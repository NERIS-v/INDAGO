# PR-4 — Context-Aware Operational Rail (Command Surface)

**Status:** DELIVERED — all verification green (`packages/web` 453/453 tests across 43 files, all seven packages typecheck exit 0, production build exit 0). The left Operational Rail is now a **command-driven surface**: every slot derives its enabled/disabled/implemented/kind/reason from one pure action model built on the PR-3 capability seam, real commands reach their existing implementations, and the rail gained one genuinely new real command (Filter) that visibly changes the graph.

## A. Scope & Goal

PR-3 answered "what IS this selection?" PR-4 answers "**what can I actually DO about it?**" The rail is no longer a hand-wired list of rows: it is a projection of a single business-language vocabulary — 15 commands in three groups (Graph / Investigate / Act & Verify) — where each command carries:

1. **A command TYPE** (`immediate` / `surface-toggle` / `modal` / `mutation`) so a button is a button, a toggle is a toggle, and a modal is a modal — no more one-size-fits-all boolean rows.
2. **An honest implementation status.** A command is OFFERED only if a real, existing, safe frontend seam is bound today. Anything else renders disabled with a truthful reason — never faked into demo behavior.
3. **A context projection.** Whether a command is *usable right now* flows from PR-3's `getContextualCapabilities` (conceptual eligibility) AND the implementation registry (what is actually wired) — the rail itself contains zero scattered `context.kind === …` branching.

The one new business capability added by PR-4 is **Filter** — a graph-readability command (relation support threshold + hide contradicted) that operates over already-loaded graph edge data and changes only what is rendered.

## B. Frozen Contract (untouched by PR-4)

