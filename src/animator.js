/**
 * Per-triangle fold animation state machine.
 *
 * States: IDLE → FOLDING → DONE
 *
 * Each triangle has an AnimState that tracks its fold progress.
 */

import { easeWithOvershoot } from './easing.js';

export const State = {
  IDLE: 'IDLE',
  FOLDING: 'FOLDING',
  DONE: 'DONE',
};

/**
 * Create an animation state for a single triangle.
 */
export function createAnimState() {
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
export function startFold(animState, startTime, newColor, oldColor, foldEdgeIdx, duration = 600) {
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
export function updateAnim(animState, now) {
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
export function resetAnim(animState) {
  animState.state = State.IDLE;
  animState.progress = 0;
  animState.oldColor = null;
  animState.newColor = null;
}

/**
 * Create an array of anim states for the entire grid.
 */
export function createAnimStates(count) {
  return Array.from({ length: count }, () => createAnimState());
}

/**
 * Determine the fold edge index for a triangle being triggered by a neighbor.
 * The fold edge is the shared edge between the triangle and its trigger.
 *
 * @param {object} tri - Triangle { row, col, points, up }
 * @param {object} triggerTri - The neighbor that triggered this fold
 * @param {number} cols - Grid column count
 * @returns {number} Edge index (0, 1, or 2)
 */
export function findFoldEdge(tri, triggerTri) {
  const dr = triggerTri.row - tri.row;
  const dc = triggerTri.col - tri.col;

  if (dc === -1) {
    // Left neighbor — shared edge is the left edge
    // For up triangle: edge between points[0] (bottom-left) and points[2] (top) → edge index 2
    // For down triangle: edge between points[0] (top-left) and points[2] (bottom) → edge index 2
    return 2;
  }
  if (dc === 1) {
    // Right neighbor — shared edge is the right edge
    // For up triangle: edge between points[1] (bottom-right) and points[2] (top) → edge index 1
    // For down triangle: edge between points[1] (top-right) and points[2] (bottom) → edge index 1
    return 1;
  }
  // Vertical neighbor (dr !== 0, dc === 0) — shared horizontal edge
  // For up triangle: bottom edge between points[0] and points[1] → edge index 0
  // For down triangle: top edge between points[0] and points[1] → edge index 0
  return 0;
}
