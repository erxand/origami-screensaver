import { describe, it, expect } from 'vitest';
import { PALETTES, PALETTE_NAMES, createPaletteCycler } from '../src/palette.js';

describe('PALETTES', () => {
  it('has at least 3 palettes', () => {
    expect(PALETTE_NAMES.length).toBeGreaterThanOrEqual(3);
  });

  it('includes sakura, ocean, ember, and forest', () => {
    expect(PALETTE_NAMES).toContain('sakura');
    expect(PALETTE_NAMES).toContain('ocean');
    expect(PALETTE_NAMES).toContain('ember');
    expect(PALETTE_NAMES).toContain('forest');
  });

  it('ocean is the default (first) palette', () => {
    expect(PALETTE_NAMES[0]).toBe('ocean');
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
  const FIRST = PALETTE_NAMES[0]; // ocean
  const SECOND = PALETTE_NAMES[1]; // sakura

  it('starts at the first palette and first color', () => {
    const cycler = createPaletteCycler(0);
    expect(cycler.currentPaletteName()).toBe(FIRST);
    expect(cycler.currentColor()).toBe(PALETTES[FIRST][0]);
  });

  it('nextColor picks a different color from the same palette', () => {
    const cycler = createPaletteCycler(0);
    const first = cycler.currentColor();
    const second = cycler.nextColor();
    expect(second).not.toBe(first);
    expect(PALETTES[FIRST]).toContain(second);
  });

  it('nextColor always stays within current palette', () => {
    const cycler = createPaletteCycler(0);
    for (let i = 0; i < 20; i++) {
      const color = cycler.nextColor();
      expect(PALETTES[FIRST]).toContain(color);
    }
  });

  it('nextColor never picks the same color twice in a row', () => {
    const cycler = createPaletteCycler(0);
    let prev = cycler.currentColor();
    for (let i = 0; i < 50; i++) {
      const next = cycler.nextColor();
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('randomColorExcluding returns a different color', () => {
    const cycler = createPaletteCycler(0);
    const current = cycler.currentColor();
    const random = cycler.randomColorExcluding(current);
    expect(random).not.toBe(current);
    expect(PALETTES[FIRST]).toContain(random);
  });

  it('nextPalette jumps to next palette and resets color index', () => {
    const cycler = createPaletteCycler(0);
    expect(cycler.currentPaletteName()).toBe(FIRST);
    cycler.nextPalette();
    expect(cycler.currentPaletteName()).toBe(SECOND);
    // color index should be reset to 0
    expect(cycler.currentColor()).toBe(PALETTES[SECOND][0]);
  });

  it('nextPalette wraps around all palettes', () => {
    const cycler = createPaletteCycler(0);
    for (let i = 0; i < PALETTE_NAMES.length; i++) {
      cycler.nextPalette();
    }
    expect(cycler.currentPaletteName()).toBe(FIRST);
  });

  it('setPaletteByIndex jumps to a specific palette', () => {
    const cycler = createPaletteCycler(0);
    cycler.setPaletteByIndex(2);
    expect(cycler.currentPaletteName()).toBe(PALETTE_NAMES[2]);
    expect(cycler.currentColor()).toBe(PALETTES[PALETTE_NAMES[2]][0]);
  });

  it('setPaletteByIndex wraps on out-of-bounds', () => {
    const cycler = createPaletteCycler(0);
    cycler.setPaletteByIndex(PALETTE_NAMES.length);
    expect(cycler.currentPaletteName()).toBe(PALETTE_NAMES[0]);
  });

  it('currentPaletteIndex returns the current index', () => {
    const cycler = createPaletteCycler(1);
    expect(cycler.currentPaletteIndex()).toBe(1);
    cycler.nextPalette();
    expect(cycler.currentPaletteIndex()).toBe(2 % PALETTE_NAMES.length);
    cycler.setPaletteByIndex(0);
    expect(cycler.currentPaletteIndex()).toBe(0);
  });
});
