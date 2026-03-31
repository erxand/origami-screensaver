/**
 * Live param tweaker overlay — press C to toggle.
 *
 * Exports: createControls(screensaver, config)
 *   - screensaver must expose: setParam(key, value), getParam(key), getFPS()
 *   - config is the initial ParsedConfig
 *
 * Adds a floating panel with sliders for speed, wait, size, cascades,
 * and shows a live FPS counter.
 */

const PANEL_CSS = `
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  background: rgba(15, 15, 20, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  padding: 20px 22px 18px;
  min-width: 280px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #e8e8e8;
  user-select: none;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
`;

const TITLE_CSS = `
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  margin: 0 0 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const FPS_CSS = `
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #7cf582;
  background: rgba(124,245,130,0.1);
  border-radius: 4px;
  padding: 1px 7px;
`;

const ROW_CSS = `
  margin-bottom: 14px;
`;

const LABEL_CSS = `
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
`;

const SLIDER_CSS = `
  width: 100%;
  height: 4px;
  appearance: none;
  -webkit-appearance: none;
  background: rgba(255,255,255,0.18);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
`;

const HINT_CSS = `
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  text-align: center;
  letter-spacing: 0.04em;
`;

const PALETTE_ROW_CSS = `
  display: flex;
  gap: 8px;
  margin-top: 4px;
`;

const PALETTE_BTN_CSS = `
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
`;

const PALETTE_BTN_ACTIVE_CSS = `
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(255,255,255,0.5);
  border-radius: 6px;
  background: rgba(255,255,255,0.16);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
`;

// Inject slider thumb styles once
let stylesInjected = false;
function injectSliderStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oc-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    .oc-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      border: none;
    }
  `;
  document.head.appendChild(style);
}

function makeSliderRow(label, id, min, max, step, value, unit = '') {
  const row = document.createElement('div');
  row.style.cssText = ROW_CSS;

  const lbl = document.createElement('div');
  lbl.style.cssText = LABEL_CSS;
  lbl.innerHTML = `<span>${label}</span><span id="${id}-val">${value}${unit}</span>`;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;
  slider.style.cssText = SLIDER_CSS;
  slider.className = 'oc-slider';
  slider.id = id;

  row.appendChild(lbl);
  row.appendChild(slider);
  return row;
}

function makePaletteRow(palettes, currentIdx, onSelect) {
  const row = document.createElement('div');
  row.style.cssText = ROW_CSS;

  const lbl = document.createElement('div');
  lbl.style.cssText = LABEL_CSS;
  lbl.innerHTML = '<span>Palette</span>';
  row.appendChild(lbl);

  const btns = document.createElement('div');
  btns.style.cssText = PALETTE_ROW_CSS;
  btns.id = 'oc-palette-btns';

  palettes.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = idx === currentIdx ? PALETTE_BTN_ACTIVE_CSS : PALETTE_BTN_CSS;
    btn.dataset.idx = idx;
    btn.addEventListener('click', () => onSelect(idx));
    btns.appendChild(btn);
  });

  row.appendChild(btns);
  return row;
}

/**
 * Create the live controls overlay.
 *
 * @param {object} screensaver — must expose setParam(key, val), getParam(key), getFPS()
 * @param {object} opts
 * @param {string[]} opts.palettes — palette names
 * @param {number} opts.paletteIdx — initial palette index
 * @returns {{ toggle: () => void, setFPS: (fps: number) => void, updatePaletteButtons: (idx: number) => void, destroy: () => void }}
 */
