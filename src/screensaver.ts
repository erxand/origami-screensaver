/**
 * Screensaver orchestrator — ties grid, renderer, animator, cascade, and palette together.
 */

import { createGrid, buildAdjacency } from './grid.js';
import { createRenderer } from './renderer.js';
import { createPaletteCycler } from './palette.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, findEdgeFoldEdge, State } from './animator.js';
import { buildCascadeSchedule } from './cascade.js';
import type { AnimState, RenderAnimState, CascadeEntry, GridResult, Triangle, ScreensaverOptions } from './types.js';

const WAIT_BETWEEN_CASCADES = 8_000;
const FOLD_DURATION = 600;
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
  schedule: CascadeEntry[];
  startTime: number;
  newColor: string;
  /** Pre-computed max startTime in schedule — avoids O(N) reduce() every tick. */
  maxScheduleStart: number;
}

export function createScreensaver(canvas: HTMLCanvasElement, options: ScreensaverOptions = {}) {
  const fixedSide     = options.side || 0;
  const targetDensity = options.density ?? 1000;
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

  // FPS tracking
  let fpsSamples: number[] = [];
  let currentFps = 0;

  function trackFPS(now: number): void {
    fpsSamples.push(now);
    if (fpsSamples.length > 60) fpsSamples.shift();
    if (fpsSamples.length >= 2) {
      const elapsed = fpsSamples[fpsSamples.length - 1] - fpsSamples[0];
      currentFps = Math.round((fpsSamples.length - 1) / (elapsed / 1000));
    }
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
    // Grid changed — static cache must be rebuilt from scratch
    renderer.invalidateStaticCache();
  }

  function startCascade(now: number, forcedColor?: string): void {
    if (activeCascades.length >= maxConcurrent) return;

    const newColor = forcedColor || cycler.nextColor();
    const originIdx = Math.floor(Math.random() * grid.triangles.length);
    const schedule = buildCascadeSchedule(originIdx, adjacency, cascadeDelay);

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    for (const entry of schedule) {
      const anim = animStates[entry.index];
      if (anim.state === State.FOLDING) continue;

      const tri = grid.triangles[entry.index];

      let foldEdgeIdx = findEdgeFoldEdge(tri, cw, ch);
      if (foldEdgeIdx === -1) {
        foldEdgeIdx = 0;
        if (entry.parentIdx >= 0) {
          const parentTri = grid.triangles[entry.parentIdx];
          foldEdgeIdx = findFoldEdge(tri, parentTri);
        }
      }
      startFold(
        anim,
        now + entry.startTime,
        newColor,
        colors[entry.index],
        foldEdgeIdx,
        foldDuration
      );
      // Precompute fold projection geometry once — used every frame during fold
      renderer.cacheFoldGeom(entry.index, foldEdgeIdx);
      foldingSet.add(entry.index);
    }

    const maxScheduleStart = schedule.length > 0
      ? schedule[schedule.length - 1].startTime
      : 0;
    dirty = true;
    activeCascades.push({ schedule, startTime: now, newColor, maxScheduleStart });
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

  function tick(now: number): void {
    if (!running) return;
    trackFPS(now);

    // Prune completed cascades (use pre-computed maxScheduleStart — no O(N) reduce per tick)
    activeCascades = activeCascades.filter(cascade =>
      now < cascade.startTime + cascade.maxScheduleStart + foldDuration + 50
    );

    // Start new cascade if under limit and wait has elapsed
    if (activeCascades.length < maxConcurrent && now >= waitingUntil) {
      startCascade(now);
      const nextWait = activeCascades.length >= maxConcurrent ? waitTime * 0.5 : waitTime;
      waitingUntil = now + nextWait;
    }

    // Update animating triangles — O(K) via foldingSet (K = folding count, not N total)
    let prevActiveCount = activeAnimCount;
    activeAnimCount = 0;
    const completedThisTick: number[] = [];
    for (const i of foldingSet) {
      const anim = animStates[i];
      if (anim.state !== State.FOLDING) {
        // Stale entry (e.g. from a grid rebuild) — prune it
        completedThisTick.push(i);
        continue;
      }
      // Check if the fold has started yet (startTime may be in the future)
      if (anim.startTime <= now) {
        const done = updateAnim(anim, now);
        if (done) {
          colors[i] = anim.newColor!;
          resetAnim(anim);
          // Patch just this one triangle in the static cache (O(1) vs O(N) rebuild)
          renderer.patchStaticTriangle(grid.triangles[i], colors[i], i);
          completedThisTick.push(i);
          dirty = true;
        } else {
          activeAnimCount++;
          dirty = true;
        }
      } else {
        // Pending (not yet started) — still counts as active work
        activeAnimCount++;
      }
    }
    for (const i of completedThisTick) foldingSet.delete(i);

    // Mark dirty when transition from active → idle (need one final clean frame)
    if (prevActiveCount > 0 && activeAnimCount === 0) dirty = true;

    // Build render array and render only when dirty
    if (dirty || paletteOverlayTimer > 0) {
      // Clear previous renderAnims for completed triangles from last tick
      for (const i of completedThisTick) renderAnims[i] = null;

      // Build render array — O(K) via foldingSet (only animating entries)
      for (const i of foldingSet) {
        const a = animStates[i];
        if (a.state === State.FOLDING && a.startTime <= now) {
          if (!renderAnims[i]) renderAnims[i] = {} as RenderAnimState;
          const ra = renderAnims[i]!;
          ra.progress   = a.progress;
          ra.oldColor   = a.oldColor!;
          ra.newColor   = a.newColor!;
          ra.foldEdgeIdx = a.foldEdgeIdx;
        } else {
          renderAnims[i] = null;
        }
      }

      renderer.renderFrame(grid.triangles, colors, renderAnims, currentColor, foldingSet);

      if (paletteOverlayTimer > 0) {
        drawPaletteOverlay(paletteOverlayText);
        paletteOverlayTimer -= 16;
      }

      dirty = false;
    }

    animFrameId = requestAnimationFrame(tick);
  }

  // ── Live param API ──────────────────────────────────────────────────────────

  function setParam(key: string, value: number): void {
    switch (key) {
      case 'speed':
        foldDuration = Math.round(600 / Math.max(0.1, value));
        break;
      case 'waitTime':
        waitTime = value;
        break;
      case 'side':
        sideOverride = value;
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
      case 'speed':        return Math.round((600 / foldDuration) * 100) / 100;
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
      buildGrid();
      waitingUntil = performance.now() + 2000;
      animFrameId = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
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
