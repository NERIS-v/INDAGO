# PR-4 — Cinematic Home · Organic Evidence Graph · "I" formation

**Status:** DELIVERED. The deterministic evidence constellation from PR-2 reorganizes into the letter **"I"** using the **same runtime nodes and edges** — there is no second particle/text system, no font geometry, no fade-out, no crossfade. Every node keeps its identity and simply re-positions `organicPosition → ITargetPosition` inside the existing `formation` scroll phase (0.78–0.92 of the PR-1 contract); the whole transformation is derived from `handle.progress`, so scrubbing backwards returns the graph smoothly to its organic arrangement, and a stable hold carries the letter through the `hold` phase (0.92–0.96). The PR-3 interaction rides on top the entire time and hands the spotlight back to the sculpture as the I completes; reduced motion jumps straight to a **static, final, pixel-still I**. New suite: **`tests/cinematic-formation.test.ts` (27 tests) — all passing**. Regression: cinematic suites **131/131** (104 prior + 27), full web suite **118 files / 1386 tests / 1386 passed** (includes a one-line de-flake of the untouched PR-18 case-4 drag/focus race); `pnpm --filter @indago/web typecheck` **EXIT=0**; production `next build` green (Home `/` 300 kB first-load JS, +2 kB over the PR-3 baseline from the pure formation module + controller reads).

---

## A. Scope & Goal

PR-4 is the **fourth cinematic act** of the Home page: PR-2 delivered a deterministic constellation, PR-3 let the pointer touch it, PR-4 turns the same scene into a deliberate **letter shape before the curtain**.

- **One identity, one topology.** Node identity is never re-derived: `rendered = formationBlend(rest → target) · worldScale + fading organic drift + interaction offset`. The I is the *same nodes* standing in a new formation, not a fresh drawing.
- **Scroll-scrubbed, fully reversible.** No timeline, no keyframes, no gsap: the formation is a pure function of the existing `handle.progress` inside the existing `formation` phase. Scrub forward → the letter assembles; scrub back → every node returns along the same curved (but reversible) path.
- **Interaction stays honest.** Hover/focus/drag keep their PR-3 vocabulary through the formation; `interactionInfluence = 1 − formationVisual` eases the emphasis to zero as the letter completes and a faint uniform glow (`formationGlow 0.04`) lifts clarity. Drag-release mid-formation lands on the *current* target because the base *is* the formation blend.
- **Deterministic to the seed.** One seeded stream (`mulberry32(seed ^ 0x9e3779b9)`) with a fixed consumption order drives targets, roles, stagger, jitter and trajectory curvature. The same bundle always yields a byte-identical I — testable without a browser.
- **Reduced motion = a static I.** `prefers-reduced-motion` renders the final letter directly: no per-node choreography, no curve, no drift, no fades; interaction stays the PR-3 static tap-to-focus on top of the finished shape.

## B. Frozen Contract (untouched by this deliverable)

