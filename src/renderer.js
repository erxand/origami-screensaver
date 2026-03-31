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

// Pre-compute darken overlay strings to avoid per-frame string allocation
const DARKEN_STEPS = 32;
const DARKEN_STRINGS = new Array(DARKEN_STEPS);
for (let i = 0; i < DARKEN_STEPS; i++) {
  const opacity = (i / (DARKEN_STEPS - 1)) * 0.3;
  DARKEN_STRINGS[i] = `rgba(0,0,0,${opacity.toFixed(4)})`;
}

function darkenString(t) {
  const idx = Math.min(DARKEN_STEPS - 1, Math.max(0, Math.round(t * (DARKEN_STEPS - 1))));
  return DARKEN_STRINGS[idx];
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Parse a hex color string (#rgb or #rrggbb) → [r, g, b] integers 0-255. */
function hexToRgb(hex) {
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
function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Adjust brightness of an RGB color.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} factor  Positive → lighten (0=no-op, 1=white), negative → darken (0=no-op, -1=black).
 * @returns {[number, number, number]}
 */
function adjustBrightness(r, g, b, factor) {
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
 * @param {number} index - Triangle index (integer).
 * @returns {number} variation factor
 */
export function triVariation(index) {
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

/**
 * Apply per-triangle lightness variation to a hex color.
 * Returns a new hex color shifted by the variation for the given index.
 * If index is -1 (default), no variation is applied.
 * @param {string} color - Hex color string.
 * @param {number} index - Triangle index for deterministic variation; -1 = none.
 * @returns {string} Modified hex color string.
 */
export function applyTriVariation(color, index) {
  if (index < 0 || !color.startsWith('#')) return color;
  const [r, g, b] = hexToRgb(color);
  const v = triVariation(index);
  const [nr, ng, nb] = adjustBrightness(r, g, b, v);
  return rgbToHex(nr, ng, nb);
}

/**
 * Compute the crease stroke color: 18% darker than the given hex color.
 * This makes edges nearly invisible within same-color regions (Kami 2 style).
 * @param {string} color - Hex color string.
 * @returns {string} Darker hex color string.
 */
export function creaseColor(color) {
  if (!color.startsWith('#')) return color;
  const [r, g, b] = hexToRgb(color);
  const [nr, ng, nb] = adjustBrightness(r, g, b, -0.09);
  return rgbToHex(nr, ng, nb);
}

// ---------------------------------------------------------------------------
// Paper texture
// ---------------------------------------------------------------------------

/**
 * Generate the paper texture canvas once at startup.
 * Returns an offscreen canvas with noise grain + multi-angle fibers.
 */
function generatePaperTexture() {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const pctx = canvas.getContext('2d');

  // Layer 1: random grain dots at low opacity
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const opacity = 0.08 + Math.random() * 0.10; // 0.03–0.08
    pctx.fillStyle = `rgba(255,255,255,${opacity})`;
    pctx.fillRect(x, y, 1, 1);
  }

  // Layer 2: fibers at three angles — 0°, 30°, -30° — matching equilateral triangle grain
  const fiberAngles = [0, Math.PI / 6, -Math.PI / 6]; // 0°, 30°, -30°
  for (const angle of fiberAngles) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const count = angle === 0 ? 35 : 22;
    for (let i = 0; i < count; i++) {
      const sx = Math.random() * SIZE;
      const sy = Math.random() * SIZE;
      const len = SIZE * (0.4 + Math.random() * 0.6);
      const opacity = 0.015 + Math.random() * 0.02;
      pctx.strokeStyle = `rgba(255,255,255,${opacity})`;
      pctx.lineWidth = 0.4 + Math.random() * 0.4;
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
 */
export function createRenderer(ctx) {
  // Pre-create paper texture pattern once at startup
  let paperPattern = null;
  try {
    const textureCanvas = generatePaperTexture();
    paperPattern = ctx.createPattern(textureCanvas, 'repeat');
  } catch (_) {
    // In test environments, document may not exist
  }

  /**
   * Trace the triangle path (shared between fill passes).
   */
  function tracePath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
  }

  /**
   * Apply depth shading + color-relative edge crease to an already-traced path.
   * The path must be active (no new beginPath called after tracePath).
   * @param {Array} points - Triangle vertices
   * @param {string} fillColor - The hex fill color of this triangle (used to derive crease color).
   */
  function applyDepthShading(points, fillColor) {
    // Bounding box for gradient endpoints
    const x0 = Math.min(points[0][0], points[1][0], points[2][0]);
    const y0 = Math.min(points[0][1], points[1][1], points[2][1]);
    const x1 = Math.max(points[0][0], points[1][0], points[2][0]);
    const y1 = Math.max(points[0][1], points[1][1], points[2][1]);

    // Diagonal gradient: light upper-left → darker lower-right
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(255,255,255,0.11)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.00)');
    grad.addColorStop(1, 'rgba(0,0,0,0.09)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Paper texture overlay
    if (paperPattern) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = paperPattern;
      ctx.fill();
      ctx.restore();
    }

    // Crease stroke: color-relative (18% darker than fill) → near-invisible within same-color regions.
    // Falls back to a generic low-opacity black in non-hex environments.
    const stroke = fillColor ? creaseColor(fillColor) : 'rgba(0,0,0,0.09)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  return {
    ctx,

    /** Clear the entire canvas. */
    clear() {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },

    /**
     * Draw a single triangle with paper depth shading.
     * @param {Array} points - Triangle vertices [[x,y],[x,y],[x,y]]
     * @param {string} color - Hex fill color
     * @param {number} [triIndex=-1] - Triangle index for deterministic lightness variation; -1 = no variation.
     */
    drawTriangle(points, color, triIndex = -1) {
      const variedColor = applyTriVariation(color, triIndex);
      tracePath(points);
      ctx.fillStyle = variedColor;
      ctx.fill();
      applyDepthShading(points, variedColor);
    },

    /**
     * Draw a folding triangle. The triangle is split along the fold axis
     * and the folding half is transformed to simulate a paper fold.
     *
     * @param {Array} points - Triangle vertices [[x,y],[x,y],[x,y]]
     * @param {string} oldColor - Color before fold
     * @param {string} newColor - Color after fold
     * @param {number} progress - Fold progress 0..1 (0=flat old, 0.5=edge-on, 1=flat new)
     * @param {number} foldEdgeIdx - Index (0,1,2) of the edge to fold along.
     * @param {number} [triIndex=-1] - Triangle index for lightness variation.
     */
    drawFoldingTriangle(points, oldColor, newColor, progress, foldEdgeIdx, triIndex = -1) {
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
        applyDepthShading(points, variedNew);

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
          applyDepthShading([edgeP0, edgeP1, [foldedApexX, foldedApexY]], variedOld);
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
        applyDepthShading(points, variedNew);

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
          applyDepthShading([edgeP0, edgeP1, [foldedApexX, foldedApexY]], variedNew);
        }
      }
    },

    /**
     * Render the full grid. For each triangle, call the appropriate
     * draw method based on its animation state.
     *
     * Clipped to canvas bounds to prevent edge artifacts from triangles
     * that extend slightly beyond the viewport.
     *
     * @param {Array} triangles - Grid triangles
     * @param {Array} colors - Current color per triangle index
     * @param {Array} animStates - Animation states (null or { progress, oldColor, newColor, foldEdgeIdx })
     */
    renderFrame(triangles, colors, animStates) {
      this.clear();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);
      ctx.clip();
      for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        const anim = animStates ? animStates[i] : null;
        if (anim && anim.progress > 0 && anim.progress < 1.15) {
          this.drawFoldingTriangle(
            tri.points,
            anim.oldColor,
            anim.newColor,
            anim.progress,
            anim.foldEdgeIdx,
            i
          );
        } else {
          this.drawTriangle(tri.points, colors[i], i);
        }
      }
      ctx.restore();
    },
  };
}
