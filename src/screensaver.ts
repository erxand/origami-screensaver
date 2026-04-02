/**
 * Screensaver orchestrator — ties grid, renderer, animator, cascade, and palette together.
 */

import { createGrid, buildAdjacency } from './grid.js';
import { createRenderer } from './renderer.js';
import { createPaletteCycler } from './palette.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, findEdgeFoldEdge, State } from './animator.js';
import { buildCascadeScheduleFlat } from './cascade.js';
import type { AnimState, RenderAnimState, GridResult, Triangle, ScreensaverOptions } from './types.js';

const WAIT_BETWEEN_CASCADES = 8_000;
const FOLD_DURATION = 400;
const CASCADE_DELAY = 60;
const MAX_CONCURRENT_CASCADES = 2;

/**
 * Compute responsive triangle side length based on viewport.
 */
export function responsiveSide(width: number, height: number, targetCount = 1000): number {
  const area = width * height;
  const s = Math.sqrt((area * Math.sqrt(3)) / (4 * targetCount));
  return Math.max(40, Math.min(100, Math.round(s)));
}

interface ActiveCascade {
  /** Unused — kept for structural compat; screensaver uses flat schedule internally. */
  schedule: never[];
  startTime: number;
  newColor: string;
  /** Pre-computed max startTime in schedule — avoids O(N) reduce() every tick. */
  maxScheduleStart: number;
}