- One `ScrollTrigger` (in `useCinematicScene`), one `<Canvas>` (`CinematicStage`), one camera, one `handle.progress` — the PR-2 §I guards still pass (GraphScene.tsx has **no** `addEventListener`, no `gsap`, no `ScrollTrigger`).
- **Topology is immutable**: the PR-2 `CinematicGraphBundle` node/edge IdentitySet for a tier is byte-identical before and after PR-4. No node added, removed or re-typed; no edge rewired.
- The PR-2 renderer geometry strategy (instanced node mesh, seeded slot shuffle for edge draw-range, `EvidenceLabels`, DOM cadence, `aria-hidden` fiction labels) is preserved; only the per-frame *values* change.
- The PR-3 phase gating table is untouched — `interactionModeAtProgress` still reads the same contract phases; formation is *inside* the existing windows, never a new phase.
- `createCinematicGraphInteraction(bundle, boolean)` signature unchanged (the mobile profile is derived from `bundle.tier` internally).

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/components/home/cinematic/graph/cinematicGraph.formation.ts` | Pure, browser-free formation module: `formationProgressAt`, `formationVisual` (sub-phase choreography ease), `nodeFormationProgress` (per-node stagger), `formationBlend` (quadratic characteristic-curve with seeded perpendicular bend), `edgeFormationFactor`, `labelFormationFactor`, `formationAmbientScale`, `CINEMATIC_FORMATION_ROLE` / `formationRoleName`, and the deterministic `buildIFormationLayout(bundle, mobileProfile)`. No `Math.random`, no async, no gsap. |
| `packages/web/tests/cinematic-formation.test.ts` | **27 tests** — §A deterministic target generation, §B "I" geometry, §C scroll-window mapping + choreography, §D staging + trajectory, §E edge/label/ambient factors, §F drag-release-during-formation integration, §G source-level controller wiring guards. |

## D. Files Changed

- `packages/web/src/components/home/cinematic/graph/cinematicGraph.types.ts` — PR-4 type block: `CinematicFormationRole` (`"topCap" | "stem" | "bottomCap"`), `CinematicIFormationLayout` (target/role/stagger/curve typed arrays, extents, `edgeTargetLength`), and the mutable runtime fields on `CinematicGraphInteraction`: `formation`, `formationProgress`, `formationVisual`, `interactionInfluence`, `avgTargetError`.
- `packages/web/src/components/home/cinematic/graph/cinematicGraph.config.ts` — `CINEMATIC_GRAPH_FORMATION` (every geometry/pacing/staging number, unit-annotated), `CINEMATIC_GRAPH_FORMATION_CHOREOGRAPHY` (named sub-phase boundaries + movement paces), `CINEMATIC_GRAPH_FORMATION_CLASS_WEIGHT` (core→peripheral importance).
- `packages/web/src/components/home/cinematic/graph/cinematicGraph.progress.ts` — `nodeRestPosition(node, progress, reduced)`: the organic rest position **without** breathing drift (PR-2 `nodePosition` splits into rest + drift so formation can reuse the rest and fade the drift separately).
- `packages/web/src/components/home/cinematic/graph/cinematicGraph.interaction.ts` — `createCinematicGraphInteraction` now builds `formation = buildIFormationLayout(bundle, mobileProfile)` at construction; zero cost when the tier is null.
- `packages/web/src/components/home/cinematic/scenes/GraphInteraction.tsx` — the single compute owner: step 0 derives `fp`/`visual`/`interactionInfluence`/`ambientScale` per frame; step 1 writes base positions as formation-blended targets + fading ambient drift + normal emergence alpha; step 5 feeds `view.avgTargetError`; step 7 applies `emission·influence + glow` and `1 + (scale−1)·influence`; step 8 multiplies edge emphasis by `edgeFormationFactor`; step 9 scales `labelVisible` by `labelFormationFactor`. Reduced path is a single straight-lerp bake to the final I.
- `packages/web/src/components/home/cinematic/CinematicDebugOverlay.tsx` — `formation` and `iTarget` readout rows under `?cinematicDebug=1` (fp · visual · influence · avgTargetError; target count · extents · role spread).
- `packages/web/tests/pr18-graph-focus-lifecycle.test.tsx` — **one-line de-flake** (see U): case 4 now polls `await whenFocusHidden(container)` like sibling cases instead of asserting the aura flag synchronously after `whenMoving`. No behaviour changed; it removes a post-commit-effect race in the test itself.

## E. Files Removed / Intentionally Untouched

- Removed: none.
- Untouched: `GraphScene.tsx` (still the listener-free view-reader contract), `CinematicIntro` (its `graphEffectsFor` already constructs the interaction runtime, which now carries the formation), `CinematicStage`, `FoundationScene`, `CinematicScrollTrack`, `EvidenceLabels`, `useCinematicScene`, `cinematic.constants.ts` (phases read-only), Home/App shell, `d3-force` layout, everything outside `packages/web`.

## F. The formation contract

```
baseX = ( blend(rest → target, nodeProgress) + (pos − rest)·ambientScale ) · halfW
renderedX = baseX + interactionOffset            // PR-3 spring rides on top
```

- **Before** the `formation` phase: `formationProgressAt = 0`, → `blend t = 0` → every base equals the PR-2 organic rest; the scene is indistinguishable from PR-3.
- **Across** the phase: nodes walk their deterministic curved paths to the targets; the organic breathing drift (`pos − rest`) is scaled by `formationAmbientScale` and lands on exactly 0.
- **At/after** the end: `blend t = 1` → every node sits pixel-still on its exact target; `ambientScale = 0`; the I holds through `hold` and stays until the scroll reverses or the phase window ends.
- **Reversibility** is structural: the blend is a function of progress only (plus per-node constants), so scrubbing backward traverses the same path in reverse (tests verify the trajectory is literally reversible point-for-point).

## G. Scroll-window mapping

`formationProgressAt(progress)` derives the 0→1 window fraction from the **existing** contract phase (`CINEMATIC_PHASES` entry `formation`: 0.78→0.92) — no new phase, no duplicated constants (guarded: `cinematic.constants.ts` phases stay read-only). Linear by design: the choreography ease owns the pacing, never the scroll mapping. Reduced motion substitutes `fp = 1` — the window is a single static target.

## H. Choreography ease

`formationVisual(x)` integrates a **named sub-phase schedule** into one monotonic 0→1 curve with no bounce and no overshoot (clamped at 1):

| sub-phase | fraction of window | pace |
|---|---|---|
| preparation | 0.00–0.15 | 0.42 × |
| major structural push | 0.15–0.40 | 2.00 × |
| recognizable body | 0.40–0.70 | 1.00 × |
| fine alignment | 0.70–0.90 | 0.58 × |
| long final settle | 0.90–1.00 | 0.30 × |

The sub-phase boundaries live once in `CINEMATIC_GRAPH_FORMATION_CHOREOGRAPHY`; the ease starts at 0, ends exactly at 1, and the same curve drives node staging references (drift fade, edge fade, label fade, interaction handover, glow) so every cue is choreographed by one clock.

## I. Deterministic target generation

`buildIFormationLayout(bundle, mobileProfile)` — seeded stream `mulberry32(CINEMATIC_GRAPH_SEED ^ 0x9e3779b9)`, **fixed consumption order**:

1. **Importance** — one draw per node (node order): `classWeight × (0.85 + 0.3·noise)`; `CINEMATIC_GRAPH_FORMATION_CLASS_WEIGHT` = core 1 / bridge 0.9 / secondary 0.72 / peripheral 0.5. Sorted importance-desc with deterministic tie-breaks (priority, then index).
2. **Roles** — caps claim `round(n · 0.18)` nodes each (never starving the spine: total caps capped at `⌊(n−1)/2⌋`, stem ≥ 2, caps ≥ 1 each). End-first slot fill: the highest-importance nodes take the **cap endpoints**, then the stem's top and bottom extremes — the letter's silhouette is built from its anchors.
3. **Per-node detail** — two more draws each (node order): jitter, stagger-seed, curve-angle, curve-amount, then a final draw pair reused for positional jitter.

Same bundle ⇒ byte-identical targets/roles/stagger/curves/jitter/edge-lengths across loads and tiers.

## J. Composition geometry

A centred, tall, narrow I in the normalized ±1 layout space (mapped to world via `halfW`/`halfH`):

- **Top cap** above the tallest stem node, **bottom cap** below the lowest — clearance `capGap 0.028` exceeds `capBow 0.012 + jitter extremes` so serifs never touch the spine.
- **Stem** is a thin column around `centerX = 0` with `stemJitter 0.02` wander; vertical pitch `0.034` (desktop) → ~50% viewport height for the high tier; mobile profile **0.065** so the I dominates tall portrait frames.
- **Caps** span `capWidth 0.26` (desktop) / `0.30` (mobile) with a faint `capBow 0.012` rise at the outer ends — organic, never sterile (plus deterministic `jitter 0.006` on everything).
- Tested invariants: every node gets exactly one role; top/bottom caps clear the stem; mean stem |x| < 0.04, spread < 0.05; cap span > 1.5× stem span; all targets inside the fitted space (±0.65); height > 2.2× width; mobile comp is taller than high's.

## K. Per-node staging + trajectory

- `nodeFormationProgress(fp, start, reduced)` — each node waits `start = 0.1 + impNorm·0.6 + seed·0.12` of the window, then completes exactly at the end (`t = (fp − start)/(1 − start)`). Important nodes lead, seed fine-tunes.
- `formationBlend(ox, oy, tx, ty, t, cx, cy, curve)` — quadratic origin→target: hits `(ox,oy)` at t=0 and `(tx,ty)` at t=1 **exactly**; midpoint offsets `cx/cy` are a small seeded perpendicular bend (`0.01–0.05 · normal(origin→target)`, side by seeded sign) that straightens on arrival. The bend is deliberately subtle: paths keep a hint of organic life without wandering.
- With `curve=false` the blend is a pure straight morph (reduced motion). Curve-amount 0 collapses to a straight travel — tests confirm the quadratic is exactly the control-point midpoint construction and the path is reversible.

## L. Edge behavior in the letter

`edgeFormationFactor(visual, edgeTargetLength, reduced)` — edges whose endpoints sit **close together in the final I** stay legible (factor → 1); long crossing edges (slotted `edgeCharacteristicLength 0.3`, fade `edgeLongFade 0.55` via `smoothstep` at 0.5×/1.5×) fade subordinate as the letter completes: the network reads as **re-organized**, not spaghetti. The factor walks monotonically from 1 → target-legibility with `visual`, and is always 1 in reduced motion (calm static edges). Edges still follow their endpoints every frame (PR-3 behaviour), so a dragged node's edges track it mid-formation.

## M. Labels & ambient life

- `labelFormationFactor` fades the fiction labels toward hidden (`labelFade 1`) as the I completes — the sculpture carries the story un-labelled.
- `formationAmbientScale = (1 − visual)` (exponent 1) scales the PR-2 breathing drift to exactly 0 at full formation: the final I lands **pixel-still** on its targets (verified by `avgTargetError` → 0). Organic life fades exactly when the letter needs stillness.

## N. Interaction handover

- `interactionInfluence = 1 − visual` (1 before the phase, 0 at full formation). Emphasis per node: `emission = em.emission · influence + formationGlow(0.04)·visual`, `scale = 1 + (em.scale − 1)·influence` — hover/focus/drag still work through the formation, they just stop fighting the sculpture.
- **Drag-release mid-formation lands on the current target**: the base *is* the blend, so releasing during the phase lets the PR-3 spring settle the node onto whatever target the scroll has reached (test §F verifies `blend(···, t=1)` ≡ exact target and mid-formation positions ≡ blend + additive offset).
- `view.avgTargetError` (O(n), no allocation) reports mean world-distance from rendered base to target each frame — the debug readout, and ~0 once the I holds.

## O. Reduced motion

`prefers-reduced-motion` is a **single static bake of the final I**: controller forces `fp = 1` → every node sits straight-lerped onto its exact target in one commit; `visual = 1` (no choreography), no curve, no stagger, no drift (`ambientScale 0`), factors all return 1 (edges intact, labels intact at their calm values). The frame loop still returns early (PR-3); the reduced tap-to-focus remains instant/static per PR-3 O. A source guard asserts the reduced controller path contains **no** `setTimeout|setInterval|Promise`.

## P. Mobile strategy

`mobileProfile = tier === "mobile" || tier === "reduced-motion"` (decided inside `createCinematicGraphInteraction` from `bundle.tier` — no API change). The mobile profile widens `stemPitch` to 0.065 and `capWidth` to 0.30 so the letter dominates tall portrait viewports; interaction stays the PR-3 coarse vocabulary (thumb targets, 7 px drag inertia, tap-to-focus).

## Q. Relation to the PR-3 phase gate

The PR-3 `interactionModeAtProgress` table is **unchanged**; formation is an overlay *within* the existing `formation`/`hold` windows (still mode `full`), and the `exit` window still freezes emphasis in `maintain`. Because the formation is progress-derived inside those windows, the two systems compose without new states: interaction delegates authority to the I through `interactionInfluence`, and neither phase gating nor the spring pipeline knows a new mode exists.

## R. Performance decisions

- **One compute owner, zero new loops beyond the existing passes**: formation reuses the PR-3 per-frame sweeps (base → drag → springs → fades → emphasis → labels). Step 0 adds one fraction + one ease + one influence = O(1); step 1 reuses the existing node loop with a blend instead of a bare rest; `avgTargetError` is a single extra O(n) accumulator.
- **Preallocated typed arrays only** (`Float32Array`/`Uint8Array`/`Float64Array`) — targets, roles, stagger, curves, edge-lengths are computed once per bundle in `buildIFormationLayout`; the frame loop allocates nothing.
- **No Raycaster, no gsap, no timers in the loop**, no React state per frame; reduced motion pays for the bake once and not at all per frame.
- The formation module is a pure function of (bundle, progress) — identical cost whether the tier is null or reduced.

## S. Cleanup & ownership

`GraphInteraction` remains the sole frame writer; the renderers remain readers and keep their PR-2 disposal (textures/materials). The formation layout is plain typed data owned by the interaction runtime — the debug overlay is a 200 ms poller that never writes. No subscriptions are added or leaked.

## T. Tests (27, all passing)

1 determinism (byte-identical targets/roles/stagger/curves per tier, twice); 2 array alignment + finiteness per tier; 3 role coverage (no orphans, caps ≥ 1 each, stem ≥ 2); 4 role-name mapping; 5 caps clear the stem top/bottom; 6 stem centred + thin; 7 cap span > 1.5× stem span; 8 composition inside fitted space + height > 2.2× width; 9 mobile taller than desktop; 10 stagger spread deterministic; 11 `formationProgressAt` window map (0/0.5/1/clamps); 12 choreography ease monotonic 0→1, no overshoot; 13 stagger waits-then-completes; 14 reduced ignores stagger (single linear ramp); 15 t=0 organic / t=1 exact target per tier; 16 straight morph exact lerp; 17 trajectory reversible point-for-point; 18 bend subtle (0 < bend < 0.15); 19 edges 1 before, subordinate after, short intact, long ≥ `1 − edgeLongFade`; 20 labels fade to 0 at 1; 21 ambient scale 1→0; 22 reduced keeps calm cues; 23 rendered = blend + additive offset (integration); 24 release mid-formation settles on exact current target; 25–27 controller wiring guards (formation helpers + `view.interactionInfluence` present; `nodeWorldX[i] = baseX[i]! + view.offsetX[i]!` additive contract; reduced = static bake, no `setTimeout|setInterval|Promise`).

Cinematic regression: foundation (20) + foundation.tsx (12) + graph (26) + interaction (46) + formation (27) = **131/131**. Full web suite **1386/1386** across **118 files**.

## U. Checks

- `pnpm --filter @indago/web typecheck` — EXIT=0.
- `pnpm --filter @indago/web run test` — 118 files / 1386 tests green (full run ~163 s).
- `pnpm --filter @indago/web run build` — production build green; Home `/` 300 kB first-load (PR-3: 298 kB; pure formation module + controller reads +2 kB, no new runtime dependency).
- **Unrelated flake fixed while confirming regression:** `tests/pr18-graph-focus-lifecycle.test.tsx` case 4 asserted `[data-focus-aura='hidden']` synchronously after `whenMoving`, racing the post-commit `useEffect` that clears `focusAuraOn` (the dashboard graph, zero cinematic imports — reproduced in isolation, passed alone, failed under load). One-line fix: `await whenFocusHidden(container)` before the assertion, matching cases 3/5. Now 17/17 deterministic.

## V. Manual verification (limitations)

Automated browser E2E is not available (jsdom-only; no Playwright). Manual pass under `?cinematicDebug=1` (watch the `formation` row climb `fp 0 → 1 · visual → 1 · inf → 0 · avgTargetError → 0` and the `iTarget` extents):

- **1440×900 / 1920×1080**: scroll to ~78% — nodes begin their staggered curved walk; by 92% the graph is a clean centred I (wide serifs, thin spine); the hold holds pixel-still; scrub back and each node returns along its path to the organic arrangement.
- **Mid-formation drag**: grab a node during the walk — releases land on the letter's *current* target and the spring settles there, not back in the organic residue; emphasis fades as the I completes so hover/focus never fight the sculpture.
- **390×844 / 430×932 touch**: the I fills the tall frame (wider stem pitch); tap/drag work through the formation as in PR-3.
- **OS `prefers-reduced-motion`**: a single static, centred, calm I on load — no choreography, no fades, no drift; tap-to-focus is instant and restrained.

Exiting-scroll expectation: the I holds through `hold`, freezes through `exit` (`maintain`), and the handoff to the preparative next chapter stays untouched by this deliverable.