# F-PR8 — Adaptive Flow (third NETWORK representation in the five-zone shell)

**Status:** COMPLETE. Typecheck EXIT=0. Build EXIT=0. Full web suite **75 files / 808 tests, 808 passed**. New F-PR8 suites green and stability-repeated 3×: `flow-model.test.ts` (23), `flow-panel.test.tsx` (12), `pr8-flow-shell.test.tsx` (8), plus updated `capabilities.test.ts` (8), `representations.test.ts` (7), `pr5-representation.test.tsx` (10).

---

## 1. Objective

Add **Adaptive Flow** as the third served representation inside the five-zone Graph Control Center, alongside Entity Pulse and Relationship Matrix: a directed-flow visualization that only ever draws movement the provider can evidence — **segments from directed, actionable relation hypotheses; amounts read strictly from observation metadata; gaps only where an observation explicitly marks a unilateral outflow**. It must be deterministic (identical input ⇒ identical geometry — no `Math.random`, `Date.now`, or unseeded noise), share the workspace `timeRange` as its single temporal controller, adapt its domain mode only to domains that actually hold segments, and feed the canonical context bridge (SELECT ≠ FOCUS, "Open in Graph" reuse). It resolves under DEMO and AUTO like pulse/matrix and stays a typed NOT_READY under explicit live.

## 2. What F-PR8 delivers

**Pure model (`lib/network/flow/flow-model.ts`).** `buildFlowModel(input)` returns `FlowMeta` with `status`, `availableModes`, `mode`, `roleFilter`, `segments`, `gaps`, `entities`, `layout`, `observedAmounts`, `segmentCount`, `gapCount`, `conflictCount`, `entityCount`, `pathCount`, `crossCaseCount`, `summary`, `emptyMessage`.

- **Segments** exist only from `relation.directed === true` with status `PROPOSED` or `ACCEPTED` whose `relationType` maps to a flow domain (`financial` → FINANCIAL, `communication` → COMMUNICATION, `transport|vehicle` → MOVEMENT). **REJECTED and REVERSED never re-appear** as active flow.
- **Amounts** are read ONLY from `metadata.customFields.flowAmount` + `flowCurrency` on the relation's `evidenceBasis` observations. Missing/malformed/non-finite/negative facets are ignored (no fabrication). Mixed-currency segments are never summed — each currency totals and is reported separately (`groupAmounts`, `sumAmounts`), and width scales with the dominant-currency total via a bounded log curve `MIN_WIDTH=2 … MAX_WIDTH=16` (qualitative/amountless segments get `BASE_QUALITATIVE_WIDTH=4`).
- **Gaps** exist ONLY for observations with `customFields.flowGap === "destination"`, in-mode, agreeing-amount, in-window. A gap renders as a dashed edge to an unresolved **"Unknown destination"** pseudo-node with note "Flew out to an unobserved destination" — never a fabricated name or a suspicious label.
- **Three distinct honest empty states**: `no-flow-data` ("No flow data"), `no-flow-in-window` ("No flow in selected window"), and provider-level `error` — carried on the inner `FlowMeta.status` (NOT the outer load state), surfaced verbatim by the panel.
- **Adaptivity**: `availableModes` = domains with ≥1 segment anywhere in the case; default priority FINANCIAL > MOVEMENT > COMMUNICATION; a requested-but-unavailable mode resolves to the first available one. Roles within the filtered set: sources / intermediaries / destinations.
- **Deterministic layout**: layered longest-path with a bounded relaxation cap (cycles terminate deterministically) → two-pass barycenter ordering with stable length/label tie-breaks → full-width gap columns as forced next layers. Constants `NODE_W=132, NODE_H=44, LAYER_GAP=220, ROW_GAP=28, PADDING=36`. Layout node ids `ent:<entityId>` / `gap:<observationId>`; edge ids `edge:seg:<relationId>` / `edge:gap:<observationId>`.
- **Path count**: distinct source→terminal chains via memoized traversal, capped at `MAX_PATHS=2048` (reports the cap, never hangs).
- **Context bridge**: `flowContextForRelation/Entity/Gap` → canonical `{ kind, id, source: "flow" }` (`relation`/`entity`/`observation`); `flowSegmentFromContext` / `flowEntityFromContext` reverse-map only `source === "flow"` selections.
- **Display helpers**: `formatFlowAmount` (full, e.g. "₹250,000"), `formatFlowAmountCompact` ("₹250K"), `currencySymbol`, never a bare "Number" without a currency; `INR→₹`, `USD→$`.

