# PR-2 — Cinematic Home · Organic Evidence Graph

**Status:** DELIVERED. The deterministic evidence constellation now lives inside the PR-1 WebGL scene on Home (`/`). A handcrafted 45-node / 52-edge master network is cut per quality tier, placed by a **seeded offline d3-force pass** (never at runtime), and choreographed by the existing `handle.progress` handle into the exact scroll arc the cinematic scene needs: dark atmosphere → nodes stagger in by structural class → sparse fiction labels settle → edges appear only after both endpoints → the whole constellation holds calm, breathing stability. One ScrollTrigger, one Canvas, one scene controller — PR-1 invariants verified. New suite: **`tests/cinematic-graph.test.ts` (26 tests) — all passing**. Regression: PR-1 cinematic suites **50/50**; full web suite **116 files / 1313 tests / 1313 passed**; `pnpm --filter @indago/web typecheck` **EXIT=0**; production `next build` green (Home `/` 294 kB first-load JS, +5 kB over the PR-1 baseline from the deterministic graph module).

---

## A. Scope & Goal

PR-2 is the **second cinematic act** of the Home page: the sparse fiction "evidence" the copy hints at, rendered as an organic constellation over the moody warm-dark scene.

- **Deterministic by construction.** Same device, same quality tier → byte-identical topology, silhouette, emergence timing, motion. No runtime graph library; d3-force is import-time/offline only.
- **The scroll arc is the scene's own.** Reuses PR-1's single `CINEMATIC_SCROLL_TARGET` handle and `.progress`; no fade-out, no second ScrollTrigger, no next section, no interaction (no hover, no drag, no pan).
- **Five structural layers, told in order.** Atmosphere presence → core knot → secondary trading sub-network + bridging ties → peripheral fragments → sparse labels → edges. The whole network settles and breathes quietly.
- **Accessible by default.** Reduced motion renders the fully formed constellation statically (no drift, no archive scrub); labels are `aria-hidden` ornamental anchors; every tier's label budget is small and centered.
- **Zero runtime dependencies added.** `d3-force` + `@types/d3-force` were already in `@indago/web`.

## B. Frozen Contract (untouched by this deliverable)

