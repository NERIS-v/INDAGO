# F-PR6 — Living Investigative Graph Visual Language (Entity Pulse + Graph Visual Language)

**Status:** DELIVERED — both PR-6 visual-language deliverables are green after the **F-PR6 corrective pass** (Part 1 re-grounded as a multi-entity Entity Pulse; Part 2 unchanged). Web typecheck EXIT=0 and build EXIT=0; regression **58 files / 620 tests, 619 passed** (the single excluded failure is the parallel PR-6 timeline workstream's in-progress `pr6-timeline-default-scope.test.tsx`, which renders `TimelinePanel` directly — no F-PR6 code executes in it). The Zone 2 graph surface now speaks the PR-6 living visual language through two deterministic, honest representations of the *same canonical provider data*: **Entity Pulse** (Part 1 — the multi-entity radial-field deliverable) and the **Graph Visual Language** `data-graph-*` state contract (Part 2 — derived posture/role/attention rendered on the graph surface). No invented risk, ranking, or score is ever produced by either.

---

# Part 1 — Entity Pulse (parallel F-PR6 deliverable, corrective pass)

**Scope note:** this part is the Entity Pulse deliverable of PR-6, produced in parallel on the same branch. Following the corrective pass, the Zone 2 graph surface hosts a second representation — **Entity Pulse** — as a deterministic, continuously-deformable **multi-entity** radial view driven exclusively by canonical provider data filtered through the shared workspace `timeRange`. Every entity gets its own identifiable, selectable, enclosed field; the shown set is a bounded deterministic subset (cap 6). It is the first deliverable of PR-6's "Living Investigative Graph Visual Language": the same canonical graph data is rendered through a visual language — a set of continuous, deformable, honest representations.

## A. Scope & Goal

PR-6 changes how the Zone 2 graph surface *speaks*: instead of a single static physics layout, the same canonical graph data is rendered through a **visual language** — a set of continuous, deformable, honest representations. Entity Pulse is delivered as the `"pulse"` branch of the existing `activeNetworkView` workspace-state seam (`"graph" | "pulse" | "matrix" | "flow"`), holding `"graph"` as the default and rendering the pulse **only** when the capability seam resolves it as available in the effective mode (DEMO / AUTO-demo). LIVE workspaces receive the honest typed "not yet available" pane — never a fabricated visualization.

Following the corrective pass, the pulse is a **multi-entity field family**: one smooth closed SVG contour per entity (96 samples, Catmull-Rom) whose perimeter expresses that entity's observed activity within the selected temporal window, plus an inner salience halo derived strictly from the canonical `structuralImportance` node attribute. Stale topics/other entities are excluded by a bounded deterministic scope (cap `PULSE_MAX_TOPIC_ENTITIES = 6`, salience-ordered). There are **no radial bars, no histograms, no fake risk/relevance scores**. Category colors (financial / communication / location / identity / cross-case / other) communicate *what kind* of activity sits at a lobe, not how strong it is. The shared `timeRange` is the only temporal controller; the shell's five zones adapt via a typed presentation model.

## B. Frozen Contract (untouched by the Entity Pulse deliverable)

- PR-0/1/2/3/4/5 render contracts — five-zone Control Center shell **geometry** (fixed by the corrective pass; only zone *content* adapts per representation through `presentationFor`), `data-slot`/`data-capability` seams, rail action model, PR-3 `InvestigativeContext` bridge + `revealContext`, PR-4 operational rail, PR-5 Investigative Intelligence tabs (including `intelligence-signals.tsx`).
- Graph engine — `graph-canvas.tsx`, `graph-panel.tsx`, `use-graph-layout.ts`, D3 physics, selection, temporal filtering, cross-case layers. The pulse never touches these; it reads the same providers and calls the same `onSelectContext` (`revealContext`) the graph calls.
- All provider interfaces in `lib/providers/types.ts`, demo/live provider bundles, `getDataModeConfig`, `ProviderError` codes, `WorkspaceProvider`.
- The `NetworkWorkspace` state seam (`activeNetworkView`, `timeRange`, `focusEntityId` + setters, URL sync) — annexed, not modified.
- Parent workspace nav: label is **Network** (F-PR6 corrective pass), route `/investigations/[id]/graph` unchanged.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/network/pulse/pulse-model.ts` | **Pure, deterministic geometry module** (no React, no provider imports — source-guard safe). Corrective-pass rewrite: `buildEntityPulseOverview(input)` returns `EntityPulseOverview` with an `entities` array of `EntityPulseField` (per-entity label/category/salience/activity counts/strength/`outerSamples[96]`/`innerSamples[96]`), `entityNodeCount`, window/full observation counts, `concentrationPct`, `windowLabel "selected window" \| "full timeline"`, dominant category, `strongest`, `mostChanged`, sparse `markers[]`, `capped`, deterministic `summary`. Also exports `PulseCategory` + `PULSE_CATEGORIES` / `PULSE_CATEGORY_LABELS` / `PULSE_CATEGORY_COLORS`, `observationTypeToCategory` (`COMMUNICATION→communication`, `FINANCIAL→financial`, `SPATIAL→location`, `IDENTITY→identity`, everything else → `other`), `stableHash` (FNV-1a, no `Math.random`), `observationInTimeRange` (untimed in-range, `null` window unbound), `closedRadialPath` (closed Catmull-Rom with angle-convention fix) and the per-entity geometry above. Corrective fixes: calm → `dominantCategory: null`; honest plural narration; truthful "top 6 by structural salience" cap wording. |
| `packages/web/src/lib/network/pulse/use-entity-pulse.ts` | **Client hook (added in the corrective pass)** — shell-owned single source of scene data: fetch nodes/observations/contradictions/candidates/foreign overlays once when the pulse representation is active (strictly gated; graph mode never fetches), derive the overview, expose typed `idle\|loading\|ready\|error`. Every supporting zone consumes the SAME overview. |
| `packages/web/src/lib/network/representations.ts` | **Typed presentation model (added in the corrective pass)** — `GRAPH_PRESENTATION` / `PULSE_PRESENTATION` / `NOT_READY_PRESENTATION` and `presentationFor(view, pulseServed)` resolve zone content per representation (rail / zone-2 / context / temporal-note / intelligence adapter). |
| `packages/web/src/components/graph/control-center/pulse/pulse-panel.tsx` | Client `PulsePanel` (corrective-pass rewrite). Multi-entity card grid (per-entity glyph, label, category, in-window + total counts, `data-pulse-*` hooks) + prominent focus card. SELECT via `{ kind: "entity", id, source: "graph" }` on the canonical `revealContext` bridge; `aria-pressed` highlight; focused entity prominent, others de-emphasized but never removed. Shared 320ms ease-out morph on `timeRange` — instant under `prefers-reduced-motion` and in jsdom. Markers with `<title>`, `role="img"` glyph narration, `role="status"` `aria-live="polite"` textual equivalent, legend, "Shown: n of m entities (overview cap 6)". |
| `packages/web/src/components/graph/control-center/pulse/pulse-glyph.tsx` | **Added in the corrective pass** — memoized per-entity `PulseGlyph` (perimeter + halo + category segments), `data-pulse-entity` / `data-pulse-sample-count="96"` / `data-pulse-entity-category` hooks. |
| `packages/web/src/components/graph/control-center/pulse/pulse-rail.tsx` | **Added in the corrective pass** — Zone 1 ops rail (Open in Graph / clear selection = real actions) + data-backed overview stats (entities shown, observations in window, dominant activity, window concentration). |
| `packages/web/src/components/graph/control-center/pulse/pulse-context-summary.tsx` | **Added in the corrective pass** — Zone 3 context (selected-entity field details + Open in Graph; unselected → overview + SELECT≠FOCUS note). |
| `packages/web/src/components/graph/control-center/pulse/pulse-temporal-note.tsx` | **Added in the corrective pass** — Zone 4 window facts above the unchanged `TimelinePanel` (window label · count · concentration; most active; most-changed). |
| `packages/web/src/components/graph/control-center/pulse/pulse-intelligence-insight.tsx` | **Added in the corrective pass** — Zone 5 additive insight (overview summary + markers) inside the Overview tab via `adapterSlot`. |
| `packages/web/src/components/graph/control-center/representation-switcher.tsx` | Floating Zone 2 pill (`Network / Graph / Pulse / Matrix / Flow` eyebrow = NETWORK), disabled-with-title for `not-ready` views, `aria-pressed` active state. `data-testid="representation-switcher"`. |
| `packages/web/tests/pulse-model.test.ts` | **28 pure tests** (corrective pass) — determinism (identical fields, no `Math.random`), 96 samples / finite / bounded / closed path per entity, degenerate input, calm when no observations (`dominantCategory: null`), shared `timeRange` recompute (Jan-2024 → only OBS_7, strongest = bank, concentration 11%), category mapping + dominant-per-entity tagging, salience halo from `structuralImportance` (+ `salienceAvailable=false` when absent), top-K cap (6) + truthful narration, sparse markers (contradiction + identity-resolution on `ENT_VICTOR`, cross-case unanchored), time-range predicate edges, most-changed narrator. |
| `packages/web/tests/pulse-panel.test.tsx` | **8 tests** (corrective pass) — multi-entity card set/order (bank leads), per-card `data-pulse-*` hooks, SELECT forwarding `source:"graph"` via the bridge, `aria-pressed` highlight (SELECT ≠ FOCUS), prominent focus card + Open in Graph delegation, no Open in Graph when unwired, loading/error honesty, `role="status"` textual equivalent + glyph `role="img"`, markers from the provider registry. |
| `packages/web/tests/representations.test.ts` | **4 tests (added in the corrective pass)** — GRAPH / PULSE / NOT_READY presentations and `presentationFor` for matrix/flow/pulse-live. |

## D. Files Changed

- `packages/web/src/lib/providers/capabilities.ts` — `"network.pulse"` availability in the **capability table** flipped `{ demo: false, live: false }` → `{ demo: true, live: false }` (from the original F-PR6 deliverable). LIVE serving stays typed-unsupported (never fabricated).
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — (original deliverable) additive `onNetworkViewChange` prop + availability map surfaced to the switcher; (corrective pass) a typed `presentation = presentationFor(view, pulseServed)` memo and ONE shell-owned `useEntityPulseAnalysis` hook, with every zone rendering content by the presentation model: Zone 1 → `PulseRail` / `OperationalRail`, Zone 2 → `PulsePanel` / `GraphPanel` / honest typed not-ready pane, Zone 3 → `PulseContextSummary` / `ContextualPanel`, Zone 4 → `PulseTemporalNote` strip above the unchanged `TimelinePanel`, Zone 5 → additive `PulseIntelligenceInsight` adapter slot. "Open in Graph" = view switch + select + `focusRequest` + `onFocusEntityChange`.
- `packages/web/src/components/graph/control-center/investigative-intelligence.tsx` — (corrective pass) purely additive `adapterSlot?: ReactNode`, rendered only inside the Overview tab wrapper when present (graph behavior unchanged).
- `packages/web/src/components/graph/control-center/representation-switcher.tsx` — (corrective pass) NETWORK eyebrow + Graph/Pulse/Matrix/Flow labels with `aria-pressed` active state.
- `packages/web/src/lib/workspace/nav.ts` — (corrective pass) parent label **Graph → Network**; href unchanged.
- `packages/web/src/app/investigations/[id]/graph/page.tsx` — passes `activeNetworkView` + `setActiveNetworkView` from `useNetworkWorkspace()` (view survives refresh and back/forward via existing URL sync) (original deliverable, unchanged by the corrective pass).
- `packages/web/tests/capabilities.test.ts` — pulse assertions updated to demo in AUTO / not-ready in explicit live (original deliverable).
- `packages/web/tests/pr5-auto-capability.test.ts` — AUTO-resolved status for pulse is `"demo"` (original); corrective pass added the live `network.pulse === "not-ready"` assertion.
- `packages/web/tests/pr5-representation.test.tsx` — corrective-pass rework: mock-free shell suite (10 tests) — default graph canvas + five-zone shell, pulse zone-2 with real multi-entity panel, honest not-ready for matrix/flow (no fake visualization), switcher labels/interaction, zone adaptation per representation (pulse rail / untouched shell geometry / temporal-note / intelligence insight), SHARED timeRange driving both zones (Jan-2024 → 1 of 9, 11%), pulse SELECT opening the pulse context zone, graph mode leaking no pulse artefacts, not-ready keeping graph railed zones.
- `packages/web/tests/pr1-navigation-dock.test.tsx`, `packages/web/tests/pr1-provider-boundary.test.ts` — (corrective pass) parent label assertion **Graph→Network** (href-based assertions unchanged).

## E. Files Removed

`buildPulseFrame` / `topics` geometry API and the single-giant-circle panel were replaced by the multi-entity model (`buildEntityPulseOverview`) and the per-entity card panel (grep-verified no references remain). `"matrix"` and `"flow"` remain declared-but-not-ready; the pulse mounts beside the graph in the existing Zone 2 slot.

## F. Files Intentionally Untouched (scope discipline)

- `graph-canvas.tsx`, `graph-panel.tsx`, `use-graph-layout.ts`, D3 physics, selection, temporal filtering, cross-case layers (the Graph Visual Language part of PR-6).
- Demo/Live providers and fixture databases — consumed through the seams only; `pulse-model.ts` carries **no** demo/live/fixture imports (source-guard safe) and the pulse hook only ever sees provider data through `useWorkspace()`.
- `operational-rail.tsx`, `contextual-panel.tsx`, `use-graph-live.ts`, Investigative Intelligence tabs (`intelligence-signals.tsx` is the Graph Visual Language part of PR-6); `investigative-intelligence.tsx` received only the purely additive `adapterSlot`.
- The five-zone **shell geometry** — `control-center-layout.tsx`, `controlCenterColumns`, `bottomBandHeightClass`, panel toggles; only zone *content* adapts through `presentationFor`.
- Parallel PR-6 timeline workstream's uncommitted WIP (`timeline-panel.tsx`, `capabilities.ts`, `page.tsx`, `pr6-timeline-default-scope.test.tsx`) — not modified by this part; the shell reads `activeTimeRange`/`restoredTimeRange` through the existing seam.
- No backend, contracts, intelligence, platform, or judge changes — the pulse is `packages/web/**` only.

## G. The honest-data thread

Every visual element of the pulse is either a canonical provider number or a pure function of one:

```
per-entity perimeter = raised-cosine lobes, one per in-window observation,
                       amplitude scaled by strength(field)/maxWindowStrength(field)
                       at a stableHash(nodeId | obsId) angle within [R_BASE, R_BASE + R_ACTIVITY_AMPLITUDE]
halo radius          = structuralImportance × PULSE_HALO_AMPLITUDE + PULSE_HALO_BASE
category colour      = dominant observation type of that entity's in-window set
contradiction marker = a real ObservationContradiction spanning a shared entity
identity-resolution = a real IntelligenceCandidateView whose right side resolves (left open)
cross-case marker    = a real ForeignCaseOverlay ([ref, caseId, title, bridgeSupport])
```

Marker labels narrate deterministic facts: `"1 observation in window"`, `"Intermediary Account 0093 — financial, communication."`. The `aria-live` summary says `Entity Pulse: N entities, M observations in full timeline/selected window. Most active: <label>.` and reports `"No dominant activity in this window."` when no entity carries in-window activity (`strongest === null` when calm). `concentrationPct` = `round(window/full × 100)` when the full timeline is non-empty (a null/whole timeline truthfully reports `100% of 9 total` with `windowLabel: "full timeline"`). No AI claim, risk score, or invented ranking is ever produced.

## H. Capability & representation honesty

| View | DEMO / AUTO-demo | LIVE (effective live) |
|---|---|---|
| Network (graph) | `demo` — unchanged | typed graph behavior |
| **Entity Pulse** | **`demo` — rendered** | `not-ready` — honest typed pane |
| Matrix / Flow | `not-ready` — honest typed pane | `not-ready` — honest typed pane |

Explicit-live configuration never silently serves demo pulse data; the typed resolution path is asserted by `tests/capabilities.test.ts` and `tests/pr5-auto-capability.test.ts`.

## I. Accessibility

- `aria-live="polite"` `role="status"` region carries the deterministic textual summary (color-independent understanding).
- Each entity glyph is an SVG `role="img"` with a deterministic `aria-label` naming the entity and its window/analytical-relevance facts; cards are real `<button aria-pressed>` (SELECT highlight). SELECT stays distinct from FOCUS: selection highlights via `aria-pressed`, a durable focus renders the prominent card, never the camera.
- Interactive markers translate into an `InvestigativeContext` (`{ kind: "entity", id, source: "graph" }`) so the graph-surface intent is re-materialized into the canonical selection bridge.
- `prefers-reduced-motion: reduce` → the 320 ms morph is skipped entirely (instant render); jsdom (no rAF/matchMedia/performance) falls back to the same instant path.
- Calm center: name/category only; no score readout.

## J. Test-context facts locked by the suite

- 96 samples per entity field; `data-pulse-sample-count="96"`, bounded/finite radii, closed path (`M…Z`), deterministic output for identical inputs.
- Full timeline: 9 observations, dominant category financial, strongest = Intermediary Account 0093 (`ENT_BANK`), 5/5 entities shown (no cap). Jan-2024 window: only OBS_7 (bank↔María, communication) in-range → strongest = bank, concentration `1/9 → 11%`.
- Markers: contradiction + identity-resolution anchored to the shared `ENT_VICTOR`; cross-case overlays unanchored.
- Legend renders only categories actually present in the used set (`categoriesUsed`).
- Corrective-pass suite counts: `tests/pulse-model.test.ts` 28, `tests/pulse-panel.test.tsx` 8, `tests/representations.test.ts` 4, `tests/pr5-representation.test.tsx` 10.

## K. Source guards

`pulse-model.ts` imports types only (source-guard safe); the pulse UI imports `useWorkspace`, UI primitives, the model, and provider *types*. Neither imports `providers/(demo|live)`, `demo-*fixtures`, or `create(WorkspaceDemo|Live)Providers` — the boundary documented in the module header comments.

## L. De-scoped (explicitly NOT in this part)

- Matrix and Flow representations (remain honest not-ready; PR-6 follow-ups).
- Any live implementation of the pulse (`{ demo: true, live: false }`).
- No animation beyond the requirement's restrained 320 ms ease-out morph; no perpetual motion.
- No changes to graph geometry, physics, the Investigative Intelligence panel behavior (adapterSlot is additive), or the five-zone shell geometry.

## M. Risks & residual

- jsdom lacks rAF/matchMedia/performance; the pulse glyph guards each and falls back to a render-instant `display` state, so the 320 ms morph is only exercised in real browsers (a controlled, low-risk gap — the morph is a pure ease between the same two deterministic frames).
- The two benign `act(...)` warnings during async loading under jsdom persist as before.
- The single excluded full-suite failure is the parallel PR-6 timeline workstream's uncommitted WIP (`pr6-timeline-default-scope.test.tsx`) — recorded, not fixed here.
- The Graph Visual Language part of PR-6 shares the same Zone 2 shell; boundaries are additive props + the presentation model, so merges are localized.

## N. Verification

```
packages/web tests         pnpm --filter @indago/web test → 58 files, 620 tests, 619 passed (1 excluded: PR-6 timeline WIP)
pulse files (corrective)   tests/pulse-model.test.ts → 28 passed; tests/pulse-panel.test.tsx → 8 passed
                           tests/representations.test.ts → 4 passed; tests/pr5-representation.test.tsx → 10 passed
typecheck (web)            pnpm --filter @indago/web typecheck → EXIT=0
build (web)                pnpm --filter @indago/web build → EXIT=0 (stale .next cache cleared before rebuild)
```

---

# Part 2 — Graph Visual Language (visual-state, canvas hooks, signals)

**Scope note:** this part is the Graph Visual Language deliverable of PR-6, produced in parallel on the same branch. Where the pulse is a *second* representation, this deliverable makes the *graph itself* speak: every node and edge on the existing D3 surface is hydrated from a deterministic, pure `deriveGraphVisualContext(graph, timeRange, focusSeed)` — posture, structural role, temporal state, scope, hypothesis relevance, evidence-in-scope, gap-affect and attention — surfaced through `data-graph-*` DOM hooks with zero invented data.

## A. Scope & Goal

PR-6's living visual language also means the canonical graph surface renders honest derived states, not just geometric layout. `deriveGraphVisualContext` is a **pure, deterministic module** (no React, no provider/fixture imports — source-guard safe) that computes, for every node and edge: visual posture (contradicted / supported / unresolved / cross-case), support band (strong / moderate / weak), temporal state (in-range / stale / untimed), structural role (bridge cut-vertex model), hypothesis relevance, evidence-in-scope, gap-affect (from `GraphHole`), and an attention level (0–3) with a convergence-region rule. `GraphCanvas` renders each value as `data-graph-*` DOM hooks; `GraphPanel` derives the context against the shared `timeRange` and current hypothesis `focusSeed`; `intelligence-signals.tsx` canonically re-exports the support-band constant so PR-5's threshold contract and PR-6's bands agree.

## B. Frozen Contract (untouched by this deliverable)

- PR-0/1/2/3/4/5 render contracts — the five-zone shell, `data-slot`/`data-capability` seams, rail, `InvestigativeContext` bridge, operational rail, Investigative Intelligence tabs.
- Graph engine geometry — D3 physics, layout, selection, temporal filtering, cross-case layers in `use-graph-layout.ts`; this deliverable only layers *state output* on top of the same `layoutNodes`/`layoutEdges` pass (index-aligned `nodeStateForId`/`edgeStateForId`).
- All provider interfaces, demo/live bundles, `getDataModeConfig`, `ProviderError` codes, `WorkspaceProvider`, and the `NetworkWorkspace` seam. The highlight: **no provider change, no new data field, no fixture edit** — every derived value is a pure function of canonical inputs already flowing through the `GraphProjection`.
- The Entity Pulse deliverable (Part 1 above) — `control-center/pulse/`, `lib/network/pulse/`, `representation-switcher.tsx`, and the shared `activeNetworkView` seam are owned by Part 1 and are untouched by this part.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/graph/graph-visual-state.ts` | **Pure, deterministic visual-language module** (no React, no provider/fixture imports). Exports: `WEAK_SUPPORT_BAND_THRESHOLD = 0.3`, `deriveSupportBand(support)` (`≥0.6` strong, `≥0.3` moderate, `<0.3` weak), `edgeIsGrounded(edge)` (observationCount ≥ 1 ∧ sourceCount ≥ 1 — contradicted is orthogonal, see G), per-node/per-edge posture, temporal, scope and hypothesis derivations, structural role (bridge via Tarjan cut-edge analysis over the **ACTIVE-only** topology; visible non-ACTIVE edges like a CONTRADICTED edge are excluded so they never structurally fragment the surface), evidence-in-scope, gap-affect (from `GraphHole`; `nodeIds` and `investigationGapId` carried, no top-level id), `deriveAttention` / region convergence, `nodeStateForId` / `edgeStateForId` (index-aligned to layout order), and the `deriveGraphVisualContext(graph, timeRange, focusSeed)` entry point. |
| `packages/web/tests/pr6-visual-state.test.ts` | **33 pure tests** — constants and grounding orthogonality (GE_5 contradicted AND grounded), support-band boundaries (0.6 → strong, 0.599 → moderate, 0.2 → weak), orthogonal posture truths (contradiction / support / temporal-unresolved / cross-case), temporal in-range/stale/untimed, structural-role **all-six-bridge** under the ACTIVE topology, `deriveSupportBandEdge2D`-style signal articulation, attention convergence (Victor+Witness weak-support+unresolved → ONE region; the two contradicted shells stay level 1 and NEVER form a region), filter no-contamination (a hidden CONTRADICTED edge leaves no stale contradiction signal), hypothesis relevance with incident-contradiction precedence, evidence-in-scope and gap/hole focus, interaction-free base context, projection hydration. |
| `packages/web/tests/pr6-living-graph.test.tsx` | **17 integration tests** against the real demo providers, `WorkspaceBoundary` + `GraphPanel`: baseline visual language (6 node + 6 edge state cards after load, bands/postures exact per the D–J facts), attention convergence through the panel (one region, `data-graph-attention-members` === `GN_VICTOR,GN_WITNESS`, members 2 / contradicted shells 1 / clean 0), interaction hydration (click select at attention 3 + incident-edge lighting, keyboard focus/blur, hover flag, `prefers-reduced-motion` connected-edge draw suppressed), filter honesty (hideContradicted drops GE_5 and every contradiction signal), hypothesis focus semantics (supporting/contradicting/null counts and edge owners exact), case-scope/gap-affect surfacing. |

## D. Files Changed

- `packages/web/src/components/graph/graph-canvas.tsx` — renders the derived context as DOM hooks: node `<g data-graph-node-state>` (JSON `{posture, role, temporal, scope, hypRel, evidenceInScope, gapAffected, attentionLevel}`) plus `data-graph-selected/-focused/-hovered`, `data-graph-case-scope`, `data-graph-attention-level`, `data-graph-node-posture` (contradiction ring), `data-graph-gap-affected` ring; edge `<g data-graph-edge-state>` (JSON `{band, posture, grounded, scope, temporal, hypRel, evidenceInScope, gapAffected, selected, attentionLevel}`) plus `data-graph-edge-grounded` (amber midpoint dot hidden on contradicted/foreign-bridge edges — rendering rule only, see G); new `#attention-layer` `g[data-graph-attention-region]` with `data-graph-attention-signals` (comma list) + `data-graph-attention-members` (sorted id join = region id) for the convergence region; slow-converge connected-edge animation guarded by `prefers-reduced-motion`; node/edge state hydration kept index-aligned with the existing layout pass.
- `packages/web/src/components/graph/graph-panel.tsx` — derives `visualContext = deriveGraphVisualContext(graph, timeRange, focusSeed)` against the shared workspace window and hypothesis focus seed; passes it into the canvas; runs the filtered edge set (`GraphFilterState { minSupport, hideContradicted }`) through the derivation so a hidden CONTRADICTED edge cannot contaminate attention or posture signals; forwards hypothesis `focusSeed` to the context effect.
- `packages/web/src/components/graph/control-center/intelligence/intelligence-signals.tsx` — canonically re-exports `WEAK_SUPPORT_THRESHOLD = WEAK_SUPPORT_BAND_THRESHOLD` (PR-5 asserts `=== 0.3`; PR-6 defines the source of truth).
- `packages/web/src/lib/graph/graph-visual-state.ts` was iterated to remove a now-dead `nodeIdToEntity` mapping during test-driven development (removed, unused).

## E. Files Removed

None. No dead exports remain in the module beyond the removed mapping above; PR-0–5 suites are untouched.

## F. Files Intentionally Untouched (scope discipline)

- `use-graph-layout.ts` and all D3 physics/selection/temporal/cross-case logic.
- The Entity Pulse deliverable (Part 1): `control-center/pulse/`, `lib/network/pulse/`, `representation-switcher.tsx`, `graph-control-center.tsx`, `page.tsx`, `capabilities.ts`, `pr5-auto-capability.test.ts`, `pr5-representation.test.tsx`.
- Demo/Live providers and fixture databases — the module imports *types* only and reads canonical `status/support/observationCount/sourceCount/answeredByIds/contradictedByIds/ForeignCaseOverlay/GraphHole` through the existing projection.
- `operational-rail.tsx`, `contextual-panel.tsx`, `use-graph-live.ts`.
- No backend, contracts, platform, or judge changes — this deliverable is `packages/web/**` only.

## G. The honest-data thread

Every visual state is a pure function of canonical provider numbers:

```
band          = deriveSupportBand(edge.support)                       // >=0.6 strong, >=0.3 moderate, else weak
grounded      = observationCount >= 1 && sourceCount >= 1            // ORTHOGONAL to status
posture       = contradicted when incident to a CONTRADICTED edge or ObservationContradiction set;
                else supported; unresolved on un-in-scope/untimed evidence; cross-case on foreign overlay
role          = Tarjan cut-vertex model over the ACTIVE-only topology  // visible non-ACTIVE edges excluded
hypothesis    = relevanceForNode/relevanceForEdge from Hypothesis.relatedEntityIds
                (incident CONTRADICTED relation reads "contradicting", else "supporting")
evidenceInScope / gapAffected = real GraphHole node membership           // no invented gaps
attention     = region rule below; 0–3, never a score
```

**Contradicted ≠ ungrounded (explicit):** GE_5 is `CONTRADICTED` with observationCount 2 and sourceCount 1 — it is honestly **grounded** (that evidence is exactly why the contradiction is visible). The state attribute reports `grounded: true`; the canvas hides the amber midpoint as a *rendering rule* on the contradicted edge. The integration suite locks both facts.

**Filter honesty (no contamination):** when `hideContradicted` hides GE_5, the derivation neither counts it in the topology nor emits its contradiction signal — attention falls back to the honest remaining surface, and the "filter never poisons the model" test asserts zero stale contradiction markers/regions.

**Attention convergence rule:** a signal-connected component becomes a **region** only when ≥2 distinct signal types converge there. In the demo, Victor (weak-support) + Witness (weak-support + unresolved) converge into the ONE region `{GN_VICTOR, GN_WITNESS}` (`data-graph-attention-members` = sorted join = region id); the two contradicted shells carry a single `contradiction`-type signal only, so they sit at attention 1 and never form a region. No invented risk score — attention is 3 selected / 2 in-region / 1 any-signal / 0 clean.

## H. Capability & representation honesty

| Part | DEMO / AUTO-demo | LIVE (effective live) |
|---|---|---|
| Part 1 Entity Pulse | `demo` — rendered | `not-ready` — honest typed pane |
| **Part 2 Graph Visual Language** | **`demo` — derived states rendered** | derived states rendered over typed live graph (shared derivation; no new capability) |
| Matrix / Flow | `not-ready` — honest typed pane | `not-ready` — honest typed pane |

Part 2 introduces no capability bit: it enriches the existing `"network.graph"` demo path. Matrix/Flow remain honest not-ready (PR-6 follow-ups).

## I. Accessibility

- Nodes are keyboard focusable: focus raises attention and a `data-graph-focused` flag; blur returns to baseline (locked by an integration test).
- `prefers-reduced-motion: reduce` suppresses the connected-edge draw animation entirely (tested: animates normally, never under reduce).
- Attention is expressed multiplicatively — level hooks + text-free DOM contract — never a numeric "score" readout to the user.
- Contradiction rings and gap rings use shape + `data-graph-*` state, never color alone.
- `arialabel`/title narration on markers mirrors the pulse's hard rule: labels narrate deterministic facts only.

## J. Test-context facts locked by the suite

- **All six demo nodes are `"bridge"`**: `deriveGraphVisualContext` computes structural role over the ACTIVE-only topology (GE_5 `CONTRADICTED` excluded), and every ACTIVE edge is a cut edge → all six endpoints bridge.
- **Support bands:** 5 strong (GE_1 .78, GE_2 .66, GE_3 .74, GE_4 .72, GE_5 .7) + 1 weak (GE_6 .2); `deriveSupportBand(0.6) === "strong"` (boundary inclusive at 0.6), 0.599 → moderate.
- **Postures:** edges 5 supported + 1 contradicted (GE_5); nodes 2 contradicted (Shell One, Shell Two) + 4 supported; grounded **6/6** (GE_5 honest). Attention: Victor/Witness 2 (region members), shells 1, clean nodes 0.
- **One attention region** with `data-graph-attention-members === "GN_VICTOR,GN_WITNESS"` (sorted join) and signal list (comma-separated); the two single-type contradicted shells never converge.
- **Hypothesis focus** with seed `[ENT_VICTOR, ENT_SHELL_ONE]`: supporting nodes 1 (Victor), contradicting nodes 1 (Shell One), null 4 (Bank, Maria, Shell Two, Witness); edges supporting 3 (GE_1, GE_3, GE_6), contradicting 1 (GE_5), null 2 (GE_2, GE_4).
- **Filter honesty:** hideContradicted removes GE_5 from topology and every contradiction signal; attention recomposes without stale regions.
- Interaction: click selects at attention 3 and lights incident edges; keyboard focus raises/blur restores; hover sets `data-graph-hovered`; reduced-motion suppresses the edg draw.

## K. Source guards

`graph-visual-state.ts` imports types only (source-guard safe) — no `providers/(demo|live)`, `demo-*fixtures`, or `create(WorkspaceDemo|Live)Providers`; it consumes canonical `GraphProjection` data. Integration tests exercise the *real* demo providers through `WorkspaceBoundary` + `GraphPanel` under `NEXT_PUBLIC_DATA_MODE=demo`, `NEXT_PUBLIC_DEMO_CASE_ID` set, with jsdom `ResizeObserver`/`matchMedia` stubs (the canvas is dimensioned via ResizeObserver) and next/navigation lanes seeded with `caseId` (WorkspaceBoundary reads it from the query string) and `params.id = INVESTIGATION_ID` (the demo GraphProvider validates `getVersion`/`getGraphHoles` against the workspace investigation id).

## L. De-scoped (explicitly NOT in this part)

- No new layout, physics, or topology — the bridge model is *derived*, never stored.
- No live-mode visual-language divergence: the derivation is shared; DISTINCT live behavior is a PR-6 follow-up.
- No matrix/flow implementations (remain honest not-ready).
- No changes to the Entity Pulse representation, its capability flip, or the representation switcher.
- No authored score fields: attention is a level (0–3), not a risk metric.

## M. Risks & residual

- jsdom lacks `ResizeObserver`/`matchMedia`; both suites stub them, and the `prefers-reduced-motion` path is only fully exercised in real browsers (a controlled gap identical in kind to the pulse's morph guard).
- The bridge model keys on edge `status === "ACTIVE"`; a future status value would need inclusion here, but the module centralizes that rule so the surface stays consistent.
- Root `pnpm typecheck` currently surfaces errors **only** in the parallel pulse WIP (`pulse-panel.tsx`, `pulse-model.ts` — owned by Part 1, being resolved by its owner); every Graph Visual Language file typechecks clean.
- Two benign `act(...)` warnings during async load under jsdom persist as before.

## N. Verification

```
packages/web tests         pnpm --filter @indago/web test → 58 files, 620 tests, 619 passed (1 excluded: PR-6 timeline WIP)
Graph Visual Language      tests/pr6-visual-state.test.ts → 33 passed
                           tests/pr6-living-graph.test.tsx → 17 passed
                           (both pass together and within the full suite; PR-0–5 suites unchanged)
Entity Pulse part          tests/pulse-model.test.ts → 28 passed; tests/pulse-panel.test.tsx → 8 passed
                           tests/representations.test.ts → 4 passed; tests/pr5-representation.test.tsx → 10 passed
typecheck (web)            pnpm --filter @indago/web typecheck → EXIT=0
build (web)                pnpm --filter @indago/web build → EXIT=0 (stale .next cleared before rebuild)
```

Previously-flagged PR-2/PR-3 stale assertions now pass in the full suite (parallel PR-6 work resolved them); neither PR-6 part changes those suites' intent. The graph surface is deterministic, honest, capability-gated, and restrains its motion to the spec — `data-graph-*` hooks carry the test contract with zero visual difference. The Entity Pulse side of the same Zone 2 surface now speaks the corrected multi-entity visual language (see `docs/reports/f-pr6-corrective-pass.md`).

---

PR-7 can now begin.