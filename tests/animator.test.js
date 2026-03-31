import { describe, it, expect } from 'vitest';
import {
  State,
  createAnimState,
  startFold,
  updateAnim,
  resetAnim,
  createAnimStates,
  findFoldEdge,
  findEdgeFoldEdge,
} from '../src/animator.js';

describe('createAnimState', () => {
  it('starts in IDLE state', () => {
    const s = createAnimState();
    expect(s.state).toBe(State.IDLE);
    expect(s.progress).toBe(0);
  });
});

describe('startFold', () => {
  it('transitions to FOLDING state', () => {
    const s = createAnimState();
    startFold(s, 1000, '#bbb', '#aaa', 1, 400);
    expect(s.state).toBe(State.FOLDING);
    expect(s.startTime).toBe(1000);
    expect(s.newColor).toBe('#bbb');
    expect(s.oldColor).toBe('#aaa');
    expect(s.foldEdgeIdx).toBe(1);
    expect(s.duration).toBe(400);
  });
});

describe('updateAnim', () => {
  it('does nothing for IDLE state', () => {
    const s = createAnimState();
    const completed = updateAnim(s, 5000);
    expect(completed).toBe(false);
    expect(s.state).toBe(State.IDLE);
  });

  it('updates progress during fold', () => {
    const s = createAnimState();
    startFold(s, 1000, '#bbb', '#aaa', 0, 400);
    updateAnim(s, 1200); // 200ms into 400ms fold (linear t=0.5)
    // With easing applied, progress won't be exactly 0.5 but should be
    // in the mid-range and the state should still be FOLDING
    expect(s.progress).toBeGreaterThan(0.3);
    expect(s.progress).toBeLessThan(1.1);
    expect(s.state).toBe(State.FOLDING);
  });

  it('completes fold when duration elapsed', () => {
    const s = createAnimState();
    startFold(s, 1000, '#bbb', '#aaa', 0, 400);
    const completed = updateAnim(s, 1400);
    expect(completed).toBe(true);
    expect(s.state).toBe(State.DONE);
    expect(s.progress).toBe(1);
  });

  it('completes fold when time exceeds duration', () => {
    const s = createAnimState();
    startFold(s, 1000, '#bbb', '#aaa', 0, 400);
    const completed = updateAnim(s, 2000);
    expect(completed).toBe(true);
    expect(s.state).toBe(State.DONE);
  });

  it('does nothing for DONE state', () => {
    const s = createAnimState();
    startFold(s, 1000, '#bbb', '#aaa', 0, 400);
    updateAnim(s, 1400); // complete
    const completed = updateAnim(s, 1500);
    expect(completed).toBe(false);
  });
});

describe('resetAnim', () => {
  it('resets DONE state back to IDLE', () => {
    const s = createAnimState();
    startFold(s, 1000, '#bbb', '#aaa', 0, 400);
    updateAnim(s, 1400);
    expect(s.state).toBe(State.DONE);
    resetAnim(s);
    expect(s.state).toBe(State.IDLE);
    expect(s.progress).toBe(0);
  });
});

describe('createAnimStates', () => {
  it('creates an array of the right length', () => {
    const states = createAnimStates(10);
    expect(states).toHaveLength(10);
    expect(states[0].state).toBe(State.IDLE);
  });
});

describe('findFoldEdge', () => {
  it('returns 2 for left neighbor', () => {
    const tri = { row: 1, col: 3 };
    const trigger = { row: 1, col: 2 };
    expect(findFoldEdge(tri, trigger)).toBe(2);
  });

  it('returns 1 for right neighbor', () => {
    const tri = { row: 1, col: 3 };
    const trigger = { row: 1, col: 4 };
    expect(findFoldEdge(tri, trigger)).toBe(1);
  });

  it('returns 0 for vertical neighbor', () => {
    const tri = { row: 1, col: 2 };
    const trigger = { row: 0, col: 2 };
    expect(findFoldEdge(tri, trigger)).toBe(0);
  });
});

describe('findEdgeFoldEdge', () => {
  // Triangle with centroid at (30, 300) — near left edge of 800×600 canvas
  const leftEdgeTri = {
    cx: 30, cy: 300,
    points: [[0, 250], [60, 250], [30, 350]],
  };
  // Triangle with centroid at (400, 300) — interior
  const interiorTri = {
    cx: 400, cy: 300,
    points: [[370, 250], [430, 250], [400, 350]],
  };
  // Triangle with centroid at (770, 300) — near right edge
  const rightEdgeTri = {
    cx: 770, cy: 300,
    points: [[740, 250], [800, 250], [770, 350]],
  };
  // Triangle near top
  const topEdgeTri = {
    cx: 400, cy: 20,
    points: [[370, 0], [430, 0], [400, 60]],
  };

  it('returns -1 for interior triangle', () => {
    expect(findEdgeFoldEdge(interiorTri, 800, 600)).toBe(-1);
  });

  it('returns a valid edge index (0,1,2) for left-edge triangle', () => {
    const result = findEdgeFoldEdge(leftEdgeTri, 800, 600);
    expect([0, 1, 2]).toContain(result);
  });

  it('returns a valid edge index for right-edge triangle', () => {
    const result = findEdgeFoldEdge(rightEdgeTri, 800, 600);
    expect([0, 1, 2]).toContain(result);
  });

  it('returns a valid edge index for top-edge triangle', () => {
    const result = findEdgeFoldEdge(topEdgeTri, 800, 600);
    expect([0, 1, 2]).toContain(result);
  });

  it('returns -1 for centroid exactly at center', () => {
    const tri = { cx: 400, cy: 300, points: [[390, 290], [410, 290], [400, 310]] };
    expect(findEdgeFoldEdge(tri, 800, 600)).toBe(-1);
  });

  it('picks the edge whose midpoint is closest to the nearest boundary', () => {
    // For a left-edge triangle, the left-most edge midpoint should be selected
    // Our leftEdgeTri: edge0 mid=(30,250), edge1 mid=(45,300), edge2 mid=(15,300)
    // Closest boundary distances: edge2 mid x=15 → min=15; edge0 mid x=30 → min=30
    // So edge2 (index 2) should win
    const result = findEdgeFoldEdge(leftEdgeTri, 800, 600);
    expect(result).toBe(2);
  });
});