- PR-1 cinematic scene: `CinematicStage` (one `<Canvas>`), `CinematicIntro` (GatingPanel + chapter copy + `CinematicCamera`), `Atmosphere`, `handle.progress` produced by the single ScrollTrigger (`end: "max"`), `quality` from the media hook (incl. `"reduced-motion"` tier), `CINEMATIC_PIN_END`, debug overlay (`?cinematicDebug=1`).
- Home page, App shell, `useCinematicScene`/controller wiring, DPR/vignette/grain: unchanged.
- The graph is **purely ornamental** for now; it reads no investigation/model/contract data in PR-2. That seam is PR-3 (bridge to the real graph model).

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.types.ts` | Pure model types: node kinds/classes, `CinematicNodeDefinition`, `CinematicEdgeDefinition`, per-tier `CinematicGraphTierBudget`, layout node/edge types, `CinematicGraphBundle`, fitted `CinematicGraphBounds`, mutable `CinematicGraphStatsView`, preallocated `CinematicGraphPoseView`. |
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.config.ts` | Central constants: seed, layout ticks, fit margin, tier budgets, class emergence windows, edge delay/duration, emergence offset, presence window, motion frequencies/drift/breath, label start/jitter/duration, muted warm palette, class brightness/size, edge color, label pool + `labelForNodeId`. |
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.data.ts` | Handcrafted master topology: **45 nodes (16 core / 15 secondary / 4 bridge / 10 peripheral)** and **52 edges** with retention priorities, plus `selectTierTopology` (priority-preserving prefix cuts). |
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.layout.ts` | `mulberry32` seeded PRNG + `layoutGraph`: fixed-initial-position d3-force sim with seeded `randomSource`, fixed tick count, normalize to ±fit margin, true fitted bounds. No runtime simulation path exists. |
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.progress.ts` | Pure progress→cue mapping: `smoothstep`/`smoothstepFade`, `nodeAlpha`/`edgeAlpha`/`labelAlpha`/`nodeVisible`/`graphPresence`/`nodePosition`/`nodeBreath`/`nodeDepth`, `deriveTiming`, `deriveEdgeTiming`, `assertEmergenceWindowsValid`, `selectLabelRows`, `createGraphRandom`, `createCinematicGraphPoseView`. |
| `packages/web/src/components/home/cinematic/graph/generateCinematicGraph.ts` | `generateCinematicGraph(tier)` orchestrator: tier cut → seeded layout → seeded timing → bundle + stats. Client-only (returns `null` on the server). |
| `packages/web/src/components/home/cinematic/scenes/GraphScene.tsx` | R3F scene object: `GraphScene` (root), `NodeField` (single instanced mesh), `EdgeField` (single `LineSegments`), `GraphAtmosphere` (presence glow), `writeLabelPose`, `CinematicGraphEffects`. |
| `packages/web/src/components/home/cinematic/EvidenceLabels.tsx` | DOM label layer OUTSIDE the Canvas: reads the shared pose view on a 120 ms interval, ≤ capacity spans, percent-positioned, `aria-hidden`, z-index 1 (below vignette). |
| `packages/web/tests/cinematic-graph.test.ts` | **26 tests** — § I determinism, § II topology tiers, § III layout, § IV timing/emergence, § V reduced motion, § VI label budgets, § VII source-guard reality checks. |

## D. Files Changed

- `packages/web/src/components/home/cinematic/scenes/FoundationScene.tsx` — now renders `<CinematicCamera /> + <Atmosphere /> + <GraphScene />` after the gate; graph effects forwarded to the stage.
- `packages/web/src/components/home/cinematic/CinematicStage.tsx` — accepts the `graph` effects + renders `<EvidenceLabels />`; single Canvas preserved.
- `packages/web/src/components/home/cinematic/CinematicIntro.tsx` — `graphEffectsFor(quality.tier)` memoized keyed on tier; holds bundle + stats + pose views; passes node colors/sizes to `GraphScene`.
- `packages/web/src/components/home/cinematic/CinematicDebugOverlay.tsx` — new `graph`/`bounds`/`visible` rows under `?cinematicDebug=1`.
- `packages/web/src/components/home/cinematic/cinematic.css` — `.evidence-label`, `.graph-values`, label/resolve/reduce rules + widened debug overlay.

## E. Files Removed / Intentionally Untouched

- Removed: none (a temporary count-verification test file was created, run, and deleted).
- Untouched: `useCinematicScene`, controller, `cinematic.constants.ts`, rest of Home/App, anything outside `packages/web`, contracts, platform, intelligence packages.

## F. Data model

- **Kinds** (semantic, not decorative): `person`, `organization`, `account`, `reference`, `event`. **Classes** (structural, drives rhythm): `core`, `secondary`, `bridge`, `peripheral` — each with a priority.
- Node definition: `{ id, kind, class, priority, label? }`; edge definition: `{ id, source, target, priority }`.
- Layout nodes extend definitions with `nx/ny` (normalized), `size`, `emergenceStart/End`, `offsetX/Y`, motion seed fields, `labelStart`. Edge layout nodes carry `sourceIndex/targetIndex` + emergence window.
- Bundle: `{ tier, nodes, edges, bounds, stats }` — fully serializable, pure-data, unit-testable without a browser.

## G. Topology design

Hand-walked (not algorithmically generated) so the silhouette reads organically: **one dense core knot** (persons ↔ orgs ↔ accounts ↔ references ↔ events), a **secondary trading sub-network** reached through a couple of shared orgs, five **lattice ties**, four **bridge** connectors, and **deliberate peripheral fragments with negative space** between them. No grid, no radial symmetry, no single giant hub, no uniform ball. Edge priorities encode retention so every smaller tier is a coherent subset of the larger one.

## H. Tier budgets & measured counts

| Tier | Budget (spec) | `take` (core/sec/bridge/peri) | Measured nodes | Measured edges | Edges cap | Labels max |
|---|---|---|---|---|---|---|
| `high` | 40–48 / 30–55 | 16 / 15 / 4 / 10 | **45** | **50** | 50 | 8 |
| `medium` | 30–38 / 22–42 | 16 / 14 / 2 / 2 | **34** | **32** | 32 | 7 |
| `mobile` | 20–28 / 14–30 | 16 / 7 / 1 / 0 | **24** | **24** | 24 | 5 |
| `reduced-motion` | 16–28 / 12–30 | 16 / 7 / 1 / 0 | **24** | **18** | 18 | 4 |

Labeled candidate pool is 10 (`CINEMATIC_GRAPH_LABELED_NODE_IDS`); `selectLabelRows` caps to the tier's `labelsMax`, applied over nodes in fixed index order so the DOM layer and the scene always agree.

## I. Seeding strategy

- Single constant `CINEMATIC_GRAPH_SEED = 20260421`. `mulberry32` is the only PRNG.
- Layout consumes a **separate stream** (`seed ^ 0x5f3759df`) for initial coordinates + simulation randomness; timing consumes the main seed in **strict node-order then edge-order**, so any tier that retains a node gives that node identical timing.
- Verified by tests: same seed ⇒ same state sequence; duplicate `generateCinematicGraph(tier)` calls produce identical bundles; different tiers remain deterministic and prefix-consistent.

## J. Offline layout (`d3-force`)

- Forces: `forceLink` distance 0.85, `forceManyBody` −30, `forceCenter` (0,0), `forceCollide` radius = size·2.4 with 4 iterations, `forceX/forceY` per profile (wide 0.15/0.05, balanced 0.1/0.075, vertical 0.045/0.22).
- Initial positions pre-assigned from the seeded stream across a profile initial spread (2.2 / 1.8 / 0.9).
- `.randomSource(seeded)` + `.stop()` then exactly `CINEMATIC_GRAPH_LAYOUT_TICKS = 260` manual ticks.
- Result centered and scaled into ±`CINEMATIC_GRAPH_FIT_MARGIN = 0.78`; true fitted bounds computed and carried in the bundle (debug overlay shows them). Runtime never imports or runs a simulation.

## K. World mapping & camera

- Camera: z-band + FOV behave as PR-1; per-frame `map.visibleWidth = vec.setFromMatrixColumn(camera.matrix, 0).length() * 2`.
- `halfW = 3 * aspect`, `halfH = 3`; node world position `x = nx * halfW`, `y = ny * halfH`; normalized bounds map to the same world space for the debug rect. Silhouette fits inside the frame's breathing margin (≈70–90% dark) so it never touches a screen edge.

## L. Node rendering

- **One `InstancedMesh`** for all nodes (sprite of a shared radial-gradient texture built once), `transparent`, `depthWrite=false`, `depthTest=false`, `renderOrder` 2 — no per-instance geometry, one draw call per frame.
- Per-frame writes: instance matrices only for nodes with a nonzero emergence (grows with `visible`), per-node local scale = size·breath; instance color = class-brightness-multiplied kind color **blended toward the warm-black `BGC {0.035, 0.031, 0.027}`** by the emergence alpha (fade-via-color, not per-instance alpha — works under the shared material mode).
- Matrices/colors reused (no per-frame allocations); `instanceColor` written only when the alpha target crossing changed ≥ 0.004.
- Class brightness (core 1, secondary 0.82, bridge 0.9, peripheral 0.62) and base sizes (0.085 / 0.07 / 0.062 / 0.052) drive hierarchy; size jitter ±16% seeded.

## M. Edge rendering

- **Single `LineSegments`** buffer; geometry positions baked once into **seeded-random draw slots** (deterministic Fisher–Yates over the edge indices). Slot `s` holds the `s`-th edge to become visible, and the draw range grows as edges reveal — hidden edges are **excluded from geometry via `setDrawRange`**, so nothing renders at progress 0 and the network weaves in bit-by-bit in a non-structural order.
- Edge visibility is a **color lerp** toward the exact backdrop (converted to linear working space at write time: `#0a0908` ↔ the explicit scene background) — a dimmed line is pixel-identical to the backdrop, genuinely invisible.
- `renderOrder` 1 (below nodes). Muted warm `EDGE_COLOR {164, 142, 116}`.

