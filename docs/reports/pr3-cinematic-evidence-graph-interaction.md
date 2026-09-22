# PR-3 — Cinematic Home · Organic Evidence Graph · Interaction

**Status:** DELIVERED. The deterministic evidence constellation from PR-2 is now a **responsive, physical evidence world** — desktop hover with a light-on-travelled-neighbourhood emphasis, tap/click focus with a two-hop neighbour glow, drag with a soft-bound critically-damped settle spring, a passive cursor proximity field that lights nodes while emerging, edges that brighten when incident to focus and track dragged end-points, and a scroll-vs-drag arbitration where the browser always wins. Everything rides on the existing `handle.progress` and the PR-1 `handle.pointer` window sampler — one ScrollTrigger, one Canvas, one camera. Reduced motion stays honest: interaction collapses to a **static tap-to-focus** (instant, re-baked on a revision counter, no animation). New suite: **`tests/cinematic-interaction.test.ts` (46 tests) — all passing**. Regression: cinematic suites **104/104**, full web suite **117 files / 1359 tests / 1359 passed**; `pnpm --filter @indago/web typecheck` **EXIT=0**; production `next build` green (Home `/` 298 kB first-load JS, +4 kB over the PR-2 baseline from the pure interaction module + controller).

---

## A. Scope & Goal

PR-3 is the **third cinematic act** of the Home page: PR-2 delivered a deterministic constellation choreographed by the scroll; PR-3 lets the pointer *touch* it.

- **One vector of user agency.** Hover, tap and drag never mutate the choreography — `rendered = basePosition(progress, time) + interactionOffset`, and the offset settles home through a spring. Scrub the scroll at any moment and the scene resumes the exact PR-2 arc with the interaction riding on top, never derailing it.
- **The neighbourhood is the unit of response.** Focusing a node lights not just the node but its 1-hop and (fainter) 2-hop structure; edges incident to the focus brighten; the rest of the network dims slightly so the neighbourhood reads as a scene.
- **Scroll and drag arbitrate honestly.** No `preventDefault`, no `touch-action: none`, no wheel/touchmove listeners. Drags start only past a device-px threshold; a browser `pointercancel` (a scroll won) drops the drag and lets the springs settle home.
- **Nothing new in the frame loop.** One compute owner writes preallocated buffers; the renderers became *readers*; no per-frame allocation, no Raycaster, no React state.
- **CSS/`prefers-reduced-motion` protected.** Reduced motion keeps the fully-formed static constellation and adds only a restrained, instant tap-to-focus.

## B. Frozen Contract (untouched by this deliverable)

