# F3 Graph Physics + Interaction Polish

> Status: implemented. Frontend-only. `packages/platform`, `packages/contracts`, and `packages/intelligence` are read-only for this change. The graph remains backend-swappable (provider-driven).

## Objective

Make the interactive knowledge graph feel **alive, physical, elastic, tactile, spatial, responsive, premium, and calm** — an "interactive knowledge graph," not an "SVG diagram" and not an "animated screensaver."

The desired interaction is the classic graph-view feel:

- every node is individually draggable (draggable elastic springs)
- relationships behave like soft springs
- moving one node makes connected nodes react
- local structures flex naturally, unrelated regions stay stable
- releasing a node lets the graph settle organically
- hovering/focusing causes a subtle local response
- the graph eventually rests when nothing is happening

The single most important property: the graph is **QUIET at rest.** It feels alive because it *responds* to interaction — not because it drifts forever.

```
IDLE → interaction / data change → WAKE → physical response → SETTLE → IDLE
```

## Previous D3 Implementation

The F-PR3 graph (built before this polish) already used minimal `d3-force`, `d3-drag`, `d3-selection`, native SVG, `GraphProvider`, `positionCache`, `isNewArrival`, BFS communities, Tarjan bridges, the graph-hole layer, pan/zoom, and curved Bézier edges.

Its physics model was the weak point: it modeled the graph as **always-alive** — it never truly stopped. A shelf `IDLE_ALPHA` kept the simulation timer running so nodes kept a gentle continuous drift ("Obsidian-style"). This is exactly the "permanent drift" behavior we explicitly reject: it moves for no reason, prevents a clean idle/performance state, and contradicts `prefers-reduced-motion` accessibility.

## Current Main Implementation

Same component stack (`GraphProvider → GraphPanel → GraphCanvas`, physics in `useGraphLayout`), but the physics lifecycle and interaction model were replaced:

- A real **sleep-at-idle** lifecycle (no perpetual motion).
- True **elastic drag**: `beginDrag → moveNode → endDrag` with `fx`/`fy` pinning, network spring response, and a soft settle on release.
- **Velocity-preserving release** ("letting go"), with a velocity cap to prevent graph explosion.
- A **localized** hover/focus force (`focusBias`) that only perturbs the hovered node's neighborhood.
- **Live-position carryover** so adding a node never resets or jumps the settled layout.

## Final Merged Design

The architecture boundary is unchanged and preserved:

- **D3 owns** force simulation, dragging, and the simulation lifecycle (motion only).
- **Presentation layer owns** communities (BFS), bridges (Tarjan), focus/hover semantics, and graph-hole visuals.
- **Provider owns** graph data and intelligence/truth.
- **SVG owns** rendering.
- **React owns** application state (data, selected/hovered/focused ids, filters, drawer).

`GraphSimAPI` continues to expose only mechanical verbs: `beginDrag`, `moveNode`, `endDrag`, `setHover`, `setFocus`, `isActive`, `onTick`. D3 is never given domain meaning; it never chooses data.

## Physics Model

Persistent `d3-force` with `forceLink`, `forceManyBody`, `forceCollide`, `forceX`, `forceY`, plus a hand-written `focusBias` local force. Current elasticity tuning (felt against the Operation Financial Shadow graph, not copied blindly):

- `forceLink.strength` ≈ 0.5  (strong elastic pull-back toward equilibrium)
- `forceManyBody.strength` ≈ -150 (moderate repulsion — enough to separate, not to fight the springs and feel rigid)
- `forceCollide.radius` = `nodeVisualRadius(importance) + 5..6` (per-node collision minimum)
- `forceX` / `forceY` strength ≈ 0.018 (loose centering)
- `velocityDecay` ≈ 0.42 at rest, **0.22 while dragging** (interaction-state-aware damping)
- `alphaDecay` ≈ 0.03
- `alphaTarget(DRAG_ALPHA)` ≈ 0.17 during drag; hover wake ≈ 0.07
- `DRAG_VELOCITY_CAP` ≈ 12 (high enough for a live fast drag, low enough to avoid a blast)

Bounded preferred link distance based on structural importance (never confidence-as-truth; confidence remains a domain semantic, physics never redefines intelligence). A larger base gives each spring physical room to stretch — high-importance structures rest tighter, low-importance looser:

- `distance = 70 + (1 - min(1, avgImportance)) * 90`  → 70px (high imp) … ~115px (normal) … ~160px (low)

