# Origami Screensaver — Task Status

## ✅ COMPLETED

All initial build phases are done. Preview works at `npm run dev`.

### Completed phases:
- **Phase 1** — Triangle grid geometry + neighbor lookup
- **Phase 2** — Canvas renderer
- **Phase 3** — Color palettes (Sakura, Ocean, Ember)
- **Phase 4** — Fold animation (state machine, canvas transforms)
- **Phase 5** — Cascade engine (BFS flood fill, timing)
- **Phase 6** — Screensaver orchestrator + preview (`npm run dev`)
- **Phase 7** — Polish (Kami 2-style rendering, paper texture, creases, grain)
- **TypeScript migration** — all `src/*.ts`, `tests/*.test.ts`, strict mode, `types.ts` interfaces
- **macOS .saver bundle** — WKWebView wrapper, `build.sh`, CLT swiftc (no Xcode required)
- **Performance optimizations:**
  - Dirty-flag rendering (skip frames during idle)
  - Static triangle cache (3.5× fill-call reduction)
  - Global paper texture pass (N×2 → 2 save/restore per frame)
  - Cached `applyTriVariation` + `creaseColor` (6× render speedup)
  - Incremental static cache patch (O(1) per fold completion)
  - Active-set tick scan O(K) — foldingSet tracks folding indices
- **Headless visual regression tests** — sim.js time-simulation, stuck-triangle detection, 5-min stability
- **143 tests passing**

### Latest commit:
`df0103a perf: active-set tick scan O(K) — foldingSet tracks folding indices; eliminate O(N) scans in tick + renderFrame; 3 new renderer tests (143 total)`

---

## 🔜 NEXT PHASE: Performance + Polish

See `PERF_TASK.md` for full details. Summary:

1. **Benchmarking infrastructure** — `npm run benchmark` script, measure FPS at 500/1000/2000 triangles
2. **Fluid animation** — ease-in-out easing, smooth cascade stagger, slight spring overshoot at fold end
3. **Paper texture (if not done)** — lightweight offscreen canvas texture pattern

### Exact next step to resume:
```
Read PERF_TASK.md, then implement the benchmarking infrastructure first (section 1).
Add src/benchmark.ts and tests/benchmark.test.ts, add "benchmark" script to package.json,
run npm test to confirm all 143 pass, then commit.
```

---

## How to run
```bash
cd /Users/arclo/.openclaw/workspace/projects/origami-screensaver
npm run dev        # preview in browser
npm test           # run test suite (143 tests)
npm run build      # production build to dist/
```

## macOS screensaver
```bash
cd macos && bash build.sh    # requires CLT swiftc (no Xcode needed)
```
