/**
 * Headless simulation engine — mirrors screensaver logic without DOM/canvas.
 * Used by visual regression tests to fast-forward time and inspect state.
 */

import { createGrid, buildAdjacency } from './grid.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, State } from './animator.js';
import { buildCascadeSchedule } from './cascade.js';
import { createPaletteCycler } from './palette.js';

const DEFAULT_FOLD_DURATION = 600;
const DEFAULT_WAIT_TIME = 8_000;
const DEFAULT_SIDE = 60;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_CASCADE_DELAY = 60;

/**
 * Create a headless screensaver simulation.
 *
 * @param {object} options
 * @param {number} [options.width=1920]
 * @param {number} [options.height=1080]
 * @param {number} [options.side=60]           Triangle side length
 * @param {number} [options.foldDuration=600]  ms per fold
 * @param {number} [options.waitTime=8000]     ms between cascades
 * @param {number} [options.maxConcurrent=2]   Max simultaneous cascades
 * @param {number} [options.cascadeDelay=60]   BFS time step ms
 * @param {number} [options.paletteIdx=0]      Starting palette
 * @param {number} [options.seed=42]           RNG seed (simple LCG)
 */
export function createSim(options = {}) {
  const width         = options.width         ?? 1920;
  const height        = options.height        ?? 1080;
  const side          = options.side          ?? DEFAULT_SIDE;
  const foldDuration  = options.foldDuration  ?? DEFAULT_FOLD_DURATION;
  const waitTime      = options.waitTime      ?? DEFAULT_WAIT_TIME;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const cascadeDelay  = options.cascadeDelay  ?? DEFAULT_CASCADE_DELAY;

  const grid       = createGrid(width, height, side);
  const adjacency  = buildAdjacency(grid.rows, grid.cols);
  const count      = grid.triangles.length;
  const cycler     = createPaletteCycler(options.paletteIdx ?? 0);
  const animStates = createAnimStates(count);
  const colors     = new Array(count).fill(cycler.currentColor());

  // Simple seeded LCG for reproducible random origins
  let rng = (options.seed ?? 42) | 0;
  function nextRand() {
    rng = (Math.imul(1664525, rng) + 1013904223) | 0;
    return (rng >>> 0) / 4294967296;
  }

  let activeCascades = [];
  let waitingUntil   = 0;
  let totalCascadesStarted = 0;
  let totalTrianglesFolded = 0;

  /** Snapshot current state for analysis */
  function snapshot(now) {
    let folding = 0;
    let idle    = 0;
    let done    = 0;
    const mixedColors = []; // triangles that finished folding but still have an unexpected color

    for (let i = 0; i < count; i++) {
      const s = animStates[i].state;
      if (s === State.FOLDING) folding++;
      else if (s === State.IDLE) idle++;
      else done++;
    }

    // Detect triangles stuck mid-animation (FOLDING long past their scheduled end)
    const stuck = [];
    for (let i = 0; i < count; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        const elapsed = now - a.startTime;
        if (elapsed > foldDuration * 3) {
          stuck.push({ index: i, elapsed: Math.round(elapsed), progress: a.progress });
        }
      }
    }

    return {
      now: Math.round(now),
      triangleCount: count,
      folding,
      idle,
      done,
      stuck,
      activeCascades: activeCascades.length,
      totalCascadesStarted,
      totalTrianglesFolded,
    };
  }

  function startCascade(now) {
    if (activeCascades.length >= maxConcurrent) return;

    const newColor  = cycler.nextColor();
    const originIdx = Math.floor(nextRand() * count);
    const schedule  = buildCascadeSchedule(originIdx, adjacency, cascadeDelay);

    for (const entry of schedule) {
      const anim = animStates[entry.index];
      if (anim.state === State.FOLDING) continue;

      let foldEdgeIdx = 0;
      if (entry.parentIdx >= 0) {
        foldEdgeIdx = findFoldEdge(grid.triangles[entry.index], grid.triangles[entry.parentIdx]);
      }
      startFold(anim, now + entry.startTime, newColor, colors[entry.index], foldEdgeIdx, foldDuration);
    }

    const maxStart = schedule.reduce((m, e) => Math.max(m, e.startTime), 0);
    activeCascades.push({ startTime: now, endTime: now + maxStart + foldDuration + 50 });
    totalCascadesStarted++;
  }

  /**
   * Advance simulation by one "tick" at the given timestamp.
   */
  function tick(now) {
    // Prune finished cascades
    activeCascades = activeCascades.filter(c => now < c.endTime);

    // Trigger new cascades
    if (activeCascades.length < maxConcurrent && now >= waitingUntil) {
      startCascade(now);
      waitingUntil = now + waitTime;
    }

    // Update animations
    for (let i = 0; i < count; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        const done = updateAnim(a, now);
        if (done) {
          colors[i] = a.newColor;
          resetAnim(a);
          totalTrianglesFolded++;
        }
      }
    }
  }

  /**
   * Run simulation for a given duration at the specified step rate.
   * Returns array of snapshots taken at snapshotInterval ms.
   *
   * @param {number} durationMs     Total simulation time to run
   * @param {number} stepMs         Time between ticks (default 16.67 = 60fps)
   * @param {number} snapshotEvery  Take snapshot every N ms
   * @returns {Array<object>} snapshots
   */
  function run(durationMs, stepMs = 16.67, snapshotEvery = 5000) {
    const snapshots = [];
    let now = 0;
    let nextSnapshot = snapshotEvery;

    while (now <= durationMs) {
      tick(now);
      if (now >= nextSnapshot) {
        snapshots.push(snapshot(now));
        nextSnapshot += snapshotEvery;
      }
      now += stepMs;
    }
    // Final snapshot
    snapshots.push(snapshot(now));
    return snapshots;
  }

  return { tick, snapshot, run, grid, colors, animStates, count };
}
