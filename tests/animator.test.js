import { describe, it, expect } from 'vitest';
import {
  State,
  createAnimState,
  startFold,
  updateAnim,
  resetAnim,
  createAnimStates,
  findFoldEdge,
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
    updateAnim(s, 1200); // 200ms into 400ms fold
    expect(s.progress).toBeCloseTo(0.5);
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
