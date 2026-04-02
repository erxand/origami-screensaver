/**
 * Easing functions for smooth fold animations.
 */

import type { BfsEntry, CascadeEntry } from './types.js';

/**
 * Smooth ease-in-out (quadratic).
 * t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Ease-in-out cubic — stronger, more cinematic than quadratic.
 * Used for cascade wave timing: slow start, fast middle, ease out.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Apply variable cascade easing to a BFS schedule.
 *
 * Instead of linear distance → time, we map BFS distance through an ease-in-out
 * curve so the wave starts slow (triangle-by-triangle near the origin),
 * accelerates through the bulk, then decelerates gracefully at the edges.
 */
export function applyVariableCascadeEasing(
  bfsResult: BfsEntry[],
  totalDuration = 4000,
  jitterFraction = 0.3
): CascadeEntry[] {
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
 * Three-phase fold easing with spring overshoot:
 *   Phase 1 (0–0.25):   Slow start — paper peeling off, ease-in
 *   Phase 2 (0.25–0.80): Cruising — steady, natural speed
 *   Phase 3 (0.80–1.0):  Fast finish — paper snapping down, ease-out with overshoot
 *
 * Output is continuous and smooth (no visible kinks between phases).
 * Overshoots to ~1.03 then settles to 1.0 to simulate paper bounce.
 */
export function easeWithOvershoot(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Phase 1: slow start (ease-in quadratic, mapped to 0→0.15 of output)
  if (t < 0.25) {
    const p = t / 0.25; // 0→1 within phase
    return p * p * 0.15; // quadratic ease-in, covers 0→0.15
  }

  // Phase 2: cruising (linear-ish, covers 0.15→0.85 of output)
  if (t < 0.80) {
    const p = (t - 0.25) / 0.55; // 0→1 within phase
    return 0.15 + p * 0.70; // linear, covers 0.15→0.85
  }

  // Phase 3: fast finish with overshoot (0.85→~1.03→1.0)
  const p = (t - 0.80) / 0.20; // 0→1 within phase
  // Cubic ease-out that overshoots: peaks at ~1.03, settles to 1.0
  const s = 1.2; // overshoot strength
  const p1 = p - 1;
  const overshoot = 1 + p1 * p1 * ((s + 1) * p1 + s);
  // Map from 0→1+overshoot to 0.85→1.0+overshoot
  return 0.85 + overshoot * 0.15;
}
