/**
 * Cascade engine — BFS flood-fill propagation from an origin triangle.
 *
 * Computes the schedule of when each triangle should start folding,
 * based on BFS distance from the origin. Uses variable cascade easing
 * (ease-in-out cubic on the wave timing) for a more organic ripple feel.
 *
 * Two code paths:
 *  - `bfs` / `buildCascadeSchedule`  — original object-array API (used by tests)
 *  - `buildCascadeScheduleFlat`      — zero-alloc typed-array path (used by screensaver)
 */

import { applyVariableCascadeEasing, easeInOutCubic } from './easing.js';
import type { BfsEntry, CascadeEntry } from './types.js';

// ---------------------------------------------------------------------------
// Typed-array scratch buffers for the zero-alloc BFS path.
// Grown lazily; never shrunk — sized for the largest grid seen so far.
// ---------------------------------------------------------------------------
const _FLAT_INIT = 8192; // fits most viewport sizes at default density
let _qIdx    = new Int32Array(_FLAT_INIT);   // BFS queue: index
let _qDist   = new Int32Array(_FLAT_INIT);   // BFS queue: distance
let _qParent = new Int32Array(_FLAT_INIT);   // BFS queue: parentIdx
let _visited = new Uint8Array(_FLAT_INIT);

// Output arrays — valid for length `_flatLen` entries after a call.
// These are re-exported by value so callers get a stable view.
let _schedIdx    = new Int32Array(_FLAT_INIT);
let _schedParent = new Int32Array(_FLAT_INIT);
let _schedStart  = new Float32Array(_FLAT_INIT);
let _flatLen = 0;

export interface CascadeScheduleFlat {
  /** Triangle indices (length entries valid). */
  indices: Int32Array;
  /** Parent triangle indices; -1 for origin. */
  parents: Int32Array;
  /** Eased + jittered start time in ms for each triangle. */
  startTimes: Float32Array;
  /** Number of valid entries. */
  length: number;
  /** Maximum startTime value across all entries. */
  maxStartTime: number;
}

/** Grow all scratch buffers to at least `n` elements. */
function ensureFlatCapacity(n: number): void {
  if (n <= _qIdx.length) return;
  const next = n * 2;
  _qIdx    = new Int32Array(next);
  _qDist   = new Int32Array(next);
  _qParent = new Int32Array(next);
  _visited = new Uint8Array(next);
  _schedIdx    = new Int32Array(next);
  _schedParent = new Int32Array(next);
  _schedStart  = new Float32Array(next);
}

/**
 * Zero-alloc BFS + cascade schedule builder.
 *
 * Uses module-level typed-array scratch buffers — no object allocation per call.
 * Returns a stable view into those buffers valid until the next call.
 *
 * Replaces: bfs() + buildCascadeSchedule() in the screensaver hot path.
 * Eliminates: ~6400 JS object allocations per cascade (BfsEntry[] + CascadeEntry[]).
 */