- One `ScrollTrigger` (in `useCinematicScene`), one `<Canvas>` (`CinematicStage`), one camera, one `handle.progress` — PR-2 §I style guards still pass (GraphScene.tsx has **no** `addEventListener`).
- `CinematicGraphBundle` determinism (seed/tier ⇒ byte-identical topology, timing, motion) is the same version the interaction derives its adjacency from.
- PR-2 renderer geometry strategy (instanced node mesh, seeded slot shuffle for edge draw-range) is preserved; only the per-frame *values* now come from the interaction view.
- Bundle/pose plumbing, `EvidenceLabels`, the DOM layer cadence and `aria-hidden` fiction labels are unchanged.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.interaction.ts` | Pure, browser-free interaction logic: phase gating, adjacency layout (id-maps + flattened `Int32Array` neighbour lists + two-hop sets in one pass), hit/hover radii, drag threshold + soft world clamp, `findNodeAt` O(N) lookup, cursor lift, tier-emission node/edge emphasis, hysteresis `approach`, critically-damped `solveSpring`, `isSettled`, `toggleFocus`, `createCinematicGraphInteraction` runtime factory. |
| `packages/web/src/components/home/cinematic/scenes/GraphInteraction.tsx` | The single interaction controller: canvas pointer transport (passive listeners), per-frame compute owner (base positions, drag targets, settle springs, fades, hit tests, emphasis arrays, label anchors), reduced-motion revision-bake. Mounted FIRST inside `GraphScene` so its `useFrame` runs before the renderers' every frame. |
| `packages/web/tests/cinematic-interaction.test.ts` | **46 tests** — §A phase gating, §B pressability, §C/D adjacency layout, §E structural tiering, §F/G radii, §H/I drag threshold + soft bounds, §J `findNodeAt`, §L cursor lift, §M/N node emphasis, §O edge emphasis, §P/Q fades + spring, §R focus toggle, §S runtime shape, §T source-level controller guards. |

## D. Files Changed

- `packages/web/src/components/home/cinematic/graph/cinematicGraph.types.ts` — PR3 type block: `CinematicGraphInteractionMode`, `CinematicGraphFocusTier`, `CinematicGraphInteractionLayout`, and the mutable `CinematicGraphInteraction` runtime (world positions, alpha, emission, scale, radii, offsets/velocities, edge multipliers, fades, identities, `focusRevision`).
- `packages/web/src/components/home/cinematic/graph/cinematicGraph.config.ts` — centralized `CINEMATIC_GRAPH_INTERACTION` tuning (every magic number below, unit-annotated).
- `packages/web/src/components/home/cinematic/scenes/GraphScene.tsx` — mounts `<GraphInteraction>` first, exports `ParsedWorld`, adds `interaction: CinematicGraphInteraction | null` to `CinematicGraphEffects`; `NodeField`/`EdgeField` became pure readers of the view arrays (`nodeWorldX/Y`, `nodeAlpha`, `nodeEmission`, `nodeScale`, `edgeMult`); label pose writing moved to the controller; reduced re-bake keyed on `view.focusRevision`.
- `packages/web/src/components/home/cinematic/CinematicIntro.tsx` — `graphEffectsFor` now also builds the interaction runtime (`coarse = tier === "mobile"`) behind the same `window`/tier gate.
- `packages/web/src/components/home/cinematic/CinematicDebugOverlay.tsx` — `interaction` row under `?cinematicDebug=1` (mode · reduced · coarse | hover | focus | drag ids).

## E. Files Removed / Intentionally Untouched

- Removed: none.
- Untouched: `FoundationScene`, `CinematicStage`, `CinematicScrollTrack`, `EvidenceLabels`, `useCinematicScene`, `cinematic.constants.ts` (phases read-only), Home/App shell, `d3-force` layout, anything outside `packages/web`.

## F. Interaction model

`renderedX = baseX + offsetX`, where `base` is the PR-2 `nodePosition(node, progress, time)` result (including emergence entry ease + breathing drift) scaled to world units, and `offset` is the only thing interaction touches. `offset` chases a per-node **target** through a critically-damped spring (`k = 22`, `ζ = 0.96`, semi-implicit Euler):

- rest (no pointer): target 0 → the node returns home and sleeps (gated by `isSettled`).
- drag: target = clamped cursor pull; 1-hop neighbours get `target · dragNeighborPull (0.06)` so the network feels connected without being hauled.
- neighbour pull is decayed by the same spring as everything else — release never snaps, it *falls*.

The interaction offset is the **only** mutation; the organic positions and the scroll arc are never re-derived.

## G. Phase gating

`interactionModeAtProgress(progress)` derives the mode from the phase the progress is in:

| Phase | window | mode | allowed |
|---|---|---|---|
| `intro` | 0.00–0.15 | `none` | nothing |
| `emergence` | 0.15–0.35 | `passive` | cursor field only |
| `interaction` | 0.35–0.55 | `full` | hover, focus, drag, field |
| `convergence` | 0.55–0.78 | `full` | hover, focus, drag, field |
| `formation` | 0.78–0.92 | `full` | hover, focus, drag, field |
| `hold` | 0.92–0.96 | `full` | hover, focus, drag, field |
| `exit` | 0.96–1.00 | `maintain` | freeze current emphasis; no new presses |

`isNodeInteractive` further gates a node to `alpha > 0.02` and mode ∈ {`full`, `maintain`}; `mayGrabAtMode` allows new presses only in `full`. Nothing is ever interactive while the constellation is still dark.

## H. Pointer transport & scroll arbitration

- Listeners live **only** on the canvas element inside `GraphInteraction.tsx` (`pointerdown/move/up/cancel/leave`, all `{ passive: true }`, cleanup on unmount) — GraphScene.tsx stays listener-free for PR-2 §I.
- Desktop cursor is the PR-1 window sampler (`handle.pointer`, 2×/frame DOM reads) projected to world; coarse cursors are painted by the events themselves (and mirrored into `handle.pointer` so the badge stays a single source of truth).
- Press: pointerdown re-checks the world position, `setPointerCapture` after a confirmed hit. Drag: promoted only after `dragExceedsThreshold` (4 px desktop / 7 px coarse) — the travel budget that makes scroll-vs-drag decide on **velocity** instead of blocking the scroll.
- `pointercancel`: the browser took the gesture back; drag is dropped, any drag-introduced focus clears, springs settle — a scroll always wins. Multi-touch tracks only the first pointer id.

## I. Hit testing & radii

`findNodeAt` is a plain O(N) world-distance scan against per-node radii — no Raycaster, no picking cost:

- press radius `hitRadiusFor(coarse, r) = max(floor, r · ratio)` — desktop floor 0.16 / ratio 1.7; coarse floor 0.24 / ratio 2.6 so a thumb lands where a 2px cursor wouldn't.
- hover radius `max(hitRadiusFor, hoverRadiusWorld 0.34)` (desktop only).
- nearest hit within radius wins; invisible nodes (`alpha ≤ 0.02`) can never be hit.

## J. Hover & focus vocabulary

- Hover: fades in/out with a 0.12 s half-life, re-applies the **same tier shape at half intensity** (`hoverStrength · 0.5`), so sweeping the network lights the travelled neighbourhood without stealing a persistent focus.
- Focus: tap/click toggles (`toggleFocus` — re-tapping clears; empty-space press clears); fades at 0.18 s half-life so it never pops on/off. Focus scrolls into `exit` as `maintain` — the emphasis stays until the user walks away, then releases itself on settle.
- Labels follow the focused node’s tier: `labelVisible = labelAlpha · (1 + lift·focusStrength)` with lift 0.9 focused / 0.45 neighbour.

## K. Drag & settle physics

- One spring per axis, `stiffness 22 · ζ 0.96` (critically damped, faint inertial overshoot, never oscillates).
- Soft world box: rendered position may approach `±(halfExtent − 0.55)`; past the wall the pull tapers at 12% so an aggressive fling overshoots slightly then bleeds off instead of snapping or escaping.
- Focus set at drag start persists through the settle and auto-releases once `isSettled` (positions + velocities all `< 0.012`) — the camera and label layer align to the freed node.

## L. Node emphasis model

`brighten = emergenceRamp + emission`, `scale = emergenceGrow · nodeScale`:

| tier | emission | scale |
|---|---|---|
| focused | +0.50 | 1.08 (1.22 while dragged) |
| neighbour1 | +0.30 | 1 |
| neighbour2 | +0.12 | 1 |
| rest | −0.12 (dims) | 1 |

Hover reuses the same tiers at 0.5×; the cursor field adds `up to +0.09` on top for any node within its 0.55-world-unit ring. Colors still lerp in sRGB and convert once to linear for the renderer — dimmed rest nodes stay pixel-identical to the `#0a0908` backdrop.

