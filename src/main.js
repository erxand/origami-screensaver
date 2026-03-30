/**
 * Entry point — creates the canvas and starts the screensaver.
 */

import { createScreensaver } from './screensaver.js';

const canvas = document.getElementById('canvas');
const screensaver = createScreensaver(canvas);

screensaver.start();

window.addEventListener('resize', () => screensaver.resize());
