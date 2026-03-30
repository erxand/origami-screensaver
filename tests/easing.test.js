import { describe, it, expect } from 'vitest';
import { easeInOut, easeWithOvershoot, easeInOutCubic, applyVariableCascadeEasing } from '../src/easing.js';

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

describe('easeInOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeInOutCubic(1)).toBeCloseTo(1, 5);
  });

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0.01; t <= 1.0; t += 0.01) {
      const val = easeInOutCubic(t);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = val;
    }
  });

  it('starts slow (less than linear at t=0.1)', () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });

  it('ends slow (greater than linear at t=0.9)', () => {
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });

  it('cubic is stronger than quadratic easeInOut', () => {
    // At t=0.25, cubic starts slower than quadratic
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOut(0.25));
  });
});

describe('applyVariableCascadeEasing', () => {
  it('returns empty array for empty input', () => {
    expect(applyVariableCascadeEasing([])).toEqual([]);
  });

  it('single origin triangle has startTime=0', () => {
    const result = applyVariableCascadeEasing([{ index: 0, distance: 0, parentIdx: -1 }], 1000);
    expect(result[0].startTime).toBe(0);
  });

  it('preserves index and parentIdx', () => {
    const input = [
      { index: 5, distance: 0, parentIdx: -1 },
      { index: 3, distance: 1, parentIdx: 5 },
      { index: 7, distance: 2, parentIdx: 3 },
    ];
    const result = applyVariableCascadeEasing(input, 1000, 0);
    expect(result[0].index).toBe(5);
    expect(result[1].index).toBe(3);
    expect(result[1].parentIdx).toBe(5);
  });

  it('start times are non-decreasing on average (easing is monotone)', () => {
    const input = Array.from({ length: 20 }, (_, i) => ({ index: i, distance: i, parentIdx: i - 1 }));
    const result = applyVariableCascadeEasing(input, 2000, 0); // no jitter
    for (let i = 1; i < result.length; i++) {
      expect(result[i].startTime).toBeGreaterThanOrEqual(result[i - 1].startTime);
    }
  });

  it('last triangle start time is close to totalDuration (no jitter)', () => {
    const input = Array.from({ length: 11 }, (_, i) => ({ index: i, distance: i, parentIdx: i - 1 }));
    const result = applyVariableCascadeEasing(input, 1000, 0);
    expect(result[result.length - 1].startTime).toBeCloseTo(1000, 0);
  });
});
