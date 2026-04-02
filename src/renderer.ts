/**
 * Canvas renderer — draws triangles with their current colors.
 * Supports flat rendering and fold-in-progress rendering.
 *
 * Visual depth techniques:
 *  - Per-triangle stable lightness variation (±8%, seeded from index) → Kami 2-style tile differentiation
 *  - Color-relative edge crease (18% darker than triangle fill) → near-invisible within same-color regions
 *  - Per-triangle diagonal gradient (light upper-left → dark lower-right) → folded-paper shading
 *  - Paper texture: noise grain + multi-angle fibers (0°, 30°, -30°) matching equilateral grain
 */

import type { Triangle, RenderAnimState } from './types.js';

// Stride for triCoords: [x0,y0,x1,y1,x2,y2] per triangle.
const COORDS_STRIDE = 6;

// Pre-compute darken overlay strings to avoid per-frame string allocation
const DARKEN_STEPS = 32;
const DARKEN_STRINGS: string[] = new Array(DARKEN_STEPS);
for (let i = 0; i < DARKEN_STEPS; i++) {
  const opacity = (i / (DARKEN_STEPS - 1)) * 0.3;
  DARKEN_STRINGS[i] = `rgba(0,0,0,${opacity.toFixed(4)})`;
}

function darkenString(t: number): string {
  const idx = Math.min(DARKEN_STEPS - 1, Math.max(0, Math.round(t * (DARKEN_STEPS - 1))));
  return DARKEN_STRINGS[idx];
}

// ---------------------------------------------------------------------------
// Pre-blended darkened color cache
// Eliminates the second ctx.fill() on folding flaps by pre-computing the
// blended result of (baseColor + rgba(0,0,0,opacity)) for each darken step.
// Cache: Map<baseHex, string[DARKEN_STEPS]>  (~12 varied colors × 32 steps = ~384 entries)
// ---------------------------------------------------------------------------
const _darkenedCache = new Map<string, string[]>();

