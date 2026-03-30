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

      // Fold axis: the shared edge
      const axisX = (edgeP0[0] + edgeP1[0]) / 2;
      const axisY = (edgeP0[1] + edgeP1[1]) / 2;

      if (progress <= 0.5) {
        // First half: old color face folding up
        const t = progress * 2; // 0..1 within first half
        // Scale the apex toward the fold axis to simulate perspective
        const scale = 1 - t; // 1 → 0
        const foldedApexX = axisX + (apex[0] - axisX) * scale;
        const foldedApexY = axisY + (apex[1] - axisY) * scale;

        // Draw the base (new color revealed underneath)
        this.drawTriangle(points, newColor);

        // Draw the folding flap on top
        if (scale > 0.01) {
          // darken as it folds
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = oldColor;
          ctx.fill();
          // Darken overlay
          ctx.fillStyle = darkenString(t);
          ctx.fill();
        }
      } else {
        // Second half: new color face folding down
        const t = (progress - 0.5) * 2; // 0..1 within second half
        const scale = t; // 0 → 1

        // Reflect apex across the fold axis
        const reflApexX = 2 * axisX - apex[0];
        const reflApexY = 2 * axisY - apex[1];

        // Interpolate from axis center to reflected position
        const foldedApexX = axisX + (reflApexX - axisX) * scale;
        const foldedApexY = axisY + (reflApexY - axisY) * scale;

        // Draw the base (new color)
        this.drawTriangle(points, newColor);

        // Draw the folding flap (new color, coming down from the other side)
        if (scale > 0.01) {
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = newColor;
          ctx.fill();
          ctx.fillStyle = darkenString(1 - t);
          ctx.fill();
        }
      }
    },

    /**
     * Render the full grid. For each triangle, call the appropriate
     * draw method based on its animation state.
     *
     * @param {Array} triangles - Grid triangles
     * @param {Array} colors - Current color per triangle index
     * @param {Array} animStates - Animation states (null or { progress, oldColor, newColor, foldEdgeIdx })
     */
    renderFrame(triangles, colors, animStates) {
      this.clear();
      for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        const anim = animStates ? animStates[i] : null;
        if (anim && anim.progress > 0 && anim.progress < 1) {
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
    },
  };
}
