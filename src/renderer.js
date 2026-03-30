/**
 * Canvas renderer — draws triangles with their current colors.
 * Supports flat rendering and fold-in-progress rendering.
 *
 * Visual depth techniques:
 *  - Per-triangle diagonal gradient (light upper-left → dark lower-right) → folded-paper shading
 *  - Thin semi-transparent edge stroke → crease / separation between triangles
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
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const opacity = 0.025 + Math.random() * 0.045; // 0.025–0.07
    pctx.fillStyle = `rgba(255,255,255,${opacity})`;
    pctx.fillRect(x, y, 1, 1);
  }

  // Layer 2: fibers at three angles — 0°, 30°, -30° — matching equilateral triangle grain
  const fiberAngles = [0, Math.PI / 6, -Math.PI / 6]; // 0°, 30°, -30°
  for (const angle of fiberAngles) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const count = angle === 0 ? 30 : 18; // more horizontal fibers
    for (let i = 0; i < count; i++) {
      // Start from a random point; travel along the fiber direction across the canvas
      const sx = Math.random() * SIZE;
      const sy = Math.random() * SIZE;
      const len = SIZE * (0.4 + Math.random() * 0.6);
      const opacity = 0.012 + Math.random() * 0.018; // very subtle
      pctx.strokeStyle = `rgba(255,255,255,${opacity})`;
      pctx.lineWidth = 0.4 + Math.random() * 0.4;
      pctx.beginPath();
      pctx.moveTo(sx, sy);
      // Small random perpendicular drift for organic feel
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
   * Apply depth shading + edge crease to an already-traced path.
   * The path must be active (no new beginPath called after tracePath).
   * @param {Array} points - Triangle vertices
   */
  function applyDepthShading(points) {
    // Bounding box for gradient endpoints
    const x0 = Math.min(points[0][0], points[1][0], points[2][0]);
    const y0 = Math.min(points[0][1], points[1][1], points[2][1]);
    const x1 = Math.max(points[0][0], points[1][0], points[2][0]);
    const y1 = Math.max(points[0][1], points[1][1], points[2][1]);

    // Diagonal gradient: light upper-left → darker lower-right
    // Simulates a light source from upper-left, giving paper a folded depth feel.
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

    // Thin crease stroke — creates visual separation between adjacent triangles
    // Very low opacity so it reads as a fold line, not a hard border
    ctx.strokeStyle = 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  return {
    ctx,

    /** Clear the entire canvas. */
    clear() {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },

    /** Draw a single triangle filled with the given color, with paper depth shading. */
    drawTriangle(points, color) {
      tracePath(points);
      ctx.fillStyle = color;
      ctx.fill();
      applyDepthShading(points);
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
     *   Edge i is between points[i] and points[(i+1)%3].
     */
    drawFoldingTriangle(points, oldColor, newColor, progress, foldEdgeIdx) {
      const i0 = foldEdgeIdx;
      const i1 = (foldEdgeIdx + 1) % 3;
      const i2 = (foldEdgeIdx + 2) % 3;

      const edgeP0 = points[i0];
      const edgeP1 = points[i1];
      const apex = points[i2];

      // Reflect apex across the fold edge (not just the midpoint).
      // This gives the correct landing position for the folded flap.
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
        const scale = 1 - phase; // 1 → 0 (apex collapses onto edge)
        const foldedApexX = projX + (apex[0] - projX) * scale;
        const foldedApexY = projY + (apex[1] - projY) * scale;

        // Reveal new color underneath
        this.drawTriangle(points, newColor);

        // Draw the folding flap
        if (scale > 0.005) {
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = oldColor;
          ctx.fill();
          // Darken strongly at mid-fold so the crease is visible
          ctx.fillStyle = darkenString(phase * 0.85);
          ctx.fill();
          // Depth shading on the flap
          applyDepthShading([edgeP0, edgeP1, [foldedApexX, foldedApexY]]);
        }
      } else {
        // Second half (+ overshoot): new color face unfolding from edge onto new position
        const phase = (p - 0.5) * 2; // 0..1 (plus slightly >1 for overshoot)
        const overshootPhase = Math.min(1.1, phase);
        const foldedApexX = projX + (reflApexX - projX) * overshootPhase;
        const foldedApexY = projY + (reflApexY - projY) * overshootPhase;

        // Draw the base (new color)
        this.drawTriangle(points, newColor);

        // Draw the folding flap coming down (new color, fading shadow)
        if (overshootPhase < 1.0) {
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = newColor;
          ctx.fill();
          // Shadow fades as flap lands
          ctx.fillStyle = darkenString((1 - overshootPhase) * 0.5);
          ctx.fill();
          applyDepthShading([edgeP0, edgeP1, [foldedApexX, foldedApexY]]);
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
      // Clip to canvas logical bounds — prevents black zigzag artifacts on edges
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height);
      ctx.clip();
      for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        const anim = animStates ? animStates[i] : null;
        // Allow progress up to 1.15 so the spring overshoot is visible
        if (anim && anim.progress > 0 && anim.progress < 1.15) {
          this.drawFoldingTriangle(
            tri.points,
            anim.oldColor,
            anim.newColor,
            anim.progress,
            anim.foldEdgeIdx
          );
        } else {
          this.drawTriangle(tri.points, colors[i]);
        }
      }
      ctx.restore();
    },
  };
}