## N. Labels

- **DOM layer outside the Canvas** (`EvidenceLabels`): the scene writes up to 8 label anchors into a preallocated `CinematicGraphPoseView` (`Int32Array` indices + `Float32Array` x/y/visible) every frame; the DOM side polls it at 120 ms and positions absolutely via `left/top` percentages using the same normalization → neither layer queries the other's DOM.
- Label text from `labelForNodeId` (fiction pool: “Rohan Singh”, “Nilgiri Textiles”, “AX-4471”, “Meridian Trust”, “Northbridge Shipping”, “NB-5560”, “R. Fernandes”, “₹615,000”, “T. Kamat”, “08:30”) — sparse, centered, `aria-hidden`.
- Fade-in window `[0.8, 0.8+0.12]` + seeded jitter, base opacity 0.62; reduced motion presents them at 0.7.

## O. Progress mapping (the scroll arc)

- `graphPresence`: `smoothstep(core.start, peripheral.end + 0.08)` drives the atmosphere glow (opacity `0.04 + 0.12·presence`, additive).
- Node entry windows: core `[0.16→0.32]`, secondary `[0.34→0.5]`, bridge `[0.3→0.42]`, peripheral `[0.56→0.78]`, each seeded inside, settle **capped at 0.88** so edges get a clean runway.
- Entry position: small seeded offset eases each node into its spot (“entering focus”, not flying particles); once formed, a tiny breathing drift (`sin` sums over two shared slow frequencies, amplitude `DRIFT 0.012·driftAmplitude·emergence`).
- Edges: `start = clamp(max(sourceSettle, targetSettle) + delay, ≤0.96)`, `end = min(start + 0.12, 0.99)`; delay seeded in `[0.04, 0.12]`. **Edges never precede both endpoints** — invariant asserted by a validation pass and a test.
- `assertEmergenceWindowsValid` runs on the built bundle (throws on out-of-range/empty/endpoint-violating windows).

