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
| ~500      | 0.181 ms  | 0.258 ms  | 5500+ |
| ~1000     | 0.173 ms  | 0.261 ms  | 5800+ |
| ~2000     | 0.161 ms  | 0.184 ms  | 6200+ |

Well within 60fps budget at any viewport size. Key optimizations:
- **Dirty flag** — unchanged triangles are skipped entirely each frame
- **Pre-allocated arrays** — no object creation in the render loop
- **Color variation cache** — `applyTriVariation` and `creaseColor` results cached; eliminates per-frame string allocation (~6× speedup vs baseline)
- **Global paper texture** — paper overlay applied once per frame over full canvas instead of per-triangle; reduces canvas save/restore from N×2 to 2 per frame
- **Static triangle cache** — idle triangles are blit from an offscreen canvas; during a cascade, per-frame fill calls drop from N → K (animating only), measured **3.5× reduction** in draw calls at 3000+ triangles
- **Pre-computed cascade maxStart** — eliminates O(N) `reduce()` on the `schedule` array every animation tick

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

- [ ] **[ONGOING] Performance — always be optimizing.** When nothing else is left, find and fix the next bottleneck. Areas to explore: OffscreenCanvas + Worker for texture generation, batch same-color triangles in a single path (reduces ctx state changes), typed arrays instead of object arrays for triangle data, canvas compositing tricks to reduce overdraw, WebGL renderer as a future option for 1000+ triangles at 60fps.

## Completed

- ✅ **Static triangle cache** — offscreen canvas holds all idle triangles; `drawImage` blit replaces N fill+stroke calls during cascades; measured 3.5× reduction in fill calls per frame; `invalidateStaticCache()` called on fold completion and resize; falls back gracefully in test env (no DOM)
- ✅ **Eliminated O(N) per-tick reduce** — `maxScheduleStart` pre-computed when building cascade schedule; prune check is now O(1) per active cascade per tick
- ✅ **Removed allocating `points` arg from `applyDepthShading`** — callers previously passed inline `[edgeP0, edgeP1, [x,y]]` arrays that were never used; removing eliminates 2 array allocations per animating-triangle per frame

- ✅ **Fix edge bleed** — fill canvas with current screensaver color before drawing triangles; eliminates black gaps at canvas edges
- ✅ **TypeScript migration** — all `src/*.ts` + `tests/*.test.ts`; `tsconfig.json` strict mode; shared interfaces in `src/types.ts` (Triangle, AnimState, GridResult, CascadeEntry, ParsedConfig, etc.); also fixed pre-existing flaky cascade test
- ✅ **macOS `.saver` bundle** — WKWebView wrapper in `macos/`; Swift compiled with CLT swiftc (no Xcode required); `macos/build.sh` for one-shot build → `OrigamiScreensaver.saver`; verified Mach-O 64-bit bundle arm64
- ✅ **Visual regression tests** — headless time-simulation (sim.ts): stuck-triangle detection, cascade completion, 5-min stability, multi-cascade concurrency; 10 tests
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
