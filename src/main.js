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
 */

import { createScreensaver } from './screensaver.js';
import { parseConfig } from './config.js';

const config = parseConfig();
const canvas = document.getElementById('canvas');
const screensaver = createScreensaver(canvas, {
  paletteIdx:    config.paletteIdx,
  foldDuration:  config.foldDuration,
  side:          config.side,
  density:       config.density,
  maxConcurrent: config.maxConcurrent,
  waitTime:      config.waitTime,
});

screensaver.start();

window.addEventListener('resize', () => screensaver.resize());

// Palette picker: press P to cycle palettes
window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    screensaver.switchPalette();
  }
});