**Shared shell-owned analysis (`lib/network/flow/use-flow-analysis.ts`).** ONE hook fetches canonical surfaces (nodes, observations, relations, cross-case matches) strictly gated so graph mode makes no flow fetches, and derives the single `FlowMeta` every supporting zone consumes (`enabled: presentation.zoneTwo === "flow"`; `timeRange: activeTimeRange`; `mode: flowMode`; `roleFilter: flowRoleFilter`). Outer `FlowLoadState` is `idle|loading|ready|error`; the honest inner status lives on `meta.status`.

**Presentation model (`lib/network/representations.ts`).** `presentationFor(view, pulseServed, matrixServed, flowServed)` is now 4-arg. `FLOW_PRESENTATION` declares the flow zone contract: zone 1 `flow-rail`, zone 2 `flow`, zone 3 `flow-context`, zone 4 note `flow`, zone 5 `flow`. Unsupported flow (explicit live, or a view declared-but-unimplemented elsewhere) resolves to the honest NOT_READY pane.

**Flow zone components** under `components/graph/control-center/flow/`:
- `flow-panel.tsx` (Zone 2): layered SVG — entity nodes (`ent:`), gap pseudo-nodes (`gap:`) with "Unknown destination", cubic-Bézier edges (PROPOSED dashed, ACCEPTED solid), bounded width from dominant-currency total, qualitative baseline for amountless segments; node/edge click → context bridge; roving focus (Arrow keys + Enter/Space activation, `data-flow-focus-index`, `aria-pressed`); aria semantics on the `Adaptive flow diagram: <summary>` region; `flow-summary`/`flow-mode-label`/`flow-selected-node-label` hooks; real empty-state surfaces (both honest statuses) + `ErrorDisplay`; reduced-motion-safe transitions (`motion-safe:` / `motion-reduce:`).
- `flow-rail.tsx` (Zone 1, `role="complementary"` "Flow operations"): adaptive mode toggle **rendered only when more than one domain holds segments**; role-filter `<select>` (`flow-role-filter-select`); data-backed overview stats (`flow-rail-stats`: segments / gaps / entities / paths / conflict + per-currency observed amounts via `formatFlowAmountCompact`); Open-in-Graph and Clear-selection actions; PanelToggle.
- `flow-context-summary.tsx` (Zone 3, "Flow context"): entity/segment/gap cards + overview, `AmountRow` per currency, `flow-context-open-in-graph`.
- `flow-temporal-note.tsx` (Zone 4): window strip narrating the shared `timeRange` above the unchanged TimelinePanel.
- `flow-intelligence-insight.tsx` (Zone 5): additive adapter slot in the Overview tab — cross-case flow entities as a **count only**, honest absence message.

**Shell wiring (`graph-control-center.tsx`).** `flowServed = workspace.capabilities["network.flow"] !== "not-ready"`; the `presentation` memo uses the 4-arg resolver; new `flowMode` (`FlowDomain | null`) and `flowRoleFilter` (`"all"`) state feed `useFlowAnalysis`; all five zone slots render the flow variants; node click → `handleGraphContextSelect` (reveal), Open-in-Graph → `openEntityInGraph` (view switch → select → focus). `capabilities.ts` now declares `"network.flow": { demo: true, live: false }`.

## 3. Files

**Changed**
- `packages/web/src/lib/providers/capabilities.ts` — `network.flow` demo-served.
- `packages/web/src/lib/network/representations.ts` — `FLOW_PRESENTATION` + 4-arg `presentationFor`.
- `packages/web/src/lib/context/investigative-context.ts` — `"flow"` added to `ContextSource`/`CONTEXT_SOURCES`.
- `packages/web/src/lib/providers/demo/demo-fixtures/observations.ts` + `lookup.ts` — flow amount/gap metadata on OBS_3/4/5 (₹250,000 / ₹245,000 / ₹180,000; OBS_5 `flowGap:"destination"`).
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — flow state machine + five-zone wiring.
- `packages/web/tests/capabilities.test.ts`, `representations.test.ts`, `pr5-representation.test.tsx` — flow-served assertions, 4-arg migration, and honest on-screen flow content.

**Added**
- `packages/web/src/lib/network/flow/flow-model.ts` + `use-flow-analysis.ts`.
- `packages/web/src/components/graph/control-center/flow/{flow-rail,flow-panel,flow-context-summary,flow-temporal-note,flow-intelligence-insight}.tsx`.
- `packages/web/tests/flow-model.test.ts` (23), `flow-panel.test.tsx` (12), `pr8-flow-shell.test.tsx` (8).

