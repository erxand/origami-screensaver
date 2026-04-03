/**
 * Stress test for left-edge triangle color consistency.
 * Maximizes cascade overlap and rapid transitions.
 */
import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim.js';

describe('left-edge stress — rapid overlapping cascades', () => {
  it('no color errors at idle with rapid cascades (maxConcurrent=2, very short wait)', () => {
    // Maximize overlap: super short folds + tiny wait
    const sim = createSim({
      width: 400,
      height: 300,
      side: 80,
      foldDuration: 50,
      waitTime: 100,
      cascadeDelay: 25,
      maxConcurrent: 2,
      seed: 42,
    });

    let colorErrors = 0;
    let idleCount = 0;
    let now = 0;
    while (now <= 10_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      if (snap.folding === 0 && snap.activeCascades === 0) {
        idleCount++;
        if (snap.uniqueColorCount !== 1) {
          colorErrors++;
        }
      }
      now += 8.33;
    }
    expect(idleCount).toBeGreaterThan(0);
    expect(colorErrors).toBe(0);
  });

  it('no color errors with very short wait forcing cascades to start before completion', () => {
    const sim = createSim({
      width: 400,
      height: 300,
      side: 80,
      foldDuration: 200,
      waitTime: 50,  // start new cascade before old one finishes
      cascadeDelay: 30,
      maxConcurrent: 2,
      seed: 17,
    });

    let colorErrors: number[] = [];
    let now = 0;
    while (now <= 30_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      if (snap.folding === 0 && snap.activeCascades === 0) {
        if (snap.uniqueColorCount !== 1) {
          colorErrors.push(now);
        }
      }
      now += 16.67;
    }
    expect(colorErrors).toHaveLength(0);
  });
});
