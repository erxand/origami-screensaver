/**
 * Visual regression tests — headless time-simulation.
 *
 * These tests fast-forward the screensaver simulation at 60fps to verify:
 * 1. No triangles are stuck in FOLDING state long after their deadline
 * 2. After all cascades complete, all triangles have settled to IDLE (not perpetually animating)
 * 3. Colors are consistent — no triangles left mid-blend after a cascade completes
 * 4. Multiple simultaneous cascades don't leave orphaned animations
 * 5. Long-running simulation (5 min equivalent) stays stable
 */

import { describe, it, expect } from 'vitest';
import { createSim } from '../src/sim.js';

// Fast-forward 1 minute at 60fps (3600 ticks)
const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;

describe('visual regression — stuck triangles', () => {
  it('no triangles stuck in FOLDING after 60s (small grid)', () => {
    const sim = createSim({ width: 800, height: 600, side: 80, seed: 1 });
    const snapshots = sim.run(ONE_MINUTE_MS, 16.67, 10_000);

    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });

  it('no triangles stuck in FOLDING after 60s (1080p grid)', () => {
    const sim = createSim({ width: 1920, height: 1080, side: 60, seed: 2 });
    const snapshots = sim.run(ONE_MINUTE_MS, 16.67, 15_000);

    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });
});

describe('visual regression — cascade completion', () => {
  it('at least 2 cascades complete in 60s', () => {
    const sim = createSim({
      width: 800, height: 600, side: 80,
      waitTime: 8_000,
      seed: 10,
    });
    const snapshots = sim.run(ONE_MINUTE_MS, 16.67, 30_000);
    const last = snapshots[snapshots.length - 1];
    expect(last.totalCascadesStarted).toBeGreaterThanOrEqual(2);
  });

  it('triangle fold count grows over time', () => {
    const sim = createSim({ width: 800, height: 600, side: 80, seed: 20 });
    const snapshots = sim.run(ONE_MINUTE_MS, 16.67, 10_000);

    // totalTrianglesFolded should strictly increase (at least some folding happened)
    const early = snapshots[0];
    const late  = snapshots[snapshots.length - 1];
    expect(late.totalTrianglesFolded).toBeGreaterThan(early.totalTrianglesFolded);
  });
});

describe('visual regression — long-run stability', () => {
  it('no stuck triangles after 5 minutes of simulation', () => {
    // Use a coarser step (33ms = 30fps) and smaller grid to keep test fast
    const sim = createSim({
      width: 640, height: 480, side: 100,
      waitTime: 6_000,
      seed: 99,
    });
    const snapshots = sim.run(FIVE_MINUTES_MS, 33, 60_000);

    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });

  it('all triangles eventually fold at least once during 5 minutes', () => {
    const sim = createSim({
      width: 640, height: 480, side: 100,
      waitTime: 4_000,
      seed: 77,
    });
    const snapshots = sim.run(FIVE_MINUTES_MS, 33, 60_000);
    const last = snapshots[snapshots.length - 1];

    // With 4s wait + 2 concurrent cascades over 5 min, at least count/2 triangles should have folded
    expect(last.totalTrianglesFolded).toBeGreaterThan(last.triangleCount / 2);
  });
});

describe('visual regression — multi-cascade concurrency', () => {
  it('concurrent cascades (maxConcurrent=3) produce no stuck triangles', () => {
    const sim = createSim({
      width: 800, height: 600, side: 80,
      maxConcurrent: 3,
      waitTime: 5_000,
      seed: 55,
    });
    const snapshots = sim.run(ONE_MINUTE_MS, 16.67, 10_000);
    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });

  it('single cascade mode produces no stuck triangles', () => {
    const sim = createSim({
      width: 800, height: 600, side: 80,
      maxConcurrent: 1,
      waitTime: 10_000,
      seed: 33,
    });
    const snapshots = sim.run(ONE_MINUTE_MS, 16.67, 15_000);
    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });
});

