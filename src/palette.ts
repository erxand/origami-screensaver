/**
 * Color palettes for the origami screensaver.
 * Each palette is an array of 4-6 hex colors.
 */

export const PALETTES: Record<string, string[]> = {
  sakura: ['#f8c3cd', '#f7a1b0', '#e87e94', '#d4a5a5', '#f0e0d6', '#fff5ee'],
  ocean:  ['#0d3b66', '#1a6b8a', '#2a9d8f', '#40bfa0', '#a8dadc', '#caf0f8'],
  ember:  ['#d35400', '#e67e22', '#f39c12', '#c0392b', '#7f2b0a', '#2c2c2c'],
};

export const PALETTE_NAMES: string[] = Object.keys(PALETTES);

/**
 * Create a palette cycler that steps through palettes and colors.
 */
export function createPaletteCycler(startPaletteIdx = 0) {
  let paletteIdx = startPaletteIdx % PALETTE_NAMES.length;
  let colorIdx = 0;

  return {
    /** Get the current palette name. */
    currentPaletteName(): string {
      return PALETTE_NAMES[paletteIdx];
    },

    /** Get the current palette colors array. */
    currentPalette(): string[] {
      return PALETTES[PALETTE_NAMES[paletteIdx]];
    },

    /** Get the current color. */
    currentColor(): string {
      const pal = this.currentPalette();
      return pal[colorIdx % pal.length];
    },

    /** Advance to the next color; wraps to next palette when exhausted. */
    nextColor(): string {
      const pal = this.currentPalette();
      colorIdx++;
      if (colorIdx >= pal.length) {
        colorIdx = 0;
        paletteIdx = (paletteIdx + 1) % PALETTE_NAMES.length;
      }
      return this.currentColor();
    },

    /** Jump to the next palette immediately, resetting color index. */
    nextPalette(): void {
      paletteIdx = (paletteIdx + 1) % PALETTE_NAMES.length;
      colorIdx = 0;
    },

    /** Jump to a specific palette by index, resetting color index. */
    setPaletteByIndex(idx: number): void {
      paletteIdx = ((idx % PALETTE_NAMES.length) + PALETTE_NAMES.length) % PALETTE_NAMES.length;
      colorIdx = 0;
    },

    /** Get current palette index. */
    currentPaletteIndex(): number {
      return paletteIdx;
    },

    /** Pick a random color from the current palette that isn't the given color. */
    randomColorExcluding(excludeColor: string): string {
      const pal = this.currentPalette();
      const candidates = pal.filter((c: string) => c !== excludeColor);
      if (candidates.length === 0) return pal[0];
      return candidates[Math.floor(Math.random() * candidates.length)];
    },
  };
}
