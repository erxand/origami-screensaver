/**
 * Entry point — creates the canvas and starts the screensaver.
 *
 * Supports URL params:
 *   ?palette=ocean        — starting palette (sakura|ocean|ember)
 *   ?speed=2              — fold speed multiplier (0.25–4.0)
 *   ?size=60              — triangle side px (20–200; 0 = auto)
 *   ?density=1000         — target triangle count for auto-size
 *   ?cascades=2           — max simultaneous cascades (1–5)
 *   ?wait=8000            — ms between cascade waves
 *
 * Keyboard shortcuts:
 *   P  — cycle palette
 *   C  — toggle live controls overlay
 *   +  — increase speed
 *   -  — decrease speed
 */

import { createScreensaver } from './screensaver.js';
import { parseConfig } from './config.js';
import { createControls } from './controls.js';
import { PALETTE_NAMES } from './palette.js';

const config = parseConfig();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const screensaver = createScreensaver(canvas, {
  paletteIdx:    config.paletteIdx,
  foldDuration:  config.foldDuration,
  side:          config.side,
  density:       config.density,
  maxConcurrent: config.maxConcurrent,
  waitTime:      config.waitTime,
});

screensaver.start();

// Debounce resize to avoid thrashing grid rebuilds during drag-resize.
// 150ms is enough to batch rapid events while feeling responsive.
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    screensaver.resize();
  }, 150);
});

// Live controls overlay (press C)
const controls = createControls(screensaver, {
  palettes: PALETTE_NAMES.map(n => n.charAt(0).toUpperCase() + n.slice(1)),
  paletteIdx: config.paletteIdx,
});

// Update FPS display every second
if (controls) {
  setInterval(() => {
    controls.setFPS(screensaver.getFPS());
    // Sync palette buttons in case P key changed it
    controls.syncPaletteIdx(screensaver.getPaletteIdx());
  }, 1000);
}

// Keyboard shortcuts
const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

window.addEventListener('keydown', (e: KeyboardEvent) => {
  switch (e.key) {
    case 'p':
    case 'P':
      screensaver.switchPalette();
      if (controls) controls.syncPaletteIdx(screensaver.getPaletteIdx());
      break;

    case 'c':
    case 'C':
      if (controls) controls.toggle();
      break;

    case '+':
    case '=': {
      const cur = screensaver.getParam('speed') ?? 1;
      const next = SPEED_STEPS.find(s => s > cur + 0.01) ?? SPEED_STEPS[SPEED_STEPS.length - 1];
      screensaver.setParam('speed', next);
      if (controls) controls.syncSpeed(next);
      break;
    }
    case '-':
    case '_': {
      const cur = screensaver.getParam('speed') ?? 1;
      const prev = [...SPEED_STEPS].reverse().find(s => s < cur - 0.01) ?? SPEED_STEPS[0];
      screensaver.setParam('speed', prev);
      if (controls) controls.syncSpeed(prev);
      break;
    }
  }
});
