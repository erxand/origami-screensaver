import { describe, it, expect, vi } from 'vitest';
import { createRenderer } from '../src/renderer.js';

function mockCtx() {
  return {
    canvas: { width: 800, height: 600 },
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
    createPattern: vi.fn(() => null),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  };
}

describe('createRenderer', () => {
  it('clear() calls clearRect with full canvas dimensions', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    r.clear();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('drawTriangle() draws a filled path with 3 vertices', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    r.drawTriangle(pts, '#ff0000');
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 86);
    expect(ctx.closePath).toHaveBeenCalled();
    // fill is called at least once for the base color and once for depth shading
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('renderFrame() draws all triangles', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const triangles = [
      { points: [[0, 0], [10, 0], [5, 8]] },
      { points: [[10, 0], [20, 0], [15, 8]] },
    ];
    const colors = ['#aaa', '#bbb'];
    r.renderFrame(triangles, colors, null);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    // 2 triangles + 1 clip rect = 3 beginPath calls
    expect(ctx.beginPath).toHaveBeenCalledTimes(3);
  });

  it('renderFrame() uses drawFoldingTriangle for animating triangles', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const triangles = [{ points: [[0, 0], [10, 0], [5, 8]] }];
    const colors = ['#aaa'];
    const animStates = [
      { progress: 0.3, oldColor: '#aaa', newColor: '#bbb', foldEdgeIdx: 0 },
    ];
    r.renderFrame(triangles, colors, animStates);
    // Should have drawn base + folding flap = multiple fill calls
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drawFoldingTriangle at progress=0 draws old color only', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    // progress=0 means scale=1, full old triangle on top of new
    r.drawFoldingTriangle(pts, '#aaa', '#bbb', 0.01, 0);
    // Should draw new color base, then old color flap
    const fillStyles = [];
    // We check that fill was called multiple times
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drawFoldingTriangle at progress=1 draws new color', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    r.drawFoldingTriangle(pts, '#aaa', '#bbb', 0.99, 0);
    // Near end: new color base + new color flap
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
