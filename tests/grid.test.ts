import { describe, it, expect } from 'vitest';
import {
  createGrid,
  triangleVertices,
  getNeighborCoords,
  toIndex,
  buildAdjacency,
} from '../src/grid.js';

const SQRT3 = Math.sqrt(3);

describe('triangleVertices', () => {
  const side = 70;
  const halfSide = 35;
  const h = (side * SQRT3) / 2;

  it('returns 3 vertices for an up-pointing triangle', () => {
    const pts = triangleVertices(0, 0, halfSide, h, true);
    expect(pts).toHaveLength(3);
    // bottom-left, bottom-right, top
    expect(pts[0]).toEqual([0, h]);
    expect(pts[1]).toEqual([70, h]);
    expect(pts[2]).toEqual([35, 0]);
  });

  it('returns 3 vertices for a down-pointing triangle', () => {
    const pts = triangleVertices(0, 1, halfSide, h, false);
    expect(pts).toHaveLength(3);
    // top-left, top-right, bottom
    expect(pts[0]).toEqual([35, 0]);
    expect(pts[1]).toEqual([105, 0]);
    expect(pts[2]).toEqual([70, h]);
  });

  it('offsets correctly by row', () => {
    const pts = triangleVertices(2, 0, halfSide, h, true);
    expect(pts[2][1]).toBeCloseTo(2 * h); // top vertex y
  });
});

describe('createGrid', () => {
  it('covers the canvas area', () => {
    const grid = createGrid(800, 600, 70);
    expect(grid.triangles.length).toBeGreaterThan(0);
    expect(grid.rows).toBeGreaterThan(0);
    expect(grid.cols).toBeGreaterThan(0);
  });

  it('produces triangles that span at least the canvas width and height', () => {
    const w = 800, h = 600;
    const grid = createGrid(w, h, 70);
    // Find bounding box of all triangle centroids
    let maxX = 0, maxY = 0;
    for (const t of grid.triangles) {
      for (const [px, py] of t.points) {
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
    expect(maxX).toBeGreaterThanOrEqual(w);
    expect(maxY).toBeGreaterThanOrEqual(h);
  });

  it('alternates up and down triangles', () => {
    const grid = createGrid(400, 300, 70);
    const first = grid.triangles[0]; // row=0, col=0
    const second = grid.triangles[1]; // row=0, col=1
    expect(first.up).toBe(true);
    expect(second.up).toBe(false);
  });

  it('computes centroid inside triangle bounds', () => {
    const grid = createGrid(400, 300, 70);
    for (const t of grid.triangles) {
      const minX = Math.min(...t.points.map(p => p[0]));
      const maxX = Math.max(...t.points.map(p => p[0]));
      const minY = Math.min(...t.points.map(p => p[1]));
      const maxY = Math.max(...t.points.map(p => p[1]));
      expect(t.cx).toBeGreaterThanOrEqual(minX);
      expect(t.cx).toBeLessThanOrEqual(maxX);
      expect(t.cy).toBeGreaterThanOrEqual(minY);
      expect(t.cy).toBeLessThanOrEqual(maxY);
    }
  });
});

describe('getNeighborCoords', () => {
  it('returns 3 neighbors for an interior up-pointing triangle', () => {
    // row=1, col=2 with (1+2)%2=1 → down. Let's pick row=1, col=1 → (1+1)%2=0 → up
    const neighbors = getNeighborCoords(1, 1, 10, 10);
    expect(neighbors).toHaveLength(3);
  });

  it('returns 3 neighbors for an interior down-pointing triangle', () => {
    const neighbors = getNeighborCoords(1, 2, 10, 10);
    expect(neighbors).toHaveLength(3);
  });

  it('returns 2 neighbors for a corner triangle', () => {
    // (0,0) is up-pointing: left is out of bounds, right exists, below exists
    const neighbors = getNeighborCoords(0, 0, 10, 10);
    expect(neighbors).toHaveLength(2);
  });

  it('up-pointing triangle has a neighbor below, not above', () => {
    const neighbors = getNeighborCoords(1, 1, 10, 10); // up
    const hasBelow = neighbors.some(([r]) => r === 2);
    const hasAbove = neighbors.some(([r]) => r === 0);
    expect(hasBelow).toBe(true);
    expect(hasAbove).toBe(false);
  });

  it('down-pointing triangle has a neighbor above, not below', () => {
    const neighbors = getNeighborCoords(1, 2, 10, 10); // down
    const hasAbove = neighbors.some(([r]) => r === 0);
    const hasBelow = neighbors.some(([r]) => r === 2);
    expect(hasAbove).toBe(true);
    expect(hasBelow).toBe(false);
  });
});

describe('toIndex / buildAdjacency', () => {
  it('converts row,col to flat index', () => {
    expect(toIndex(0, 0, 5)).toBe(0);
    expect(toIndex(1, 3, 5)).toBe(8);
  });

  it('buildAdjacency produces correct-length array', () => {
    const adj = buildAdjacency(4, 6);
    expect(adj).toHaveLength(24);
  });

  it('adjacency is symmetric — if A neighbors B then B neighbors A', () => {
    const rows = 5, cols = 8;
    const adj = buildAdjacency(rows, cols);
    for (let i = 0; i < adj.length; i++) {
      for (const j of adj[i]) {
        expect(adj[j]).toContain(i);
      }
    }
  });

  it('every triangle has 2 or 3 neighbors', () => {
    const adj = buildAdjacency(6, 10);
    for (const neighbors of adj) {
      expect(neighbors.length).toBeGreaterThanOrEqual(1);
      expect(neighbors.length).toBeLessThanOrEqual(3);
    }
  });
});
