# F-PR3: Graph Physics Upgrade (minimal d3-force + d3-drag)

> Status: implemented. Frontend-only. `packages/platform`, `packages/contracts`, and `packages/intelligence` are read-only for this PR.

## Overview

F-PR3 upgrades the graph interaction model by merging the best of the earlier `d3-force` experiment (persistent simulation, node dragging, curved Bézier edges, hover/focus physics) with main's newer provider-driven graph (position memory, `isNewArrival`, community/Tarjan bridge detection, graph-hole layer, pan/zoom, bloom) — **without** reintroducing a graph framework or moving any business/domain meaning into D3.

The core rule preserved through every edit: **D3 owns physics + dragging + simulation lifecycle only.** Community detection, Tarjan bridges, focus/hover semantics, and all presentation choice remain in the presentational layer, computed from canonical `GraphNode` / `GraphEdge` data delivered by the graph provider.

This phase answers: **"how does the graph move, settle, and let the judge interact with it?"**

## Scope

In scope:
- Persistent `d3-force` simulation (link / manyBody / collide / x / y) with a custom `focusBias` hover·focus local force
- Deterministic seeding (reproducible ring) with `positionCache` reuse so live growth never collapses the graph
- `isNewArrival` flagging; new nodes spawn near an already-placed related neighbor
- Node dragging via `d3-drag` (world coordinates correct under pan/zoom; dragging does not pan)
- d3 alpha lifecycle: graph **settles → idle (sim stops)**; interaction wakes it → responds → settles. No random/determinism violation
- Curved quadratic Bézier `<path>` edges restored
- Realtime/`graph-live`, `graph-hole-burst-layer`, pan/zoom + zoom-aware bloom all preserved unchanged
- Pure coordinate helpers (`screenToWorld` / `worldToScreen`), `findBridgeEdges` (Tarjan), `nodeVisualRadius`, community regions
- Tests (determinism, settle, drag pin/unpin, position cache, new-arrival placement, reduced-motion, provider-driven boundary, coordinate transforms at zoom 0.5/1/2)

Explicitly out of scope (not shipped): `d3` umbrella, react-force-graph, cytoscape, vis-network, three.js, WebGL, any second transport, any backend change.

## Design decisions

- **Minimal D3, native SVG.** Only `d3-force` (physics), `d3-drag` (node dragging), and `d3-selection` (`select` / `pointer`) are installed + typed (`@types/*`). Rendering stays hand-written JSX/SVG. No umbrella `d3`, no graph framework.
- **D3 owns physics, not meaning.** `GraphSimAPI` exposes only mechanical verbs (`beginDrag`/`moveNode`/`endDrag`/`setHover`/`setFocus`/`isActive`/`onTick`). Communities (BFS), bridges (Tarjan), and `focusBias` influence are computed/owned by the presentational layer and passed in; they are never inferred inside D3.
- **Settle → idle lifecycle.** Build pins deterministic seeds and cancels the auto-started timer (`simulation.stop()`), so a fresh mount is stable. Interaction (`beginDrag`, hover/focus under non-reduced-motion) wakes via `alphaTarget(...).restart()`; the simulation runs, then falls to `end` → `active=false` → idle. Idle timeout (`settled`) reflects "no further motion expected".
- **Deterministic seeding / no random drift.** First layout seeds nodes on a ring `radius = min(width,height) * 0.35`; existing nodes restore from `positionCache`; genuinely new nodes spawn 40px from a placed neighbor. Seeded positions are reproduced exactly run-to-run (`Math.random` is never used).
- **Cache + `seenNodeIds` persist synchronously after build** (not only on `end`), so position memory and new-arrival flagging work even when the graph settles via the idle timer rather than running to alpha=0.
- **Drag under zoom/pan.** Interaction circles are positioned in world coordinates; `beginDrag`→`moveNode` uses `screenToWorld(pointer, pan, zoom, ...)` so the grabbed node tracks the cursor correctly at zoom 0.5/1/2. A canvas-level pan guard prevents node drags from also panning.
- **Reduced motion.** Hover/focus bias and the awake-alpha choreography are skipped under `prefers-reduced-motion`; dragging still moves the node directly (`simulation.tick()` on move) and pins/unpins `fx`/`fy`.
- **Curved edges.** Each edge renders as a quadratic Bézier `<path>` (with a `#payload` grip for interaction) instead of a straight line.
- **Deterministic structure helpers.** `findBridgeEdges` uses Tarjan's algorithm (with the correct `low` propagation: `low.set(u, min(low[u], low[v]))`); communities are BFS; both are `useMemo`d on `[nodes, edges]` only.