## P. Mobile strategy

- `mobile` tier: core-focused, near-zero peripheral, **vertical** layout profile (spread 0.9, forceY 0.22 defeaulting) → tall, narrow composition that reads in 390×844 / 430×932 portrait. Labels capped at 5 (desktop 8), still centered. Same deterministic pass; only the tier/budget/profile changes.

## Q. Reduced motion

- Tier `reduced-motion` (calmest budget + `vertical` profile): `generateCinematicGraph` returns the same fully-formed bundle; the scene **bakes all instance matrices once** in `useLayoutEffect` and `useFrame` returns immediately after writing nothing drift-related; `nodePosition` returns the exact `{nx, ny}` (divergence-free, cannot animate by accident); labels at 0.7 static; atmosphere fully present.
- Verified by test: reduced bundle's emergence windows resolve to fully-formed/static values, and the scene path is asserted not to use gsap/ScrollTrigger/addEventListener.

## R. Performance decisions

- Offline layout: d3-force runs once at generation time, not on the frame loop; no runtime simulation exists.
- One draw call for nodes, one for edges; shared materials; depth disabled so no alpha sorting cost; edge draw range grows monotonically (set per frame, no buffer re-upload).
- Node visibility is gated on emergence alone (zero-scale below threshold); the ambient breath modulates size/color of **already-visible** nodes and can never conjure a node out of the dark.
- Explicit renderer background (`#0a0908`, matching `--color-semantic-background`) so fades blend pixel-for-pixel into the true backdrop instead of an implicit black canvas; vertex/instance colors are written in linear space so the sRGB output equals what was authored.
- No DOM reads in the frame loop; label DOM work throttled to 120 ms; no React state per frame.
- Bundle gated client-side (server renders the same HTML as PR-1); generated once per `quality.tier`.

