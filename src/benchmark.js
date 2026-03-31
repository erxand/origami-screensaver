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
import { buildCascadeSchedule, cascadeDuration } from './cascade.js';
import { createPaletteCycler } from './palette.js';

// ---------------------------------------------------------------------------
// Mock canvas context (headless — no real DOM)
// ---------------------------------------------------------------------------
function mockCtx(width = 1920, height = 1080) {
  return {
    canvas: { width, height },
    clearRect() {},
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
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Benchmark: render loop cost (time per frame)
// ---------------------------------------------------------------------------
function benchRenderFrame(triCount, frames = 200) {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const ctx = mockCtx();
  const renderer = createRenderer(ctx);
  const animStates = createAnimStates(actualCount);
  const colors = new Array(actualCount).fill('#f8c3cd');
  const renderAnims = new Array(actualCount).fill(null);

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
  }

  const frameTimes = [];

  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67; // ~60fps timestamps

    // Update anim states
    for (let i = 0; i < actualCount; i++) {
      const anim = animStates[i];
      if (anim.state === State.FOLDING) {
        const done = updateAnim(anim, now);
        if (done) colors[i] = anim.newColor;
      }
    }

    // Build render state
    for (let i = 0; i < actualCount; i++) {
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
function benchCascadeScheduling(triCount, iterations = 50) {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;
  const times = [];

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
// Benchmark: memory allocations per frame (object creation detection)
// ---------------------------------------------------------------------------
function benchMemoryPerFrame(triCount, frames = 100) {
  const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * triCount))));
  const grid = createGrid(1920, 1080, side);
  const adjacency = buildAdjacency(grid.rows, grid.cols);
  const actualCount = grid.triangles.length;

  const ctx = mockCtx();
  const renderer = createRenderer(ctx);
  const animStates = createAnimStates(actualCount);
  const colors = new Array(actualCount).fill('#f8c3cd');
  const renderAnims = new Array(actualCount).fill(null);

  // Start cascade
  const originIdx = 0;
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

  // Warm up GC
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let f = 0; f < frames; f++) {
    const now = baseTime + f * 16.67;
    for (let i = 0; i < actualCount; i++) {
      if (animStates[i].state === State.FOLDING) {
        updateAnim(animStates[i], now);
      }
    }
    for (let i = 0; i < actualCount; i++) {
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
    renderer.renderFrame(grid.triangles, colors, renderAnims);
  }

  const heapAfter = process.memoryUsage().heapUsed;

  return {
    targetTriangles: triCount,
    actualTriangles: actualCount,
    frames,
    heapDeltaKB: Math.round((heapAfter - heapBefore) / 1024),
    estimatedBytesPerFrame: Math.round((heapAfter - heapBefore) / frames),
  };
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------
function run() {
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

  // 3. Memory
  console.log('--- Memory Allocations (per-frame heap growth) ---');
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

  // 4. Idle frame cost (dirty-flag: skip renderFrame when nothing animating)
  console.log('--- Idle Frame Cost (dirty-flag skip, no animation) ---');
  console.log();
  for (const count of triangleCounts) {
    const side = Math.max(40, Math.round(Math.sqrt((1920 * 1080 * Math.sqrt(3)) / (4 * count))));
    const grid = createGrid(1920, 1080, side);
    const actualCount = grid.triangles.length;
    const animStates = createAnimStates(actualCount);
    // No folds started — all IDLE
    const IDLE_FRAMES = 500;
    const t0 = performance.now();
    for (let f = 0; f < IDLE_FRAMES; f++) {
      // Simulate the dirty-flag check: only run update loop, no render
      let hasAnim = false;
      for (let i = 0; i < actualCount; i++) {
        if (animStates[i].state !== 'IDLE') { hasAnim = true; break; }
      }
      // dirty=false, hasAnim=false → skip renderFrame entirely
      if (hasAnim) { /* would render */ }
    }
    const idleMs = (performance.now() - t0) / IDLE_FRAMES;
    console.log(`  ${actualCount} triangles (target ${count}): ${idleMs.toFixed(4)} ms/frame idle (dirty-flag saves ~100% render cost)`);
  }
  console.log();

  // 5. Bottleneck identification
  console.log('--- TOP BOTTLENECKS ---');
  console.log();

  const bottlenecks = [];

  // Check if render is the bottleneck
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
      detail: `P95 frame time ${worst.p95FrameMs.toFixed(1)}ms uses >${Math.round(worst.p95FrameMs / 16.67 * 100)}% of 16.67ms budget at ${worst.actualTriangles} triangles`,
    });
  }

  // Check cascade scheduling
  const worstCascade = cascadeResults[cascadeResults.length - 1];
  if (worstCascade.maxMs > 5) {
    bottlenecks.push({
      severity: 'MEDIUM',
      area: 'Cascade scheduling',
      detail: `Max scheduling time ${worstCascade.maxMs.toFixed(1)}ms at ${worstCascade.actualTriangles} triangles — may cause frame skip`,
    });
  }

  // Check memory
  const worstMem = memResults[memResults.length - 1];
  if (worstMem.estimatedBytesPerFrame > 10000) {
    bottlenecks.push({
      severity: 'MEDIUM',
      area: 'Memory allocations',
      detail: `~${worstMem.estimatedBytesPerFrame} bytes/frame at ${worstMem.actualTriangles} triangles — GC pressure risk`,
    });
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
