# F-PR6 Corrective Pass — Multi-Entity Entity Pulse (five-zone adaptive shell + NETWORK nav)

**Status:** COMPLETE. Typecheck `pnpm --filter @indago/web typecheck` EXIT=0. Build `pnpm --filter @indago/web build` EXIT=0 (after removing a stale `.next` Turbopack cache). Web regression **58 files / 620 tests, 619 passed** — the single failure (`tests/pr6-timeline-default-scope.test.tsx`) is owned by the parallel PR-6 timeline workstream (new file + `timeline-panel.tsx`/`capabilities.ts`/`page.tsx` in that agent's uncommitted WIP), renders `TimelinePanel` directly (no F-PR6 code executes in it), and is recorded here as out of scope rather than fixed.

---

## 1. Objective (why a corrective pass)

The originally delivered F-PR6 Entity Pulse rendered the whole topic set as ONE giant deformable circle. The corrective pass re-grounds the deliverable in the actual requirement — **a multi-entity view**: every entity gets its own identifiable, selectable, enclosed field with a readable label; the shown set is a bounded deterministic scoped subset (cap 6); each outer contour expresses in-window activity, each inner halo expresses analytical salience from canonical `structuralImportance`; color communicates category only (never severity); the shared workspace `timeRange` remains the only temporal controller; the morph is 320 ms restrained ease-out with an instant reduced-motion/jsdom fallback; **SELECT ≠ FOCUS**; "Open in Graph" reuses the existing graph focus seam. The pass must also (a) make all five zones representation-aware through a **typed presentation model** — no scattered `view === "pulse"` checks — while freezing the shell geometry, (b) rename the parent workspace nav label **Graph → NETWORK** (`/investigations/[id]/graph` route unchanged), and (c) keep the live-mode honesty rule: explicit-live never silently serves demo pulse data.

## 2. What the corrective pass delivers

**Pure model (`pulse-model.ts`).** `buildPulseFrame(topics…)` was replaced by `buildEntityPulseOverview(input)` returning `EntityPulseOverview` with an `entities` array of `EntityPulseField` — `{ nodeId, entityId, label, category, categoryLabel, salience, salienceAvailable, active, observationCount, totalObservationCount, strength, outerSamples[96], innerSamples[96] }` — plus `entityNodeCount`, `totalObservationsInWindow`, `totalObservationsFull`, `concentrationPct`, `windowLabel "selected window" | "full timeline"`, `dominantCategory(Label)`, `strongest`, `mostChanged`, `markers[]`, `capped`, and a deterministic `summary`. Per-entity geometry: each in-window observation contributes a raised-cosine lobe at a `stableHash(nodeId|obsId)` angle, amplitude scaled by `strength / maxWindowStrength`, sampled into 96 samples within `[PULSE_RADIUS_BASE, PULSE_RADIUS_BASE + PULSE_ACTIVITY_AMPLITUDE]`; the halo is the salience field. Ordering is salience-descending (stable across time); the set is capped at `PULSE_MAX_TOPIC_ENTITIES = 6`. No `Math.random`/`Date.now`; the `timeRange` predicate is unchanged and includes untimed observations. Corrective-pass model fixes: calm overviews now report `dominantCategory: null` (a zero-count category can no longer "win"), the summary pluralizes honestly (`entity`/`entities`, `observation`/`observations`), and the cap narrates "top 6 by structural salience" instead of a fake word.

**Shared shell-owned analysis (`use-entity-pulse.ts`).** ONE hook fetches canonical surfaces (nodes, observations, contradictions, candidates, foreign overlays) — strictly gated so graph mode makes no pulse fetches — and derives the single `EntityPulseOverview` every supporting zone consumes (`enabled: presentation.zoneTwo === "pulse"`; `timeRange: activeTimeRange`). Idle/loading/ready/error are typed.

**Typed presentation model (`lib/network/representations.ts`).** `GRAPH_PRESENTATION`, `PULSE_PRESENTATION`, `NOT_READY_PRESENTATION` and `presentationFor(view, pulseServed)` declare each zone's content per representation: zone 1 (rail), zone 2 (graph/pulse/not-ready), zone 3 (graph-context/pulse-context), zone 4 pulse-note flag, zone 5 intelligence/pulse-adapter. Matrix/Flow and explicit-live pulse resolve to the honest NOT_READY pane.

**Pulse zone components.** `pulse-panel.tsx` (per-entity card grid + prominent focus card, SELECT bridge `{ kind: "entity", id, source: "graph" }`, markers, legend, aria-live textual equivalent), `pulse-glyph.tsx` (memoized multi-entity glyph, `data-pulse-*` hooks), `pulse-rail.tsx` (Zone 1: real Open-in-Graph / clear-selection actions + data-backed overview stats), `pulse-context-summary.tsx` (Zone 3: selected-entity context, open-in-graph), `pulse-temporal-note.tsx` (Zone 4: window/most-active/most-changed facts above the unchanged `TimelinePanel`), `pulse-intelligence-insight.tsx` (Zone 5: additive adapter slot in the Overview tab).

**Shell wiring.** `graph-control-center.tsx` gained the `presentation` memo and the shared pulse hook; each zone renders content by the presentation model. `investigative-intelligence.tsx` gained a purely additive `adapterSlot` (Overview-tab wrapper only when present — graph behavior byte-identical). `representation-switcher.tsx` carries the NETWORK eyebrow and Graph/Pulse/Matrix/Flow labels. `nav.ts` label is **Network** (href unchanged). "Open in Graph" does view switch → select → `focusRequest` → `onFocusEntityChange`.

## 3. Files in the corrective pass

**Changed**

- `packages/web/src/lib/network/pulse/pulse-model.ts` — rewritten multi-entity model (API + corrective fixes above).
- `packages/web/src/components/graph/control-center/pulse/pulse-panel.tsx` — rewritten multi-entity panel (old single-circle panel replaced).
- `packages/web/src/components/graph/control-center/representation-switcher.tsx` — NETWORK eyebrow + Graph/Pulse/Matrix/Flow labels.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — typed `presentation` memo + shared pulse hook + per-zone content adaptation.
- `packages/web/src/components/graph/control-center/investigative-intelligence.tsx` — additive `adapterSlot`.
- `packages/web/src/lib/workspace/nav.ts` — parent label "Network".
- `packages/web/tests/pulse-model.test.ts` — rewritten to the overview API (28 tests).
- `packages/web/tests/pulse-panel.test.tsx` — rewritten to the multi-entity panel (8 tests).
- `packages/web/tests/pr1-navigation-dock.test.tsx`, `packages/web/tests/pr1-provider-boundary.test.ts` — "Network" labels.
- `packages/web/tests/pr5-auto-capability.test.ts` — live `network.pulse === "not-ready"` assertion.
- `packages/web/tests/pr5-representation.test.tsx` — representation-shell suite reworked (10 tests).

**Added**

- `packages/web/src/lib/network/pulse/use-entity-pulse.ts` (hook), `packages/web/src/lib/network/representations.ts` (presentation model).
- `packages/web/src/components/graph/control-center/pulse/pulse-glyph.tsx`, `pulse-rail.tsx`, `pulse-context-summary.tsx`, `pulse-temporal-note.tsx`, `pulse-intelligence-insight.tsx`.
- `packages/web/tests/representations.test.ts` (4 tests).

**Removed** — `buildPulseFrame` / `topics` API (grep-verified fully gone; old single-field panel gone).

## 4. Protected areas confirmation

- Only `packages/web/**` changed. No backend/contracts/platform/judge files.
- `graph-canvas.tsx`, `graph-panel.tsx`, `intelligence-signals.tsx`, `graph-visual-state.ts` — untouched (parallel Graph Visual Language owner).
- `timeline-panel.tsx`, `capabilities.ts`, `page.tsx`, `pr6-timeline-default-scope.test.tsx`, `scratch-shared-time.test.tsx` — PR-6 timeline agent's uncommitted WIP; not modified by this pass (the corrective pass only reads `activeTimeRange`/`restoredTimeRange` through the existing seam).
- No new dependencies; native SVG path built by the model (no d3-shape).
- The untracked local configuration artifact was never staged or committed.

## 5. Honest-data thread

```
outer contour = raised-cosine lobes:      strength(field) / maxWindowStrength × lobe, per in-window observation
inner halo    = structuralImportance × PULSE_HALO_AMPLITUDE + PULSE_HALO_BASE
category color= dominant observation type of that entity's in-window set (financial/communication/location/identity/cross-case/other)
markers       = real ObservationContradiction / IntelligenceCandidateView / ForeignCaseOverlay
```
`concentrationPct` = `round(window/full × 100)`, computed when the full timeline is non-empty (a null/whole timeline reports a truthful 100% with `windowLabel: "full timeline"`). The narrative (`summary`, temporal note, insight) only ever states real counts and labels; SELECT vs FOCUS are separated (highlight vs durable focus prominence); focused entities are prominent while others are de-emphasized, never removed.

## 6. Capability & representation honesty

| View | DEMO / AUTO-demo | LIVE (effective live) |
|---|---|---|
| Network (graph) | `demo` — unchanged | typed graph behavior |
| Entity Pulse | `demo` — rendered | `not-ready` — honest typed pane |
| Matrix / Flow | `not-ready` | `not-ready` |

The typed NOT_READY resolution (`presentationFor("pulse", false)`) is asserted in `representations.test.ts` and the live capability bit in `pr5-auto-capability.test.ts`.

## 7. Test-context facts locked by the suite

- 5 demo entities, 96 samples/field, capped set ordering by salience (bank first), finite/bounded radii, closed Catmull-Rom path (`M…Z`), determinism of identical inputs, calm → `dominantCategory null`, `strongest null`.
- Jan-2024 window: only OBS_7 (bank↔María, communication) in-range → strongest = bank, concentration `1/9 → 11%`; full timeline dominant = financial, strongest = bank.
- Markers: contradiction & identity-resolution anchored to `ENT_VICTOR`; cross-case overlays unanchored.
- Shell: pulse mode swaps zone content (pulse rail / pulse context / temporal note / intelligence adapter) while the five-zone geometry and region labels persist; SELECT opens the Pulse context zone (SELECT ≠ FOCUS via `aria-pressed` + focus card); the note narrates the shared window (`full timeline · 9 observations (100% of 9 total)` / `selected window · 1 observations (11% of 9 total)`); graph mode leaks no pulse artefacts; matrix/flow show the honest typed pane; live pulse never falls back.

## 8. Verification

```
typecheck                 pnpm --filter @indago/web typecheck           → EXIT=0
build                     pnpm --filter @indago/web build              → EXIT=0 (stale .next cleared first)
web regression            pnpm --filter @indago/web test               → 58 files, 620 tests: 619 passed, 1 excluded (PR-6 timeline WIP)
pulse model               tests/pulse-model.test.ts                    → 28 passed
pulse panel               tests/pulse-panel.test.tsx                   → 8 passed
presentation model        tests/representations.test.ts                → 4 passed
pulse shell               tests/pr5-representation.test.tsx            → 10 passed
nav / boundary / auto     pr1-navigation-dock, pr1-provider-boundary, pr5-auto-capability → all passed
```

## 9. Residual & limitations

- jsdom lacks `matchMedia`/`requestAnimationFrame`/`performance`; the 320 ms morph falls back to instant render there (tested) and is fully exercised only in real browsers — the morph is a pure ease between the same two deterministic frames, so the gap is low-risk.
- The PR-6 timeline workstream is mid-flight in the same workspace; its single failing test is theirs to close and is excluded from this pass's gate.
- Matrix/Flow remain honest not-ready; live pulse implementation is still `{ demo: true, live: false }`.