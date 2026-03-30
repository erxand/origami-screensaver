/**
 * Color palettes for the origami screensaver.
 * Each palette is an array of 4-6 hex colors.
 */

export const PALETTES = {
  sakura: ['#f8c3cd', '#f7a1b0', '#e87e94', '#d4a5a5', '#f0e0d6', '#fff5ee'],
  ocean:  ['#0d3b66', '#1a6b8a', '#2a9d8f', '#40bfa0', '#a8dadc', '#caf0f8'],
  ember:  ['#d35400', '#e67e22', '#f39c12', '#c0392b', '#7f2b0a', '#2c2c2c'],
};

export const PALETTE_NAMES = Object.keys(PALETTES);

/**
 * Create a palette cycler that steps through palettes and colors.
 */
export function createPaletteCycler(startPaletteIdx = 0) {
  let paletteIdx = startPaletteIdx % PALETTE_NAMES.length;
  let colorIdx = 0;

  return {
    /** Get the current palette name. */
    currentPaletteName() {
      return PALETTE_NAMES[paletteIdx];
    },

    /** Get the current palette colors array. */
    currentPalette() {
      return PALETTES[PALETTE_NAMES[paletteIdx]];
    },

    /** Get the current color. */
    currentColor() {
      const pal = this.currentPalette();
      return pal[colorIdx % pal.length];
    },

    /** Advance to the next color; wraps to next palette when exhausted. */
    nextColor() {
      const pal = this.currentPalette();
      colorIdx++;
      if (colorIdx >= pal.length) {
        colorIdx = 0;
        paletteIdx = (paletteIdx + 1) % PALETTE_NAMES.length;
      }
      return this.currentColor();
    },

    /** Jump to the next palette immediately, resetting color index. */
    nextPalette() {
      paletteIdx = (paletteIdx + 1) % PALETTE_NAMES.length;
      colorIdx = 0;
    },

    /** Pick a random color from the current palette that isn't the given color. */
    randomColorExcluding(excludeColor) {
      const pal = this.currentPalette();
      const candidates = pal.filter(c => c !== excludeColor);
      if (candidates.length === 0) return pal[0];
      return candidates[Math.floor(Math.random() * candidates.length)];
    },
  };
}