export function createScreensaver(canvas: HTMLCanvasElement, options: ScreensaverOptions = {}) {
  const fixedSide     = options.side || 0;
  const targetDensity = options.density ?? 500;
  const cascadeDelay  = options.cascadeDelay ?? CASCADE_DELAY;
  const startPaletteIdx = options.paletteIdx ?? 0;

  // Mutable live params (can be changed via setParam)
  let foldDuration   = options.foldDuration  ?? FOLD_DURATION;
  let waitTime       = options.waitTime       ?? WAIT_BETWEEN_CASCADES;
  let sideOverride   = fixedSide;
  let maxConcurrent  = options.maxConcurrent  ?? MAX_CONCURRENT_CASCADES;

  let ctx = canvas.getContext('2d')!;
  let grid: GridResult;
  let adjacency: number[][];
  let renderer: ReturnType<typeof createRenderer>;
  let animStates: AnimState[];
  let colors: string[];
  let renderAnims: (RenderAnimState | null)[];
  let cycler = createPaletteCycler(startPaletteIdx);
  let currentColor = cycler.currentColor();

  let activeCascades: ActiveCascade[] = [];
  let waitingUntil = 0;
  let animFrameId: number | null = null;
  let running = false;

  // Dirty flag — skip renderFrame when nothing has changed
  let dirty = true;
  let activeAnimCount = 0; // triangles currently folding

  // Active-set tracking: indices of triangles in FOLDING state (pending or animating).
  // Maintained alongside animStates so tick loops scan O(K) instead of O(N).
  let foldingSet: Set<number> = new Set();

  // Palette overlay
  let paletteOverlayTimer = 0;
  let paletteOverlayText = '';

  // FPS tracking — circular Float64Array avoids push+shift alloc (2.2× faster)
  const FPS_SAMPLES = 60;
  const fpsBuf = new Float64Array(FPS_SAMPLES);
  let fpsBufHead = 0;
  let fpsBufSize = 0;
  let currentFps = 0;

  // Pre-allocated scratch arrays — reused every tick to avoid per-frame heap churn.
  // completedBuf: holds indices that finished folding this tick (max K = grid size)
  // activeCascades uses in-place splice instead of .filter() to avoid allocation.
  let _completedBuf = new Int32Array(256); // grows if needed
  let _completedLen = 0;

  function trackFPS(now: number): void {
    // Circular buffer — no push/shift allocations (2.2× faster than Array.push+shift)
    const oldest = fpsBuf[fpsBufHead]; // will be overwritten
    fpsBuf[fpsBufHead] = now;
    fpsBufHead = (fpsBufHead + 1) % FPS_SAMPLES;
    if (fpsBufSize < FPS_SAMPLES) fpsBufSize++;
    if (fpsBufSize >= 2) {
      // Oldest sample is the one we just overwrote (or head if not yet full)
      const oldestIdx = fpsBufSize < FPS_SAMPLES ? (fpsBufHead - fpsBufSize + FPS_SAMPLES) % FPS_SAMPLES : fpsBufHead;
      const span = now - fpsBuf[oldestIdx];
      if (span > 0) currentFps = Math.round((fpsBufSize - 1) / (span / 1000));
    }
    void oldest; // suppress unused warning
  }

  function buildGrid(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const side = sideOverride || responsiveSide(canvas.clientWidth, canvas.clientHeight, targetDensity);
    grid = createGrid(canvas.clientWidth, canvas.clientHeight, side);
    adjacency = buildAdjacency(grid.rows, grid.cols);
    renderer = createRenderer(ctx, grid.triCoords);
    animStates = createAnimStates(grid.triangles.length);
    colors = new Array(grid.triangles.length).fill(currentColor);
    renderAnims = new Array(grid.triangles.length).fill(null);
    activeCascades = [];
    foldingSet = new Set();
    // Ensure scratch buffer is large enough for the new grid
    if (_completedBuf.length < grid.triangles.length) {
      _completedBuf = new Int32Array(grid.triangles.length);
    }
    _completedLen = 0;
    // Grid changed — static cache must be rebuilt from scratch
    renderer.invalidateStaticCache();
  }

  function startCascade(now: number, forcedColor?: string): void {
    if (activeCascades.length >= maxConcurrent) return;

    const newColor = forcedColor || cycler.nextColor();
    const originIdx = Math.floor(Math.random() * grid.triangles.length);
    // Zero-alloc flat BFS — returns typed-array views, no JS object allocation
    const flat = buildCascadeScheduleFlat(originIdx, adjacency, cascadeDelay);

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    for (let fi = 0; fi < flat.length; fi++) {
      const idx       = flat.indices[fi];
      const parentIdx = flat.parents[fi];
      const startTime = flat.startTimes[fi];
      const anim = animStates[idx];

      if (anim.state === State.FOLDING) {
        // Triangle is already mid-fold from an earlier cascade.
        // Always set pendingColor to this cascade's target color.
        //
        // Why always? startCascade() is called in strictly chronological order:
        // Cascade A first, then B, then C. By the time we reach this branch,
        // `newColor` is ALWAYS from a newer cascade than whatever drove the
        // current fold (since startFold was called by an earlier startCascade).
        // The last write to pendingColor wins — which is always the newest cascade.
        //
        // The old conditional (`newColor === currentColor || anim.newColor !== currentColor`)
        // was broken: at the time of the check, `currentColor` still holds the
        // PREVIOUS cascade's color (it's updated at the END of startCascade),
        // so when Cascade B encounters a triangle folding toward Cascade A's color,
        // `newColor !== currentColor` AND `anim.newColor === currentColor` both
        // evaluate in the wrong direction → pendingColor was NEVER set for those
        // triangles → they completed to the old color and reverted. Fixed here.
        anim.pendingColor = newColor;
        foldingSet.add(idx); // ensure we're tracking it
        continue;
      }

      const tri = grid.triangles[idx];

      let foldEdgeIdx = findEdgeFoldEdge(tri, cw, ch);
      if (foldEdgeIdx === -1) {
        foldEdgeIdx = 0;
        if (parentIdx >= 0) {
          const parentTri = grid.triangles[parentIdx];
          foldEdgeIdx = findFoldEdge(tri, parentTri);
        }
      }
      startFold(
        anim,
        now + startTime,
        newColor,
        colors[idx],
        foldEdgeIdx,
        foldDuration
      );
      // Precompute fold projection geometry once — used every frame during fold
      renderer.cacheFoldGeom(idx, foldEdgeIdx);
      foldingSet.add(idx);
    }

    dirty = true;
    activeCascades.push({ schedule: [], startTime: now, newColor, maxScheduleStart: flat.maxStartTime });
    currentColor = newColor;
  }

  function drawPaletteOverlay(text: string): void {
    const alpha = Math.min(1, paletteOverlayTimer / 400);
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const padX = 16;
    const w = metrics.width + padX * 2;
    const h = 36;
    const x = (canvas.clientWidth - w) / 2;
    const y = canvas.clientHeight - 60;
    ctx.beginPath();
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.clientWidth / 2, y + h / 2);
    ctx.restore();
  }

  let _lastTickNow = 0;

  function tick(now: number): void {
    if (!running) return;
    const dt = _lastTickNow > 0 ? Math.min(100, now - _lastTickNow) : 16;
    _lastTickNow = now;
    trackFPS(now);

    // Prune completed cascades in-place — avoids .filter() allocation each frame
    // (use pre-computed maxScheduleStart — no O(N) reduce per tick)
    let _ci = activeCascades.length;
    while (_ci--) {
      if (now >= activeCascades[_ci].startTime + activeCascades[_ci].maxScheduleStart + foldDuration + 50) {
        activeCascades.splice(_ci, 1);
      }
    }

    // Start new cascade if under limit and wait has elapsed
    if (activeCascades.length < maxConcurrent && now >= waitingUntil) {
      startCascade(now);
      const nextWait = activeCascades.length >= maxConcurrent ? waitTime * 0.5 : waitTime;
      waitingUntil = now + nextWait;
    }

    // Update animating triangles AND populate renderAnims in one fused pass — O(K) via foldingSet.
    // Previously two separate foldingSet iterations; fusing them eliminates ~1.4× overhead.
    let prevActiveCount = activeAnimCount;
    activeAnimCount = 0;
    // Reuse pre-allocated scratch buffer — grow if foldingSet exceeds current capacity
    if (_completedBuf.length < foldingSet.size) {
      _completedBuf = new Int32Array(foldingSet.size * 2);
    }
    _completedLen = 0;
    for (const i of foldingSet) {
      const anim = animStates[i];
      if (anim.state !== State.FOLDING) {
        // Stale entry (e.g. from a grid rebuild) — prune it
        _completedBuf[_completedLen++] = i;
        renderAnims[i] = null;
        continue;
      }
      // Check if the fold has started yet (startTime may be in the future)
      if (anim.startTime <= now) {
        const done = updateAnim(anim, now);
        if (done) {
          const completedNewColor = anim.newColor!;
          const pendingColor = anim.pendingColor;
          colors[i] = completedNewColor;

          if (pendingColor && pendingColor !== completedNewColor) {
            // A later cascade wanted a different color — immediately start a new fold
            // from completedNewColor → pendingColor so the triangle catches up.
            // This avoids the "revert" bug where redirecting newColor mid-fold would
            // set oldColor === newColor, making the fold appear to snap back.
            const tri = grid.triangles[i];
            const cw = canvas.clientWidth;
            const ch = canvas.clientHeight;
            let foldEdgeIdx = findEdgeFoldEdge(tri, cw, ch);
            if (foldEdgeIdx === -1) foldEdgeIdx = anim.foldEdgeIdx; // reuse same edge

            // Patch static cache to completedNewColor BEFORE starting fold 2.
            // Fold 2 begins at progress=0, which is skipped by renderFrame's animated
            // draw pass (condition: progress <= 0). The static blit is the fallback,
            // so if we don't patch it here, the cache still shows the pre-fold-1 color
            // for 1-2 frames — exactly the "left-edge triangle reverts" bug.
            // Use enqueuePatch so all completions this tick flush together in one batched draw.
            renderer.enqueuePatch(grid.triangles[i], completedNewColor, i);

            startFold(anim, now, pendingColor, completedNewColor, foldEdgeIdx, foldDuration);
            renderer.cacheFoldGeom(i, foldEdgeIdx);
            // Stay in foldingSet — fold continues immediately
            activeAnimCount++;
            dirty = true;
            if (!renderAnims[i]) renderAnims[i] = {} as RenderAnimState;
            const ra = renderAnims[i]!;
            ra.progress    = anim.progress;
            ra.oldColor    = anim.oldColor!;
            ra.newColor    = anim.newColor!;
            ra.foldEdgeIdx = anim.foldEdgeIdx;
          } else {
            resetAnim(anim);
            // Enqueue patch — all completions this tick flush together in flushPatches()
            renderer.enqueuePatch(grid.triangles[i], colors[i], i);
            _completedBuf[_completedLen++] = i;
            renderAnims[i] = null; // fold done — clear render state inline
            dirty = true;
          }
        } else {
          activeAnimCount++;
          dirty = true;
          // Fused: populate renderAnims inline — eliminates second foldingSet pass
          if (!renderAnims[i]) renderAnims[i] = {} as RenderAnimState;
          const ra = renderAnims[i]!;
          ra.progress    = anim.progress;
          ra.oldColor    = anim.oldColor!;
          ra.newColor    = anim.newColor!;
          ra.foldEdgeIdx = anim.foldEdgeIdx;
        }
      } else {
        // Pending (not yet started) — still counts as active work; not yet renderable
        activeAnimCount++;
        renderAnims[i] = null;
      }
    }
    for (let _ci2 = 0; _ci2 < _completedLen; _ci2++) foldingSet.delete(_completedBuf[_ci2]);

    // Mark dirty when transition from active → idle (need one final clean frame)
    if (prevActiveCount > 0 && activeAnimCount === 0) {
      dirty = true;
      // DEBUG: check for color mismatches when going idle
      if (typeof window !== 'undefined' && (window as any).__ssDebug && activeCascades.length === 0) {
        const mismatches: number[] = [];
        for (let _di = 0; _di < colors.length; _di++) {
          if (colors[_di] !== currentColor) mismatches.push(_di);
        }
        if (mismatches.length > 0) {
          (window as any).__ssDebug.colorMismatches.push({ time: now, expected: currentColor, mismatches: mismatches.length, indices: mismatches.slice(0, 10) });
          console.warn(`[BUG] ${mismatches.length} triangles wrong color at idle! Expected ${currentColor}`, mismatches.slice(0, 10));
        }
      }
    }

    // DEBUG: expose foldingSet size and activeAnimCount
    if (typeof window !== 'undefined' && (window as any).__ssDebug) {
      (window as any).__ssDebug.foldingSetSize = foldingSet.size;
      (window as any).__ssDebug.activeAnimCount = activeAnimCount;
      (window as any).__ssDebug.activeCascadesCount = activeCascades.length;
      if ((window as any).__ssDebug.maxFoldingSet === undefined || foldingSet.size > (window as any).__ssDebug.maxFoldingSet) {
        (window as any).__ssDebug.maxFoldingSet = foldingSet.size;
      }
    }

    // Flush batched static-cache patches (all completions this tick → 1 compound draw per color).
    // Must happen before renderFrame so the updated static canvas is blitted correctly.
    renderer.flushPatches();

    // Render only when dirty (renderAnims is already up-to-date from the fused loop above)
    if (dirty || paletteOverlayTimer > 0) {
      renderer.renderFrame(grid.triangles, colors, renderAnims, currentColor, foldingSet);

      if (paletteOverlayTimer > 0) {
        drawPaletteOverlay(paletteOverlayText);
        paletteOverlayTimer -= dt;
      }

      dirty = false;
    }

    animFrameId = requestAnimationFrame(tick);
  }

  // ── Live param API ──────────────────────────────────────────────────────────

  function setParam(key: string, value: number): void {
    switch (key) {
      case 'speed':
        // Store as float to preserve round-trip accuracy through getParam.
        // Clamp to [0.25, 4.0] matching URL param validation and slider range.
        foldDuration = 400 / Math.max(0.25, Math.min(4.0, value));
        break;
      case 'waitTime':
        waitTime = value;
        break;
      case 'side':
        // 0 = auto-size (responsive); positive values clamped to valid range
        sideOverride = value === 0 ? 0 : Math.max(20, Math.min(200, value));
        if (running && grid) {
          const prevColor = currentColor;
          buildGrid();
          colors.fill(prevColor);
          waitingUntil = performance.now() + 1500;
        }
        break;
      case 'maxConcurrent':
        maxConcurrent = value;
        break;
      case 'paletteIdx':
        cycler.setPaletteByIndex(value);
        paletteOverlayText = `Palette: ${cycler.currentPaletteName()}`;
        paletteOverlayTimer = 2000;
        dirty = true;
        if (running && grid) {
          const now = performance.now();
          if (activeCascades.length >= maxConcurrent) activeCascades.shift();
          startCascade(now, cycler.currentColor());
          waitingUntil = now + waitTime;
        }
        break;
    }
  }

  function getParam(key: string): number | undefined {
    switch (key) {
      case 'speed':        return Math.round((400 / foldDuration) * 100) / 100;
      case 'waitTime':     return waitTime;
      case 'side':         return sideOverride;
      case 'maxConcurrent': return maxConcurrent;
      case 'paletteIdx':   return cycler.currentPaletteIndex();
      default: return undefined;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    start() {
      running = true;
      _lastTickNow = 0;
      buildGrid();
      waitingUntil = performance.now() + 2000;
      animFrameId = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
      _lastTickNow = 0;
      if (animFrameId != null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    },

    resize() {
      if (!running) return;
      const prevColor = currentColor;
      buildGrid();
      colors.fill(prevColor);
      activeCascades = [];
      activeAnimCount = 0;
      dirty = true;
      waitingUntil = performance.now() + 2000;
    },

    switchPalette() {
      cycler.nextPalette();
      paletteOverlayText = `Palette: ${cycler.currentPaletteName()}`;
      paletteOverlayTimer = 2500;
      dirty = true;
      if (running && grid) {
        const now = performance.now();
        if (activeCascades.length >= maxConcurrent) activeCascades.shift();
        startCascade(now, cycler.currentColor());
        waitingUntil = now + waitTime;
      }
    },

    setParam,
    getParam,
    getFPS: () => currentFps,
    getPaletteIdx: () => cycler.currentPaletteIndex(),
  };
}
