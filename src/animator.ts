/**
 * Per-triangle fold animation state machine.
 *
 * States: IDLE → FOLDING → DONE
 *
 * Each triangle has an AnimState that tracks its fold progress.
 */

import { easeWithOvershoot } from './easing.js';
import type { AnimState, Triangle } from './types.js';

export const State = {
  IDLE: 'IDLE' as const,
  FOLDING: 'FOLDING' as const,
  DONE: 'DONE' as const,
};

/**
 * Create an animation state for a single triangle.
 */
export function createAnimState(): AnimState {
  return {
    state: State.IDLE,
    progress: 0,       // 0..1
    startTime: 0,      // timestamp when fold starts
    duration: 350,      // ms for the fold
    oldColor: null,
    newColor: null,
    foldEdgeIdx: 0,    // which edge to fold along
  };
}

/**
 * Start folding a triangle.
 */
export function startFold(
  animState: AnimState,
  startTime: number,
  newColor: string,
  oldColor: string,
  foldEdgeIdx: number,
  duration = 600
): void {
  animState.state = State.FOLDING;
  animState.progress = 0;
  animState.startTime = startTime;
  animState.duration = Math.max(400, duration); // minimum 400ms for visibility
  animState.oldColor = oldColor;
  animState.newColor = newColor;
  animState.foldEdgeIdx = foldEdgeIdx;
}

/**
 * Update a triangle's animation based on current time.
 * Returns true if the triangle just completed its fold.
 */
export function updateAnim(animState: AnimState, now: number): boolean {
  if (animState.state !== State.FOLDING) return false;

  const elapsed = now - animState.startTime;
  if (elapsed >= animState.duration) {
    animState.progress = 1;
    animState.state = State.DONE;
    return true;
  }

  const linear = elapsed / animState.duration;
  animState.progress = easeWithOvershoot(linear);
  return false;
}

/**
 * Reset a DONE triangle back to IDLE (for the next cascade cycle).
 */
export function resetAnim(animState: AnimState): void {
  animState.state = State.IDLE;
  animState.progress = 0;
  animState.oldColor = null;
  animState.newColor = null;
}

/**
 * Create an array of anim states for the entire grid.
 */
export function createAnimStates(count: number): AnimState[] {
  return Array.from({ length: count }, () => createAnimState());
}

/**
 * Determine if a triangle is at the viewport boundary and return the edge
 * index closest to the nearest screen edge (for "peeling off the wall" fold).
 */
export function findEdgeFoldEdge(
  tri: Triangle,
  canvasWidth: number,
  canvasHeight: number,
  threshold = 55
): number {
  const { cx, cy, points: pts } = tri;

  // Only apply to triangles whose centroid is within `threshold` of any viewport edge
  const nearLeft   = cx < threshold;
  const nearRight  = cx > canvasWidth - threshold;
  const nearTop    = cy < threshold;
  const nearBottom = cy > canvasHeight - threshold;

  if (!nearLeft && !nearRight && !nearTop && !nearBottom) return -1;

  // Find which edge midpoint is closest to the nearest viewport boundary
  const edges: [[number, number], [number, number]][] = [
    [pts[0] as [number, number], pts[1] as [number, number]], // edge 0
    [pts[1] as [number, number], pts[2] as [number, number]], // edge 1
    [pts[2] as [number, number], pts[0] as [number, number]], // edge 2
  ];

  let bestEdge = 0;
  let bestScore = Infinity;

  for (let i = 0; i < 3; i++) {
    const mx = (edges[i][0][0] + edges[i][1][0]) / 2;
    const my = (edges[i][0][1] + edges[i][1][1]) / 2;

    // Score = distance to the closest viewport boundary
    const score = Math.min(mx, canvasWidth - mx, my, canvasHeight - my);
    if (score < bestScore) {
      bestScore = score;
      bestEdge = i;
    }
  }

  return bestEdge;
}

/**
 * Determine the fold edge index for a triangle being triggered by a neighbor.
 * The fold edge is the shared edge between the triangle and its trigger.
 */
export function findFoldEdge(tri: Triangle, triggerTri: Triangle): number {
  const dc = triggerTri.col - tri.col;

  if (dc === -1) {
    // Left neighbor — shared edge is the left edge
    return 2;
  }
  if (dc === 1) {
    // Right neighbor — shared edge is the right edge
    return 1;
  }
  // Vertical neighbor — shared horizontal edge
  return 0;
}
