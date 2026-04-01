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
- **Incremental static cache patch** — fold completions paint just 1 triangle onto the offscreen cache (O(1)) instead of a full O(N) rebuild; at 3000 triangles with ~300 folds per cascade this eliminates ~900,000 redundant draw ops per cascade
- **Pre-computed cascade maxStart** — eliminates O(N) `reduce()` on the `schedule` array every animation tick
- **Active-set tick scan** — `foldingSet: Set<number>` maintains only the K folding triangle indices; tick update loop and renderAnims build iterate K instead of N (at 3000 triangles / 300 animating, eliminates 2×(N−K) = ~5400 null-checks per frame); `renderFrame` accepts the set for an O(K) animating-draw pass
- **Zero-alloc cascade scheduling** — `buildCascadeScheduleFlat()` replaces `bfs()` + `buildCascadeSchedule()` in the screensaver hot path; uses module-level typed-array scratch buffers (`Int32Array` queue/result/parent, `Float32Array` start-times, `Uint8Array` visited) so each cascade scheduling call allocates zero JS objects instead of ~6400 (N BfsEntry + N CascadeEntry objects); measured **1.44–1.58× speedup** (avg 90µs → 57µs at 3000 triangles); worst-case max jitter drops from **416µs → 160µs** (2.6× less frame-skip risk at cascade start)
- **Zero-alloc tick loop** — `completedThisTick: number[]` → reuse `Int32Array` scratch buffer; `activeCascades.filter()` → in-place reverse splice; `fpsSamples.push+shift` → circular `Float64Array(60)` ring buffer; eliminates ~180 heap allocations/sec at 60fps; **1.70–3.02× speedup** on tick-loop overhead (1.84→1.08 µs/tick at 3000 triangles)
- **Precomputed fold geometry cache** — `cacheFoldGeom()` computes `[projX, projY, reflApexX, reflApexY]` once per fold-start into a `Float32Array(N×4)`; `drawFoldingTriangleRaw` reads 4 floats instead of a per-frame dot-product + division; measured **1.40–1.43× speedup** on fold rendering (160µs vs 229µs/frame at 3000 triangles)
- **Zero-alloc folding triangle draw** — `drawFoldingTriangleRaw` accepts flat scalar coords; static-cache hot path reads directly from `Float32Array triCoords` (no `pts` array allocation per animating triangle); `Array.from(foldingIndices)` replaced with direct `for...of` Set iteration; eliminates ~72K small allocations/sec during cascades; typed-array speedup improved to **1.36×** (148µs vs 202µs/frame at 3000 triangles)
- **Typed-array triangle coords** — `Float32Array triCoords` (stride 6) stores all triangle vertices in a flat contiguous buffer; render loops read directly from the buffer instead of dereferencing nested `triangle.points[i][j]` arrays, eliminating per-triangle array allocation in the hot path; measured **1.33× speedup** in the fallback render loop (161µs vs 218µs/frame at 3000 triangles)

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

143 tests across 9 test files:

| File | Tests | Covers |
|------|-------|--------|
| `grid.test.js` | 16 | Geometry, neighbor lookup, full coverage |
| `animator.test.js` | 18 | State machine, easing, spring overshoot |
| `cascade.test.js` | 9 | BFS correctness, timing schedule |
| `palette.test.js` | 14 | Palette structure, color validation, cycling |
| `renderer.test.js` | 25 | Draw calls, dirty flags (mock canvas), active-set renderFrame path |
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

- [ ] **[BUG - INVESTIGATE] Left-edge triangles not updating color** — symptom: triangles on far left revert to old color after fold completes. Investigated with console instrumentation: `colors[i]`, `patchStaticTriangle` commits, and cache rebuilds all show correct newColor for left-edge triangles in standard 1- and 2-cascade tests. Bug may be fixed by the `anim.newColor = newColor` redirect in `startCascade`, or may require a very specific race condition to reproduce (e.g., rapid palette switch mid-fold + specific cascade origin positions). If seen again, add `?speed=4&wait=0&cascades=2` to force maximum overlap and watch left columns.
- [ ] **[ONGOING-A] Performance — always be optimizing.** Profile, find bottleneck, fix it, measure. Areas: OffscreenCanvas + Worker for texture gen, batch same-color triangles into single path, WebGL renderer for 1000+ tris.
- [ ] **[ONGOING-B] Bug hunting — use the app, break it.** Alternate with performance work. Actually run the screensaver, interact with it like a user would, and find bugs. Known example: switching palettes mid-transition leaves 3 colors on screen. Try: rapid palette switches, resizing window during cascade, very slow/fast speed params, switching palettes at exact start/end of cascade, leaving it running for 10+ minutes and watching for drift or stuck states, URL param edge cases. When you find a bug: fix it immediately if straightforward, or add it to Roadmap with a clear description if complex. Track which bugs you found and fixed in ## Completed.


## Completed