Soft boundary clamping is relaxed (`NODE_MARGIN_X/Y` ≈ 26/20 with a ±40 slack) so springs can move freely near the canvas edges instead of being anchored to an interior box.

## Spring/Link Behavior

`forceLink` is the core of the elastic feel. Each edge has a preferred distance; when two linked nodes are displaced the link pulls them back toward equilibrium. When a node is dragged, the network responds naturally — D3 solves the network, we do **not** manually move neighbors or compute neighbor offsets.

The visual sequence: normal `A ───── B`, dragging `A ─────────── B`, release → get slightly closer together, settle, rest. Movement is visible but restrained (soft, not rubber-band-explosion).

## Elastic Interaction Model

A spring graph is only as elastic as the room its links have to stretch and the willingness of neighbors to yield. Three knobs control the feel:

1. **Preferred distance** — if the resting distance is tiny, an edge cannot visibly lengthen and the network looks glued. The bounded distance (`70…160px`) gives each relationship visible stretch headroom.
2. **Link strength** — the stiffness of pull-back toward equilibrium (≈0.5). High stiffness means the dragged node's neighbors follow it strongly; combined with the larger resting distance this reads as "elastic" rather than "rigid."
3. **Interaction-state damping** — the graph is more responsive (lower `velocityDecay` ≈ 0.22) while a node is being dragged, so neighbors visibly yield and stretch; on release it returns to normal damping (≈ 0.42) so the network rebounded and settles to a calm rest. This damp-then-settle contrast is what makes the drag feel alive rather than dead.

Only the dragged node is pinned (`fx/fy`); neighbors are never manually moved or pinned — they respond purely through link / repulsion / collision / centering forces. This is a genuine spring network, not a hand-authored neighbor choreography.

## Dragging

Every visible node is individually draggable. Interaction hit-circles (r≈32) overlay the visual nodes so node manipulation is easy without visually enlarging the nodes; the interaction target is intentionally larger than the visual circle.

- pointer down on a node → `beginDrag(nodeId)` → sets `node.fx/fy`
- drag → converts **screen to world coordinates** via `screenToWorld(pointer, pan, zoom, cx, cy)` → `node.fx = worldX`, `node.fy = worldY`
- release → `endDrag` clears `fx/fy`

Dragging stays glued to the cursor at zoom 0.5, 1, and 2 because it uses the exact inverse of the SVG content transform (`screenToWorld`/`worldToScreen`). No separate transform system was introduced.

### Drag / click separation

`d3-drag` is configured with `clickDistance(3)`: a click (below 3 screen px of movement) does **not** start a drag — no pin — and the `onClick` fires to open the Entity Detail drawer. A real drag starts only after the small movement threshold is crossed. (The earlier `distance(...)` cellular attempt was corrected to the actual d3-drag API `clickDistance(...)`.)

### Drag binding lifecycle (fix for intermittent rigidity)

The drag behavior used to be (re)attached inside a `useEffect` whose dependency array included `layoutNodes` and `dimensions.width/height`. Any re-render that changed those references — physics ticks, hover, bloom, and especially ResizeObserver viewport changes — caused an **attach → detach cycle** that left the interaction circles without their listeners between cycles. The result was the graph rendering fine but not being draggable ("rigid") until a window/resize forced a fresh mount (e.g. opening DevTools).

Fix: the `d3Drag` behavior is now built **once** (a `useMemo` and never torn down on re-render) and attached per interaction circle through a **single stable React callback ref** that reads the circle's own `data-nodeid`. Because the callback identity is stable, React binds once on mount and the binding survives all re-renders — physics, hover, bloom, data updates, and viewport resizes. Handlers read live refs (`svgRef`, `dimensionsRef`, `panRef`, `zoomRef`, `apiRef`) so cursor alignment stays correct at any zoom.

### Pan vs drag

Background pointer-drag pans the canvas. A node drag (handled on the interaction circles) is guarded so canvas pan never starts during a node drag, and a background drag never moves a node. The two can't happen at once.

## Drag Physics

On drag start: pin the node and wake the simulation with a modest `alphaTarget(DRAG_ALPHA)` and `restart()`. Only the dragged node is pinned; neighbors remain free and react via link / repulsion / collision / centering forces — producing the spring-network response.

During drag, damping is lowered (`DRAG_VELOCITY_DECAY ≈ 0.22` vs `BASE_VELOCITY_DECAY ≈ 0.42`) and neighbor velocity is capped (`DRAG_VELOCITY_CAP = 12`) so a very fast throw cannot explode the graph while still feeling live.

## Release Behavior

On release (critical):

