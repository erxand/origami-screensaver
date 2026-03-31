/**
 * Triangle grid geometry — generates equilateral triangle tiles and neighbor lookups.
 *
 * Coordinate system:
 *   - (row, col) identifies each triangle
 *   - Even cols in a row point up (▲), odd cols point down (▽)
 *   - Triangle height h = side * √3 / 2
 *   - Each row of triangles shares a horizontal band of height h
 */

import type { Triangle, GridResult } from './types.js';

const SQRT3 = Math.sqrt(3);

/**
 * Build the full triangle grid for a given canvas size.
 * Returns { triangles, cols, rows, triHeight, triSide }
 */
export function createGrid(canvasWidth: number, canvasHeight: number, side = 70): GridResult {
  const h = (side * SQRT3) / 2; // triangle height
  const halfSide = side / 2;

  // How many rows / cols do we need to cover the canvas (with overflow)?
  const rows = Math.ceil(canvasHeight / h) + 1;
  const cols = Math.ceil(canvasWidth / halfSide) + 1;

  const triangles: Triangle[] = [];
  const triCoords = new Float32Array(rows * cols * 6); // [x0,y0,x1,y1,x2,y2,...], stride 6

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const up = (row + col) % 2 === 0; // alternating up/down
      const points = triangleVertices(row, col, halfSide, h, up);
      const cx = (points[0][0] + points[1][0] + points[2][0]) / 3;
      const cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
      const idx = (row * cols + col) * 6;
      triCoords[idx]     = points[0][0]; triCoords[idx + 1] = points[0][1];
      triCoords[idx + 2] = points[1][0]; triCoords[idx + 3] = points[1][1];
      triCoords[idx + 4] = points[2][0]; triCoords[idx + 5] = points[2][1];
      triangles.push({ row, col, points, cx, cy, up });
    }
  }

  return { triangles, cols, rows, triHeight: h, triSide: side, triCoords };
}

/**
 * Compute the three vertices of triangle (row, col).
 */
export function triangleVertices(
  row: number,
  col: number,
  halfSide: number,
  h: number,
  up: boolean
): [number, number][] {
  const x = col * halfSide;
  const y = row * h;

  if (up) {
    //   top vertex
    //   /\
    //  /  \
    // /____\
    return [
      [x, y + h],            // bottom-left
      [x + halfSide * 2, y + h], // bottom-right
      [x + halfSide, y],     // top
    ];
  } else {
    // \‾‾‾‾/
    //  \  /
    //   \/
    return [
      [x, y],                // top-left
      [x + halfSide * 2, y], // top-right
      [x + halfSide, y + h], // bottom
    ];
  }
}

/**
 * Return indices of the (up to 3) neighbors of triangle at (row, col).
 * Uses the grid dimensions to bounds-check.
 */
export function getNeighborCoords(
  row: number,
  col: number,
  rows: number,
  cols: number
): [number, number][] {
  const up = (row + col) % 2 === 0;
  const neighbors: [number, number][] = [];

  // Left neighbor: same row, col - 1
  if (col > 0) neighbors.push([row, col - 1]);
  // Right neighbor: same row, col + 1
  if (col < cols - 1) neighbors.push([row, col + 1]);

  if (up) {
    // Up-pointing triangle shares its bottom edge with the row below
    if (row < rows - 1) neighbors.push([row + 1, col]);
  } else {
    // Down-pointing triangle shares its top edge with the row above
    if (row > 0) neighbors.push([row - 1, col]);
  }

  return neighbors;
}

/**
 * Convert (row, col) to a flat index.
 */
export function toIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/**
 * Build a full adjacency list (flat array indexed by triangle index).
 */
export function buildAdjacency(rows: number, cols: number): number[][] {
  const adj: number[][] = new Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = toIndex(row, col, cols);
      adj[idx] = getNeighborCoords(row, col, rows, cols).map(
        ([r, c]) => toIndex(r, c, cols)
      );
    }
  }
  return adj;
}