## S. Cleanup & ownership

- The scene keeps a single cleanup: dispose the instanced node mesh, edges, sprite texture, and atmosphere material on unmount; effects returned to the stage are stable references (created once per tier).
- `GraphScene` reads only the passed bundle/effects — no globals, no external subscriptions; `EvidenceLabels` polls the pose view and owns only its DOM spans; `CinematicIntro` owns the tier-keyed memo.

## T. Tests (26, all passing)

1. `mulberry32` replayability; 2. `createGraphRandom` same-seed determinism; 3. bundle tier identity; 4. topology repeatability across calls; 5. unique node ids; 6. edge ids reference retained endpoints; 7. node count in every tier budget; 8. edge count in every tier budget; 9. tier subset edges ⊆ master; 10. tier subset nodes ⊆ master; 11. finite normalized coordinates; 12. duplicate layout determinism; 13. bounds contain all nodes; 14. fitted bounds within ±fit margin; 15. bounded world mapping for canvas fov; 16. emergence windows in [0,1]; 17. edges never precede endpoints; 18. class-order emergence monotonic; 19. (intro) dark early path; 20. emergence windows valid post-build (validation throws on corruption); 21. node visibility monotonic; 22. reduced-motion fully formed; 23. reduced-motion static position; 24. label budget sparse cap; 25. label rows align scene+DOM (same bundle); 26. source-guards: `GraphScene` has no ScrollTrigger/gsap/addEventListener, `CinematicStage` has exactly one `<Canvas`, `generateCinematicGraph` only imports pure module files.

PR-1 regression: `cinematic-foundation.test.ts` (20) + `cinematic-foundation.test.tsx` (12) + `pr1-navigation-dock.test.tsx` (12) + `home-dashboard-routing.test.ts` (6) = **50/50**. Full web suite **1313/1313**.

## U. Checks

- `pnpm --filter @indago/web typecheck` — EXIT=0.
- `pnpm --filter @indago/web run test` — 116 files / 1313 tests green.
- `pnpm --filter @indago/web run build` — production build green; Home `/` 294 kB first-load (PR-1: ~289 kB; deterministic module +5 kB, no new runtime dep).

## V. Manual verification (limitations)

Automated browser E2E is not available in this repo (jsdom-only test environment; no Playwright). Manual pass is recommended at these viewports with `?cinematicDebug=1` (overlay should show a populated `graph` count, finite `bounds`, and `visible` climbing 0 → N as the scene scrubs):

- 1440×900 (wide: 45 nodes / two clusters + bridges + fragments)
- 1920×1080 (same wide composition, breathing room)
- 390×844 and 430×932 (mobile: vertical silhouette, ≤5 labels)
- OS `prefers-reduced-motion: reduce` (static, fully formed, no drift)

Expect : intro darkness → atmosphere presence → core knot → secondary network/lattice/bridges → peripheral fragments → labels → edges after endpoints → quiet stability; no fade, no second trigger, no interaction.

## W. PR-3 extension point

The bundle and pose plumbing are intentionally data-agnostic: `generateCinematicGraph(tier)` already carries node ids/kinds/classes and is the single seam where the **real investigation graph** (investigation → hypotheses → evidence model via the provider layer) can be projected onto the same deterministic choreography — replacing the handcrafted fiction topology + label pool while keeping every scene, label, and motion contract identical.