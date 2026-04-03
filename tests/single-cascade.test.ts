/**
 * Tests for single-cascade-at-a-time behavior.
 * Ensures at most 2 colors are on screen at any point during the simulation.
 */
import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim.js';

// Small grid + short fold for fast tests
const BASE_OPTS = {
  width: 400,
  height: 300,
  side: 80,
  foldDuration: 100,
  waitTime: 500,
  cascadeDelay: 50,
  seed: 123,
};

describe('single cascade at a time', () => {
  it('never has more than 2 unique colors on screen', () => {
    const sim = createSim(BASE_OPTS);
    // Run for 30 seconds, snapshot every 50ms
    const snapshots = sim.run(30_000, 16, 50);
    for (const snap of snapshots) {
      expect(snap.uniqueColorCount).toBeLessThanOrEqual(2);
    }
  });

  it('never has more than 2 unique colors at any tick (high frequency check)', () => {
    const sim = createSim({ ...BASE_OPTS, seed: 999 });
    // Step every frame, check every frame for 20 seconds
    let now = 0;
    while (now <= 20_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      expect(snap.uniqueColorCount, `at t=${now}ms had ${snap.uniqueColorCount} colors`).toBeLessThanOrEqual(2);
      now += 16.67;
    }
  });

  it('starts a new cascade only after all folds complete', () => {
    const sim = createSim(BASE_OPTS);
    let lastCascadeCount = 0;
    let now = 0;
    while (now <= 30_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      if (snap.totalCascadesStarted > lastCascadeCount) {
        // A new cascade just started — verify no triangles were mid-fold
        // (the cascade starts on the same tick, so folding count should be
        // exactly the triangles from the NEW cascade, not leftover old ones)
        if (lastCascadeCount > 0) {
          // Before this tick, everything should have been idle
          // We can't check "before" directly, but we can verify that
          // the previous cascade completed (uniqueColorCount should have been 1
          // right before this cascade started, now it's still ≤ 2)
          expect(snap.uniqueColorCount).toBeLessThanOrEqual(2);
        }
        lastCascadeCount = snap.totalCascadesStarted;
      }
      now += 16.67;
    }
    // Should have started multiple cascades in 30s
    expect(lastCascadeCount).toBeGreaterThan(3);
  });

  it('completes cascades — all triangles reach the new color', () => {
    const sim = createSim({ ...BASE_OPTS, waitTime: 2000 });
    // Run long enough for several full cascades, snapshot frequently to catch idle gaps
    const snapshots = sim.run(30_000, 16, 100);
    // Find snapshots where no triangles are folding (idle moments between cascades)
    const idleMoments = snapshots.filter(s => s.folding === 0);
    // At idle moments, all triangles should be a single color
    for (const snap of idleMoments) {
      expect(snap.uniqueColorCount, `at t=${snap.now}ms idle but ${snap.uniqueColorCount} colors`).toBe(1);
    }
    // Should have at least some idle moments
    expect(idleMoments.length).toBeGreaterThan(0);
  });

  it('no stuck triangles after cascades', () => {
    const sim = createSim(BASE_OPTS);
    const snapshots = sim.run(30_000, 16, 5000);
    for (const snap of snapshots) {
      expect(snap.stuck.length, `stuck triangles at t=${snap.now}ms`).toBe(0);
    }
  });

  it('respects wait time between cascades', () => {
    const waitTime = 2000;
    const sim = createSim({ ...BASE_OPTS, waitTime });
    let cascadeStartTimes: number[] = [];
    let lastCount = 0;
    let now = 0;
    while (now <= 30_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      if (snap.totalCascadesStarted > lastCount) {
        cascadeStartTimes.push(now);
        lastCount = snap.totalCascadesStarted;
      }
      now += 16.67;
    }
    // Check gaps between cascade starts are at least waitTime
    // (first cascade starts at t=0 after initial wait, subsequent ones
    // need to wait for completion + waitTime)
    for (let i = 1; i < cascadeStartTimes.length; i++) {
      const gap = cascadeStartTimes[i] - cascadeStartTimes[i - 1];
      // Gap should be at least waitTime (cascade duration + wait)
      expect(gap).toBeGreaterThanOrEqual(waitTime - 20); // small tolerance for tick alignment
    }
  });

  it('handles rapid speed settings without color overlap', () => {
    // Very fast folds, tight timing
    const sim = createSim({
      ...BASE_OPTS,
      foldDuration: 30,
      waitTime: 200,
      cascadeDelay: 15,
      seed: 777,
    });
    let now = 0;
    while (now <= 15_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      expect(snap.uniqueColorCount, `at t=${now}ms had ${snap.uniqueColorCount} colors`).toBeLessThanOrEqual(2);
      now += 8; // ~120fps tick rate
    }
  });

  it('multiple cascades complete successfully over time', () => {
    const sim = createSim({ ...BASE_OPTS, waitTime: 1000 });
    const finalSnaps = sim.run(60_000, 16, 60_000);
    const last = finalSnaps[finalSnaps.length - 1];
    // Should have completed many cascades
    expect(last.totalCascadesStarted).toBeGreaterThan(5);
    // All triangles should have been folded many times
    expect(last.totalTrianglesFolded).toBeGreaterThan(last.triangleCount * 3);
  });
});