- PR-0/1/2/3 render contracts: `data-slot`, `data-capability`, `aria-pressed` on Discover/Detect Gaps/Cross-Case/Layers/Filter + the disabled set (Search/Expand/Layout/Review/Resolve/Challenge). All pr0–pr3 suites stay green **unmodified except the pr2 `DEFAULT_ACTIONS` equality** (which now includes the new `filterOpen`/`filter` fields) and the pr2 disabled-loop (Filter is no longer in it).
- `GraphCanvas` glue, `useGraphLayout`, hole bursts, drag/zoom/pan, temporal filtering, community/bridge rendering, and **physics** — Filter feeds the canvas *fewer edges*, but the simulation and the entity drawer keep the FULL topology (no physics restarts on filter interaction).
- All provider interfaces in `lib/providers/types.ts`; the demo/live provider bundles; `getDataModeConfig` latencies; `ProviderError` codes.
- `lib/context` PR-3 contracts (`getContextualCapabilities`, `EMPTY_CAPABILITIES`, resolver, race-guard controller) — consumed, not replaced.
- The judge page still renders standalone `<GraphPanel activeTimeRange={null} />`.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/context/operational-actions.ts` | **The action model (pure).** `OperationalAction` union (15), `OperationalActionKind`, `OperationalActionState { visible, enabled, implemented, kind, reason? }`, `OPERATIONAL_ACTION_META`, `OPERATIONAL_ACTION_GROUPS`, `OPERATIONAL_REASONS`, the single `IMPLEMENTED` registry, `getOperationalActionState` / `getOperationalRailStates`, re-exported `EMPTY_CAPABILITIES`. Imports only the PR-3 context model — no providers/fixtures/UI. |
| `packages/web/src/lib/graph/graph-filter.ts` | **The new real command (pure).** `GraphFilterState { minSupport, hideContradicted }`, `DEFAULT_GRAPH_FILTER`, `MIN_SUPPORT_STEP = 0.05`, `MIN_SUPPORT_MAX = 0.6`, `graphFilterIsActive()`, `applyGraphFilter()`. |
| `packages/web/tests/pr4-operational-rail.test.tsx` | 15 end-to-end shell tests (groups/slots/labels, capability attrs, command-kind vs aria-pressed, exclusive vs independent surfaces, the modal exception, Focus→`focusNode`, gap→Focus disabled, Cross-Case activate/deactivate, Filter opens+prunes the canvas edge set 6→4, graph-cell identity + selection preservation, no-fit on surface toggles, honest enabled/disabled split). |
| `packages/web/tests/pr4-operational-actions.test.ts` | 13 pure tests (registry completeness, static kinds, honest-stubs-vs-real-commands, capability mapping incl. no-context / capable-but-unwired / no-graph-target, EMPTY_CAPABILITIES re-export, full `applyGraphFilter` behavior). |

## D. Files Changed

- `packages/web/src/lib/layout/control-center.ts` — repaired the `GraphControlCenterActions` interface (all surface flags + `filterOpen: boolean` + `filter: GraphFilterState` + `activeForeignCaseId`) and added the shared `ControlCenterSurfaceKey` union; `DEFAULT_ACTIONS` extended with `filterOpen: false` + `filter: DEFAULT_GRAPH_FILTER`.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — Filter is an **independent surface** (like Legend): exclusive-surface resets preserve `filterOpen`/`filter`; rail receives `context`, `mode={workspace.mode}`, `filter`, `onFilterChange`; GraphPanel receives `filter`.
- `packages/web/src/components/graph/control-center/operational-rail.tsx` — **full rewrite** driven by `getOperationalRailStates`: all 15 slots from one projection, `data-slot` everywhere, `aria-pressed` ONLY for surface-toggles, inline Filter panel under the Filter slot, cross-case picker under the Cross-Case slot, active-dot for open surfaces, dispatch table (`dispatchAction`) that routes enabled commands to their existing seams.
- `packages/web/src/components/graph/graph-panel.tsx` — optional `filter` prop; `canvasEdges = applyGraphFilter(finalEdges, filter)` memo; `GraphCanvas` renders `canvasEdges` (entity drawer + physics keep `finalEdges`).
- `packages/web/tests/pr2-graph-control-center.test.tsx` — `DEFAULT_ACTIONS` equality updated; `/^Filter/` removed from the disabled-set loop (Filter now enabled).
- `packages/web/tests/setup.ts` + `packages/web/vitest.config.ts` — async-utility budget 15s and per-test timeout 20s so the recursive parallel run (ingestion + web + platform in separate vitest processes) stops flaking on mount-heavy shells.

## E. Files Removed

None. PR-4 removes the old hand-wired rail branches and replaces them with the action model in place.

## F. Files Intentionally Untouched (scope discipline)

- `graph-canvas.tsx`, `use-graph-layout.ts`, `graph-hull.tsx`, `graph-live.ts`, hole-burst layer — the Focus seam still goes through `controlsRef.focusNode`; Filter never touches them.
- Demo/Live providers, fixtures, fixture databases — untouched; `operational-actions.ts` and `graph-filter.ts` are provider-agnostic and source-guarded.
- Hypothesis engine, robustness measurement, leads, entity-resolution intelligence packages — untouched; disabled commands reference their future seams only in reason text.
- `app/investigations/[id]/judge/page.tsx` — still standalone.

## G. The command model

```
type OperationalAction = "search" | "focus" | "expand" | "filter" | "layers" | "layout"
                       | "discover" | "find-connections" | "detect-gaps" | "trace-evidence"
                       | "cross-case" | "add-evidence" | "review" | "resolve" | "challenge";
