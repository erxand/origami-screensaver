/**
 * Cascade engine — BFS flood-fill propagation from an origin triangle.
 *
 * Computes the schedule of when each triangle should start folding,
 * based on BFS distance from the origin. Uses variable cascade easing
 * (ease-in-out cubic on the wave timing) for a more organic ripple feel.
 */

import { applyVariableCascadeEasing } from './easing.js';

/**
 * Run BFS from originIdx and return an array of { index, distance, parentIdx }
 * ordered by BFS distance.
 *
 * @param {number} originIdx - Starting triangle index
 * @param {Array<Array<number>>} adjacency - Adjacency list
 * @returns {Array<{index: number, distance: number, parentIdx: number}>}
 */
export function bfs(originIdx, adjacency) {
  const count = adjacency.length;
  const visited = new Uint8Array(count);
  const result = [];
  const queue = [{ index: originIdx, distance: 0, parentIdx: -1 }];
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
 *
 * Uses variable cascade easing (ease-in-out cubic) so the wave starts slow
 * near the origin, accelerates through the bulk, then gracefully decelerates
 * at the edges — for a cinematic, organic ripple feel.
 *
 * @param {number} originIdx - Starting triangle
 * @param {Array<Array<number>>} adjacency - Adjacency list
 * @param {number} cascadeDelay - Delay per BFS hop (ms); also used to derive total duration
 * @returns {Array<{index: number, startTime: number, parentIdx: number}>}
 */
export function buildCascadeSchedule(originIdx, adjacency, cascadeDelay = 60) {
  const bfsResult = bfs(originIdx, adjacency);
  const maxDist = bfsResult.length > 0 ? bfsResult[bfsResult.length - 1].distance : 0;
  // totalDuration: same wall-clock spread as before (maxDist * cascadeDelay),
  // but distributed through an ease-in-out curve instead of linearly.
  const totalDuration = maxDist * cascadeDelay;
  return applyVariableCascadeEasing(bfsResult, totalDuration, 0.35);
}

/**
 * Get the maximum start time in a schedule (useful for knowing total cascade duration).
 */
export function cascadeDuration(schedule, foldDuration = 350) {
  if (schedule.length === 0) return 0;
  const maxStart = schedule[schedule.length - 1].startTime;
  return maxStart + foldDuration;
}
