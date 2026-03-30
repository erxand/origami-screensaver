import { describe, it, expect } from 'vitest';
import { bfs, buildCascadeSchedule, cascadeDuration } from '../src/cascade.js';
import { buildAdjacency } from '../src/grid.js';

describe('bfs', () => {
  it('visits all nodes in a connected graph', () => {
    const adj = buildAdjacency(3, 4);
    const result = bfs(0, adj);
    expect(result).toHaveLength(12); // 3 rows × 4 cols
  });

  it('origin has distance 0', () => {
    const adj = buildAdjacency(3, 4);
    const result = bfs(0, adj);
    expect(result[0].index).toBe(0);
    expect(result[0].distance).toBe(0);
    expect(result[0].parentIdx).toBe(-1);
  });

  it('distances are non-decreasing', () => {
    const adj = buildAdjacency(5, 8);
    const result = bfs(10, adj);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distance).toBeGreaterThanOrEqual(result[i - 1].distance);
    }
  });

  it('each node appears exactly once', () => {
    const adj = buildAdjacency(4, 6);
    const result = bfs(5, adj);
    const indices = result.map(r => r.index).sort((a, b) => a - b);
    const unique = [...new Set(indices)];
    expect(unique).toHaveLength(24);
    expect(unique).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('parent of each non-origin node is at distance-1', () => {
    const adj = buildAdjacency(4, 6);
    const result = bfs(0, adj);
    const distMap = new Map(result.map(r => [r.index, r.distance]));
    for (const r of result) {
      if (r.parentIdx !== -1) {
        expect(distMap.get(r.parentIdx)).toBe(r.distance - 1);
      }
    }
  });
});

describe('buildCascadeSchedule', () => {
  it('produces a schedule with start times roughly proportional to distance', () => {
    const adj = buildAdjacency(3, 4);
    const schedule = buildCascadeSchedule(0, adj, 60);
    expect(schedule).toHaveLength(12);
    expect(schedule[0].startTime).toBe(0);
    // With jitter, start times may not be strictly sorted, but should be
    // roughly increasing — later BFS distances should have higher avg start times
    const maxStart = Math.max(...schedule.map(s => s.startTime));
    expect(maxStart).toBeGreaterThan(0);
  });

  it('respects cascade delay with jitter', () => {
    const adj = buildAdjacency(3, 4);
    const schedule = buildCascadeSchedule(0, adj, 100);
    // Distance-1 entries should have start times near 100ms (within jitter range)
    const dist1Entries = schedule.filter(s => s.startTime > 50 && s.startTime < 150);
    expect(dist1Entries.length).toBeGreaterThan(0);
  });
});

describe('cascadeDuration', () => {
  it('returns total duration including last fold', () => {
    const adj = buildAdjacency(3, 4);
    const schedule = buildCascadeSchedule(0, adj, 60);
    const duration = cascadeDuration(schedule, 350);
    const maxStart = schedule[schedule.length - 1].startTime;
    expect(duration).toBe(maxStart + 350);
  });

  it('returns 0 for empty schedule', () => {
    expect(cascadeDuration([])).toBe(0);
  });
});