/** Return a hex color that is baseHex blended with black at darken parameter t (0..1). */
function darkenedHex(baseHex: string, t: number): string {
  const stepIdx = Math.min(DARKEN_STEPS - 1, Math.max(0, Math.round(t * (DARKEN_STEPS - 1))));
  if (stepIdx === 0) return baseHex; // no darkening
  let steps = _darkenedCache.get(baseHex);
  if (!steps) {
    steps = new Array(DARKEN_STEPS);
    steps[0] = baseHex;
    _darkenedCache.set(baseHex, steps);
  }
  let cached = steps[stepIdx];
  if (cached === undefined) {
    const [r, g, b] = hexToRgb(baseHex);
    // Blend with black at opacity = stepIdx/(DARKEN_STEPS-1) * 0.3
    const opacity = (stepIdx / (DARKEN_STEPS - 1)) * 0.3;
    const inv = 1 - opacity;
    cached = rgbToHex(r * inv, g * inv, b * inv);
    steps[stepIdx] = cached;
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Parse a hex color string (#rgb or #rrggbb) → [r, g, b] integers 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Convert [r, g, b] integers to #rrggbb hex string. */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Adjust brightness of an RGB color.
 * @param factor  Positive → lighten (0=no-op, 1=white), negative → darken (0=no-op, -1=black).
 */
function adjustBrightness(r: number, g: number, b: number, factor: number): [number, number, number] {
  if (factor >= 0) {
    return [r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor];
  }
  const f = 1 + factor; // factor=-0.09 → f=0.82
  return [r * f, g * f, b * f];
}

/**
 * Deterministic per-triangle lightness variation.
 * Returns a value in [-0.08, +0.08] derived from the triangle index via
 * Knuth multiplicative hashing — stable across frames, visually random.
 */
export function triVariation(index: number): number {
  // Knuth multiplicative hash (uint32)
  let h = Math.imul(index >>> 0, 0x9e3779b9) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  // Map to [-0.08, +0.08]
  return ((h >>> 0) / 0xffffffff) * 0.16 - 0.08;
}

// ---------------------------------------------------------------------------
// Per-triangle color variation cache
// Cache: Map<baseColor, Map<triIndex, variedColor>>
// Only 6 palette colors × ~3000 triangle indices = bounded.
// Cache is cleared when a new base color is first seen after palette change.
// ---------------------------------------------------------------------------
const _triVariationCache = new Map<string, Map<number, string>>();

/**
 * Apply per-triangle lightness variation to a hex color.
 * Returns a new hex color shifted by the variation for the given index.
 * If index is -1 (default), no variation is applied.
 * Results are cached: same (color, index) → same string, no per-frame allocation.
 */
export function applyTriVariation(color: string, index: number): string {
  if (index < 0 || !color.startsWith('#')) return color;
  let byIndex = _triVariationCache.get(color);
  if (!byIndex) {
    byIndex = new Map<number, string>();
    _triVariationCache.set(color, byIndex);
  }
  let cached = byIndex.get(index);
  if (cached === undefined) {
    const [r, g, b] = hexToRgb(color);
    const v = triVariation(index);
    const [nr, ng, nb] = adjustBrightness(r, g, b, v);
    cached = rgbToHex(nr, ng, nb);
    byIndex.set(index, cached);
  }
  return cached;
}

// Cache for creaseColor — only ~6-12 varied colors active at a time
const _creaseColorCache = new Map<string, string>();

/**
 * Compute the crease stroke color: 18% darker than the given hex color.
 * This makes edges nearly invisible within same-color regions (Kami 2 style).
 * Results are cached to avoid per-frame string allocation.
 */
export function creaseColor(color: string): string {
  if (!color.startsWith('#')) return color;
  let cached = _creaseColorCache.get(color);
  if (cached === undefined) {
    const [r, g, b] = hexToRgb(color);
    const [nr, ng, nb] = adjustBrightness(r, g, b, -0.09);
    cached = rgbToHex(nr, ng, nb);
    _creaseColorCache.set(color, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Paper texture
// ---------------------------------------------------------------------------

/**
 * Generate the paper texture canvas once at startup.
 * Returns an offscreen canvas with noise grain + multi-angle fibers.
 */
function generatePaperTexture(): HTMLCanvasElement {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const pctx = canvas.getContext('2d')!;

  // Layer 1: dense random grain dots — heavier for construction-paper roughness
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const opacity = 0.06 + Math.random() * 0.18; // denser, more visible
    // Mix light and dark flecks for realistic paper grain
    const isLight = Math.random() > 0.4;
    pctx.fillStyle = isLight
      ? `rgba(255,255,255,${opacity})`
      : `rgba(0,0,0,${opacity * 0.6})`;
    pctx.fillRect(x, y, 1, 1);
  }

  // Layer 2: fibers at three angles — 0°, 30°, -30° — matching equilateral triangle grain
  const fiberAngles = [0, Math.PI / 6, -Math.PI / 6]; // 0°, 30°, -30°
  for (const angle of fiberAngles) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const count = angle === 0 ? 80 : 55; // more fibers
    for (let i = 0; i < count; i++) {
      const sx = Math.random() * SIZE;
      const sy = Math.random() * SIZE;
      const len = SIZE * (0.15 + Math.random() * 0.4); // shorter, denser fibers
      const opacity = 0.04 + Math.random() * 0.08; // more visible
      pctx.strokeStyle = `rgba(255,255,255,${opacity})`;
      pctx.lineWidth = 0.3 + Math.random() * 0.5;
      pctx.beginPath();
      pctx.moveTo(sx, sy);
      const drift = (Math.random() - 0.5) * 1.5;
      pctx.lineTo(
        sx + cos * len - sin * drift,
        sy + sin * len + cos * drift
      );
      pctx.stroke();
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// Renderer factory
// ---------------------------------------------------------------------------

/**
 * Create a renderer bound to a canvas context.
 *
 * Static triangle cache (offscreen canvas):
 *   All idle triangles are painted onto `staticCanvas` once. During a cascade,
 *   the hot path blits the static layer then draws only the K animating triangles
 *   on top, reducing per-frame draw calls from N to K (typically 10-60× fewer).
 *   The cache is rebuilt whenever `invalidateStaticCache()` is called — i.e. when
 *   a triangle finishes folding (its committed color changed) or on resize.
 */
export function createRenderer(ctx: CanvasRenderingContext2D, triCoords?: Float32Array) {
  // Pre-create paper texture pattern once at startup
  let paperPattern: CanvasPattern | null = null;
  try {
    const textureCanvas = generatePaperTexture();
    paperPattern = ctx.createPattern(textureCanvas, 'repeat');
  } catch (_) {
    // In test environments, document may not exist
  }

  // Pre-computed fold projection geometry cache.
  // Stride 4 per triangle: [projX, projY, reflApexX, reflApexY].
  // Populated by cacheFoldGeom() once when a fold starts; read every frame
  // inside drawFoldingTriangleRaw() to skip the per-frame dot-product + division.
  let foldGeomCache: Float32Array | null = triCoords
    ? new Float32Array(triCoords.length / COORDS_STRIDE * 4)
    : null;

  // Offscreen canvas for static (idle) triangles
  let staticCanvas: HTMLCanvasElement | null = null;
  let staticCtx: CanvasRenderingContext2D | null = null;
  let staticDirty = true;
  let staticWidth = 0;
  let staticHeight = 0;

  /** Force a full static-cache rebuild on the next renderFrame call. */
  function invalidateStaticCache(): void {
    staticDirty = true;
  }

  /**
   * Incrementally update one triangle in the static cache.
   * Called when a single triangle finishes folding — avoids O(N) full rebuild.
   * If the static cache isn't ready, falls back to a full invalidation.
   *
   * For batching multiple completions in one tick, use enqueuePatch + flushPatches.
   */
  function patchStaticTriangle(triangle: Triangle, color: string, index: number): void {
    if (!staticCtx || staticDirty) {
      // Cache not ready yet — full rebuild will happen on next renderFrame
      staticDirty = true;
      if (typeof window !== 'undefined' && (window as any).__ssDebug) (window as any).__ssDebug.patchEarlyReturns++;
      return;
    }
    if (typeof window !== 'undefined' && (window as any).__ssDebug) (window as any).__ssDebug.patchCalls++;
    const sc = staticCtx;
    const variedColor = applyTriVariation(color, index);
    // DEBUG: track what we're patching
    if (typeof window !== 'undefined' && (window as any).__ssDebug2) {
      const d = (window as any).__ssDebug2;
      if (!d.patches) d.patches = [];
      if (d.patches.length < 200) d.patches.push({ idx: index, color, variedColor });
    }

    sc.beginPath();
    if (triCoords) {
      const base = index * COORDS_STRIDE;
      sc.moveTo(triCoords[base],     triCoords[base + 1]);
      sc.lineTo(triCoords[base + 2], triCoords[base + 3]);
      sc.lineTo(triCoords[base + 4], triCoords[base + 5]);
    } else {
      const pts = triangle.points as [number, number][];
      sc.moveTo(pts[0][0], pts[0][1]);
      sc.lineTo(pts[1][0], pts[1][1]);
      sc.lineTo(pts[2][0], pts[2][1]);
    }
    sc.closePath();
    sc.fillStyle = variedColor;
    sc.fill();
    sc.strokeStyle = creaseColor(variedColor);
    sc.lineWidth = 0.7;
    sc.stroke();
  }

  // ── Batched patch buffers ─────────────────────────────────────────────────
  // Accumulate (index, color) pairs within one tick, then flush as a single
  // compound path-per-color draw in flushPatches().  This collapses the
  // per-triangle beginPath+fill+stroke into 2×(unique varied colors) calls —
  // typically ~2-4 calls vs 7× per-triangle when many folds complete together.
  const _patchIndices: number[] = [];
  const _patchColors: string[]  = [];
  // Reusable scratch map for flushPatches — avoids per-tick Map allocation during cascades.
  const _patchBuckets = new Map<string, number[]>();

  /**
   * Queue a triangle to be patched into the static cache.
   * Must call flushPatches() before the next renderFrame to apply.
   */
  function enqueuePatch(triangle: Triangle, color: string, index: number): void {
    if (!staticCtx || staticDirty) {
      staticDirty = true;
      return;
    }
    void triangle; // will read from triCoords in flushPatches
    _patchIndices.push(index);
    _patchColors.push(color);
  }

  /**
   * Flush all queued patches in a single batched draw pass.
   * Groups triangles by their varied color and emits one compound fill+stroke
   * per color bucket — same strategy as rebuildStaticCache (2×unique-color calls
   * instead of 7×N individual canvas ops).
   *
   * No-op if queue is empty or static cache is dirty (rebuild scheduled anyway).
   */
  function flushPatches(): void {
    if (_patchIndices.length === 0) return;
    if (!staticCtx || staticDirty) {
      _patchIndices.length = 0;
      _patchColors.length  = 0;
      return;
    }
    const sc = staticCtx;
    // Build color → index[] map (reuse module-level scratch map to avoid per-tick allocation).
    // Instead of .clear() (which drops bucket arrays for GC), truncate existing arrays in-place.
    for (const bucket of _patchBuckets.values()) bucket.length = 0;
    for (let k = 0; k < _patchIndices.length; k++) {
      const idx = _patchIndices[k];
      const variedColor = applyTriVariation(_patchColors[k], idx);
      let b = _patchBuckets.get(variedColor);
      if (!b) { b = []; _patchBuckets.set(variedColor, b); }
      b.push(idx);
    }
    sc.lineWidth = 0.7;
    if (triCoords) {
      for (const [variedColor, idxList] of _patchBuckets) {
        if (idxList.length === 0) continue;
        sc.beginPath();
        for (const idx of idxList) {
          const base = idx * COORDS_STRIDE;
          sc.moveTo(triCoords[base],     triCoords[base + 1]);
          sc.lineTo(triCoords[base + 2], triCoords[base + 3]);
          sc.lineTo(triCoords[base + 4], triCoords[base + 5]);
          sc.closePath();
        }
        sc.fillStyle = variedColor;
        sc.fill();
        sc.strokeStyle = creaseColor(variedColor);
        sc.stroke();
      }
    } else {
      // Fallback for test environments without triCoords
      // (we don't have the Triangle objects here; fall back to invalidate)
      staticDirty = true;
    }
    _patchIndices.length = 0;
    _patchColors.length  = 0;
  }

  /**
   * Precompute and cache fold projection geometry for a triangle.
   * Call once when `startFold` is invoked for triangle `index`.
   * Stores [projX, projY, reflApexX, reflApexY] in foldGeomCache at index*4.
   *
   * This eliminates the per-frame dot-product + division from drawFoldingTriangleRaw
   * (6 multiplies, 4 adds, 1 div → 0 per frame for static fold geometry).
   */
  function cacheFoldGeom(index: number, foldEdgeIdx: number): void {
    if (!foldGeomCache || !triCoords) return;
    const base = index * COORDS_STRIDE;
    const i0 = foldEdgeIdx;
    const i1 = (foldEdgeIdx + 1) % 3;
    const i2 = (foldEdgeIdx + 2) % 3;
    const ex0 = triCoords[base + i0 * 2],     ey0 = triCoords[base + i0 * 2 + 1];
    const ex1 = triCoords[base + i1 * 2],     ey1 = triCoords[base + i1 * 2 + 1];
    const ax  = triCoords[base + i2 * 2],     ay  = triCoords[base + i2 * 2 + 1];

    const edgeX = ex1 - ex0;
    const edgeY = ey1 - ey0;
    const edgeLenSq = edgeX * edgeX + edgeY * edgeY;
    const t_proj = edgeLenSq > 0
      ? ((ax - ex0) * edgeX + (ay - ey0) * edgeY) / edgeLenSq
      : 0;
    const projX = ex0 + t_proj * edgeX;
    const projY = ey0 + t_proj * edgeY;

    const gbase = index * 4;
    foldGeomCache[gbase]     = projX;
    foldGeomCache[gbase + 1] = projY;
    foldGeomCache[gbase + 2] = 2 * projX - ax; // reflApexX
    foldGeomCache[gbase + 3] = 2 * projY - ay; // reflApexY
  }

  /**
   * Ensure the offscreen canvas exists and matches the current output size.
   * On HiDPI displays, the static canvas is allocated at physical pixel resolution
   * (w*dpr × h*dpr) with a matching scale transform — so idle triangles render at
   * full Retina resolution, matching the animating triangles drawn on the main canvas.
   */
  function ensureStaticCanvas(w: number, h: number): void {
    try {
      if (!staticCanvas) {
        staticCanvas = document.createElement('canvas');
        staticCtx = staticCanvas.getContext('2d');
      }
      if (staticWidth !== w || staticHeight !== h) {
        const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
        staticCanvas.width = w * dpr;
        staticCanvas.height = h * dpr;
        if (staticCtx && dpr !== 1) {
          staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        staticWidth = w;
        staticHeight = h;
        staticDirty = true;
      }
    } catch (_) {
      // No DOM in test environments — static cache disabled
    }
  }

  // Module-level scratch map for batched static cache rebuild.
  // Reused across calls to avoid per-rebuild Map allocation.
  // Maps variedColor → array of triangle indices (cleared before each use).
  const _rebuildBuckets = new Map<string, number[]>();

  /**
   * Rebuild the static cache by drawing all idle triangles onto staticCtx.
   *
   * Batch-by-color optimization: group triangles by their varied fill color and
   * emit one compound path per color bucket → fill+stroke count drops from 2N to
   * 2×(num_unique_varied_colors). With 3 palette colors × 32 variation buckets the
   * worst case is ~96 compound paths instead of ~3000 individual fills.
   * In practice during a cascade most triangles share a color → typical reduction is
   * 10–20× fewer fill+stroke calls vs the per-triangle loop.
   *
   * Uses triCoords Float32Array when available for cache-friendly coord reads.
   */
  function rebuildStaticCache(
    triangles: Triangle[],
    colors: string[],
    animStates: (RenderAnimState | null)[] | null,
    bgColor: string | undefined,
    w: number,
    h: number,
  ): void {
    if (!staticCtx || !staticCanvas) return;
    const sc = staticCtx;

    // DEBUG: log the unique colors in the rebuild
    if (typeof window !== 'undefined' && (window as any).__ssDebug2) {
      const uniqueColors = new Set(colors);
      (window as any).__ssDebug2.rebuildColors = Array.from(uniqueColors);
    }

    // Fill background
    if (bgColor) {
      sc.fillStyle = bgColor;
      sc.fillRect(0, 0, w, h);
    } else {
      sc.clearRect(0, 0, w, h);
    }

    sc.save();
    sc.beginPath();
    sc.rect(0, 0, w, h);
    sc.clip();

    // --- Batch by color: group triangle indices by variedColor ---
    _rebuildBuckets.clear();

    if (triCoords) {
      for (let i = 0; i < triangles.length; i++) {
        const anim = animStates ? animStates[i] : null;
        if (anim && anim.progress > 0 && anim.progress < 1.15) continue;
        const variedColor = applyTriVariation(colors[i], i);
        let bucket = _rebuildBuckets.get(variedColor);
        if (!bucket) { bucket = []; _rebuildBuckets.set(variedColor, bucket); }
        bucket.push(i);
      }

      sc.lineWidth = 0.7;
      for (const [variedColor, bucket] of _rebuildBuckets) {
        // Build compound fill path for all triangles of this color
        sc.beginPath();
        for (const i of bucket) {
          const base = i * COORDS_STRIDE;
          sc.moveTo(triCoords[base],     triCoords[base + 1]);
          sc.lineTo(triCoords[base + 2], triCoords[base + 3]);
          sc.lineTo(triCoords[base + 4], triCoords[base + 5]);
          sc.closePath();
        }
        sc.fillStyle = variedColor;
        sc.fill();
        // Crease stroke — same compound path
        sc.strokeStyle = creaseColor(variedColor);
        sc.stroke();
      }
    } else {
      // Fallback: nested array access (test environment or no triCoords provided)
      for (let i = 0; i < triangles.length; i++) {
        const anim = animStates ? animStates[i] : null;
        if (anim && anim.progress > 0 && anim.progress < 1.15) continue;
        const variedColor = applyTriVariation(colors[i], i);
        let bucket = _rebuildBuckets.get(variedColor);
        if (!bucket) { bucket = []; _rebuildBuckets.set(variedColor, bucket); }
        bucket.push(i);
      }

      sc.lineWidth = 0.7;
      for (const [variedColor, bucket] of _rebuildBuckets) {
        sc.beginPath();
        for (const i of bucket) {
          const pts = triangles[i].points as [number, number][];
          sc.moveTo(pts[0][0], pts[0][1]);
          sc.lineTo(pts[1][0], pts[1][1]);
          sc.lineTo(pts[2][0], pts[2][1]);
          sc.closePath();
        }
        sc.fillStyle = variedColor;
        sc.fill();
        sc.strokeStyle = creaseColor(variedColor);
        sc.stroke();
      }
    }

    sc.restore();
    staticDirty = false;
    if (typeof window !== 'undefined' && (window as any).__ssDebug) (window as any).__ssDebug.rebuilds = ((window as any).__ssDebug.rebuilds || 0) + 1;
  }

  /**
   * Trace the triangle path onto the main context (shared between fill passes).
   */
  function tracePath(points: [number, number][]): void {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
  }

  /**
   * Apply crease stroke to an already-traced path on the main context.
   * Note: `points` parameter was removed — it was never read inside this function;
   * removing it eliminates 2 array allocations per folding-triangle per frame.
   */
  function applyDepthShading(fillColor: string): void {
    // Crease stroke: color-relative (18% darker than fill) → near-invisible within same-color regions.
    // Note: lineWidth is set once per frame in renderFrame (0.7) to avoid redundant per-triangle sets.
    const stroke = fillColor ? creaseColor(fillColor) : 'rgba(0,0,0,0.09)';
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  /**
   * Apply paper texture overlay over the entire canvas in one pass.
   * Called once at the end of renderFrame instead of once per triangle.
   */
  function applyGlobalPaperTexture(width: number, height: number): void {
    if (!paperPattern) return;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = paperPattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  return {
    ctx,

    /**
     * Notify the renderer that committed triangle colors have changed (a fold completed).
     * Forces the static cache to rebuild on the next frame.
     * Prefer `patchStaticTriangle` when possible — it updates a single triangle in O(1).
     */
    invalidateStaticCache,

    /**
     * Incrementally update a single triangle in the static cache after fold completion.
     * O(1) per triangle vs O(N) full rebuild — keeps the cache warm during cascades.
     * For multiple completions in one tick, prefer enqueuePatch + flushPatches instead.
     */
    patchStaticTriangle,

    /**
     * Queue a triangle for batched patching. Call flushPatches() after all completions
     * in a tick to write them in a single compound-path draw (2×unique-color ops vs 7×N).
     */
    enqueuePatch,

    /**
     * Flush all queued patches in one batched compound-path draw pass.
     * Must be called before the next renderFrame to keep the static cache consistent.
     */
    flushPatches,

    /**
     * Precompute fold projection geometry for triangle `index` at fold start.
     * Call once when startFold() is invoked for a triangle.
     * Caches [projX, projY, reflApexX, reflApexY] so drawFoldingTriangleRaw
     * skips the per-frame dot-product + division (~10 FLOPs per animating tri per frame).
     */
    cacheFoldGeom,

    /** Clear the entire canvas, optionally filling with a background color. */
    clear(bgColor?: string): void {
      if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      } else {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    },

    /**
     * Draw a single triangle with paper depth shading.
     */
    drawTriangle(points: [number, number][], color: string, triIndex = -1): void {
      const variedColor = applyTriVariation(color, triIndex);
      tracePath(points);
      ctx.fillStyle = variedColor;
      ctx.fill();
      applyDepthShading(variedColor);
    },

    /**
     * Draw a folding triangle. The triangle is split along the fold axis
     * and the folding half is transformed to simulate a paper fold.
     */
    drawFoldingTriangle(
      points: [number, number][],
      oldColor: string,
      newColor: string,
      progress: number,
      foldEdgeIdx: number,
      triIndex = -1
    ): void {
      const i0 = foldEdgeIdx;
      const i1 = (foldEdgeIdx + 1) % 3;
      const i2 = (foldEdgeIdx + 2) % 3;
      this.drawFoldingTriangleRaw(
        points[i0][0], points[i0][1],
        points[i1][0], points[i1][1],
        points[i2][0], points[i2][1],
        oldColor, newColor, progress, foldEdgeIdx, triIndex
      );
    },

    /**
     * Draw a folding triangle from raw flat coordinates — zero array allocations in hot path.
     * Called directly with typed-array coords in the static-cache render loop.
     * @param ex0,ey0  first point of fold edge (points[foldEdgeIdx])
     * @param ex1,ey1  second point of fold edge (points[(foldEdgeIdx+1)%3])
     * @param ax,ay    apex point (points[(foldEdgeIdx+2)%3])
     */
    drawFoldingTriangleRaw(
      ex0: number, ey0: number,
      ex1: number, ey1: number,
      ax: number, ay: number,
      oldColor: string,
      newColor: string,
      progress: number,
      foldEdgeIdx: number,
      triIndex = -1
    ): void {
      const variedOld = applyTriVariation(oldColor, triIndex);
      const variedNew = applyTriVariation(newColor, triIndex);

      // Fold projection geometry — use precomputed cache when available (zero cost per frame).
      // Falls back to inline computation for test environments or when cache is unset.
      let projX: number, projY: number, reflApexX: number, reflApexY: number;
      if (foldGeomCache && triIndex >= 0) {
        const gbase = triIndex * 4;
        projX     = foldGeomCache[gbase];
        projY     = foldGeomCache[gbase + 1];
        reflApexX = foldGeomCache[gbase + 2];
        reflApexY = foldGeomCache[gbase + 3];
      } else {
        // Inline computation (test env / no cache)
        const edgeX = ex1 - ex0;
        const edgeY = ey1 - ey0;
        const edgeLenSq = edgeX * edgeX + edgeY * edgeY;
        const t_proj = edgeLenSq > 0
          ? ((ax - ex0) * edgeX + (ay - ey0) * edgeY) / edgeLenSq
          : 0;
        projX = ex0 + t_proj * edgeX;
        projY = ey0 + t_proj * edgeY;
        reflApexX = 2 * projX - ax;
        reflApexY = 2 * projY - ay;
      }

      const p = Math.min(1.05, Math.max(0, progress));

      // Draw base triangle (full shape, current backing color)
      ctx.beginPath();
      // Reconstruct original point order from foldEdgeIdx and raw coords
      // ex0=points[foldEdgeIdx], ex1=points[(foldEdgeIdx+1)%3], ax=points[(foldEdgeIdx+2)%3]
      // For tracePath we need all 3 original points; we have them as ex0/ey0, ex1/ey1, ax/ay
      ctx.moveTo(ex0, ey0);
      ctx.lineTo(ex1, ey1);
      ctx.lineTo(ax, ay);
      ctx.closePath();

      if (p <= 0.5) {
        // First half: old color face folding up toward the edge
        const phase = p * 2; // 0..1
        const scale = 1 - phase;
        const foldedApexX = projX + (ax - projX) * scale;
        const foldedApexY = projY + (ay - projY) * scale;

        // Reveal new color underneath
        ctx.fillStyle = variedNew;
        ctx.fill();
        applyDepthShading(variedNew);

        // Draw the folding flap — single pre-blended fill (eliminates 1 ctx.fill per flap per frame)
        if (scale > 0.005) {
          ctx.beginPath();
          ctx.moveTo(ex0, ey0);
          ctx.lineTo(ex1, ey1);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = darkenedHex(variedOld, phase * 0.85);
          ctx.fill();
          applyDepthShading(variedOld);
        }
      } else {
        // Second half (+ overshoot): new color face unfolding from edge onto new position
        const phase = (p - 0.5) * 2;
        const overshootPhase = Math.min(1.1, phase);
        const foldedApexX = projX + (reflApexX - projX) * overshootPhase;
        const foldedApexY = projY + (reflApexY - projY) * overshootPhase;

        // Draw the base (new color)
        ctx.fillStyle = variedNew;
        ctx.fill();
        applyDepthShading(variedNew);

        // Draw the folding flap coming down — single pre-blended fill
        if (overshootPhase < 1.0) {
          ctx.beginPath();
          ctx.moveTo(ex0, ey0);
          ctx.lineTo(ex1, ey1);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = darkenedHex(variedNew, (1 - overshootPhase) * 0.5);
          ctx.fill();
          applyDepthShading(variedNew);
        }
      }
    },

    /**
     * Render the full grid.
     *
     * Hot path (during cascade):
     *   1. Rebuild static cache if dirty (only idle triangles, ~once per fold completion)
     *   2. Blit static cache (one drawImage call)
     *   3. Draw only the K animating triangles on top  ← O(K) when foldingIndices provided
     *   4. Apply global paper texture overlay
     *
     * This reduces per-frame fill+stroke calls from N → K (the animating set),
     * which during a cascade is typically 10–60× fewer than the full grid.
     *
     * Pass `foldingIndices` (the active-set from screensaver.ts) to skip the O(N) scan
     * over `animStates` and iterate directly over the K animating indices.
     *
     * Fallback (no DOM / test env): draws all triangles as before.
     */
    renderFrame(
      triangles: Triangle[],
      colors: string[],
      animStates: (RenderAnimState | null)[] | null,
      bgColor?: string,
      foldingIndices?: Set<number>
    ): void {
      const w = ctx.canvas.clientWidth || ctx.canvas.width;
      const h = ctx.canvas.clientHeight || ctx.canvas.height;

      ensureStaticCanvas(w, h);

      // Check if there are any animating triangles
      let hasAnim = false;
      if (foldingIndices) {
        // O(K) — caller already knows which triangles are animating
        for (const i of foldingIndices) {
          const a = animStates ? animStates[i] : null;
          if (a && a.progress > 0 && a.progress < 1.15) { hasAnim = true; break; }
        }
      } else if (animStates) {
        // O(N) fallback when no active-set provided
        for (let i = 0; i < animStates.length; i++) {
          const a = animStates[i];
          if (a && a.progress > 0 && a.progress < 1.15) { hasAnim = true; break; }
        }
      }

      if (staticCanvas && staticCtx) {
        // --- Static-cache path ---
        if (staticDirty) {
          rebuildStaticCache(triangles, colors, animStates, bgColor, w, h);
        }

        // Blit static layer (one drawImage — replaces N fill+stroke calls)
        // Draw at CSS-pixel dimensions (w×h) — the main canvas has a DPR scale
        // transform, and the static canvas is allocated at physical pixel resolution,
        // so we explicitly size the blit to CSS pixels to avoid double-scaling on Retina.
        // No clear() needed — the static canvas already includes the bgColor fill
        // and covers the entire area, so drawImage overwrites all pixels.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.drawImage(staticCanvas, 0, 0, w, h);

        // Set lineWidth once per frame — applyDepthShading skips redundant per-triangle sets
        ctx.lineWidth = 0.7;

        // Draw only animating triangles on top — O(K) when foldingIndices provided
        if (hasAnim && animStates) {
          if (foldingIndices) {
            // O(K): iterate Set directly — no Array.from allocation
            for (const i of foldingIndices) {
              const anim = animStates[i];
              if (!anim || anim.progress <= 0 || anim.progress >= 1.15) continue;
              if (triCoords) {
                // Zero-allocation: read raw coords and call drawFoldingTriangleRaw directly
                const base = i * COORDS_STRIDE;
                const i0 = anim.foldEdgeIdx;
                const i1 = (i0 + 1) % 3;
                const i2 = (i0 + 2) % 3;
                this.drawFoldingTriangleRaw(
                  triCoords[base + i0 * 2],     triCoords[base + i0 * 2 + 1],
                  triCoords[base + i1 * 2],     triCoords[base + i1 * 2 + 1],
                  triCoords[base + i2 * 2],     triCoords[base + i2 * 2 + 1],
                  anim.oldColor, anim.newColor, anim.progress, anim.foldEdgeIdx, i
                );
              } else {
                const pts = triangles[i].points as [number, number][];
                this.drawFoldingTriangle(pts, anim.oldColor, anim.newColor, anim.progress, anim.foldEdgeIdx, i);
              }
            }
          } else {
            // O(N) fallback when no active-set provided
            for (let i = 0; i < triangles.length; i++) {
              const anim = animStates[i];
              if (!anim || anim.progress <= 0 || anim.progress >= 1.15) continue;
              if (triCoords) {
                const base = i * COORDS_STRIDE;
                const i0 = anim.foldEdgeIdx;
                const i1 = (i0 + 1) % 3;
                const i2 = (i0 + 2) % 3;
                this.drawFoldingTriangleRaw(
                  triCoords[base + i0 * 2],     triCoords[base + i0 * 2 + 1],
                  triCoords[base + i1 * 2],     triCoords[base + i1 * 2 + 1],
                  triCoords[base + i2 * 2],     triCoords[base + i2 * 2 + 1],
                  anim.oldColor, anim.newColor, anim.progress, anim.foldEdgeIdx, i
                );
              } else {
                const pts = triangles[i].points as [number, number][];
                this.drawFoldingTriangle(pts, anim.oldColor, anim.newColor, anim.progress, anim.foldEdgeIdx, i);
              }
            }
          }
        }

        applyGlobalPaperTexture(w, h);
        ctx.restore();
      } else {
        // --- Fallback: full redraw (test environment, no DOM) ---
        this.clear(bgColor);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.lineWidth = 0.7;
        if (triCoords) {
          // Fast path: read coords directly from typed buffer — no per-triangle array allocation
          for (let i = 0; i < triangles.length; i++) {
            const anim = animStates ? animStates[i] : null;
            const base = i * COORDS_STRIDE;
            const x0 = triCoords[base],     y0 = triCoords[base + 1];
            const x1 = triCoords[base + 2], y1 = triCoords[base + 3];
            const x2 = triCoords[base + 4], y2 = triCoords[base + 5];
            if (anim && anim.progress > 0 && anim.progress < 1.15) {
              // Need pts array for drawFoldingTriangle — only for animating tris (rare in fallback)
              this.drawFoldingTriangle([[x0,y0],[x1,y1],[x2,y2]], anim.oldColor, anim.newColor, anim.progress, anim.foldEdgeIdx, i);
            } else {
              // Inline drawTriangle — eliminates tracePath() call and pts array allocation
              const variedColor = applyTriVariation(colors[i], i);
              ctx.beginPath();
              ctx.moveTo(x0, y0);
              ctx.lineTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.closePath();
              ctx.fillStyle = variedColor;
              ctx.fill();
              applyDepthShading(variedColor);
            }
          }
        } else {
          for (let i = 0; i < triangles.length; i++) {
            const tri = triangles[i];
            const anim = animStates ? animStates[i] : null;
            if (anim && anim.progress > 0 && anim.progress < 1.15) {
              this.drawFoldingTriangle(
                tri.points as [number, number][],
                anim.oldColor,
                anim.newColor,
                anim.progress,
                anim.foldEdgeIdx,
                i
              );
            } else {
              this.drawTriangle(tri.points as [number, number][], colors[i], i);
            }
          }
        }
        applyGlobalPaperTexture(w, h);
        ctx.restore();
      }
    },
  };
}
