import { describe, it, expect } from 'vitest';
import { PALETTES, PALETTE_NAMES, createPaletteCycler } from '../src/palette.js';

describe('PALETTES', () => {
  it('has at least 3 palettes', () => {
    expect(PALETTE_NAMES.length).toBeGreaterThanOrEqual(3);
  });

  it('includes sakura, ocean, and ember', () => {
    expect(PALETTE_NAMES).toContain('sakura');
    expect(PALETTE_NAMES).toContain('ocean');
    expect(PALETTE_NAMES).toContain('ember');
  });

  it('each palette has 4-6 colors', () => {
    for (const name of PALETTE_NAMES) {
      expect(PALETTES[name].length).toBeGreaterThanOrEqual(4);
      expect(PALETTES[name].length).toBeLessThanOrEqual(6);
    }
  });

  it('all colors are valid hex strings', () => {
    for (const name of PALETTE_NAMES) {
      for (const color of PALETTES[name]) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe('createPaletteCycler', () => {
  it('starts at the first palette and first color', () => {
    const cycler = createPaletteCycler(0);
    expect(cycler.currentPaletteName()).toBe('sakura');
    expect(cycler.currentColor()).toBe(PALETTES.sakura[0]);
  });

  it('nextColor advances through the palette', () => {
    const cycler = createPaletteCycler(0);
    const first = cycler.currentColor();
    const second = cycler.nextColor();
    expect(second).toBe(PALETTES.sakura[1]);
    expect(second).not.toBe(first);
  });

  it('wraps to the next palette after exhausting current', () => {
    const cycler = createPaletteCycler(0);
    const palLen = PALETTES.sakura.length;
    for (let i = 0; i < palLen; i++) {
      cycler.nextColor();
    }
    expect(cycler.currentPaletteName()).toBe('ocean');
  });

  it('wraps around all palettes', () => {
    const cycler = createPaletteCycler(0);
    const totalColors = PALETTE_NAMES.reduce((sum, n) => sum + PALETTES[n].length, 0);
    for (let i = 0; i < totalColors; i++) {
      cycler.nextColor();
    }
    // Should be back to first palette
    expect(cycler.currentPaletteName()).toBe('sakura');
  });

  it('randomColorExcluding returns a different color', () => {
    const cycler = createPaletteCycler(0);
    const current = cycler.currentColor();
    const random = cycler.randomColorExcluding(current);
    expect(random).not.toBe(current);
    expect(PALETTES.sakura).toContain(random);
  });
});
