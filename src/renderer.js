/**
 * Canvas renderer — draws triangles with their current colors.
 * Supports flat rendering and fold-in-progress rendering.
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
 * Create a renderer bound to a canvas context.
 */
export function createRenderer(ctx) {
  // Pre-create a subtle paper texture pattern (Kami-style grain + fiber)
  let paperPattern = null;
  try {
    const patternCanvas = document.createElement('canvas');
    const SIZE = 256;
    patternCanvas.width = SIZE;
    patternCanvas.height = SIZE;
    const pctx = patternCanvas.getContext('2d');

    // Layer 1: random grain dots at low opacity
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const opacity = 0.03 + Math.random() * 0.05; // 0.03-0.08
      pctx.fillStyle = `rgba(255,255,255,${opacity})`;
      pctx.fillRect(x, y, 1, 1);
    }

    // Layer 2: subtle horizontal fiber lines
    pctx.strokeStyle = 'rgba(255,255,255,0.02)';
    pctx.lineWidth = 0.5;
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * SIZE;
      const xStart = Math.random() * SIZE * 0.3;
      const xEnd = xStart + SIZE * 0.3 + Math.random() * SIZE * 0.4;
      pctx.beginPath();
      pctx.moveTo(xStart, y);
      pctx.lineTo(xEnd, y + (Math.random() - 0.5) * 2);
      pctx.stroke();
    }

    paperPattern = ctx.createPattern(patternCanvas, 'repeat');
  } catch (_) {
    // In test environments, document may not exist
  }

  return {
    ctx,

    /** Clear the entire canvas. */
    clear() {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },

    /** Draw a single triangle filled with the given color, with paper texture. */
    drawTriangle(points, color) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      ctx.lineTo(points[1][0], points[1][1]);
      ctx.lineTo(points[2][0], points[2][1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // Paper texture overlay with multiply compositing
      if (paperPattern) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = paperPattern;
        ctx.fill();
        ctx.restore();
      }
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
      // Project apex onto edge line, then reflect.
      const ex = edgeP1[0] - edgeP0[0];
      const ey = edgeP1[1] - edgeP0[1];
      const edgeLenSq = ex * ex + ey * ey;
      const t_proj = edgeLenSq > 0
        ? ((apex[0] - edgeP0[0]) * ex + (apex[1] - edgeP0[1]) * ey) / edgeLenSq
        : 0;
      const projX = edgeP0[0] + t_proj * ex;
      const projY = edgeP0[1] + t_proj * ey;
      // Reflected apex = 2 * projection − apex
      const reflApexX = 2 * projX - apex[0];
      const reflApexY = 2 * projY - apex[1];

      // Clamp progress to valid rendering range (spring overshoot > 1.0 is handled below)
      const p = Math.min(1.05, Math.max(0, progress));

      if (p <= 0.5) {
        // First half: old color face folding up toward the edge
        const phase = p * 2; // 0..1
        // Perspective squish: apex moves toward the fold edge line
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
          // Paper texture
          if (paperPattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = paperPattern;
            ctx.fill();
            ctx.restore();
          }
        }
      } else {
        // Second half (+ overshoot): new color face unfolding from edge onto new position
        const phase = (p - 0.5) * 2; // 0..1 (plus slightly >1 for overshoot)
        // Spring overshoot: apex goes slightly past reflected position then eases back
        // When progress > 1.0 we re-map: the animator uses easeWithOvershoot so
        // progress peaks ~1.03; we clamp phase to ≤1.1 for rendering.
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
          // Paper texture
          if (paperPattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = paperPattern;
            ctx.fill();
            ctx.restore();
          }
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
      // from triangles that extend slightly beyond the viewport.
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