```

Groups (PR-2 visual order, driven by the model):

- **Graph** — `search`, `focus`, `expand`, `filter`, `layers`, `layout`
- **Investigate** — `discover`, `find-connections`, `detect-gaps`, `trace-evidence`, `cross-case`
- **Act / Verify** — `add-evidence`, `review`, `resolve`, `challenge`

Every decision the rail shows passes through `getOperationalActionState(action, context, capabilities, workspace)`. The only TWO inputs are the PR-3 capability seam and the `IMPLEMENTED` registry — there is no per-slot bespoke logic left in the component.

## H. Command kinds (static, context-invariant)

| Kind | Commands | Rail behavior |
|---|---|---|
| `immediate` | search, focus, expand, layout, find-connections | executes once; no open/closed state; **no `aria-pressed`** |
| `surface-toggle` | filter, layers, discover, detect-gaps, trace-evidence, cross-case | opens/closes a graph surface; **`aria-pressed`** + active dot while open |
| `modal` | add-evidence | opens the EvidenceIntake modal; not a toggle, no `aria-pressed` |
| `mutation` | review, resolve, challenge | dedicated domain workflows (future); currently disabled stubs |

## I. Honest projection rules

1. `enabled` = implemented **AND** (for selection-bound commands) conceptually capable per PR-3.
2. `implemented` = bound to a real seam today; everything else is a **disabled stub with a truthful `reason`** — `OPERATIONAL_REASONS` is stable, testable text.
3. Focus reasons (identical to the pr3 title contract): no selection → "Select an entity to focus it"; context but no deterministic graph target (e.g. a gap) → "This selection has no deterministic graph target"; enabled → "Center selection on graph".
4. `data-capability` mirrors PR-3: `focus → canFocus`; `expand`/`find-connections → hasContext && canExpand`; `trace-evidence → hasContext && canTraceEvidence`; `review/resolve/challenge → hasContext && (can*)`. Global commands (Filter/Layers/Discover/Detect Gaps/Cross-Case/Add Evidence) expose no capability flag.
5. Global commands (Filter, Layers, Discover, Detect Gaps, Cross-Case, Add Evidence) are context-free: enabled whenever implemented, so the user can always reach topology-level tools.

## J. Implemented commands (everything that actually does something)

All seven share the property: **they call an EXISTING implementation** — PR-4 adds zero new backends and never fake-wires a demo path for an un-backed command.

### 1. Focus — `immediate`
- **Existing implementation:** PR-3 seam — shell `focusContext(entity)` → `focusRequest` (nonce-bumped) → GraphPanel resolves `entityId → graph node id` → `controlsRef.current.focusNode(id)` (bounded 1.4x–3x zoom).
- **State changed:** camera centers on the entity's graph node; selection + right panel unchanged.
- **Context requirement:** entity selection with `canFocus`. Gap/relation/cross-case → disabled with the honest reason.
- **Live vs demo:** identical (both go through the canvas focus seam); no provider dependency.
- **Unsupported (no entity / no deterministic target):** disabled with `FOCUS_NEEDS_ENTITY` / `NO_GRAPH_TARGET`.

### 2. Layers — `surface-toggle`
- **Existing implementation:** PR-2 `legendOpen` → GraphPanel's graph legend surface.
- **State changed:** legend overlay toggles; **independent** of exclusive surfaces (never closed by Discover/Detect Gaps).
- **Context requirement:** none.
- **Live/demo/unsupported:** identical, always enabled.

### 3. Filter — `surface-toggle` (the PR-4 new command)
- **Existing implementation:** none prior — new pure `applyGraphFilter` over the **already-loaded** `finalEdges` (`GraphEdge.status` / `GraphEdge.support`); result replaces the RENDERED edge set.
- **State changed:** visible graph relations (`canvasEdges`) shrink by threshold/contradiction; physics + entity drawer keep full topology (no layout restart — GraphPanel's `canvasEdges` memo only swaps the render input).
- **Controls:** inline in the rail under the Filter slot: range `min=0 max=0.6 step=0.05` labelled "Minimum relation support threshold" + "Hide contradicted relations" checkbox; filter is independent (never closed by exclusive surfaces) and context-free.
- **Live vs demo:** identical — operates on whatever the graph provider loaded.
- **Unsupported:** n/a (no selection required). Active indicator (`graphFilterIsActive`) when anything is hidden.
- **Proof of visible effect:** demo graph ships GE_5 (`CONTRADICTED`, support 0.7) and GE_6 (support 0.2); the test drives `minSupport=0.6` + `hideContradicted` and asserts the canvas edge set deterministically drops 6 → 4 (GE_5 and GE_6 gone, GE_1 retained).

### 4. Discover — `surface-toggle`
- **Existing implementation:** PR-2 `DiscoveryPanel` provider-driven discovery overlay (right side).
- **State changed:** opens the discovery surface; opening an exclusive surface collapses the right contextual panel (PR-3 one-analysis-surface rule) so they never double-cover.
- **Context requirement:** none.
- **Live/demo/unsupported:** always enabled; provider disconnection shows the panel's own honest empty/error state.

### 5. Detect Gaps — `surface-toggle`
- **Existing implementation:** PR-2 investigative-gaps overlay (`gapListVisible` in shell mode); selecting a gap → PR-3 `{ gap, … }` context bridge.
- **State changed:** gaps surface toggles; pitching a gap resolves the contextual panel to the gap and disables Focus (`NO_GRAPH_TARGET`); re-clicking Detect Gaps while a gap is pitched returns to the LIST (PR-3 behavior preserved).
- **Context requirement:** none to open; gap selection drives the context bridge.

### 6. Cross-Case — `surface-toggle`
- **Existing implementation:** PR-1/PR-2 `CrossCaseProvider.listForeignOverlays` → picker under the Cross-Case slot; activating a `ref` → `{ cross-case, … }` context + staged camera reveal (PR-3) + `activeForeignCaseId`.
- **State changed:** picker toggles; activating an overlay resolves the bridge context, `aria-pressed` tracks `crossCaseOpen || activeForeignCaseId`; deactivating clears ONLY the cross-case selection (a real entity selection survives overlay toggling — pr3 contract).
- **Context requirement:** none to open.

### 7. Add Evidence — `modal`
- **Existing implementation:** PR-2 `EvidenceIntake` upload modal + the existing submission/realtime choreography.
- **State changed:** modal opens/closes; not a toggle (`aria-pressed` absent), never affected by exclusive-surface resets.
- **Context requirement:** none.

## K. Deliberately disabled commands (honest stubs — no fake actions)

| Command | Kind | Reason shown (stable `OPERATIONAL_REASONS`) |
|---|---|---|
| Search | immediate | NO_SEARCH — "Search is not available yet" |
| Expand | immediate | NO_EXPAND_SEAM — "Traversal backend exists, UI command is not yet wired" |
| Layout | immediate | NO_LAYOUT_SEAM — "Only the force layout is implemented — no alternative layout switch" |
| Find Connections | immediate | NO_CONNECTIONS_SEAM — "Connection traversal is not yet wired to a graph surface" |
| Trace Evidence | surface-toggle | NO_TRACE_SEAM — "Evidence trace is not yet wired for this context" |
| Review | mutation | NO_REVIEW — "No review workflow is wired for this object type" |
| Resolve | mutation | NO_RESOLVE — "There is no generic resolver — resolution follows the object's own domain API" |
| Challenge | mutation | NO_CHALLENGE — "Challenge uses the object's relation-authority workflow (PR-8), not yet wired" |

These rows stay disabled even for fully-capable selections (tested with `canExpand`/`canReview`/... all true) — demonstrating capability awareness WITHOUT faking an implementation.

## L. Shell wiring

- `ControlCenterSurfaceKey` unifies rail-triggered surfaces; `toggleAction` treats Legend **and** Filter as independent (survive exclusive resets) while Discover/Detect Gaps/Cross-Case remain exclusive and collapse the right panel on open.
- `dispatchAction` routes the seven enabled commands to their seams; disabled commands never dispatch.
- Selection preservation: surface churn (Layers/Filter/Discover) never clears the context or remounts the graph cell (tested); surface toggles never fit/zoom the camera (only Focus and the cross-case reveal do).

## M. Accessibility + source guards

- Every slot is a real `button` with a `title` (reason on disabled, hint on enabled), `data-slot`, and `data-capability`; surface-toggles expose `aria-pressed`; immediate/modal commands deliberately omit it.
- Inline Filter inputs are labelled ("Minimum relation support threshold", "Hide contradicted relations") and the range focuses when the Filter surface opens.
- Source guards (tested by inspection like PR-3): `operational-actions.ts`, `graph-filter.ts`, and the rail import no `providers/(demo|live)`, no demo fixtures, and never construct `create(WorkspaceDemo|Live)Providers`.

## N. Verification

- `packages/web` — full suite **453/453 across 43 files**; PR-4's new files alone **28/28** (13 pure + 15 end-to-end). pr0–pr3 suites stay green (pr2 updated for the new `DEFAULT_ACTIONS` fields + Filter-enabled set).
- Typecheck exit 0: `web`, `platform`, `contracts`, and all four intelligence packages (`entity-resolution`, `graphology-projection`, `ingestion`, `relation-resolution`).
- Production build exit 0 for all seven workspace packages.
- Resilience hardening: `tests/setup.ts` raises the testing-library async budget to 15s and `vitest.config.ts` sets `testTimeout: 20000` — the recursive `pnpm test` (which runs ingestion's heavy PDF suite in a parallel vitest process) previously flaked three tests past vitest's 5s default; the gate is now stable, green across `contracts` (181), `web` (453), `ingestion` (459), `entity-resolution` (32), `relation-resolution` (37), `graphology-projection` (11).
- Platform integration suites (`packages/platform`) require real Postgres/Redis (`TEST_DATABASE_URL`) and fail with `PrismaClientInitializationError` when that infra is absent — pre-existing, environmental, unrelated to PR-4.

PR-5 can now begin.