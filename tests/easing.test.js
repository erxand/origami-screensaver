import { describe, it, expect } from 'vitest';
import { easeInOut, easeWithOvershoot } from '../src/easing.js';

describe('easeInOut', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOut(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeInOut(1)).toBe(1);
  });

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0.01; t <= 1.0; t += 0.01) {
      const val = easeInOut(t);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('starts slow (ease-in)', () => {
    // At t=0.1, eased value should be less than linear 0.1
    expect(easeInOut(0.1)).toBeLessThan(0.1);
  });

  it('ends slow (ease-out)', () => {
    // At t=0.9, eased value should be greater than linear 0.9
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
});

describe('easeWithOvershoot', () => {
  it('returns 0 at t=0', () => {
    expect(easeWithOvershoot(0)).toBe(0);
  });

  it('returns approximately 1 at t=1', () => {
    expect(easeWithOvershoot(1)).toBeCloseTo(1, 2);
  });

  it('overshoots past 1.0 at some point', () => {
    let maxVal = 0;
    for (let t = 0; t <= 1.0; t += 0.001) {
      maxVal = Math.max(maxVal, easeWithOvershoot(t));
    }
    expect(maxVal).toBeGreaterThan(1.0);
  });

  it('overshoot is small (under 0.05)', () => {
    let maxVal = 0;
    for (let t = 0; t <= 1.0; t += 0.001) {
      maxVal = Math.max(maxVal, easeWithOvershoot(t));
    }
    expect(maxVal).toBeLessThan(1.05);
  });

  it('starts at 0 and ends near 1', () => {
    expect(easeWithOvershoot(0)).toBe(0);
    expect(Math.abs(easeWithOvershoot(1) - 1)).toBeLessThan(0.01);
  });
});