export function buildCascadeScheduleFlat(
  originIdx: number,
  adjacency: number[][],
  cascadeDelay = 60
): CascadeScheduleFlat {
  const count = adjacency.length;
  ensureFlatCapacity(count);

  // Clear visited flags (only the entries we'll use)
  _visited.fill(0, 0, count);

  // BFS — write queue entries into typed arrays
  _qIdx[0]    = originIdx;
  _qDist[0]   = 0;
  _qParent[0] = -1;
  _visited[originIdx] = 1;

  let head = 0;
  let tail = 1; // next write position
  let maxDist = 0;

  while (head < tail) {
    const curIdx    = _qIdx[head];
    const curDist   = _qDist[head];
    const curParent = _qParent[head];
    head++;

    // Copy to output schedule arrays (BFS order = final order)
    const out = head - 1; // same index as BFS position
    _schedIdx[out]    = curIdx;
    _schedParent[out] = curParent;
    if (curDist > maxDist) maxDist = curDist;

    const neighbors = adjacency[curIdx];
    for (let ni = 0; ni < neighbors.length; ni++) {
      const nb = neighbors[ni];
      if (!_visited[nb]) {
        _visited[nb] = 1;
        _qIdx[tail]    = nb;
        _qDist[tail]   = curDist + 1;
        _qParent[tail] = curIdx;
        tail++;
      }
    }
  }

  _flatLen = tail; // number of triangles visited

  // Compute start times with wave acceleration:
  //   - Starts at 1× speed (full cascadeDelay per hop)
  //   - Gradually ramps to 2× speed (half cascadeDelay per hop)
  //   - Stays at 2× for the remainder
  //
  // The acceleration ramp covers the first 40% of hops, then locks at 2× speed.
  // This gives the cascade a slow, deliberate start that builds momentum.
  //
  // Math: integrate a linearly decreasing delay from cascadeDelay down to
  // cascadeDelay/2 over the ramp, then constant cascadeDelay/2 after that.
  const rampFrac = 0.4; // first 40% of hops accelerate
  const rampDist = maxDist * rampFrac;
  const minDelay = cascadeDelay * 0.5; // 2× speed

  // Pre-compute the total time spent in the ramp phase:
  // Integral of delay(d) from 0 to rampDist where delay linearly drops
  // from cascadeDelay to minDelay: avg delay × rampDist
  const rampTime = (cascadeDelay + minDelay) * 0.5 * rampDist;

  const jitterRange = cascadeDelay * 0.25;
  let maxStartTime = 0;

  for (let i = 0; i < _flatLen; i++) {
    const dist = _qDist[i];
    if (dist === 0) {
      _schedStart[i] = 0;
      continue;
    }

    let base: number;
    if (dist <= rampDist) {
      // In ramp: delay decreases linearly from cascadeDelay to minDelay
      // Integral from 0 to dist of (cascadeDelay - (cascadeDelay - minDelay) * d / rampDist)
      const frac = dist / rampDist; // 0→1 within ramp
      const avgDelay = cascadeDelay - (cascadeDelay - minDelay) * frac * 0.5;
      base = avgDelay * dist;
    } else {
      // Past ramp: constant minDelay (2× speed)
      base = rampTime + (dist - rampDist) * minDelay;
    }

    const jitter = Math.random() * jitterRange;
    const st     = base + jitter;
    _schedStart[i] = st;
    if (st > maxStartTime) maxStartTime = st;
  }

  return {
    indices:      _schedIdx,
    parents:      _schedParent,
    startTimes:   _schedStart,
    length:       _flatLen,
    maxStartTime,
  };
}

// ---------------------------------------------------------------------------
// Original object-array API — preserved for tests and external callers
// ---------------------------------------------------------------------------

/**
 * Run BFS from originIdx and return an array of { index, distance, parentIdx }
 * ordered by BFS distance.
 */
export function bfs(originIdx: number, adjacency: number[][]): BfsEntry[] {
  const count = adjacency.length;
  const visited = new Uint8Array(count);
  const result: BfsEntry[] = [];
  const queue: BfsEntry[] = [{ index: originIdx, distance: 0, parentIdx: -1 }];
  visited[originIdx] = 1;

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    result.push(current);

    for (const neighborIdx of adjacency[current.index]) {
      if (!visited[neighborIdx]) {
        visited[neighborIdx] = 1;
        queue.push({
          index: neighborIdx,
          distance: current.distance + 1,
          parentIdx: current.index,
        });
      }
    }
  }

  return result;
}

/**
 * Build a cascade schedule: for each triangle, compute the start time
 * of its fold animation.
 */
export function buildCascadeSchedule(
  originIdx: number,
  adjacency: number[][],
  cascadeDelay = 60
): CascadeEntry[] {
  const bfsResult = bfs(originIdx, adjacency);
  const maxDist = bfsResult.length > 0 ? bfsResult[bfsResult.length - 1].distance : 0;
  const totalDuration = maxDist * cascadeDelay;
  return applyVariableCascadeEasing(bfsResult, totalDuration, 0.35);
}

/**
 * Get the maximum start time in a schedule (useful for knowing total cascade duration).
 */
export function cascadeDuration(schedule: CascadeEntry[], foldDuration = 350): number {
  if (schedule.length === 0) return 0;
  const maxStart = schedule[schedule.length - 1].startTime;
  return maxStart + foldDuration;
}
