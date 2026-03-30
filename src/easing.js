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
