# Performance + Polish Task

## Problems to fix (in priority order)

### 1. Benchmarking infrastructure
Add `src/benchmark.js` and `tests/benchmark.test.js`:
- Measure FPS with 500, 1000, 2000 triangles
- Measure time per frame (render loop cost)
- Measure cascade scheduling time
- Measure memory allocations per frame (object creation in hot path)
- Output a benchmark report to console: `npm run benchmark`
- Add to package.json scripts: `"benchmark": "node src/benchmark.js"`
- The benchmark should identify the TOP bottlenecks specifically

### 2. Fluid animation (fix choppiness)
Current problem: likely using linear easing or discrete frame steps. Fix:
- Use cubic-bezier / ease-in-out easing on the fold angle: `t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t`
- Ensure the cascade delay staggers smoothly — each triangle should start slightly after its neighbor, not in discrete BFS "waves"
- The fold should feel like paper physically rotating, not snapping
- Add a slight overshoot / spring at the end of the fold (go 185°, ease back to 180°)
- Make sure requestAnimationFrame is being used correctly — no setInterval, no setTimeout in the render loop
- Target: each triangle fold should take 350-450ms, feel completely smooth

### 3. Paper texture (lightweight)
Goal: look like Kami 2's paper texture — subtle grain/fiber pattern on each triangle. Must be lightweight.

Approach: pre-generate a single offscreen canvas texture once at startup:
- Create a 256x256 offscreen canvas
- Fill with semi-transparent noise: random dots at low opacity (0.03-0.08)
- Add subtle horizontal fiber lines (very thin, very low opacity)
- Use `ctx.createPattern(textureCanvas, 'repeat')` to apply as fill pattern
- Composite over triangle color: draw color first, then overlay texture with `ctx.globalCompositeOperation = 'multiply'` or `'overlay'`
- The texture should NOT be regenerated per frame — generate once, reuse

This is the most lightweight approach (single 256x256 canvas, pattern repeat).

### 4. Performance optimizations (after benchmarking identifies bottlenecks)
Common issues to look for and fix:
- Object allocation in render loop (creating new arrays/objects every frame) → pre-allocate
- Redundant canvas state saves/restores → minimize
- Drawing triangles that haven't changed (same color, not animating) → dirty flag, skip unchanged
- Canvas transform overhead → cache transforms
- Too many triangles for viewport → recalculate optimal triangle size at startup

### Architecture notes
- Keep all changes backward compatible with existing tests
- Add new tests for: easing function correctness, texture generation (mock canvas), benchmark results
- The benchmark should run headlessly (no browser needed) — use mock canvas

## After completing:
1. Run `npm test` — all tests must pass
2. Run `npm run benchmark` — output should show FPS and bottlenecks
3. Commit with clear messages per feature
4. Push
5. Run: openclaw system event --text "Done: origami-screensaver perf+polish — benchmarks added, fluid animation, paper texture" --mode now
