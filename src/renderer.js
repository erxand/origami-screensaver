/**
 * Canvas renderer — draws triangles with their current colors.
 * Supports flat rendering and fold-in-progress rendering.
 */

/**
 * Create a renderer bound to a canvas context.
 */
export function createRenderer(ctx) {
  // Pre-create a subtle paper texture pattern
  let paperPattern = null;
  try {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 64;
    patternCanvas.height = 64;
    const pctx = patternCanvas.getContext('2d');
    pctx.fillStyle = 'rgba(255,255,255,0.03)';
    // Scatter tiny dots for a paper-fiber look
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * 64;
      const y = Math.random() * 64;
      pctx.fillRect(x, y, 1, 1);
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
      // Paper texture overlay
      if (paperPattern) {
        ctx.fillStyle = paperPattern;
        ctx.fill();
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
          const darken = t * 0.3; // darken as it folds
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = oldColor;
          ctx.fill();
          // Darken overlay
          ctx.fillStyle = `rgba(0,0,0,${darken})`;
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
          const darken = (1 - t) * 0.3;
          ctx.beginPath();
          ctx.moveTo(edgeP0[0], edgeP0[1]);
          ctx.lineTo(edgeP1[0], edgeP1[1]);
          ctx.lineTo(foldedApexX, foldedApexY);
          ctx.closePath();
          ctx.fillStyle = newColor;
          ctx.fill();
          ctx.fillStyle = `rgba(0,0,0,${darken})`;
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
