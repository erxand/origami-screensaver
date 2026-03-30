/**
 * Screensaver orchestrator — ties grid, renderer, animator, cascade, and palette together.
 */

import { createGrid, buildAdjacency, toIndex } from './grid.js';
import { createRenderer } from './renderer.js';
import { createPaletteCycler } from './palette.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, State } from './animator.js';
import { buildCascadeSchedule, cascadeDuration } from './cascade.js';

const WAIT_BETWEEN_CASCADES = 30_000; // 30 seconds
const FOLD_DURATION = 400;
const CASCADE_DELAY = 60;

/**
 * Compute responsive triangle side length based on viewport.
 * Targets roughly 800-1500 triangles for good visual density.
 */
export function responsiveSide(width, height) {
  const area = width * height;
  // Each equilateral triangle with side s has area ≈ s²·√3/4
  // We want ~1000 triangles: s = sqrt(area * √3 / (4 * 1000))
  const targetCount = 1000;
  const s = Math.sqrt((area * Math.sqrt(3)) / (4 * targetCount));
  return Math.max(40, Math.min(100, Math.round(s)));
}

export function createScreensaver(canvas, options = {}) {
  const fixedSide = options.side || 0; // 0 = responsive
  const waitTime = options.waitTime ?? WAIT_BETWEEN_CASCADES;
  const foldDuration = options.foldDuration ?? FOLD_DURATION;
  const cascadeDelay = options.cascadeDelay ?? CASCADE_DELAY;

  let ctx = canvas.getContext('2d');
  let grid, adjacency, renderer, animStates, colors;
  // Pre-allocated render state array to avoid per-frame allocations
  let renderAnims = [];
  let cycler = createPaletteCycler(0);
  let currentColor = cycler.currentColor();

  // Cascade state
  let schedule = null;
  let cascadeStartTime = 0;
  let cascading = false;
  let waitingUntil = 0;
  let animFrameId = null;
  let running = false;

  function initGrid() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const side = fixedSide || responsiveSide(canvas.clientWidth, canvas.clientHeight);
    grid = createGrid(canvas.clientWidth, canvas.clientHeight, side);
    adjacency = buildAdjacency(grid.rows, grid.cols);
    renderer = createRenderer(ctx);
    animStates = createAnimStates(grid.triangles.length);
    colors = new Array(grid.triangles.length).fill(currentColor);
    renderAnims = new Array(grid.triangles.length).fill(null);
  }

  function startCascade(now) {
    const newColor = cycler.nextColor();
    const originIdx = Math.floor(Math.random() * grid.triangles.length);
    schedule = buildCascadeSchedule(originIdx, adjacency, cascadeDelay);

    // Start folds with correct edge indices
    for (const entry of schedule) {
      const tri = grid.triangles[entry.index];
      let foldEdgeIdx = 0;
      if (entry.parentIdx >= 0) {
        const parentTri = grid.triangles[entry.parentIdx];
        foldEdgeIdx = findFoldEdge(tri, parentTri);
      }
      startFold(
        animStates[entry.index],
        now + entry.startTime,
        newColor,
        colors[entry.index],
        foldEdgeIdx,
        foldDuration
      );
    }

    cascadeStartTime = now;
    cascading = true;
    currentColor = newColor;
  }

  function tick(now) {
    if (!running) return;

    if (!cascading && now >= waitingUntil) {
      startCascade(now);
    }

    if (cascading) {
      let allDone = true;
      for (let i = 0; i < animStates.length; i++) {
        const anim = animStates[i];
        if (anim.state === State.FOLDING) {
          const done = updateAnim(anim, now);
          if (done) {
            colors[i] = anim.newColor;
          } else {
            allDone = false;
          }
        } else if (anim.state === State.IDLE) {
          // Not yet started (scheduled for future)
          allDone = false;
        }
      }

      if (allDone) {
        // All triangles done — reset and wait
        for (const anim of animStates) {
          resetAnim(anim);
        }
        cascading = false;
        schedule = null;
        waitingUntil = now + waitTime;
      }
    }

    // Update render-friendly anim state array (reuse to avoid allocations)
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
    animFrameId = requestAnimationFrame(tick);
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
      cascading = false;
      schedule = null;
      waitingUntil = performance.now() + 2000;
    },
  };
}
