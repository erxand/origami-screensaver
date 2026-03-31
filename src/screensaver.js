/**
 * Screensaver orchestrator — ties grid, renderer, animator, cascade, and palette together.
 */

import { createGrid, buildAdjacency } from './grid.js';
import { createRenderer } from './renderer.js';
import { createPaletteCycler } from './palette.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, findEdgeFoldEdge, State } from './animator.js';
import { buildCascadeSchedule } from './cascade.js';

const WAIT_BETWEEN_CASCADES = 8_000;
const FOLD_DURATION = 600;
const CASCADE_DELAY = 60;
const MAX_CONCURRENT_CASCADES = 2;

/**
 * Compute responsive triangle side length based on viewport.
 */
export function responsiveSide(width, height, targetCount = 1000) {
  const area = width * height;
  const s = Math.sqrt((area * Math.sqrt(3)) / (4 * targetCount));
  return Math.max(40, Math.min(100, Math.round(s)));
}

export function createScreensaver(canvas, options = {}) {
  const fixedSide     = options.side || 0;
  const targetDensity = options.density ?? 1000;
  const cascadeDelay  = options.cascadeDelay ?? CASCADE_DELAY;
  const startPaletteIdx = options.paletteIdx ?? 0;

  // Mutable live params (can be changed via setParam)
  let foldDuration   = options.foldDuration  ?? FOLD_DURATION;
  let waitTime       = options.waitTime       ?? WAIT_BETWEEN_CASCADES;
  let sideOverride   = fixedSide;
  let maxConcurrent  = options.maxConcurrent  ?? MAX_CONCURRENT_CASCADES;

  let ctx = canvas.getContext('2d');
  let grid, adjacency, renderer, animStates, colors;
  let renderAnims = [];
  let cycler = createPaletteCycler(startPaletteIdx);
  let currentColor = cycler.currentColor();

  let activeCascades = [];
  let waitingUntil = 0;
  let animFrameId = null;
  let running = false;

  // Palette overlay
  let paletteOverlayTimer = 0;
  let paletteOverlayText = '';

  // FPS tracking
  let fpsSamples = [];
  let currentFps = 0;

  function trackFPS(now) {
    fpsSamples.push(now);
    if (fpsSamples.length > 60) fpsSamples.shift();
    if (fpsSamples.length >= 2) {
      const elapsed = fpsSamples[fpsSamples.length - 1] - fpsSamples[0];
      currentFps = Math.round((fpsSamples.length - 1) / (elapsed / 1000));
    }
  }

  function buildGrid() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const side = sideOverride || responsiveSide(canvas.clientWidth, canvas.clientHeight, targetDensity);
    grid = createGrid(canvas.clientWidth, canvas.clientHeight, side);
    adjacency = buildAdjacency(grid.rows, grid.cols);
    renderer = createRenderer(ctx);
    animStates = createAnimStates(grid.triangles.length);
    colors = new Array(grid.triangles.length).fill(currentColor);
    renderAnims = new Array(grid.triangles.length).fill(null);
    activeCascades = [];
  }

  function startCascade(now, forcedColor) {
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
    }

    activeCascades.push({ schedule, startTime: now, newColor });
    currentColor = newColor;
  }

  function drawPaletteOverlay(text) {
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
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.clientWidth / 2, y + h / 2);
    ctx.restore();
  }

  function tick(now) {
    if (!running) return;
    trackFPS(now);

    // Prune completed cascades
    activeCascades = activeCascades.filter(cascade => {
      const maxStart = cascade.schedule.reduce((m, e) => Math.max(m, e.startTime), 0);
      return now < cascade.startTime + maxStart + foldDuration + 50;
    });

    // Start new cascade if under limit and wait has elapsed
    if (activeCascades.length < maxConcurrent && now >= waitingUntil) {
      startCascade(now);
      const nextWait = activeCascades.length >= maxConcurrent ? waitTime * 0.5 : waitTime;
      waitingUntil = now + nextWait;
    }

    // Update animating triangles
    for (let i = 0; i < animStates.length; i++) {
      const anim = animStates[i];
      if (anim.state === State.FOLDING) {
        const done = updateAnim(anim, now);
        if (done) {
          colors[i] = anim.newColor;
          resetAnim(anim);
        }
      }
    }

    // Build render array (reuse objects to avoid allocations)
    for (let i = 0; i < animStates.length; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        if (!renderAnims[i]) renderAnims[i] = {};
        renderAnims[i].progress   = a.progress;
        renderAnims[i].oldColor   = a.oldColor;
        renderAnims[i].newColor   = a.newColor;
        renderAnims[i].foldEdgeIdx = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }

    renderer.renderFrame(grid.triangles, colors, renderAnims);

    if (paletteOverlayTimer > 0) {
      drawPaletteOverlay(paletteOverlayText);
      paletteOverlayTimer -= 16;
    }

    animFrameId = requestAnimationFrame(tick);
  }

  // ── Live param API ──────────────────────────────────────────────────────────

  function setParam(key, value) {
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
        if (running && grid) {
          const now = performance.now();
          if (activeCascades.length >= maxConcurrent) activeCascades.shift();
          startCascade(now, cycler.currentColor());
          waitingUntil = now + waitTime;
        }
        break;
    }
  }

  function getParam(key) {
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
      waitingUntil = performance.now() + 2000;
    },

    switchPalette() {
      cycler.nextPalette();
      paletteOverlayText = `Palette: ${cycler.currentPaletteName()}`;
      paletteOverlayTimer = 2500;
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