export function createControls(screensaver, opts = {}) {
  if (typeof document === 'undefined') return null; // SSR / test guard

  injectSliderStyles();

  const palettes = opts.palettes || ['Sakura', 'Ocean', 'Ember'];
  let currentPaletteIdx = opts.paletteIdx ?? 0;

  // Initial values from screensaver
  const initSpeed    = screensaver.getParam('speed');       // multiplier 0.25–4
  const initWait     = screensaver.getParam('waitTime');     // ms
  const initSize     = screensaver.getParam('side');         // px
  const initCascades = screensaver.getParam('maxConcurrent');

  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;
  panel.id = 'oc-controls';

  // Title row with FPS badge
  const title = document.createElement('div');
  title.style.cssText = TITLE_CSS;
  title.innerHTML = `<span>Controls</span><span id="oc-fps" style="${FPS_CSS}">— fps</span>`;
  panel.appendChild(title);

  // Speed slider: 0.25 → 4, step 0.25
  const speedRow = makeSliderRow('Fold Speed', 'oc-speed', 0.25, 4, 0.25, initSpeed, '×');
  panel.appendChild(speedRow);

  // Wait time slider: 2 → 30s, step 1
  const waitSec = Math.round(initWait / 1000);
  const waitRow = makeSliderRow('Wave Pause', 'oc-wait', 2, 30, 1, waitSec, 's');
  panel.appendChild(waitRow);

  // Triangle size: 20 → 200px, step 5 (applies on mouseup to avoid thrashing grid)
  const sideRow = makeSliderRow('Triangle Size', 'oc-size', 20, 200, 5, initSize, 'px');
  panel.appendChild(sideRow);

  // Cascades: 1 → 5
  const cascRow = makeSliderRow('Cascades', 'oc-cascades', 1, 5, 1, initCascades, '');
  panel.appendChild(cascRow);

  // Palette buttons
  const paletteRow = makePaletteRow(palettes, currentPaletteIdx, (idx) => {
    if (idx !== currentPaletteIdx) {
      currentPaletteIdx = idx;
      screensaver.setParam('paletteIdx', idx);
      updatePaletteButtons(idx);
    }
  });
  panel.appendChild(paletteRow);

  // Hint
  const hint = document.createElement('div');
  hint.style.cssText = HINT_CSS;
  hint.textContent = 'C to close  ·  P to cycle palette  ·  ± speed';
  panel.appendChild(hint);

  // Wire speed slider
  const speedSlider = panel.querySelector('#oc-speed');
  const speedVal    = panel.querySelector('#oc-speed-val');
  speedSlider.addEventListener('input', () => {
    const v = parseFloat(speedSlider.value);
    speedVal.textContent = v + '×';
    screensaver.setParam('speed', v);
  });

  // Wire wait slider
  const waitSlider = panel.querySelector('#oc-wait');
  const waitVal    = panel.querySelector('#oc-wait-val');
  waitSlider.addEventListener('input', () => {
    const v = parseInt(waitSlider.value, 10);
    waitVal.textContent = v + 's';
    screensaver.setParam('waitTime', v * 1000);
  });

  // Wire size slider — only apply on release (grid rebuild is expensive)
  const sizeSlider = panel.querySelector('#oc-size');
  const sizeVal    = panel.querySelector('#oc-size-val');
  sizeSlider.addEventListener('input', () => {
    sizeVal.textContent = sizeSlider.value + 'px';
  });
  sizeSlider.addEventListener('change', () => {
    const v = parseInt(sizeSlider.value, 10);
    screensaver.setParam('side', v);
  });

  // Wire cascades slider
  const cascSlider = panel.querySelector('#oc-cascades');
  const cascVal    = panel.querySelector('#oc-cascades-val');
  cascSlider.addEventListener('input', () => {
    const v = parseInt(cascSlider.value, 10);
    cascVal.textContent = v;
    screensaver.setParam('maxConcurrent', v);
  });

  let visible = false;
  panel.style.display = 'none';
  document.body.appendChild(panel);

  function toggle() {
    visible = !visible;
    panel.style.display = visible ? 'block' : 'none';
  }

  function setFPS(fps) {
    const el = panel.querySelector('#oc-fps');
    if (el) el.textContent = fps + ' fps';
  }

  function updatePaletteButtons(activeIdx) {
    const btns = panel.querySelectorAll('#oc-palette-btns button');
    btns.forEach((btn, i) => {
      btn.style.cssText = i === activeIdx ? PALETTE_BTN_ACTIVE_CSS : PALETTE_BTN_CSS;
    });
  }

  // Keep palette buttons in sync when P key cycles palette externally
  function syncPaletteIdx(idx) {
    currentPaletteIdx = idx;
    updatePaletteButtons(idx);
  }

  function destroy() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
  }

  return { toggle, setFPS, syncPaletteIdx, destroy, isVisible: () => visible };
}