## M. Edge response

`edgeMult = 1 + incidentFocus·0.55·focusStrength + incidentHover·0.28·hoverStrength + cursorLiftEdge(≤0.08)` on top of the edge's emergence alpha. Edge buffer slots now read `view.nodeWorldX/Y` per frame, so edges **follow the dragged node** naturally — the network stays attached to its points.

## N. Cursor field (passive phase)

`cursorLift(d) = 1 − d/radius` within `cursorFieldRadiusWorld 0.55`. During `emergence` this is the **only** emphasis that exists — nodes already easing into place warm slightly near the pointer, and nothing else responds until `interaction`. It shares the same emission channel as focus/hover, so there is one unified brightness model.

## O. Reduced motion

- `useFrame` returns immediately in reduced motion (no spring loop, no drift — `nodePosition` static as in PR-2); the controller's compute *is* the release defence: offsets/velocities are forced to 0.
- Tap-to-focus becomes **static**: `focusStrength` is 0 or 1 (no fades), no hover, no drag, no cursor field (`hoverTarget` locked to 0).
- Re-bake contract: focus changes bump `view.focusRevision`; `NodeField`/`EdgeField` (and the controller bake) re-run on `[world, view.focusRevision]`, so a reduced tap re-paints emphasis through a **single discrete React re-render**, never a frame source. Restrained emphasis: focused emission 0.30, scale 1.06, incident edges +0.55 only at full strength.

## P. Mobile strategy

Coarse targets (floor 0.24, ratio 2.6), a 7 px drag inertia, tap-to-focus (`toggleFocus`), and drag-after-threshold. The cursor *field* and hover remain desktop-only (the PR-1 sampler is guard-gated to non-coarse); mobile interaction travels through the enriched press target + drag, which is exactly how a finger can feel a network with no hover at all.

## Q. Label integration

