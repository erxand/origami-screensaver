/**
 * Headless simulation engine — mirrors screensaver logic without DOM/canvas.
 * Used by visual regression tests to fast-forward time and inspect state.
 */

import { createGrid, buildAdjacency } from './grid.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, State } from './animator.js';
import { buildCascadeSchedule } from './cascade.js';
import { createPaletteCycler } from './palette.js';
import type { AnimState, CascadeEntry, GridResult } from './types.js';

const DEFAULT_FOLD_DURATION = 600;
const DEFAULT_WAIT_TIME = 8_000;
const DEFAULT_SIDE = 60;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_CASCADE_DELAY = 60;

export interface SimOptions {
  width?: number;
  height?: number;
  side?: number;
  foldDuration?: number;
  waitTime?: number;
  maxConcurrent?: number;
  cascadeDelay?: number;
  paletteIdx?: number;
  seed?: number;
}

export interface SimSnapshot {
  now: number;
  triangleCount: number;
  folding: number;
  idle: number;
  done: number;
  stuck: { index: number; elapsed: number; progress: number }[];
  activeCascades: number;
  totalCascadesStarted: number;
  totalTrianglesFolded: number;
  /** Number of unique colors across all triangles at snapshot time. */
  uniqueColorCount: number;
}

interface ActiveCascade {
  startTime: number;
  endTime: number;
}

/**
 * Create a headless screensaver simulation.
 */
export function createSim(options: SimOptions = {}) {
  const width         = options.width         ?? 1920;
  const height        = options.height        ?? 1080;
  const side          = options.side          ?? DEFAULT_SIDE;
  const foldDuration  = options.foldDuration  ?? DEFAULT_FOLD_DURATION;
  const waitTime      = options.waitTime      ?? DEFAULT_WAIT_TIME;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const cascadeDelay  = options.cascadeDelay  ?? DEFAULT_CASCADE_DELAY;

  const grid: GridResult   = createGrid(width, height, side);
  const adjacency          = buildAdjacency(grid.rows, grid.cols);
  const count              = grid.triangles.length;
  const cycler             = createPaletteCycler(options.paletteIdx ?? 0);
  const animStates         = createAnimStates(count);
  const colors             = new Array<string>(count).fill(cycler.currentColor());

  // Simple seeded LCG for reproducible random origins
  let rng = (options.seed ?? 42) | 0;
  function nextRand(): number {
    rng = (Math.imul(1664525, rng) + 1013904223) | 0;
    return (rng >>> 0) / 4294967296;
  }

  let activeCascades: ActiveCascade[] = [];
  let waitingUntil   = 0;
  let totalCascadesStarted = 0;
  let totalTrianglesFolded = 0;

  /** Snapshot current state for analysis */
  function snapshot(now: number): SimSnapshot {
    let folding = 0;
    let idle    = 0;
    let done    = 0;

    for (let i = 0; i < count; i++) {
      const s = animStates[i].state;
      if (s === State.FOLDING) folding++;
      else if (s === State.IDLE) idle++;
      else done++;
    }

    // Detect triangles stuck mid-animation (FOLDING long past their scheduled end)
    const stuck: { index: number; elapsed: number; progress: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        const elapsed = now - a.startTime;
        if (elapsed > foldDuration * 3) {
          stuck.push({ index: i, elapsed: Math.round(elapsed), progress: a.progress });
        }
      }
    }

    // Count unique colors at this moment (for color-uniformity assertions)
    const _uniqueColors = new Set(colors);

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
      uniqueColorCount: _uniqueColors.size,
    };
  }

  function startCascade(now: number): void {
    if (activeCascades.length >= maxConcurrent) return;

    const newColor  = cycler.nextColor();
    const originIdx = Math.floor(nextRand() * count);
    const schedule  = buildCascadeSchedule(originIdx, adjacency, cascadeDelay);

    for (const entry of schedule) {
      const anim = animStates[entry.index];
      if (anim.state === State.FOLDING) {
        // Mirror screensaver.ts: always redirect pending folds to this (newer) cascade's color.
        // This is the key fix for the left-edge triangle color revert bug — earlier cascades
        // set startTime far in the future for far-away triangles, so cascade B arrives while
        // they are State.FOLDING but haven't visually started yet. Without pendingColor, they
        // complete to the stale cascade A color. See screensaver.ts startCascade() for details.
        anim.pendingColor = newColor;
        continue;
      }

      let foldEdgeIdx = 0;
      if (entry.parentIdx >= 0) {
        foldEdgeIdx = findFoldEdge(grid.triangles[entry.index], grid.triangles[entry.parentIdx]);
      }
      startFold(anim, now + entry.startTime, newColor, colors[entry.index], foldEdgeIdx, foldDuration);
    }

    const maxStart = schedule.reduce((m: number, e: CascadeEntry) => Math.max(m, e.startTime), 0);
    activeCascades.push({ startTime: now, endTime: now + maxStart + foldDuration + 50 });
    totalCascadesStarted++;
  }

  /**
   * Advance simulation by one "tick" at the given timestamp.
   */
  function tick(now: number): void {
    // Prune finished cascades
    activeCascades = activeCascades.filter(c => now < c.endTime);

    // Trigger new cascade only when all previous folds are complete.
    // This ensures at most 2 colors on screen at any time (old + new).
    const anyFolding = animStates.some(a => a.state === State.FOLDING);
    if (activeCascades.length === 0 && !anyFolding && now >= waitingUntil) {
      startCascade(now);
      waitingUntil = now + waitTime;
    }

    // Update animations
    for (let i = 0; i < count; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        const done = updateAnim(a, now);
        if (done) {
          const completedColor = a.newColor!;
          const pending = a.pendingColor;
          colors[i] = completedColor;
          totalTrianglesFolded++;
          if (pending && pending !== completedColor) {
            // A later cascade requested a different color — chain immediately.
            startFold(a, now, pending, completedColor, a.foldEdgeIdx, foldDuration);
          } else {
            resetAnim(a);
          }
        }
      }
    }
  }

  /**
   * Run simulation for a given duration at the specified step rate.
   * Returns array of snapshots taken at snapshotInterval ms.
   */
  function run(durationMs: number, stepMs = 16.67, snapshotEvery = 5000): SimSnapshot[] {
    const snapshots: SimSnapshot[] = [];
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