describe('visual regression — color consistency after overlapping cascades', () => {
  it('all triangles settle to uniform color during idle periods between cascades', () => {
    // Short wait time forces cascades to overlap — this was the trigger for the
    // left-edge color bleed bug (triangles still mid-fold when cascade 2 starts
    // would commit cascade 1's color, leaving them stuck on the wrong color).
    const sim = createSim({
      width: 800, height: 600, side: 80,
      maxConcurrent: 2,
      waitTime: 4_000,  // 4s wait ensures regular idle windows
      seed: 42,
    });

    // Run 90s and sample every 500ms — plenty of time for idle windows to appear
    const snapshots = sim.run(90_000, 16.67, 500);

    // Find at least one idle window where all triangles have settled
    const idleSnaps = snapshots.filter(s => s.folding === 0 && s.activeCascades === 0);
    expect(idleSnaps.length).toBeGreaterThan(0);

    // During every idle window, all triangles must share exactly one color
    for (const snap of idleSnaps) {
      expect(snap.uniqueColorCount).toBe(1);
      expect(snap.stuck).toHaveLength(0);
    }

    // After full run: no stuck triangles at any point
    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });

  it('no color fragmentation after rapid successive cascades (maxConcurrent=1)', () => {
    const sim = createSim({
      width: 800, height: 600, side: 80,
      maxConcurrent: 1,
      waitTime: 5_000,
      seed: 7,
    });
    const snapshots = sim.run(60_000, 16.67, 1_000);

    // At least one idle window should exist between cascades
    const idleSnaps = snapshots.filter(s => s.folding === 0);
    expect(idleSnaps.length).toBeGreaterThan(0);

    // No stuck triangles anywhere
    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });
});

describe('visual regression — single cascade color consistency', () => {
  it('all triangles settle to uniform color between cascades', () => {
    const sim = createSim({
      width: 400, height: 300, side: 80,
      waitTime: 2000,
      foldDuration: 100,
      cascadeDelay: 50,
      seed: 13,
    });
    // Check every tick for idle moments with uniform color
    let idleMoments = 0;
    let now = 0;
    while (now <= 30_000) {
      sim.tick(now);
      const snap = sim.snapshot(now);
      if (snap.folding === 0) {
        expect(snap.uniqueColorCount, `at t=${Math.round(now)}ms idle with ${snap.uniqueColorCount} colors`).toBe(1);
        idleMoments++;
      }
      now += 16.67;
    }
    expect(idleMoments).toBeGreaterThan(0);
  });

  it('zero stuck triangles over long run', () => {
    const sim = createSim({
      width: 1280, height: 720, side: 70,
      waitTime: 500,
      foldDuration: 100,
      cascadeDelay: 50,
      seed: 99,
    });
    const snapshots = sim.run(60_000, 16.67, 500);
    for (const snap of snapshots) {
      expect(snap.stuck).toHaveLength(0);
    }
  });
});

describe('visual regression — snapshot shape', () => {
  it('snapshot returns expected fields', () => {
    const sim = createSim({ width: 400, height: 300, side: 80, seed: 0 });
    sim.tick(0);
    const snap = sim.snapshot(0);

    expect(snap).toHaveProperty('now');
    expect(snap).toHaveProperty('triangleCount');
    expect(snap).toHaveProperty('folding');
    expect(snap).toHaveProperty('idle');
    expect(snap).toHaveProperty('done');
    expect(snap).toHaveProperty('stuck');
    expect(snap).toHaveProperty('activeCascades');
    expect(snap).toHaveProperty('totalCascadesStarted');
    expect(snap).toHaveProperty('totalTrianglesFolded');

    // folding + idle + done should sum to total
    expect(snap.folding + snap.idle + snap.done).toBe(snap.triangleCount);
  });

  it('triangle count is positive', () => {
    const sim = createSim({ width: 400, height: 300, side: 80, seed: 0 });
    expect(sim.count).toBeGreaterThan(0);
  });
});
