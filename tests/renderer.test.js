import { describe, it, expect, vi } from 'vitest';
import { createRenderer, triVariation, applyTriVariation, creaseColor } from '../src/renderer.js';

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

// ---------------------------------------------------------------------------
// Color utility tests
// ---------------------------------------------------------------------------

describe('triVariation', () => {
  it('returns a value in [-0.08, +0.08]', () => {
    for (let i = 0; i < 1000; i++) {
      const v = triVariation(i);
      expect(v).toBeGreaterThanOrEqual(-0.08);
      expect(v).toBeLessThanOrEqual(0.08);
    }
  });

  it('is deterministic (same index → same value)', () => {
    expect(triVariation(42)).toBe(triVariation(42));
    expect(triVariation(0)).toBe(triVariation(0));
    expect(triVariation(9999)).toBe(triVariation(9999));
  });

  it('varies across indices (not all the same)', () => {
    const vals = new Set([0, 1, 2, 3, 4, 5, 100, 200, 300].map(triVariation));
    expect(vals.size).toBeGreaterThan(1);
  });
});

describe('applyTriVariation', () => {
  it('returns the original color when index is -1', () => {
    expect(applyTriVariation('#ff0000', -1)).toBe('#ff0000');
  });

  it('returns a valid hex color for a positive index', () => {
    const result = applyTriVariation('#ff8800', 42);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces different colors for different triangle indices on the same base color', () => {
    const results = [0, 1, 2, 50, 100].map(i => applyTriVariation('#7fbfff', i));
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('is deterministic per index', () => {
    expect(applyTriVariation('#aabbcc', 7)).toBe(applyTriVariation('#aabbcc', 7));
  });

  it('passes through non-hex colors unchanged', () => {
    expect(applyTriVariation('rgba(255,0,0,1)', 5)).toBe('rgba(255,0,0,1)');
  });
});

describe('creaseColor', () => {
  it('returns a hex color darker than the input', () => {
    const result = creaseColor('#ff8800');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    // The resulting color should be numerically smaller (darker) in all channels
    const [r1, g1, b1] = [
      parseInt('ff', 16),
      parseInt('88', 16),
      parseInt('00', 16),
    ];
    const [r2, g2, b2] = [
      parseInt(result.slice(1, 3), 16),
      parseInt(result.slice(3, 5), 16),
      parseInt(result.slice(5, 7), 16),
    ];
    expect(r2).toBeLessThanOrEqual(r1);
    expect(g2).toBeLessThanOrEqual(g1);
    expect(b2).toBeLessThanOrEqual(b1);
  });

  it('passes through non-hex colors unchanged', () => {
    expect(creaseColor('rgba(0,0,0,1)')).toBe('rgba(0,0,0,1)');
  });

  it('handles pure black without crashing', () => {
    const result = creaseColor('#000000');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Renderer tests
// ---------------------------------------------------------------------------

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
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('drawTriangle() applies triIndex variation when provided', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    // Should not throw — variation applied internally
    r.drawTriangle(pts, '#aabbcc', 42);
    expect(ctx.fill).toHaveBeenCalled();
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
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drawFoldingTriangle at progress=0.01 draws old color on top of new', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    r.drawFoldingTriangle(pts, '#aaa', '#bbb', 0.01, 0);
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drawFoldingTriangle at progress=0.99 draws new color', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    r.drawFoldingTriangle(pts, '#aaa', '#bbb', 0.99, 0);
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drawFoldingTriangle accepts triIndex parameter', () => {
    const ctx = mockCtx();
    const r = createRenderer(ctx);
    const pts = [[0, 0], [100, 0], [50, 86]];
    r.drawFoldingTriangle(pts, '#aabbcc', '#ddeeff', 0.3, 1, 99);
    expect(ctx.fill).toHaveBeenCalled();
  });
});
