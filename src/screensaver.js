/**
 * Screensaver orchestrator — ties grid, renderer, animator, cascade, and palette together.
 */

import { createGrid, buildAdjacency, toIndex } from './grid.js';
import { createRenderer } from './renderer.js';
import { createPaletteCycler } from './palette.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, findEdgeFoldEdge, State } from './animator.js';
import { buildCascadeSchedule, cascadeDuration } from './cascade.js';

const WAIT_BETWEEN_CASCADES = 8_000; // 8 seconds between cascade waves
const FOLD_DURATION = 600; // 600ms — visually substantial fold
const CASCADE_DELAY = 60;
const MAX_CONCURRENT_CASCADES = 2; // allow up to 2 simultaneous cascades

/**
 * Compute responsive triangle side length based on viewport.
 * Targets roughly `targetCount` triangles for good visual density.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [targetCount=1000]
 */
export function responsiveSide(width, height, targetCount = 1000) {
  const area = width * height;
  // Each equilateral triangle with side s has area ≈ s²·√3/4
  // s = sqrt(area * √3 / (4 * targetCount))
  const s = Math.sqrt((area * Math.sqrt(3)) / (4 * targetCount));
  return Math.max(40, Math.min(100, Math.round(s)));
}

export function createScreensaver(canvas, options = {}) {
  const fixedSide = options.side || 0; // 0 = responsive
  const targetDensity = options.density ?? 1000; // target triangle count for auto-size
  const waitTime = options.waitTime ?? WAIT_BETWEEN_CASCADES;
  const foldDuration = options.foldDuration ?? FOLD_DURATION;
  const cascadeDelay = options.cascadeDelay ?? CASCADE_DELAY;
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT_CASCADES;
  const startPaletteIdx = options.paletteIdx ?? 0;

  let ctx = canvas.getContext('2d');
  let grid, adjacency, renderer, animStates, colors;
  // Pre-allocated render state array to avoid per-frame allocations
  let renderAnims = [];
  let cycler = createPaletteCycler(startPaletteIdx);
  let currentColor = cycler.currentColor();

  // Multiple cascade support: track active cascade slots
  // Each slot: { schedule, startTime, newColor, active }
  let activeCascades = [];
  let waitingUntil = 0;
  let animFrameId = null;
  let running = false;

  // Palette picker state
  let paletteOverlayTimer = 0;
  let paletteOverlayText = '';

  function initGrid() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const side = fixedSide || responsiveSide(canvas.clientWidth, canvas.clientHeight, targetDensity);
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

    // Only start folds for triangles not currently mid-fold
    for (const entry of schedule) {
      const anim = animStates[entry.index];
      // Don't restart a triangle that's actively folding
      if (anim.state === State.FOLDING) continue;

      const tri = grid.triangles[entry.index];

      // Edge triangles fold along their viewport-boundary edge (peeling effect).
      // Interior triangles fold along the shared edge with their cascade parent.
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

    activeCascades.push({ schedule, startTime: now, newColor, active: true });
    currentColor = newColor;
  }

  /**
   * Switch to the next palette immediately — triggers a new cascade with palette colors.
   */
  function switchPalette() {
    cycler.nextPalette();
    const paletteName = cycler.currentPaletteName();
    paletteOverlayText = `Palette: ${paletteName}`;
    paletteOverlayTimer = 2500; // show for 2.5 seconds

    // Immediately trigger a new cascade with the new palette
    if (running && grid) {
      const now = performance.now();
      // Force a cascade even if at max concurrent (bump oldest)
      if (activeCascades.length >= maxConcurrent) {
        activeCascades.shift();
      }
      startCascade(now, cycler.currentColor());
      waitingUntil = now + waitTime;
    }
  }

  function tick(now) {
    if (!running) return;

    // Prune completed cascades
    activeCascades = activeCascades.filter(cascade => {
      const maxStart = cascade.schedule.reduce((m, e) => Math.max(m, e.startTime), 0);
      const endTime = cascade.startTime + maxStart + foldDuration + 50;
      return now < endTime;
    });

    // Start new cascade if under limit and wait has elapsed
    if (activeCascades.length < maxConcurrent && now >= waitingUntil) {
      startCascade(now);
      // Stagger next cascade a bit (half wait if concurrent mode)
      const nextWait = activeCascades.length >= maxConcurrent ? waitTime * 0.5 : waitTime;
      waitingUntil = now + nextWait;
    }

    // Update all animating triangles
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

    // Build render-friendly anim state array (reuse to avoid allocations)
    for (let i = 0; i < animStates.length; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        if (!renderAnims[i]) renderAnims[i] = {};
        renderAnims[i].progress = a.progress;
        renderAnims[i].oldColor = a.oldColor;
        renderAnims[i].newColor = a.newColor;
        renderAnims[i].foldEdgeIdx = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }

    renderer.renderFrame(grid.triangles, colors, renderAnims);

    // Draw palette overlay if active
    if (paletteOverlayTimer > 0) {
      drawPaletteOverlay(paletteOverlayText);
      paletteOverlayTimer -= 16; // rough 60fps decrement
    }

    animFrameId = requestAnimationFrame(tick);
  }

  function drawPaletteOverlay(text) {
    const alpha = Math.min(1, paletteOverlayTimer / 400); // fade out in last 400ms
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const padX = 16, padY = 10;
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

  return {
    start() {
      running = true;
      initGrid();
      // First cascade starts after a short initial wait
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
      // Re-init grid on resize, reset cascade
      const prevColor = currentColor;
      initGrid();
      colors.fill(prevColor);
      activeCascades = [];
      waitingUntil = performance.now() + 2000;
    },

    switchPalette,
  };
}