With `nodePosition` folded into the controller, labels follow the *rendered* (interaction-inclusive) positions — a label stays glued to its node mid-drag — and get the tier lift above. `labelDirty` is still set per frame; the DOM layer cadence (120 ms) and `aria-hidden` rules are unchanged.

## R. Performance decisions

- **Single compute owner**: `GraphInteraction` is mounted first, so its `useFrame` (base positions → drag targets → springs → fades → hit → emphasis → labels) always runs before the renderer readers; the whole constellation is one sweep over preallocated typed arrays.
- Renderers removed their per-node maths (`nodePosition`, `nodeAlpha`, `writeLabelPose`) — they only transpose the view buffers into instance matrices / vertex colors, so the total frame work is *less* than PR-2's split arithmetic.
- No per-frame allocations anywhere: working base/target buffers, drag state, and `findNodeAt` live on refs; no Raycaster; no gsap; no React state in the loop (`setRevision` fires only on focus-affecting events for the reduced re-bake).
- One interaction runtime per bundle/tier (`createCinematicGraphInteraction`), zero cost when the tier is null.

## S. Cleanup & ownership

- `GraphInteraction` owns its canvas listeners and removes them on unmount; its drag/working buffers are refs with no external subscriptions.
- Renderers keep their PR-2 disposal (textures/materials); the interaction view is a plain object the scene and overlay share — the debug overlay is a 200 ms poller, the controller the sole writer, per the same reader/writer split the pose view already used.

## T. Tests (46, all passing)

1–2 phase gating (every phase + progress bands); 3–4 pressability + grab gates; 5–9 adjacency layout (symmetric maps, flattened list length = 2×edges, map↔flattened agreement per node, two-hop correctness, `areNeighbors`); 10–11 structural tiering (focused/neighbour1/neighbour2/rest, absent-focus guard); 12–14 radii (floors, coarse ≥ fine, hover ≥ max(hit, ring)); 15–17 drag threshold + soft clamp (in-bounds identity, taper geometry, aggressive-drag wall behaviour); 18–21 `findNodeAt` (nearest-wins, out-of-range −1, invisible-skip, mode gating); 22–23 cursor lift (centre→edge falloff, degenerate radius); 24–31 node emphasis (tier ordering, focus-fade scaling, hover half-intensity, drag force scale, hover scale, cursor lift on top, reduced variants, rest-night dimming); 32–34 edge emphasis (focus brightening, hover+cursor compounding, reduced only-at-full-strength); 35–38 fades + spring (half-life exact, settle-from-displacement, chase-a-moving-target, `isSettled`); 39 focus toggle; 40–42 runtime shape (buffer lengths + defaults, coarse verbatim, layout consistency); 43–46 source-level controller guards (passive-only listeners + no `preventDefault`/touch listeners, one controller + listener-free GraphScene, frame-loop usage, reduced re-bake wiring).

Cinematic regression: `cinematic-foundation.test.ts` (20) + `cinematic-foundation.test.tsx` (12) + `cinematic-graph.test.ts` (26) + `cinematic-interaction.test.ts` (46) = **104/104**. Full web suite **1359/1359**.

## U. Checks

- `pnpm --filter @indago/web typecheck` — EXIT=0.
- `pnpm --filter @indago/web run test` — 117 files / 1359 tests green.
- `pnpm --filter @indago/web run build` — production build green; Home `/` 298 kB first-load (PR-2: 294 kB; pure module + controller +4 kB, no new runtime dependency).

## V. Manual verification (limitations)

Automated browser E2E is not available (jsdom-only; no Playwright). Manual pass under `?cinematicDebug=1` (watch the `interaction` row flip `none → passive → full → maintain` and hover/focus/drag ids light up):

- **1440×900 / 1920×1080**: hover sweeps the neighbourhood (tier lift at half intensity), click focuses with a 2-hop glow + incident-edge brightening, drag any node and feel the soft wall + settle on release, drag-focus auto-clears once home.
- **Drag-vs-scroll**: mid-drag, wheel/scroll the page — the browser wins (`pointercancel`), emissions fade cleanly and the node springs home, never a stuck node.
- **390×844 / 430×932 touch**: tap to focus (thumb-sized targets), drag after a 7 px intent, tap-again/empty-press to clear.
- **OS `prefers-reduced-motion`**: fully static constellation; tapping a node flips a restrained static focus instantly; no fades, no motion, no cursor field.

Exiting-scroll expectation: interaction freezes (`maintain`) through the final `exit` phase and the scene hands back to the pure PR-2 arc — the preparative next chapter stays untouched by this deliverable.