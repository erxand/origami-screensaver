/**
 * URL parameter configuration parser.
 *
 * Supported params:
 *   ?palette=sakura|ocean|ember    — starting palette (default: sakura)
 *   ?speed=0.5                     — fold speed multiplier (0.25–4.0; 1.0 = default)
 *   ?size=60                       — triangle side length in px (20–200; 0 = auto)
 *   ?density=1000                  — target triangle count for auto-size (100–5000)
 *   ?cascades=2                    — max simultaneous cascades (1–5)
 *   ?wait=8000                     — ms between cascade waves (500–30000)
 */

import { PALETTE_NAMES } from './palette.js';

/**
 * Parse URL search params and return a validated screensaver options object.
 *
 * @param {string|URLSearchParams} [search] - URL search string (default: window.location.search)
 * @returns {{ paletteIdx: number, foldDuration: number, side: number, density: number, maxConcurrent: number, waitTime: number }}
 */
export function parseConfig(search) {
  let params;
  if (typeof search === 'string') {
    params = new URLSearchParams(search);
  } else if (search instanceof URLSearchParams) {
    params = search;
  } else if (typeof window !== 'undefined') {
    params = new URLSearchParams(window.location.search);
  } else {
    params = new URLSearchParams('');
  }

  // --- palette ---
  let paletteIdx = 0;
  const paletteParam = params.get('palette');
  if (paletteParam) {
    const idx = PALETTE_NAMES.indexOf(paletteParam.toLowerCase());
    if (idx !== -1) paletteIdx = idx;
  }

  // --- speed (multiplier; higher = faster folds) ---
  let foldDuration = 400; // ms default
  const speedParam = params.get('speed');
  if (speedParam !== null) {
    const speed = parseFloat(speedParam);
    if (!isNaN(speed) && speed > 0) {
      const clamped = Math.max(0.25, Math.min(4.0, speed));
      foldDuration = Math.round(400 / clamped);
    }
  }

  // --- size (triangle side in px; 0 = auto-responsive) ---
  let side = 0;
  const sizeParam = params.get('size');
  if (sizeParam !== null) {
    const s = parseInt(sizeParam, 10);
    if (!isNaN(s) && s > 0) {
      side = Math.max(20, Math.min(200, s));
    }
  }

  // --- density (target triangle count for auto-size) ---
  let density = 500; // default halved to produce ~2x larger triangles
  const densityParam = params.get('density');
  if (densityParam !== null) {
    const d = parseInt(densityParam, 10);
    if (!isNaN(d) && d > 0) {
      density = Math.max(100, Math.min(5000, d));
    }
  }

  // --- cascades ---
  let maxConcurrent = 2;
  const cascadesParam = params.get('cascades');
  if (cascadesParam !== null) {
    const c = parseInt(cascadesParam, 10);
    if (!isNaN(c) && c > 0) {
      maxConcurrent = Math.max(1, Math.min(5, c));
    }
  }

  // --- wait (ms between cascade waves) ---
  let waitTime = 8000;
  const waitParam = params.get('wait');
  if (waitParam !== null) {
    const w = parseInt(waitParam, 10);
    if (!isNaN(w) && w > 0) {
      waitTime = Math.max(500, Math.min(30000, w));
    }
  }

  return { paletteIdx, foldDuration, side, density, maxConcurrent, waitTime };
}

/**
 * Build a URL search string from a config object (for sharing/linking).
 *
 * @param {object} config - config object as returned by parseConfig
 * @returns {string} - URL search string (e.g. "?palette=ocean&speed=2")
 */
export function buildConfigUrl(config) {
  const params = new URLSearchParams();

  if (config.paletteIdx != null && config.paletteIdx !== 0) {
    params.set('palette', PALETTE_NAMES[config.paletteIdx]);
  }
  if (config.foldDuration != null && config.foldDuration !== 400) {
    const speed = +(400 / config.foldDuration).toFixed(2);
    params.set('speed', String(speed));
  }
  if (config.side != null && config.side !== 0) {
    params.set('size', String(config.side));
  }
  if (config.density != null && config.density !== 500) {
    params.set('density', String(config.density));
  }
  if (config.maxConcurrent != null && config.maxConcurrent !== 2) {
    params.set('cascades', String(config.maxConcurrent));
  }
  if (config.waitTime != null && config.waitTime !== 8000) {
    params.set('wait', String(config.waitTime));
  }

  const str = params.toString();
  return str ? `?${str}` : '';
}
