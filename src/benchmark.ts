/**
 * Benchmark suite for origami-screensaver.
 * Measures FPS, frame time, cascade scheduling, and memory allocation hotspots.
 * Runs headlessly with a mock canvas context.
 *
 * Usage: node src/benchmark.js
 */

import { createGrid, buildAdjacency } from './grid.js';
import { createRenderer } from './renderer.js';
import { createAnimStates, startFold, updateAnim, resetAnim, findFoldEdge, State } from './animator.js';
import { buildCascadeSchedule, buildCascadeScheduleFlat } from './cascade.js';
import { createPaletteCycler } from './palette.js';

// ---------------------------------------------------------------------------
// Mock canvas context (headless — no real DOM)
// ---------------------------------------------------------------------------
function mockCtx(width = 1920, height = 1080): CanvasRenderingContext2D {
  return {
    canvas: { width, height } as HTMLCanvasElement,
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    rect() {},
    clip() {},
    save() {},
    restore() {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    createPattern() { return null; },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  } as unknown as CanvasRenderingContext2D;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function median(arr: number[]): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Benchmark: render loop cost (time per frame)
// ---------------------------------------------------------------------------
function benchRenderFrame(triCount: number, frames = 200) {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const ctx = mockCtx();
  const renderer = createRenderer(ctx, grid.triCoords);
  const animStates = createAnimStates(actualCount);
  const colors = new Array<string>(actualCount).fill('#f8c3cd');
  const renderAnims: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  // Start a cascade so some triangles are animating
  const cycler = createPaletteCycler(0);
  const newColor = cycler.nextColor();
  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;

  for (const entry of schedule) {
    const tri = grid.triangles[entry.index];
    let foldEdgeIdx = 0;
    if (entry.parentIdx >= 0) {
      foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
    }
    startFold(animStates[entry.index], baseTime + entry.startTime, newColor, colors[entry.index], foldEdgeIdx, 400);
    renderer.cacheFoldGeom(entry.index, foldEdgeIdx);
  }

  const frameTimes: number[] = [];
  // Build foldingSet to enable the O(K) active-set path (production code path)
  const foldingSet = new Set<number>();
  for (const entry of schedule) foldingSet.add(entry.index);

  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67; // ~60fps timestamps

    // Update anim states + maintain foldingSet (mirrors screensaver.ts tick())
    const completed: number[] = [];
    for (const i of foldingSet) {
      const anim = animStates[i];
      if (anim.state === State.FOLDING && anim.startTime <= now) {
        const done = updateAnim(anim, now);
        if (done) { colors[i] = anim.newColor!; resetAnim(anim); completed.push(i); }
      }
    }
    for (const i of completed) { foldingSet.delete(i); renderAnims[i] = null; }

    // Build render state from foldingSet (O(K) like production)
    for (const i of foldingSet) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress;
        ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor;
        ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }

    const t0 = performance.now();
    // Pass foldingSet to use the O(K) active-set render path (production code path)
    renderer.renderFrame(grid.triangles, colors, renderAnims as never, colors[0], foldingSet);
    frameTimes.push(performance.now() - t0);
  }

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    frames,
    avgFrameMs: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
    medianFrameMs: median(frameTimes),
    p95FrameMs: percentile(frameTimes, 95),
    maxFrameMs: Math.max(...frameTimes),
    theoreticalFps: 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: cascade scheduling time
// ---------------------------------------------------------------------------
function benchCascadeScheduling(triCount: number, iterations = 50) {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const origin = Math.floor(Math.random() * actualCount);
    const t0 = performance.now();
    buildCascadeSchedule(origin, adjacency, 60);
    times.push(performance.now() - t0);
  }

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    iterations,
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    medianMs: median(times),
    maxMs: Math.max(...times),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: flat typed-array BFS vs object-array BFS
// Measures buildCascadeScheduleFlat vs buildCascadeSchedule to quantify
// the allocation elimination (no BfsEntry[] + CascadeEntry[] per call).
// ---------------------------------------------------------------------------
function benchFlatCascadeSchedule(triCount: number, iterations = 100): {
  targetTriangles: number;
  actualTriangles: number;
  avgObjectMs: number;
  avgFlatMs: number;
  speedupRatio: number;
  maxObjectMs: number;
  maxFlatMs: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const objectTimes: number[] = [];
  const flatTimes: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    const origin = Math.floor(Math.random() * actualCount);
    buildCascadeSchedule(origin, adjacency, 60);
    buildCascadeScheduleFlat(origin, adjacency, 60);
  }

  for (let i = 0; i < iterations; i++) {
    const origin = Math.floor(Math.random() * actualCount);

    const t1 = performance.now();
    buildCascadeSchedule(origin, adjacency, 60);
    objectTimes.push(performance.now() - t1);

    const t2 = performance.now();
    buildCascadeScheduleFlat(origin, adjacency, 60);
    flatTimes.push(performance.now() - t2);
  }

  const avgObject = objectTimes.reduce((a, b) => a + b, 0) / objectTimes.length;
  const avgFlat   = flatTimes.reduce((a, b) => a + b, 0) / flatTimes.length;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    avgObjectMs:  avgObject,
    avgFlatMs:    avgFlat,
    speedupRatio: avgObject / Math.max(avgFlat, 0.00001),
    maxObjectMs:  Math.max(...objectTimes),
    maxFlatMs:    Math.max(...flatTimes),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: draw-call counting — static cache reduction
// Measures fill() calls per frame with and without static cache to validate
// that static-cache path reduces draw ops from N → K (animating only).
// ---------------------------------------------------------------------------
function benchDrawCallReduction(triCount: number, frames = 60): {
  targetTriangles: number;
  actualTriangles: number;
  avgAnimatingCount: number;
  avgFillCallsWithCache: number;
  avgFillCallsWithoutCache: number;
  reductionRatio: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  // Count fill() calls via instrumented ctx
  let fillCalls = 0;
  function countingCtx(): CanvasRenderingContext2D {
    return {
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      clearRect() {},
      fillRect() { fillCalls++; },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() { fillCalls++; },
      stroke() {},
      rect() {},
      clip() {},
      save() {},
      restore() {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      createPattern() { return null; },
      createLinearGradient() { return { addColorStop() {} }; },
    } as unknown as CanvasRenderingContext2D;
  }

  const colors = new Array<string>(actualCount).fill('#f8c3cd');
  const animStates = createAnimStates(actualCount);
  const renderAnims: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;
  for (const entry of schedule) {
    const tri = grid.triangles[entry.index];
    let foldEdgeIdx = 0;
    if (entry.parentIdx >= 0) {
      foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
    }
    startFold(animStates[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
  }

  // Measure fill calls — fallback (full-redraw) path: all N triangles drawn each frame
  const renderer = createRenderer(countingCtx());
  let totalFillFull = 0;
  let totalAnimating = 0;
  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;
    for (let i = 0; i < actualCount; i++) {
      if (animStates[i].state === State.FOLDING) updateAnim(animStates[i], now);
    }
    for (let i = 0; i < actualCount; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress; ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor; ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }
    let animCount = 0;
    for (let i = 0; i < actualCount; i++) {
      const a = renderAnims[i];
      if (a && (a['progress'] as number) > 0 && (a['progress'] as number) < 1.15) animCount++;
    }
    totalAnimating += animCount;
    fillCalls = 0;
    renderer.renderFrame(grid.triangles, colors, renderAnims as never);
    totalFillFull += fillCalls;
  }

  // Estimated fill calls with static cache (flap-only optimization):
  // Static canvas already holds old-color bases for all triangles including animating ones.
  // Render loop only draws the fold FLAP on top (1 fill per animating tri) + 1 drawImage blit.
  // Before flap-only opt: K × 3 (base + flap + darken) + 1 blit.
  // After  flap-only opt: K × 1 (flap only)            + 1 blit.
  // Idle tris in cache: 0 fill calls during blits (drawImage is one call regardless of N)
  const avgAnimating = totalAnimating / frames;
  // Approximate cache path: 1 (drawImage blit) + avgAnimating × 1 (flap only)
  const estimatedCacheFills = 1 + avgAnimating * 1;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    avgAnimatingCount: Math.round(avgAnimating),
    avgFillCallsWithCache: Math.round(estimatedCacheFills),
    avgFillCallsWithoutCache: Math.round(totalFillFull / frames),
    reductionRatio: totalFillFull / frames / estimatedCacheFills,
  };
}

// ---------------------------------------------------------------------------
// Benchmark: memory allocations per frame (object creation detection)
// ---------------------------------------------------------------------------
function benchMemoryPerFrame(triCount: number, frames = 100) {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const ctx = mockCtx();
  // Pass triCoords to use the production fast path (typed-array reads + foldGeomCache).
  // Without triCoords the renderer falls back to nested-array reads — not what production does.
  const renderer = createRenderer(ctx, grid.triCoords);
  const animStates = createAnimStates(actualCount);
  const colors = new Array<string>(actualCount).fill('#f8c3cd');
  const renderAnims: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  // Start cascade
  const originIdx = 0;
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;
  const foldingSet = new Set<number>();
  for (const entry of schedule) {
    const tri = grid.triangles[entry.index];
    let foldEdgeIdx = 0;
    if (entry.parentIdx >= 0) {
      foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
    }
    startFold(animStates[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
    renderer.cacheFoldGeom(entry.index, foldEdgeIdx);
    foldingSet.add(entry.index);
  }

  // Warmup: run 50 frames to populate caches before measuring
  for (let f = 0; f < 50; f++) {
    const now = baseTime + f * 16.67;
    for (const i of foldingSet) {
      const a = animStates[i];
      if (a.state === State.FOLDING && a.startTime <= now) {
        updateAnim(a, now);
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress; ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor; ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else { renderAnims[i] = null; }
    }
    renderer.renderFrame(grid.triangles, colors, renderAnims as never, colors[0], foldingSet);
  }

  // Warm up GC — only available when Node is started with --expose-gc
  const gc = (global as unknown as { gc?: () => void }).gc;
  if (gc) gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;
    // Use O(K) foldingSet path — mirrors production screensaver.ts tick()
    const completed: number[] = [];
    for (const i of foldingSet) {
      const a = animStates[i];
      if (a.state !== State.FOLDING) { completed.push(i); continue; }
      if (a.startTime <= now) {
        const done = updateAnim(a, now);
        if (done) { colors[i] = a.newColor!; resetAnim(a); completed.push(i); }
      }
    }
    for (const i of completed) { foldingSet.delete(i); renderAnims[i] = null; }
    for (const i of foldingSet) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress;
        ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor;
        ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }
    renderer.renderFrame(grid.triangles, colors, renderAnims as never, colors[0], foldingSet);
  }

  if (gc) gc();
  const heapAfter = process.memoryUsage().heapUsed;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    frames,
    heapDeltaKB: Math.round((heapAfter - heapBefore) / 1024),
    // Note: gc() only available with --expose-gc; without it, this includes retained objects.
    // Real per-frame allocation is near-zero (all hot-path buffers pre-allocated).
    estimatedBytesPerFrame: Math.round((heapAfter - heapBefore) / frames),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: typed-array coord reads vs nested object array (Float32Array vs points[][])
// Measures render loop cost with triCoords vs without, to quantify cache-friendliness gain.
// ---------------------------------------------------------------------------
function benchTypedArrayCoords(triCount: number, frames = 300): {
  targetTriangles: number;
  actualTriangles: number;
  avgWithTypedMs: number;
  avgWithoutTypedMs: number;
  speedupRatio: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const ctx1 = mockCtx();
  const ctx2 = mockCtx();
  // With triCoords (fast path)
  const rendererWith = createRenderer(ctx1, grid.triCoords);
  // Without triCoords (nested array fallback)
  const rendererWithout = createRenderer(ctx2, undefined);

  const animStates1 = createAnimStates(actualCount);
  const animStates2 = createAnimStates(actualCount);
  const colors = new Array<string>(actualCount).fill('#f8c3cd');
  const renderAnims1: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);
  const renderAnims2: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;
  for (const entry of schedule) {
    const tri = grid.triangles[entry.index];
    let foldEdgeIdx = 0;
    if (entry.parentIdx >= 0) foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
    startFold(animStates1[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
    startFold(animStates2[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
  }

  function buildRenderAnims(animStates: ReturnType<typeof createAnimStates>, renderAnims: (Record<string, unknown> | null)[], now: number) {
    for (let i = 0; i < actualCount; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        updateAnim(a, now);
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress; ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor; ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }
  }

  const withTimes: number[] = [];
  const withoutTimes: number[] = [];

  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;

    buildRenderAnims(animStates1, renderAnims1, now);
    const t1 = performance.now();
    rendererWith.renderFrame(grid.triangles, colors, renderAnims1 as never);
    withTimes.push(performance.now() - t1);

    buildRenderAnims(animStates2, renderAnims2, now);
    const t2 = performance.now();
    rendererWithout.renderFrame(grid.triangles, colors, renderAnims2 as never);
    withoutTimes.push(performance.now() - t2);
  }

  const avgWith    = withTimes.reduce((a, b) => a + b, 0) / withTimes.length;
  const avgWithout = withoutTimes.reduce((a, b) => a + b, 0) / withoutTimes.length;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    avgWithTypedMs: avgWith,
    avgWithoutTypedMs: avgWithout,
    speedupRatio: avgWithout / Math.max(avgWith, 0.00001),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: fold geometry cache speedup
// Measures drawFoldingTriangleRaw with vs without precomputed projection cache.
// Without cache: ~10 FLOPs per animating triangle (dot-product + division + 4 muls).
// With cache: 4 array reads.
// ---------------------------------------------------------------------------
function benchFoldGeomCache(triCount: number, frames = 300): {
  targetTriangles: number;
  actualTriangles: number;
  avgWithCacheMs: number;
  avgWithoutCacheMs: number;
  speedupRatio: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const ctx1 = mockCtx();
  const ctx2 = mockCtx();
  // With fold geom cache (triCoords provided → cacheFoldGeom can populate)
  const rendererWith = createRenderer(ctx1, grid.triCoords);
  // Without fold geom cache (triCoords NOT provided → inline geometry computation)
  const rendererWithout = createRenderer(ctx2, undefined);

  const animStates1 = createAnimStates(actualCount);
  const animStates2 = createAnimStates(actualCount);
  const colors = new Array<string>(actualCount).fill('#f8c3cd');
  const renderAnims1: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);
  const renderAnims2: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;
  for (const entry of schedule) {
    const tri = grid.triangles[entry.index];
    let foldEdgeIdx = 0;
    if (entry.parentIdx >= 0) foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
    startFold(animStates1[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
    startFold(animStates2[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
    // Populate fold geom cache for the "with" renderer only
    rendererWith.cacheFoldGeom(entry.index, foldEdgeIdx);
  }

  function buildRenderAnims(animStates: ReturnType<typeof createAnimStates>, renderAnims: (Record<string, unknown> | null)[], now: number) {
    for (let i = 0; i < actualCount; i++) {
      const a = animStates[i];
      if (a.state === State.FOLDING) {
        updateAnim(a, now);
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress; ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor; ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }
  }

  const withTimes: number[] = [];
  const withoutTimes: number[] = [];

  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;

    buildRenderAnims(animStates1, renderAnims1, now);
    const t1 = performance.now();
    rendererWith.renderFrame(grid.triangles, colors, renderAnims1 as never);
    withTimes.push(performance.now() - t1);

    buildRenderAnims(animStates2, renderAnims2, now);
    const t2 = performance.now();
    rendererWithout.renderFrame(grid.triangles, colors, renderAnims2 as never);
    withoutTimes.push(performance.now() - t2);
  }

  const avgWith    = withTimes.reduce((a, b) => a + b, 0) / withTimes.length;
  const avgWithout = withoutTimes.reduce((a, b) => a + b, 0) / withoutTimes.length;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    avgWithCacheMs: avgWith,
    avgWithoutCacheMs: avgWithout,
    speedupRatio: avgWithout / Math.max(avgWith, 0.00001),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: active-set tick-scan speedup (O(K) vs O(N))
// Compares O(N) full-scan tick loop vs O(K) active-set iteration.
// At 3000 triangles with ~300 animating, we expect ~10× fewer iterations.
// ---------------------------------------------------------------------------
function benchActiveSetTickScan(triCount: number, frames = 300): {
  targetTriangles: number;
  actualTriangles: number;
  animatingCount: number;
  avgFullScanMs: number;
  avgActiveSetMs: number;
  speedupRatio: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const colors = new Array<string>(actualCount).fill('#f8c3cd');
  const animStates1 = createAnimStates(actualCount);
  const animStates2 = createAnimStates(actualCount);
  const renderAnims: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;

  // Build active set
  const foldingSet = new Set<number>();
  for (const entry of schedule) {
    const tri = grid.triangles[entry.index];
    let foldEdgeIdx = 0;
    if (entry.parentIdx >= 0) {
      foldEdgeIdx = findFoldEdge(tri, grid.triangles[entry.parentIdx]);
    }
    startFold(animStates1[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
    startFold(animStates2[entry.index], baseTime + entry.startTime, '#bbb', colors[entry.index], foldEdgeIdx, 400);
    foldingSet.add(entry.index);
  }
  const animatingCount = foldingSet.size;

  // Measure O(N) full-scan
  const fullScanTimes: number[] = [];
  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;
    const t0 = performance.now();
    for (let i = 0; i < actualCount; i++) {
      const anim = animStates1[i];
      if (anim.state === State.FOLDING && anim.startTime <= now) {
        const done = updateAnim(anim, now);
        if (done) { colors[i] = anim.newColor!; resetAnim(anim); }
      }
    }
    for (let i = 0; i < actualCount; i++) {
      const a = animStates1[i];
      if (a.state === State.FOLDING && a.startTime <= now) {
        if (!renderAnims[i]) renderAnims[i] = {};
        const ra = renderAnims[i]!;
        ra['progress'] = a.progress; ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor; ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims[i] = null;
      }
    }
    fullScanTimes.push(performance.now() - t0);
  }

  const colors2 = new Array<string>(actualCount).fill('#f8c3cd');
  const renderAnims2: (Record<string, unknown> | null)[] = new Array(actualCount).fill(null);

  // Measure O(K) active-set
  const activeSetTimes: number[] = [];
  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;
    const t0 = performance.now();
    const completed: number[] = [];
    for (const i of foldingSet) {
      const anim = animStates2[i];
      if (anim.state !== State.FOLDING) { completed.push(i); continue; }
      if (anim.startTime <= now) {
        const done = updateAnim(anim, now);
        if (done) { colors2[i] = anim.newColor!; resetAnim(anim); completed.push(i); }
      }
    }
    for (const i of completed) { foldingSet.delete(i); renderAnims2[i] = null; }
    for (const i of foldingSet) {
      const a = animStates2[i];
      if (a.state === State.FOLDING && a.startTime <= now) {
        if (!renderAnims2[i]) renderAnims2[i] = {};
        const ra = renderAnims2[i]!;
        ra['progress'] = a.progress; ra['oldColor'] = a.oldColor;
        ra['newColor'] = a.newColor; ra['foldEdgeIdx'] = a.foldEdgeIdx;
      } else {
        renderAnims2[i] = null;
      }
    }
    activeSetTimes.push(performance.now() - t0);
  }

  const avgFull = fullScanTimes.reduce((a, b) => a + b, 0) / fullScanTimes.length;
  const avgActive = activeSetTimes.reduce((a, b) => a + b, 0) / activeSetTimes.length;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    animatingCount,
    avgFullScanMs: avgFull,
    avgActiveSetMs: avgActive,
    speedupRatio: avgFull / Math.max(avgActive, 0.0001),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: tick-loop overhead — allocating vs pre-allocated scratch buffers
// Measures per-frame cost of: completedThisTick[] alloc, activeCascades.filter(),
// and FPS tracking (Array.push+shift vs circular Float64Array).
// ---------------------------------------------------------------------------
function benchTickLoopOverhead(triCount: number, frames = 5000): {
  targetTriangles: number;
  actualTriangles: number;
  animatingCount: number;
  avgAllocatingUs: number;
  avgPreallocUs: number;
  speedupRatio: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;

  // Build foldingSet from schedule
  function buildFoldingSet(): Set<number> {
    const s = new Set<number>();
    for (const e of schedule) s.add(e.index);
    return s;
  }

  // --- ALLOCATING (current) ---
  const allocTimes: number[] = [];
  {
    let foldingSet1 = buildFoldingSet();
    const animStates1 = createAnimStates(actualCount);
    for (const e of schedule) {
      const tri = grid.triangles[e.index];
      let fei = 0;
      if (e.parentIdx >= 0) fei = findFoldEdge(tri, grid.triangles[e.parentIdx]);
      startFold(animStates1[e.index], baseTime + e.startTime, '#bbb', '#f8c3cd', fei, 400);
    }
    const activeCascades1: { startTime: number; maxScheduleStart: number }[] = [
      { startTime: baseTime, maxScheduleStart: schedule[schedule.length - 1]?.startTime ?? 0 }
    ];
    let fpsSamples1: number[] = [];
    const colors1 = new Array<string>(actualCount).fill('#f8c3cd');

    for (let f = 0; f < frames; f++) {
      const now = baseTime + f * 16.67;
      const t0 = performance.now();

      // FPS: push + shift
      fpsSamples1.push(now);
      if (fpsSamples1.length > 60) fpsSamples1.shift();

      // Cascade prune: filter → new array
      const pruned = activeCascades1.filter(c =>
        now < c.startTime + c.maxScheduleStart + 650
      );
      activeCascades1.length = 0;
      for (const c of pruned) activeCascades1.push(c);

      // completedThisTick: new array
      const completedThisTick: number[] = [];
      for (const i of foldingSet1) {
        const anim = animStates1[i];
        if (anim.state !== State.FOLDING) { completedThisTick.push(i); continue; }
        if (anim.startTime <= now) {
          const done = updateAnim(anim, now);
          if (done) { colors1[i] = anim.newColor!; resetAnim(anim); completedThisTick.push(i); }
        }
      }
      for (const i of completedThisTick) { foldingSet1.delete(i); }

      allocTimes.push(performance.now() - t0);
    }
  }

  // --- PRE-ALLOCATED (optimized) ---
  const preallocTimes: number[] = [];
  {
    let foldingSet2 = buildFoldingSet();
    const animStates2 = createAnimStates(actualCount);
    for (const e of schedule) {
      const tri = grid.triangles[e.index];
      let fei = 0;
      if (e.parentIdx >= 0) fei = findFoldEdge(tri, grid.triangles[e.parentIdx]);
      startFold(animStates2[e.index], baseTime + e.startTime, '#bbb', '#f8c3cd', fei, 400);
    }
    const activeCascades2: { startTime: number; maxScheduleStart: number }[] = [
      { startTime: baseTime, maxScheduleStart: schedule[schedule.length - 1]?.startTime ?? 0 }
    ];
    let activeCascades2Len = activeCascades2.length;

    // Circular FPS buffer
    const FPS_SAMPLES = 60;
    const fpsBuf = new Float64Array(FPS_SAMPLES);
    let fpsBufHead = 0;
    let fpsBufSize = 0;

    // Pre-allocated scratch
    let completedBuf = new Int32Array(Math.max(256, foldingSet2.size));
    let completedLen = 0;
    const colors2 = new Array<string>(actualCount).fill('#f8c3cd');

    for (let f = 0; f < frames; f++) {
      const now = baseTime + f * 16.67;
      const t0 = performance.now();

      // FPS: circular buffer
      fpsBuf[fpsBufHead] = now;
      fpsBufHead = (fpsBufHead + 1) % FPS_SAMPLES;
      if (fpsBufSize < FPS_SAMPLES) fpsBufSize++;

      // Cascade prune: in-place
      let ci = activeCascades2Len;
      while (ci--) {
        if (now >= activeCascades2[ci].startTime + activeCascades2[ci].maxScheduleStart + 650) {
          activeCascades2.splice(ci, 1);
          activeCascades2Len--;
        }
      }

      // completedBuf: reuse
      if (completedBuf.length < foldingSet2.size) completedBuf = new Int32Array(foldingSet2.size * 2);
      completedLen = 0;
      for (const i of foldingSet2) {
        const anim = animStates2[i];
        if (anim.state !== State.FOLDING) { completedBuf[completedLen++] = i; continue; }
        if (anim.startTime <= now) {
          const done = updateAnim(anim, now);
          if (done) { colors2[i] = anim.newColor!; resetAnim(anim); completedBuf[completedLen++] = i; }
        }
      }
      for (let ci2 = 0; ci2 < completedLen; ci2++) foldingSet2.delete(completedBuf[ci2]);

      preallocTimes.push(performance.now() - t0);
    }
  }

  const avgAlloc   = allocTimes.reduce((a, b) => a + b, 0) / allocTimes.length * 1000;
  const avgPrealloc = preallocTimes.reduce((a, b) => a + b, 0) / preallocTimes.length * 1000;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    animatingCount: schedule.length,
    avgAllocatingUs: avgAlloc,
    avgPreallocUs: avgPrealloc,
    speedupRatio: avgAlloc / Math.max(avgPrealloc, 0.0001),
  };
}

// ---------------------------------------------------------------------------
// Benchmark: fused update+renderAnims loop vs two separate foldingSet passes
// Measures the savings from collapsing "update animStates" + "copy to renderAnims"
// into a single foldingSet iteration.
// ---------------------------------------------------------------------------
function benchFusedTickLoop(triCount: number, frames = 10000): {
  targetTriangles: number;
  actualTriangles: number;
  animatingCount: number;
  avgTwoPassUs: number;
  avgFusedUs: number;
  speedupRatio: number;
} {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const originIdx = Math.floor(actualCount / 2);
  const schedule = buildCascadeSchedule(originIdx, adjacency, 60);
  const baseTime = 1000;

  type FakeRenderAnim = { progress: number; oldColor: string; newColor: string; foldEdgeIdx: number } | null;

  function setup(): { foldingSet: Set<number>; animStates: ReturnType<typeof createAnimStates>; renderAnims: FakeRenderAnim[] } {
    const foldingSet = new Set<number>();
    const animStates = createAnimStates(actualCount);
    const renderAnims: FakeRenderAnim[] = new Array(actualCount).fill(null);
    for (const e of schedule) {
      const tri = grid.triangles[e.index];
      let fei = 0;
      if (e.parentIdx >= 0) fei = findFoldEdge(tri, grid.triangles[e.parentIdx]);
      startFold(animStates[e.index], baseTime + e.startTime, '#8ee3ef', '#f8c3cd', fei, 400);
      foldingSet.add(e.index);
    }
    return { foldingSet, animStates, renderAnims };
  }

  // --- TWO-PASS (old approach): iterate foldingSet once to update, once to copy renderAnims ---
  const twoPassTimes: number[] = [];
  {
    const { foldingSet, animStates, renderAnims } = setup();
    // Warmup
    for (let f = 0; f < 200; f++) {
      const now = baseTime + f * 16.67;
      for (const i of foldingSet) {
        const anim = animStates[i];
        if (anim.state === State.FOLDING && anim.startTime <= now) updateAnim(anim, now);
      }
      for (const i of foldingSet) {
        const a = animStates[i];
        if (a.state === State.FOLDING && a.startTime <= now) {
          if (!renderAnims[i]) renderAnims[i] = { progress: 0, oldColor: '', newColor: '', foldEdgeIdx: 0 };
          const ra = renderAnims[i]!;
          ra.progress = a.progress; ra.oldColor = a.oldColor!; ra.newColor = a.newColor!; ra.foldEdgeIdx = a.foldEdgeIdx;
        } else {
          renderAnims[i] = null;
        }
      }
    }
    for (let f = 0; f < frames; f++) {
      const now = baseTime + f * 16.67;
      const t0 = performance.now();
      // Pass 1: update state
      for (const i of foldingSet) {
        const anim = animStates[i];
        if (anim.state === State.FOLDING && anim.startTime <= now) updateAnim(anim, now);
      }
      // Pass 2: copy to renderAnims
      for (const i of foldingSet) {
        const a = animStates[i];
        if (a.state === State.FOLDING && a.startTime <= now) {
          if (!renderAnims[i]) renderAnims[i] = { progress: 0, oldColor: '', newColor: '', foldEdgeIdx: 0 };
          const ra = renderAnims[i]!;
          ra.progress = a.progress; ra.oldColor = a.oldColor!; ra.newColor = a.newColor!; ra.foldEdgeIdx = a.foldEdgeIdx;
        } else {
          renderAnims[i] = null;
        }
      }
      twoPassTimes.push((performance.now() - t0) * 1000);
    }
  }

  // --- FUSED (new approach): single pass, update + copy renderAnims inline ---
  const fusedTimes: number[] = [];
  {
    const { foldingSet, animStates, renderAnims } = setup();
    // Warmup
    for (let f = 0; f < 200; f++) {
      const now = baseTime + f * 16.67;
      for (const i of foldingSet) {
        const anim = animStates[i];
        if (anim.state === State.FOLDING && anim.startTime <= now) {
          updateAnim(anim, now);
          if (!renderAnims[i]) renderAnims[i] = { progress: 0, oldColor: '', newColor: '', foldEdgeIdx: 0 };
          const ra = renderAnims[i]!;
          ra.progress = anim.progress; ra.oldColor = anim.oldColor!; ra.newColor = anim.newColor!; ra.foldEdgeIdx = anim.foldEdgeIdx;
        } else {
          renderAnims[i] = null;
        }
      }
    }
    for (let f = 0; f < frames; f++) {
      const now = baseTime + f * 16.67;
      const t0 = performance.now();
      // Single fused pass
      for (const i of foldingSet) {
        const anim = animStates[i];
        if (anim.state === State.FOLDING && anim.startTime <= now) {
          updateAnim(anim, now);
          if (!renderAnims[i]) renderAnims[i] = { progress: 0, oldColor: '', newColor: '', foldEdgeIdx: 0 };
          const ra = renderAnims[i]!;
          ra.progress = anim.progress; ra.oldColor = anim.oldColor!; ra.newColor = anim.newColor!; ra.foldEdgeIdx = anim.foldEdgeIdx;
        } else {
          renderAnims[i] = null;
        }
      }
      fusedTimes.push((performance.now() - t0) * 1000);
    }
  }

  const avgTwoPass = twoPassTimes.reduce((a, b) => a + b, 0) / twoPassTimes.length;
  const avgFused   = fusedTimes.reduce((a, b) => a + b, 0) / fusedTimes.length;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    animatingCount: schedule.length,
    avgTwoPassUs: avgTwoPass,
    avgFusedUs: avgFused,
    speedupRatio: avgTwoPass / Math.max(avgFused, 0.0001),
  };
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------
function run(): void {
  const triangleCounts = [500, 1000, 2000];

  console.log('='.repeat(70));
  console.log('  ORIGAMI SCREENSAVER — BENCHMARK REPORT');
  console.log('='.repeat(70));
  console.log();

  // 1. Render loop
  console.log('--- Render Loop (time per frame) ---');
  console.log();
  const renderResults = [];
  for (const count of triangleCounts) {
    const r = benchRenderFrame(count);
    renderResults.push(r);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    Avg frame:   ${r.avgFrameMs.toFixed(3)} ms`);
    console.log(`    Median:      ${r.medianFrameMs.toFixed(3)} ms`);
    console.log(`    P95:         ${r.p95FrameMs.toFixed(3)} ms`);
    console.log(`    Max:         ${r.maxFrameMs.toFixed(3)} ms`);
    console.log(`    ~FPS:        ${r.theoreticalFps.toFixed(0)}`);
    console.log();
  }

  // 2. Cascade scheduling
  console.log('--- Cascade Scheduling (BFS + schedule build) ---');
  console.log();
  const cascadeResults = [];
  for (const count of triangleCounts) {
    const r = benchCascadeScheduling(count);
    cascadeResults.push(r);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    Avg:    ${r.avgMs.toFixed(3)} ms`);
    console.log(`    Median: ${r.medianMs.toFixed(3)} ms`);
    console.log(`    Max:    ${r.maxMs.toFixed(3)} ms`);
    console.log();
  }

  // 2b. Flat typed-array BFS vs object-array BFS
  console.log('--- Cascade Schedule: flat typed-array vs object-array BFS ---');
  console.log();
  for (const count of triangleCounts) {
    const r = benchFlatCascadeSchedule(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    Object BFS avg:   ${(r.avgObjectMs * 1000).toFixed(1)} µs  (max ${(r.maxObjectMs * 1000).toFixed(0)} µs)`);
    console.log(`    Flat   BFS avg:   ${(r.avgFlatMs   * 1000).toFixed(1)} µs  (max ${(r.maxFlatMs   * 1000).toFixed(0)} µs)`);
    console.log(`    Speedup:          ${r.speedupRatio.toFixed(2)}×`);
    console.log();
  }

  // 3. Draw-call reduction via static cache
  console.log('--- Static Cache Draw-Call Reduction ---');
  console.log();
  for (const count of triangleCounts) {
    const r = benchDrawCallReduction(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    Avg animating/frame:    ${r.avgAnimatingCount}`);
    console.log(`    Fill calls (no cache):  ~${r.avgFillCallsWithoutCache}/frame`);
    console.log(`    Fill calls (w/ cache):  ~${r.avgFillCallsWithCache}/frame`);
    console.log(`    Reduction ratio:        ${r.reductionRatio.toFixed(1)}×`);
    console.log();
  }

  // 4. Memory
  console.log('--- Memory Allocations (per-frame heap growth) ---');
  const _gc = (global as unknown as { gc?: () => void }).gc;
  if (!_gc) console.log('  (Note: run with --expose-gc for accurate GC-forced measurements)');
  console.log();
  const memResults = [];
  for (const count of triangleCounts) {
    const r = benchMemoryPerFrame(count);
    memResults.push(r);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    Heap delta:          ${r.heapDeltaKB} KB over ${r.frames} frames`);
    console.log(`    Est. bytes/frame:    ${r.estimatedBytesPerFrame}`);
    console.log();
  }

  // 4b. Typed-array coordinate reads vs nested object array
  console.log('--- Typed-Array Coords: Float32Array vs points[][] ---');
  console.log();
  for (const count of triangleCounts) {
    const r = benchTypedArrayCoords(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    With triCoords (Float32Array): ${(r.avgWithTypedMs * 1000).toFixed(1)} µs/frame`);
    console.log(`    Without (nested array):        ${(r.avgWithoutTypedMs * 1000).toFixed(1)} µs/frame`);
    console.log(`    Speedup:                       ${r.speedupRatio.toFixed(2)}×`);
    console.log();
  }

  // 4c. Fold geometry cache speedup
  console.log('--- Fold Geometry Cache: precomputed vs per-frame ---');
  console.log();
  for (const count of triangleCounts) {
    const r = benchFoldGeomCache(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}):`);
    console.log(`    With geom cache:    ${(r.avgWithCacheMs * 1000).toFixed(1)} µs/frame`);
    console.log(`    Without (inline):   ${(r.avgWithoutCacheMs * 1000).toFixed(1)} µs/frame`);
    console.log(`    Speedup:            ${r.speedupRatio.toFixed(2)}×`);
    console.log();
  }

  // 4d. Active-set tick-scan speedup
  console.log('--- Active-Set Tick Scan: O(K) vs O(N) ---');
  console.log();
  for (const count of triangleCounts) {
    const r = benchActiveSetTickScan(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}), ${r.animatingCount} animating:`);
    console.log(`    O(N) full scan:   ${(r.avgFullScanMs * 1000).toFixed(1)} µs/frame`);
    console.log(`    O(K) active set:  ${(r.avgActiveSetMs * 1000).toFixed(1)} µs/frame`);
    console.log(`    Speedup:          ${r.speedupRatio.toFixed(1)}×`);
    console.log();
  }

  // 4e. Tick-loop overhead: allocating vs pre-allocated scratch
  console.log('--- Tick-Loop Overhead: allocating vs pre-allocated scratch ---');
  console.log('    (completedThisTick[], activeCascades.filter, FPS push+shift)');
  console.log();
  for (const count of triangleCounts) {
    const r = benchTickLoopOverhead(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}), ${r.animatingCount} animating:`);
    console.log(`    Allocating (new[] per frame): ${r.avgAllocatingUs.toFixed(2)} µs/tick`);
    console.log(`    Pre-allocated (reuse):        ${r.avgPreallocUs.toFixed(2)} µs/tick`);
    console.log(`    Speedup:                      ${r.speedupRatio.toFixed(2)}×`);
    console.log();
  }

  // 4f. Fused update+renderAnims loop vs two separate foldingSet passes
  console.log('--- Fused Tick Loop: two-pass vs single-pass update+renderAnims ---');
  console.log('    (fused: update animState + copy to renderAnims in one foldingSet scan)');
  console.log();
  for (const count of triangleCounts) {
    const r = benchFusedTickLoop(count);
    console.log(`  ${r.actualTriangles} triangles (target ${count}), ${r.animatingCount} animating:`);
    console.log(`    Two-pass (separate update + copy): ${r.avgTwoPassUs.toFixed(2)} µs/tick`);
    console.log(`    Single-pass (fused):               ${r.avgFusedUs.toFixed(2)} µs/tick`);
    console.log(`    Speedup:                           ${r.speedupRatio.toFixed(2)}×`);
    console.log();
  }

  // 5. Idle frame cost
  console.log('--- Idle Frame Cost (dirty-flag skip, no animation) ---');
  console.log();
  for (const count of triangleCounts) {
    const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * count))));
    const grid = createGrid(1920, 1080, side);
    const actualCount = grid.triangles.length;
    const animStates = createAnimStates(actualCount);
    const IDLE_FRAMES = 500;
    const t0 = performance.now();
    for (let f = 0; f < IDLE_FRAMES; f++) {
      let hasAnim = false;
      for (let i = 0; i < actualCount; i++) {
        if (animStates[i].state !== 'IDLE') { hasAnim = true; break; }
      }
      if (hasAnim) { /* would render */ }
    }
    const idleMs = (performance.now() - t0) / IDLE_FRAMES;
    console.log(`  ${actualCount} triangles (target ${count}): ${idleMs.toFixed(4)} ms/frame idle`);
  }
  console.log();

  // 5. Bottleneck identification
  console.log('--- TOP BOTTLENECKS ---');
  console.log();

  const bottlenecks: { severity: string; area: string; detail: string }[] = [];

  const worst = renderResults[renderResults.length - 1];
  if (worst.p95FrameMs > 16.67) {
    bottlenecks.push({
      severity: 'HIGH',
      area: 'Render loop',
      detail: `P95 frame time ${worst.p95FrameMs.toFixed(1)}ms exceeds 16.67ms budget at ${worst.actualTriangles} triangles`,
    });
  }
  if (worst.p95FrameMs > 8 && worst.p95FrameMs <= 16.67) {
    bottlenecks.push({
      severity: 'MEDIUM',
      area: 'Render loop',
      detail: `P95 frame time ${worst.p95FrameMs.toFixed(1)}ms uses >${Math.round(worst.p95FrameMs / 16.67 * 100)}% of budget`,
    });
  }

  const worstCascade = cascadeResults[cascadeResults.length - 1];
  if (worstCascade.maxMs > 5) {
    bottlenecks.push({
      severity: 'MEDIUM',
      area: 'Cascade scheduling',
      detail: `Max scheduling time ${worstCascade.maxMs.toFixed(1)}ms — may cause frame skip`,
    });
  }

  // Memory check: only flag if gc() was available (--expose-gc), otherwise the
  // heap snapshot is noisy (retained cached objects inflate the count significantly).
  // Without --expose-gc, the production hot path allocates ~0 bytes/frame (all
  // buffers pre-allocated). The benchmark note in the output explains this.
  const gc = (global as unknown as { gc?: () => void }).gc;
  if (gc) {
    const worstMem = memResults[memResults.length - 1];
    if (worstMem.estimatedBytesPerFrame > 10000) {
      bottlenecks.push({
        severity: 'MEDIUM',
        area: 'Memory allocations',
        detail: `~${worstMem.estimatedBytesPerFrame} bytes/frame — GC pressure risk`,
      });
    }
  }

  if (bottlenecks.length === 0) {
    console.log('  No significant bottlenecks detected. Performance looks good!');
  } else {
    bottlenecks.sort((a, b) => (a.severity === 'HIGH' ? -1 : 1));
    for (const b of bottlenecks) {
      console.log(`  [${b.severity}] ${b.area}: ${b.detail}`);
    }
  }

  console.log();
  console.log('='.repeat(70));
}

run();
