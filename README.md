# Origami Screensaver

A high-performance animated screensaver inspired by [Kami 2](https://apps.apple.com/us/app/kami-2/id1133161444) — the origami paper-folding puzzle game. The screen is tiled with equilateral triangles that fold over one another in cascading waves, transitioning the entire screen from one color to another.

![Origami Screensaver](https://github.com/erxand/origami-screensaver/raw/main/preview.gif)

## Features

- **Equilateral triangle grid** — full-screen tiling with upward (▲) and downward (▽) triangles
- **Fluid fold animation** — cubic ease-in-out with spring overshoot, feels like real paper
- **Cascade propagation** — BFS flood-fill with smooth per-triangle stagger (not discrete waves)
- **Paper texture** — pre-generated noise + fiber pattern composited over each triangle
- **3 built-in palettes** — Sakura (warm pinks), Ocean (deep teals), Ember (burnt orange)
- **60fps target** — dirty-flag rendering skips unchanged triangles, no allocations in hot path
- **Lightweight** — no frameworks, pure HTML5 Canvas + vanilla JS

## Quick Start

```bash
git clone https://github.com/erxand/origami-screensaver.git
cd origami-screensaver
npm install
npm run dev
```

Opens in your browser at `http://localhost:5173`. The screensaver starts immediately — sit back and watch.

## Architecture

```
src/
├── grid.js         — Triangle geometry: coordinates, neighbor lookup, BFS
├── renderer.js     — Canvas rendering: draw triangles, paper texture, dirty flags
├── animator.js     — Per-triangle fold state machine (IDLE → FOLDING → DONE)
├── cascade.js      — Cascade engine: BFS propagation, timing schedule
├── palette.js      — Color palettes (sakura, ocean, ember) + cycling
├── config.js       — URL param parser: ?palette=ocean&speed=2&size=60 etc.
├── screensaver.js  — Main orchestrator: wait → cascade → wait → repeat
└── main.js         — Entry point: canvas setup, resize handling, URL config
```

### Triangle Grid

The grid uses equilateral triangles in a tessellating pattern:

```
▲▽▲▽▲▽▲
▲▽▲▽▲▽▲
▲▽▲▽▲▽▲
```

Each triangle has exactly 3 neighbors (sharing an edge). The grid auto-sizes to fill the viewport at startup and on resize.

### Fold Animation

Each triangle animates through three states:

1. **IDLE** — flat, showing current color
2. **FOLDING** — 180° rotation around the shared edge with its trigger neighbor
   - Easing: `t < 0.5 ? 2t² : -1 + (4-2t)t` (cubic ease-in-out)
   - Spring overshoot: fold reaches 185° then eases back to 180°
   - Duration: ~380ms
3. **DONE** — flat, showing new color

### Cascade Engine

```
1. Pick a random IDLE triangle as origin
2. BFS outward, assigning each triangle a hop distance from origin
3. startTime = hopDistance × cascadeDelay (default: 55ms/hop)
4. All triangles fold to the same new color
5. Wait ~30s, pick new origin + new color, repeat
```

### Paper Texture

A 256×256 noise texture is generated once at startup:
- Random dots at 3–8% opacity
- Subtle horizontal fiber lines at very low opacity
- Applied via `ctx.createPattern()` with `'multiply'` composite mode

No per-frame texture generation — one canvas, reused forever.

## Performance

Benchmarks on Apple Silicon (M-series), measured headlessly:

| Triangles | Avg frame | P95 frame | ~FPS |
|-----------|-----------|-----------|------|
| ~500      | 0.028 ms  | 0.035 ms  | 35k+ |
| ~1000     | 0.039 ms  | 0.046 ms  | 25k+ |
| ~2000     | 0.055 ms  | 0.063 ms  | 18k+ |

Well within 60fps budget at any viewport size. Key optimizations:
- **Dirty flag** — unchanged triangles are skipped entirely each frame
- **Pre-allocated arrays** — no object creation in the render loop
- **Minimal state saves** — canvas save/restore only when needed

Run the full benchmark:

```bash
npm run benchmark
```

## Development

```bash
npm run dev        # Start dev server (hot reload)
npm test           # Run test suite (93 tests)
npm run test:watch # Watch mode
npm run benchmark  # Performance report
npm run build      # Production build
```

## Tests

137 tests across 9 test files:

| File | Tests | Covers |
|------|-------|--------|
| `grid.test.js` | 16 | Geometry, neighbor lookup, full coverage |
| `animator.test.js` | 18 | State machine, easing, spring overshoot |
| `cascade.test.js` | 9 | BFS correctness, timing schedule |
| `palette.test.js` | 14 | Palette structure, color validation, cycling |
| `renderer.test.js` | 19 | Draw calls, dirty flags (mock canvas) |
| `easing.test.js` | 23 | Easing function correctness |
| `benchmark.test.js` | 4 | Benchmark harness correctness |
| `config.test.js` | 24 | URL param parsing, validation, round-trip |
| `visual-regression.test.js` | 10 | Headless simulation: stuck triangles, cascade completion, 5-min stability |

## Color Palettes

| Palette | Colors | Vibe |
|---------|--------|------|
| **Sakura** | Pinks, creams, soft whites | Warm, Japanese paper |
| **Ocean** | Navy, teal, seafoam, pale blue | Cool, deep water |
| **Ember** | Burnt orange, rust, charcoal | Warm, fire |

Press `P` to cycle palettes with a HUD overlay.

## Roadmap

- [ ] **[PRIORITY] Fix edge bleed — black background showing on left/right edges** — triangles at the canvas boundary don't fully cover the edge, leaving black gaps/slivers from the background. Fix: (1) extend grid coverage so triangles bleed ~1 triangle-width beyond all 4 canvas edges, OR (2) fill the canvas background with the current screensaver color before drawing triangles so any gaps show the right color instead of black. Option 2 is simpler and more robust.
- [ ] **[PRIORITY] Migrate to TypeScript** — convert all `src/*.js` and `tests/*.test.js` to `.ts`. Add `tsconfig.json` (strict mode), type interfaces for Triangle, AnimState, CascadeSchedule, Palette, RendererOptions, ScreensaverOptions, etc. Update Vite config (`vite.config.ts`), update Vitest config. All tests must still pass. Keep existing behavior exactly — this is a type-safety refactor only, no logic changes.
- [ ] macOS `.saver` bundle via WKWebView
- [ ] **[ONGOING] Performance — always be optimizing.** When nothing else is left, find and fix the next bottleneck. Areas to explore: offscreen canvas + `drawImage` for static triangles (only re-render animating ones), OffscreenCanvas + Worker for texture generation, reduce canvas state changes (batch same-color triangles), typed arrays instead of object arrays for triangle data, canvas compositing tricks to reduce overdraw, WebGL renderer as a future option for 1000+ triangles at 60fps.

## Completed

- ✅ **Visual regression tests** — headless time-simulation (sim.js): stuck-triangle detection, cascade completion, 5-min stability, multi-cascade concurrency; 10 tests
- ✅ Equilateral triangle grid with full-screen tiling
- ✅ Fluid fold animation (cubic ease-in-out + spring overshoot)
- ✅ BFS cascade propagation with smooth per-triangle stagger
- ✅ Variable cascade easing — ease-in-out cubic on wave timing
- ✅ Paper texture — pre-generated noise + multi-angle fibers matching equilateral grain
- ✅ Paper depth shading — diagonal gradient + thin crease stroke per triangle
- ✅ **Kami 2-style rendering** — color-relative edge creases (18% darker, near-invisible within same-color regions) + stable per-triangle lightness variation (±8%, seeded from index via Knuth hash, not orientation-based); 127 tests
- ✅ 3 built-in palettes (Sakura, Ocean, Ember)
- ✅ Palette picker overlay (press `P`)
- ✅ Multiple simultaneous cascades (up to 2 overlapping waves)
- ✅ Performance benchmarking (`npm run benchmark`) — headless, reports FPS + bottlenecks + idle-frame cost
- ✅ **Dirty-flag rendering** — `renderFrame` skipped entirely when nothing is animating; idle cost ~0.005ms/frame vs ~1.2ms active (~100% savings during 8s pauses between cascades)
- ✅ URL params config (`?palette=ocean&speed=2&size=60&density=1000&cascades=2&wait=8000`)
- ✅ BUG FIX: Edge artifacts — canvas clip rect prevents black zigzag borders
- ✅ BUG FIX: Fold animation clearly visible — proper axis reflection, 600ms, spring overshoot
- ✅ Edge fold behavior — viewport-boundary triangles peel along screen edge
- ✅ **Live controls overlay** — press `C` to toggle: sliders for speed/pause/size/cascades, palette buttons, live FPS; `+`/`-` for speed steps

## License

MIT
