/**
 * Easing functions for smooth fold animations.
 */

/**
 * Smooth ease-in-out (quadratic).
 * t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t
 */
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Ease-in-out cubic — stronger, more cinematic than quadratic.
 * Used for cascade wave timing: slow start, fast middle, ease out.
 */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Apply variable cascade easing to a BFS schedule.
 *
 * Instead of linear distance → time, we map BFS distance through an ease-in-out
 * curve so the wave starts slow (triangle-by-triangle near the origin),
 * accelerates through the bulk, then decelerates gracefully at the edges.
 *
 * @param {Array<{index, distance, parentIdx}>} bfsResult - Raw BFS output
 * @param {number} totalDuration - Total cascade spread duration in ms
 * @param {number} jitterFraction - Per-triangle jitter as fraction of hop time (0–0.4)
 * @returns {Array<{index, startTime, parentIdx}>}
 */
export function applyVariableCascadeEasing(bfsResult, totalDuration = 4000, jitterFraction = 0.3) {
  if (bfsResult.length === 0) return [];
  const maxDist = bfsResult[bfsResult.length - 1].distance;
  if (maxDist === 0) return bfsResult.map(({ index, parentIdx }) => ({ index, startTime: 0, parentIdx }));

  // Average hop duration for jitter scaling
  const avgHopMs = totalDuration / maxDist;
  const jitterRange = avgHopMs * jitterFraction;

  return bfsResult.map(({ index, distance, parentIdx }) => {
    const t = distance / maxDist; // normalized 0..1
    const easedT = easeInOutCubic(t);
    const base = easedT * totalDuration;
    const jitter = distance > 0 ? Math.random() * jitterRange : 0;
    return { index, startTime: base + jitter, parentIdx };
  });
}

/**
 * Spring overshoot easing — goes past 1.0 then settles back.
 * Used for the fold to simulate paper overshooting ~185° then easing to 180°.
 * Overshoot peaks at ~1.03 around t≈0.82, then eases back to 1.0.
 */
export function easeWithOvershoot(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Back-ease-out formula: overshoots then returns
  // s controls overshoot amount (~0.03 overshoot of final value)
  const s = 1.0;
  const t1 = t - 1;
  return 1 + t1 * t1 * ((s + 1) * t1 + s);
}