## 4. Protected areas confirmation

- Only `packages/web/**` changed. No backend/contracts/platform/judge/Prisma/workers/SSE files; no new routes or dependencies (native SVG paths; no d3).
- Five-zone geometry, `graph-canvas`, `graph-panel`, matrix, pulse, Zone 5 design, temporal system, and cross-case auth untouched by this PR.
- The mode toggle is hidden when only one domain holds data (demo case: FINANCIAL only), so the "adaptive" claim is never fake.
- Untracked local configuration and unrelated prior-PR reports remain untracked/untouched.

## 5. Honest-data thread

```
segment  = directed relation (PROPOSED/ACCEPTED) + domain mapping
amounts  = metadata.customFields.{flowAmount,flowCurrency} on evidenceBasis  (never invented/summed across currencies)
gap      = observation with flowGap:"destination", in-mode, in-window, with an amount
width    = bounded log curve over dominant-currency total; amountless segments → baseline 4
layout   = layered longest-path + barycenter + stable tie-breaks; no randomness
paths    = distinct source→terminal chains (capped at 2048, never hangs)
empty    = no-flow-data / no-flow-in-window / error — distinct typed states
```
The demo fixture chain is `MARIA→BANK (no amount, ACCEPTED)`, `SHELL_ONE→BANK ₹250k (ACCEPTED)`, `BANK→SHELL_TWO ₹245k (ACCEPTED)`, `SHELL_ONE→SHELL_TWO (PROPOSED, dashed)`, plus the OBS_5 gap `SHELL_TWO → Unknown destination ₹180k` → full-window summary **"Financial · 4 flow segments · 3 active paths · ₹495,000 observed"**, 5 layout nodes. The shared Feb-2024 window drops the January segment and the March gap → **"Financial · 3 flow segments · 2 active paths · ₹495,000 observed"**. May-2024 → "No flow in selected window". A case with no flow-forming relations reports "No flow data". Cross-case flow presence is reported as a bare count (0 in the demo case) with honest absence.

## 6. Capability & representation honesty

| View | DEMO / AUTO-demo | LIVE (effective live) |
|---|---|---|
| Network (graph) | `demo` — unchanged | typed graph behavior |
| Entity Pulse | `demo` — rendered | `not-ready` — honest typed pane |
| Matrix | `demo` — rendered | `not-ready` — honest typed pane |
| **Adaptive Flow** | **`demo` — rendered** | **`not-ready` — honest typed pane** |

Asserted in `capabilities.test.ts` (table + `demo["network.flow"]` / `autoDevLive["network.flow"]` = `"demo"`, explicit live = `"not-ready"`) and `representations.test.ts` (`FLOW_PRESENTATION` mapping + unsupported-flow → NOT_READY).

## 7. Test-context facts locked by the suite

- Model (23): segments only from directed PROPOSED/ACCEPTED; REJECTED/REVERSED excluded; non-directed excluded; OBS_5 is a gap destination not a segment; per-currency totals; mixed currencies never summed; mode selection honors availability; role filters by sources/intermediaries/destinations; empty role set stays honest; window scoping (`no-flow-in-window` for May); context bridge round-trips; deterministic layout widths.
- Panel (12): summary strings for full/Feb windows; 5 layout nodes incl. gap "Unknown destination"; node click → `{kind:"entity",id:ENT_BANK,source:"flow"}`; edge click → `{kind:"relation",id:REL_3,source:"flow"}`; PROPOSED dashed vs ACCEPTED solid; Enter/Space activation; arrow-roving focus; `₹495,000` (no bare "$"); both honest empty states; `role="alert"` error pane; Feb scoping.
- Shell (8): Zone 2 serves the panel with all five zones adapted (`flow-rail`, `flow-context-summary`, `flow-temporal-note`, `flow-intelligence-insight`); the mode toggle is absent for a single-domain demo; the SHARED `timeRange` is the only temporal controller (Feb scopes rail + note together); May reports No-flow-in-window in the panel; `flow-role-filter-select` reshapes the rail overview (Feb → sources → 2 segments); node click opens the "Flow context" zone (SELECT ≠ FOCUS); Open-in-Graph → `onNetworkViewChange("graph")`; graph mode leaks no flow artefacts.
- Stability: `pr8-flow-shell.test.tsx` + `flow-panel.test.tsx` run 3× consecutively — 20/20 each run.