## Files

| File | Purpose |
|------|---------|
| `src/components/graph/use-graph-layout.ts` | Persistent `d3-force` engine: forces, `focusBias` hover force, alpha lifecycle, `GraphSimAPI`, Tarjan bridges + BFS communities (data-only), `positionCache`/`isNewArrival`, deterministic seeding, reduced-motion, pure `screenToWorld`/`worldToScreen`/`findBridgeEdges`/`nodeVisualRadius` |
| `src/components/graph/graph-canvas.tsx` | Renders the graph; `d3-drag` node dragging (world coords), pan guard, tick-driven re-render while active, curved quadratic Bézier `<path>` edges, all visual layers (hover/bloom/autofit/communities/bridges/hole-burst/labels/a11y) preserved |
| `package.json` | Adds `d3-force@3`, `d3-drag@3`, `d3-selection@3` + `@types/*` |
| `tests/graph-physics.test.tsx` | Simulation/geometry/provider-boundary tests |
| `docs/frontend/frontend-development-plan.md` | "no graph library" decision replaced with minimal-d3 scope (§5.1, §6 table, §22) |
| `docs/frontend/f-pr2-provider-architecture.md` | Audit line updated: graph deps scoped to d3-force/d3-drag/d3-selection only |

## Verification

- `pnpm --filter @indago/web exec tsc --noEmit` — **clean (exit 0)**.
- `pnpm --filter @indago/web test` — **35 files, 290 tests passed**, including the new `tests/graph-physics.test.tsx` (15 tests).
- `pnpm --filter @indago/web build` — **compiled successfully (exit 0)**.
- Graph tests cover: deterministic ring seed; `settled` becomes true; `isNewArrival` only for genuinely new nodes; position-cache preservation across rebuild; new node seeds near a placed neighbor; drag pins `fx`/`fy` then release clears them (normal + reduced-motion); unmount cleanup; `screenToWorld`↔`worldToScreen` round-trip at zoom 0.5/1/2 with pan; `findBridgeEdges` cut-edge detection; `nodeVisualRadius` bounded/monotonic; provider-driven source scan (no demo/provider/platform imports, no hardcoded UUIDs).

## Scope / x-package audit

`git status` / `git diff --name-only` confirm changes are confined to `packages/web` + frontend docs:

- **Modified**: `packages/web/package.json`, `src/components/graph/{use-graph-layout.ts, graph-canvas.tsx}`, `pnpm-lock.yaml` (dependency install), `docs/frontend/{frontend-development-plan.md, f-pr2-provider-architecture.md}`.
- **New**: `packages/web/tests/graph-physics.test.tsx`, `docs/frontend/f-pr3-graph-physics.md`.
- **Untouched**: `packages/platform`, `packages/contracts`, `packages/intelligence` (pre-existing uncommitted changes to `audit-event.ts` / `relation.ts` and untracked `opencode.json` / `intelligence/relation-resolution/` were present before this PR and left alone).

Forbidden-deps grep across `src/components/graph/*` shows **only** `d3-force`, `d3-drag`, `d3-selection` imports (plus ordinary prose); no `d3` umbrella, no graph framework, no Three.js/WebGL.

## Acceptance checklist

- **Was a graph library (umbrella `d3`/react-force-graph/cytoscape/vis-network) installed?** NO — only minimal `d3-force`/`d3-drag`/`d3-selection` for physics/interaction.
- **Was Three.js / WebGL installed?** NO
- **Is D3 given business/domain meaning (communities/bridges/focus semantics)?** NO — D3 is physics-only; domain is computed in the presentational layer from canonical `GraphNode`/`GraphEdge`.
- **Is the graph provider-driven (no hardcoded nodes/edges/demo ids in components)?** YES — verified by source scan.
- **Is there random/permanent drift?** NO — deterministic seeds; settles → idle (sim stops); interaction wakes → responds → settles.
- **Does node dragging align under zoom/pan?** YES — world coords via `screenToWorld`/`worldToScreen` at zoom 0.5/1/2.
- **Does pan remain canvas behavior (node-drag doesn't pan)?** YES — pan guard.
- **Do curved edges render?** YES — quadratic Bézier `<path>`.
- **Were `packages/platform`, `packages/contracts`, or `packages/intelligence` changed?** NO
- **Do all prior tests still pass?** YES (290/290)
- **Typecheck clean?** YES
- **Production build?** YES
