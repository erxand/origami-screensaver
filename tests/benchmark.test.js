import { describe, it, expect } from 'vitest';
import { createGrid, buildAdjacency } from '../src/grid.js';
import { createRenderer } from '../src/renderer.js';
import { createAnimStates, startFold, updateAnim, findFoldEdge, State } from '../src/animator.js';
import { buildCascadeSchedule } from '../src/cascade.js';
import { createPaletteCycler } from '../src/palette.js';
import { vi } from 'vitest';

function mockCtx() {
  return {
    canvas: { width: 800, height: 600 },
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    createPattern: vi.fn(() => null),
  };
}

describe('benchmark: render performance', () => {
  it('renders 500 triangles in under 50ms per frame (mock canvas)', () => {
    const grid = createGrid(800, 600, 50);
    const ctx = mockCtx();
    const renderer = createRenderer(ctx);
    const colors = new Array(grid.triangles.length).fill('#f8c3cd');
    const renderAnims = new Array(grid.triangles.length).fill(null);

    const t0 = performance.now();
    const frames = 20;
    for (let f = 0; f < frames; f++) {
      renderer.renderFrame(grid.triangles, colors, renderAnims);
    }
    const avgMs = (performance.now() - t0) / frames;

    expect(avgMs).toBeLessThan(50);
  });

  it('renders with active animations without exceeding budget', () => {
    const grid = createGrid(800, 600, 60);
    const adjacency = buildAdjacency(grid.rows, grid.cols);
    const ctx = mockCtx();
    const renderer = createRenderer(ctx);
    const animStates = createAnimStates(grid.triangles.length);
    const colors = new Array(grid.triangles.length).fill('#f8c3cd');
    const renderAnims = new Array(grid.triangles.length).fill(null);

    // Start cascade
    const schedule = buildCascadeSchedule(0, adjacency, 60);
    for (const entry of schedule) {
      const tri = grid.triangles[entry.index];
      let foldEdgeIdx = 0;
      if (entry.parentIdx >= 0) {
        foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
      }
      startFold(animStates[entry.index], 1000 + entry.startTime, '#bbb', '#aaa', foldEdgeIdx, 400);
    }

    // Simulate mid-cascade
    const now = 1000 + 200;
    for (let i = 0; i < animStates.length; i++) {
      if (animStates[i].state === State.FOLDING) updateAnim(animStates[i], now);
    }
    for (let i = 0; i < animStates.length; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        if (!renderAnims[i]) renderAnims[i] = {};
        renderAnims[i].progress = a.progress;
        renderAnims[i].oldColor = a.oldColor;
        renderAnims[i].newColor = a.newColor;
        renderAnims[i].foldEdgeIdx = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }

    const t0 = performance.now();
    renderer.renderFrame(grid.triangles, colors, renderAnims);
    const elapsed = performance.now() - t0;

    // Should complete in reasonable time with mock canvas
    expect(elapsed).toBeLessThan(100);
  });
});

describe('benchmark: cascade scheduling', () => {
  it('builds schedule for 1000+ triangles in under 20ms', () => {
    const grid = createGrid(1920, 1080, 55);
    const adjacency = buildAdjacency(grid.rows, grid.cols);

    const t0 = performance.now();
    const iterations = 10;
    for (let i = 0; i < iterations; i++) {
      buildCascadeSchedule(Math.floor(Math.random() * grid.triangles.length), adjacency, 60);
    }
    const avgMs = (performance.now() - t0) / iterations;

    expect(avgMs).toBeLessThan(20);
  });
});

describe('benchmark: animation update', () => {
  it('updates 2000 anim states in under 5ms', () => {
    const count = 2000;
    const animStates = createAnimStates(count);
    for (let i = 0; i < count; i++) {
      startFold(animStates[i], 1000 + i * 0.5, '#bbb', '#aaa', i % 3, 400);
    }

    const t0 = performance.now();
    const iterations = 100;
    for (let f = 0; f < iterations; f++) {
      const now = 1000 + f * 16.67;
      for (let i = 0; i < count; i++) {
        if (animStates[i].state === State.FOLDING) {
          updateAnim(animStates[i], now);
        }
      }
    }
    const avgMs = (performance.now() - t0) / iterations;

    expect(avgMs).toBeLessThan(5);
  });
});