1. clear `fx/fy`
2. **retain physical velocity** (do not zero it)
3. drop `alphaTarget` to 0 so the simulation decays
4. neighbor network rebounds briefly
5. damping pulls it back
6. settle → idle (timer stops)

The result feels elastic — a short, noticeable physical after-response — not a hard freeze and not a rubber-band explosion. Velocity is capped by the drag cap and damps via `velocityDecay`, so no unbounded explosion.

## Hover / Focus

`hoveredNodeId` / `focusedNodeId` flow into a hand-written `focusBias` local force:

- **Direct neighbors** are mildly attracted toward the hovered node.
- **Nearby unrelated nodes** (within a bounded radius ≈180) are gently repelled.
- Nodes beyond the radius are completely unaffected.
- The effect scales with `alpha` so it fades as the simulation settles — a local "breathe," not a global rearrangement.

Visual hover treats the hovered node and its connected edges as stronger; the surrounding graph is dimmed. Hover wakes the simulation, responds, then settles and stops (no requirement of continuous motion — a stationary pointer does not endlessly animate).

## Position Memory

`positionCache` is preserved. On data change:

- existing nodes reuse their **current live position** (from the running simulation when mid-settle, else the cache)
- genuinely new nodes spawn near an already-placed related node and are flagged `isNewArrival`
- the initial ring layout is never re-run for the whole graph; the graph never jumps.

(The live-position seed was added because seeding only from the stale cache could snap an actively settling graph back to its ring positions when a new node arrived mid-settle.)

## New Node Arrival

When `isNewArrival` is true the new node: appears near its related node, receives a subtle arrival visual, participates in local physics, and settles into the graph. No whole-graph re-layout, no randomization, no viewport reset.

## Curved Edges

Existing quadratic Bézier `<path>` rendering is kept. Edge geometry derives from current node positions every frame, so when a node moves the edge moves with it naturally — no independent edge animation, no artificial edge motion.

Curvature is bounded and gentle: short edges get a small bow, long edges a slightly stronger one (`arcFactor ∈ [0.10, 0.24]`), keeping the graph legible at normal zoom — never spaghetti. Tension is conveyed by spatial distance, not by drawing literal rubber bands.

## Communities

BFS community detection is kept and is semantic/structural — D3 does not determine communities. Community visualization (fog regions) follows the live node positions; membership is memoized on `[nodes, edges]` only and never recomputed per physics tick — only geometry updates.

## Bridges

Tarjan bridge detection is kept. Bridge meaning remains outside D3 (D3 only changes positions); the visual bridge halo/styling is intact.

## Graph Holes

`GraphHoleBurstLayer` is untouched. Graph-hole semantics remain provider/domain driven; physics never invents graph holes.

## Physics Lifecycle

Explicit lifecycle with no state oscillation:

```
INITIALIZING → SETTLING → IDLE
IDLE → HOVER / FOCUS / DRAG → INTERACTING → SETTLING → IDLE
IDLE → NEW DATA → UPDATING → SETTLING → IDLE
```

Wake triggers are **meaningful only** (drag, hover enter/exit, focus change, new node, data change) — never a timer that constantly wakes the simulation.

## Sleep / Idle Detection

The simulation is marked inactive — and its timer stopped — once **alpha is sufficiently low AND** the **maximum node velocity is sufficiently small** (`isIdle()`: `alpha < 0.001` and `maxVel < 0.15`). When idle, the graph holds still and React stops re-rendering; there is no background motion or render loop.

On unmount, `simulation.stop()`, tick/end handlers are detached, and the sim reference is cleared — no simulation survives navigation.

## React vs Physics

Physics state (`x`, `y`, `vx`, `vy`, `fx`, `fy`) stays mutable and simulation-driven; the canvas re-renders only while actively moving (via an imperative `onTick` → `setTick` requestAnimationFrame sync), not on a constant loop. React owns graph data, selection, hover/focus, filters, and drawer state.

## Performance

- No constant React re-render loop (idle stops the timer).
- No continuous simulation when idle.
- No full graph re-layout on drag or hover.
- No repeated structural analysis per tick (memoized on data only).
- No leaked simulations after unmount.

## Reduced Motion

Under `prefers-reduced-motion: reduce`:

- the simulation is stopped immediately (static, deterministic layout)
- hover/focus physics and arrival bloom motion are disabled
- dragging still works functionally (nodes move one-shot via `tick()` on move, `fx`/`fy` pinned)

Accessibility has priority over physics.

## Determinism

