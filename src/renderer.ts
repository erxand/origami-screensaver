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
export function createRenderer(ctx: CanvasRenderingContext2D) {
  // Pre-create paper texture pattern once at startup
  let paperPattern: CanvasPattern | null = null;
  try {
    const textureCanvas = generatePaperTexture();
    paperPattern = ctx.createPattern(textureCanvas, 'repeat');
  } catch (_) {
    // In test environments, document may not exist
  }

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
   */
  function patchStaticTriangle(triangle: Triangle, color: string, index: number): void {
    if (!staticCtx || staticDirty) {
      // Cache not ready yet — full rebuild will happen on next renderFrame
      staticDirty = true;
      return;
    }
    const sc = staticCtx;
    const pts = triangle.points as [number, number][];
    const variedColor = applyTriVariation(color, index);

    sc.beginPath();
    sc.moveTo(pts[0][0], pts[0][1]);
    sc.lineTo(pts[1][0], pts[1][1]);
    sc.lineTo(pts[2][0], pts[2][1]);
    sc.closePath();
    sc.fillStyle = variedColor;
    sc.fill();
    sc.strokeStyle = creaseColor(variedColor);
    sc.lineWidth = 0.7;
    sc.stroke();
  }

  /**
   * Ensure the offscreen canvas exists and matches the current output size.
   */
  function ensureStaticCanvas(w: number, h: number): void {
    try {
      if (!staticCanvas) {
        staticCanvas = document.createElement('canvas');
        staticCtx = staticCanvas.getContext('2d');
      }
      if (staticWidth !== w || staticHeight !== h) {
        staticCanvas.width = w;
        staticCanvas.height = h;
        staticWidth = w;
        staticHeight = h;
        staticDirty = true;
      }
    } catch (_) {
      // No DOM in test environments — static cache disabled
    }
  }

  /**
   * Rebuild the static cache by drawing all idle triangles onto staticCtx.
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

    // Draw every triangle that is NOT currently animating
    for (let i = 0; i < triangles.length; i++) {
      const anim = animStates ? animStates[i] : null;
      if (anim && anim.progress > 0 && anim.progress < 1.15) continue; // animating — skip
      const pts = triangles[i].points as [number, number][];
      const variedColor = applyTriVariation(colors[i], i);
      sc.beginPath();
      sc.moveTo(pts[0][0], pts[0][1]);
      sc.lineTo(pts[1][0], pts[1][1]);
      sc.lineTo(pts[2][0], pts[2][1]);
      sc.closePath();
      sc.fillStyle = variedColor;
      sc.fill();
      sc.strokeStyle = creaseColor(variedColor);
      sc.lineWidth = 0.7;
      sc.stroke();
    }

    sc.restore();
    staticDirty = false;
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
    const stroke = fillColor ? creaseColor(fillColor) : 'rgba(0,0,0,0.09)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.7;
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
     */
    patchStaticTriangle,

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
      const variedOld = applyTriVariation(oldColor, triIndex);
      const variedNew = applyTriVariation(newColor, triIndex);

      const i0 = foldEdgeIdx;
      const i1 = (foldEdgeIdx + 1) % 3;
      const i2 = (foldEdgeIdx + 2) % 3;

      const edgeP0 = points[i0];
      const edgeP1 = points[i1];
      const apex = points[i2];

      // Reflect apex across the fold edge.
      const ex = edgeP1[0] - edgeP0[0];
      const ey = edgeP1[1] - edgeP0[1];
      const edgeLenSq = ex * ex + ey * ey;
      const t_proj = edgeLenSq > 0
        ? ((apex[0] - edgeP0[0]) * ex + (apex[1] - edgeP0[1]) * ey) / edgeLenSq
        : 0;
      const projX = edgeP0[0] + t_proj * ex;
      const projY = edgeP0[1] + t_proj * ey;
      const reflApexX = 2 * projX - apex[0];
      const reflApexY = 2 * projY - apex[1];

      const p = Math.min(1.05, Math.max(0, progress));

      if (p <= 0.5) {
        // First half: old color face folding up toward the edge
        const phase = p * 2; // 0..1
        const scale = 1 - phase;
        const foldedApexX = projX + (apex[0] - projX) * scale;
        const foldedApexY = projY + (apex[1] - projY) * scale;

        // Reveal new color underneath
        tracePath(points);
        ctx.fillStyle = variedNew;
        ctx.fill();
        applyDepthShading(variedNew);

        // Draw the folding flap
        if (scale > 0.005) {
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = variedOld;
          ctx.fill();
          ctx.fillStyle = darkenString(phase * 0.85);
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
        tracePath(points);
        ctx.fillStyle = variedNew;
        ctx.fill();
        applyDepthShading(variedNew);

        // Draw the folding flap coming down
        if (overshootPhase < 1.0) {
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = variedNew;
          ctx.fill();
          ctx.fillStyle = darkenString((1 - overshootPhase) * 0.5);
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
     *   3. Draw only the K animating triangles on top
     *   4. Apply global paper texture overlay
     *
     * This reduces per-frame fill+stroke calls from N → K (the animating set),
     * which during a cascade is typically 10–60× fewer than the full grid.
     *
     * Fallback (no DOM / test env): draws all triangles as before.
     */
    renderFrame(
      triangles: Triangle[],
      colors: string[],
      animStates: (RenderAnimState | null)[] | null,
      bgColor?: string
    ): void {
      const w = ctx.canvas.clientWidth || ctx.canvas.width;
      const h = ctx.canvas.clientHeight || ctx.canvas.height;

      ensureStaticCanvas(w, h);

      // Check if there are any animating triangles
      let hasAnim = false;
      if (animStates) {
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
        this.clear(bgColor);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.drawImage(staticCanvas, 0, 0);

        // Draw only animating triangles on top
        if (hasAnim && animStates) {
          for (let i = 0; i < triangles.length; i++) {
            const anim = animStates[i];
            if (!anim || anim.progress <= 0 || anim.progress >= 1.15) continue;
            this.drawFoldingTriangle(
              triangles[i].points as [number, number][],
              anim.oldColor,
              anim.newColor,
              anim.progress,
              anim.foldEdgeIdx,
              i
            );
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
        applyGlobalPaperTexture(w, h);
        ctx.restore();
      }
    },
  };
}
