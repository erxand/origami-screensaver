/**
 * Cascade engine — BFS flood-fill propagation from an origin triangle.
 *
 * Computes the schedule of when each triangle should start folding,
 * based on BFS distance from the origin. Uses variable cascade easing
 * (ease-in-out cubic on the wave timing) for a more organic ripple feel.
 */

import { applyVariableCascadeEasing } from './easing.js';
import type { BfsEntry, CascadeEntry } from './types.js';

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