No `Math.random()` anywhere. First layout uses a fixed ring seed; subsequent builds reuse the position cache / live positions. Same fixture + same initial state reproduces the same behavior.

## Provider Boundary

The pipeline stays `useWorkspace() → GraphProvider → canonical GraphNode[] / GraphEdge[] → physics → SVG`. There is no hardcoded `CASE_ID` / `INVESTIGATION_ID` / demo node / demo edge inside `graph-canvas.tsx` or `use-graph-layout.ts`. D3 never chooses data. Verified by the provider-driven source-scan tests.

## Backend Swappability

Only provider output changes between `DemoGraphProvider` and a `LiveGraphProvider`; the `GraphCanvas`/physics components are unchanged. No backend API, Prisma, BullMQ, ingestion, UploadThing server, SSE producer, contracts, or intelligence engine was modified.

## Dependencies

Allowed and unchanged: `d3-force`, `d3-drag`, `d3-selection` (+ `@types/*`). Not allowed and not present: the `d3` umbrella, react-force-graph, cytoscape, vis-network, three.js, any WebGL framework. No new graph dependency was added.

## Tests

`packages/web/tests/graph-physics.test.tsx` covers behavioral invariants (no pixel-position assertions for physics):

- deterministic initial ring seed; `settled` becomes true after initial build
- **wake on interaction** (`isActive()` true during drag / hover)
- **drag pins `fx`/`fy`**; **release clears the pin**
- **only the dragged node is pinned — neighbors stay free** (spring network: `n2…n5` remain unpinned, `fx/fy == null`)
- **velocity is preserved on release** (not zeroed, soft rebound)
- **simulation returns to idle** (stops) after settling
- hover → local wake response
- `isNewArrival` only for genuinely new nodes
- position-cache / live-position preservation on new arrival (no re-layout / no jump, locality bound)
- new node seeds near a related placed node
- reduced-motion drag still moves the node without alpha choreography
- unmount cleanup (sim reported stopped, no throw)
- `screenToWorld` ↔ `worldToScreen` round-trip at zoom 0.5 / 1 / 2 with pan
- `findBridgeEdges` (Tarjan) cut-edge detection; `nodeVisualRadius` bounded/monotonic
- provider-driven source scan (no demo/provider/platform imports, no hardcoded UUIDs)

## Manual Visual QA

> Not claimed as passing on the basis of automated tests alone. The physics must be felt against the real Operation Financial Shadow graph.

Checklist to run manually: initial layout settles smoothly → becomes still; node individually draggable; dragged node follows cursor; links stretch naturally; neighbors move naturally; release has soft rebound; no graph explosion; unrelated communities stay stable; hover gives a local physical response; click preserves layout and opens the drawer; pan works; zoom works; drag works after zoom and after pan; curved edges stay attached; new nodes insert locally; graph does not constantly drift; reduced motion works; returning to idle stops the simulation.

## Known Trade-offs

- **Settle time**: because the graph now genuinely runs physics from `alpha=1` and stops only when both alpha and velocity are low, the initial layout and post-interaction settle take roughly a few seconds. This is the cost of a calm, physical settle (vs. an instant snap or a perpetual drift). `settled` (the app-level latch) still fires quickly for entrance/auto-fit, decoupled from full physical idle.
- **Locality vs. responsiveness**: keeping hover/drag responses strictly local means 2-hop and distant communities barely move. This is intentional (unrelated regions stay stable), but large local clusters can look comparatively rigid.
- **Physics tuning is empirical**: the force strengths/decay values are starting points and should be tuned against the target graph by feel; they are not validated by pixel tests.

## Definition of Done

- [x] Physics lifecycle: quiet rest, wake on meaningful interaction/data change, settle, stop (no perpetual/random drift)
- [x] Elastic drag with `fx`/`fy` pinning, world-coordinate cursor alignment at zoom 0.5 / 1 / 2, click-vs-drag separation
- [x] Velocity-preserving, soft rebound on release; velocity cap prevents explosion
- [x] Local hover/focus physics (no global rearrangement, no continuous animation)
- [x] Position memory / no re-layout on new-node arrival; curved edges follow live positions
- [x] Communities, bridges, graph holes preserved (semantics outside D3)
- [x] Reduced-motion deterministic/static; unmount cleanup
- [x] Provider boundary intact; backend swappable; no backend/dependency changes
- [x] Typecheck clean; production build passes; graph physics tests (20) pass; the full web suite passes (295 tests, including the previously-flaky `api-client` test)
- [ ] Manual visual QA on the Operation Financial Shadow graph (feels final only after this pass)
