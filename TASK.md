# Origami Screensaver — Build Task

## Concept
A web-based screensaver inspired by the animations in Kami 2. The screen is tiled with equilateral triangles. The screen starts as one solid color. Every ~30 seconds, a random triangle "folds over" to reveal a new color underneath, triggering a cascade flood-fill outward to neighboring triangles until the entire screen transitions to the new color.

## The core animation
Each triangle folds like a piece of paper — it should appear to physically rotate/flip on one of its edges, revealing a new color underneath. The fold animation propagates outward from the origin triangle like a wave, with each neighboring triangle starting its fold slightly after its triggering neighbor (ripple delay). The result is a smooth, organic wave of color sweeping across the screen.

## Architecture requirements
- **Web-based**: HTML5 Canvas (not SVG — performance critical for 1000+ triangles)
- **Preview window**: `npm run dev` opens a browser window showing the screensaver running
- **Testable**: Full test suite covering grid math, animation logic, color management, cascade propagation
- **Maintainable**: Clean separation of concerns — grid, renderer, animator, color palette, cascade engine
- **Performant**: Must run smoothly at 60fps on a modern machine. Use requestAnimationFrame, minimize allocations in the render loop.

## Grid geometry (equilateral triangles)
- The screen is tiled with equilateral triangles
- Each row alternates between upward-pointing (▲) and downward-pointing (▽) triangles
- Triangle size should be configurable (default: ~60-80px side length)
- The grid must cover the full canvas including edges (triangles can be clipped at edges)
- Each triangle has 3 neighbors (shares an edge with 3 other triangles)

## File structure
```
origami-screensaver/
├── src/
│   ├── grid.js          # Triangle grid: geometry, coordinates, neighbor lookup
│   ├── renderer.js      # Canvas rendering: draws triangles, handles clip regions
│   ├── animator.js      # Per-triangle fold animation state machine
│   ├── cascade.js       # Flood-fill cascade: BFS propagation, timing
│   ├── palette.js       # Color palettes (multiple built-in palettes)
│   ├── screensaver.js   # Main orchestrator: ties everything together
│   └── main.js          # Entry point: creates canvas, starts screensaver
├── tests/
│   ├── grid.test.js     # Grid geometry, neighbor lookup, coverage
│   ├── animator.test.js # Animation state machine transitions
│   ├── cascade.test.js  # BFS propagation, timing calculation
│   ├── palette.test.js  # Palette structure, color validation
│   └── renderer.test.js # Renderer (mock canvas, check draw calls)
├── index.html           # Preview page
├── package.json         # Vite + Vitest
└── README.md
```

## Color palettes (first pass — at least 3 built-in)
- **Sakura**: warm pinks and creams (like the Kami 2 default)
- **Ocean**: deep teals, navy, seafoam
- **Ember**: burnt orange, rust, charcoal
Each palette should have 4-6 colors. The screensaver cycles through them over time.

## Animation spec (fold effect)
Each triangle animates through these states:
1. **IDLE** — flat, showing current color
2. **FOLDING** — the paper fold animation (180° rotation around one edge)
   - Use a CSS-like perspective transform on the canvas
   - The fold axis is the shared edge with the triangle that triggered it
   - At 0°: showing old color
   - At 90°: edge-on (thin line, darkened)
   - At 180°: fully flipped, showing new color
3. **DONE** — flat, showing new color

The fold duration should be ~300-400ms per triangle. Cascade delay between neighbors: ~50-80ms.

## Cascade spec
1. A random IDLE triangle is selected as the origin
2. BFS outward: each triangle schedules its neighbors to start folding after a delay proportional to their BFS distance from origin
3. Delay formula: `startTime = bfsDistance * cascadeDelay` (e.g. 60ms per hop)
4. All triangles fold to the same new color
5. Once all triangles are DONE, wait ~30 seconds, then pick a new origin and new color

## Build this in phases, committing after each:

### Phase 1 — Grid & geometry
- Triangle grid generation covering any canvas size
- Neighbor lookup (each triangle knows its 3 neighbors)
- Unit tests for geometry (coordinate generation, coverage, neighbor correctness)
- Commit: "feat: triangle grid geometry + neighbor lookup"

### Phase 2 — Renderer
- Canvas renderer that draws all triangles with their current colors
- Must handle canvas resize
- Test with mock canvas
- Commit: "feat: canvas renderer"

### Phase 3 — Palettes
- At least 3 built-in palettes (Sakura, Ocean, Ember)
- Palette cycling logic
- Tests for palette structure
- Commit: "feat: color palettes"

### Phase 4 — Fold animation
- Per-triangle fold animation using canvas transforms
- State machine: IDLE → FOLDING → DONE
- Smooth 60fps via requestAnimationFrame
- Tests for animation state transitions and timing
- Commit: "feat: fold animation"

### Phase 5 — Cascade engine
- BFS flood fill from origin triangle
- Timing: each neighbor starts folding after cascadeDelay * bfsDistance
- Tests for BFS correctness and timing
- Commit: "feat: cascade engine"

### Phase 6 — Orchestrator + preview
- Main screensaver loop: wait → pick origin → cascade → wait → repeat
- index.html with a preview window (full browser viewport)
- `npm run dev` works
- Commit: "feat: screensaver orchestrator + preview"

### Phase 7 — Polish
- Ensure 60fps with many triangles (profile if needed)
- Add subtle paper texture to triangles (CSS or canvas)
- Make triangle size responsive to viewport
- Commit: "feat: polish + performance"

## After all phases:
- Run the full test suite, ensure all pass
- Push all commits: git push
- Run: openclaw system event --text "Done: origami-screensaver initial build complete — all phases done, preview working at npm run dev" --mode now