- ✅ **screensaver.ts density default mismatch + setParam speed clamp** — `targetDensity` default was `?? 1000` in screensaver.ts but config.ts defaults to 500; corrected to `?? 500` for consistent URL-param/direct-API behavior. Also unified `setParam('speed', v)` clamp to `[0.25, 4.0]` matching URL param validation and slider range (was clamping only at 0.1).

- ✅ **Controls panel Triangle Size shows "Auto" for 0** — slider min changed to 0 (was 20); label shows "Auto" when value=0 instead of "0px"; `setParam('side')` now clamps non-zero values to [20,200] matching URL param validation; prevents accidentally creating sub-20px grid via controls drag
- ✅ **dt-based palette overlay countdown** — overlay timer now decrements by actual frame delta-time (ms) instead of fixed `-16/frame`; was showing too long at <60fps and too briefly at >60fps; `_lastTickNow` tracks previous frame timestamp, clamped to 100ms to handle tab-background freeze/resume
- ✅ **SVG favicon** — `public/favicon.svg` eliminates 404 on every page load; simple origami triangle grid icon in Sakura palette colors

- ✅ **Zero-alloc cascade scheduling** — `buildCascadeScheduleFlat()` uses module-level typed-array scratch buffers; eliminates ~6400 JS object allocations per cascade (N BfsEntry + N CascadeEntry); measured **1.44–1.58× speedup** on cascade scheduling (90µs → 57µs avg at 3000 triangles); worst-case max drops from 416µs → 160µs; old object-array `bfs()` / `buildCascadeSchedule()` API preserved for tests

- ✅ **Zero-alloc tick loop** — replaced 3 per-frame allocations in the `tick()` hot path: `completedThisTick: number[]` → reuse `Int32Array` scratch buffer (grows lazily when grid size increases); `activeCascades.filter()` → in-place reverse splice (no new array per frame); `fpsSamples.push+shift` → circular `Float64Array(60)` ring buffer; dedicated benchmark section `benchTickLoopOverhead` added; measured **1.70–3.02× speedup** on tick-loop overhead (1.84→1.08 µs/tick at 3000 triangles); eliminates ~180 heap allocations/sec at 60fps

- ✅ **Precomputed fold geometry cache** — `cacheFoldGeom()` computes `[projX, projY, reflApexX, reflApexY]` once per fold-start into a `Float32Array(N×4)`; `drawFoldingTriangleRaw` reads 4 floats instead of computing dot-product + division + 4 multiplies per animating triangle per frame; dedicated benchmark section added; measured **1.40–1.43× speedup** on fold rendering (160µs vs 229µs/frame at 3000 triangles during cascades)

- ✅ **Zero-alloc folding triangle draw** — new `drawFoldingTriangleRaw(x0,y0,x1,y1,x2,y2,...)` variant accepts flat scalar coords; static-cache hot path calls it directly from `Float32Array triCoords` with no intermediate `pts` array; eliminates 4 array allocations per animating triangle per frame (~72K allocs/sec removed at 300 animating × 60fps); `Array.from(foldingIndices)` replaced with direct `for...of` Set iteration (1 fewer array per frame during cascades); typed-array speedup improved from **1.33× → 1.36×**

- ✅ **Typed-array triangle coords** — `Float32Array triCoords` (stride 6) stores all vertex data contiguously in `GridResult`; render/patch loops read from buffer instead of `triangle.points[i][j]` nested arrays; inline idle-triangle draw eliminates `tracePath()` call + pts allocation per triangle; measured **1.32× speedup** in the render loop at 3000 triangles (168µs vs 222µs/frame)

- ✅ **Active-set tick scan O(K)** — `foldingSet: Set<number>` tracks which triangles are in FOLDING state; tick loop + renderAnims build iterate only K animating indices instead of all N; renderer's `renderFrame` accepts optional `foldingIndices` for the same O(K) draw pass; eliminates N−K null-checks per frame during cascades; 3 new renderer tests (143 total)

- ✅ **Incremental static cache patch** — fold completions call `patchStaticTriangle()` to repaint 1 triangle O(1) instead of full O(N) rebuild; at 3000 triangles with ~300 folds per cascade eliminates ~900,000 redundant draw ops per cascade
- ✅ **Static triangle cache** — offscreen canvas holds all idle triangles; `drawImage` blit replaces N fill+stroke calls during cascades; measured 3.5× reduction in fill calls per frame; `invalidateStaticCache()` on resize; falls back gracefully in test env (no DOM)
- ✅ **Eliminated O(N) per-tick reduce** — `maxScheduleStart` pre-computed when building cascade schedule; prune check is now O(1) per active cascade per tick
- ✅ **Removed allocating `points` arg from `applyDepthShading`** — callers previously passed inline `[edgeP0, edgeP1, [x,y]]` arrays that were never used; removing eliminates 2 array allocations per animating-triangle per frame

- ✅ **Fix left-edge color bleed (first attempt — STILL BROKEN)** — initial fix redirected `anim.newColor` for mid-fold triangles but bug persists
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
