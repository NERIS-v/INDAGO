# PR-3 — Unified Investigative Context Bridge

**Status:** DELIVERED — all verification green (web 425/425 tests across 41 files, all packages typecheck exit 0, production build exit 0). The canonical `InvestigativeContext` selection now flows graph → contextual panel → intelligence Overview → operational rail with Focus wired to the graph, while un-wired commands stay capability-aware disabled (no fake actions).

## A. Scope & Goal

PR-3 delivers INDAGO V7's **unified investigative context bridge** — ONE canonical selection contract shared by every surface of the Graph Control Center:

1. **A pure selection contract** (`InvestigateContext = { kind, id, source } | null`) whose identity is `kind + id`. Mutable domain data is never stuffed into selection state.
2. **A query≠selection rule**: selecting an object does NOT load its data. A dedicated **Context Resolver** turns the later-resolved, discriminated selection into current provider-backed display data at render time, with distinct `empty / loading / resolved / unsupported / not-found / error` states.
3. **The shell (`GraphControlCenter`) is the SINGLE OWNER** of the selection. Panels speak intents (graph clicks, gap picks, timeline activations, rail picks, deep links, drawer closes); the shell rematerializes them as `ContextSource`-tagged selections — no global event bus, no singleton, no third-party store.
4. **One centralized capability mapping** (`getContextualCapabilities`) drives every rail enabled/disabled decision. Focus is the first real investigative command (entity selections can be centered on the graph); every other command remains disabled with a capability-aware hint because its business action lands in a later PR.

PR-3 builds only the **interaction spine**: no reasoning engine, no provider rewrite, no global store. Hypothesis authority stays in the hypothesis engine (robustness seam); the intelligence tabs remain structural; an anomaly selection is a first-class `unsupported` state — never a fabricated view.

## B. Frozen Contract (untouched by PR-3)

- `GraphPanel` public export name + props; `GraphCanvas` engine glue, `useGraphLayout`, `graph-canvas.tsx`, `graph-hull.tsx`, hole bursts, drag/zoom/pan, temporal filtering, community/bridge rendering.
- `TimelinePanel` (`onTimeRangeChange`, domain/density computation, play choreography) — only NEW optional `onEventActivate` was added; the existing seam is untouched.
- All provider interfaces in `lib/providers/types.ts`; `WorkspaceProviders` bundle shape/factories; `getDataModeConfig` latencies; `ProviderError` codes.
- `lib/providers/workspace/context.tsx` (`useWorkspace`) remains the ONLY provider seam the bridge touches.
- **Layout state stays separate from investigative selection state.** Rail collapse/reopen and tab switches must NOT clear the selection (tested). Judge page still renders standalone `<GraphPanel activeTimeRange={null} />` — absence of `onContextSelect` keeps that flow a silent no-op.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/context/investigative-context.ts` | Pure contract: `ContextKind`, `ContextSource`, `InvestigativeContext`, `contextKey`, `sameContextIdentity`, kind/display labels, `ContextualCapabilities` + `EMPTY_CAPABILITIES`, `WorkspaceCapabilities`, `getContextualCapabilities`, `InvestigativeContextActions`. ZERO provider imports. |
| `packages/web/src/lib/context/context-resolver.ts` | Discriminated `ContextResolution` (resolved/unsupported/not-found/error), `isResolved`/`resolutionStatus`, `ProviderError → status` mapping, per-kind resolvers (entity, evidence, observation via `listByInvestigation`+find, lead, gap, relation, hypothesis via the robustness engine seam, cross-case via `listForeignOverlays` find-by-ref), `RESOLVERS` registry + `resolveContext` (never throws). Anomaly is intentionally absent from the registry → deterministic `unsupported`. |
| `packages/web/src/lib/context/use-investigative-context.ts` | Controller hook: `{ context, contextIdentity, select, focus, reveal, clear }`. Provider-agnostic; one `useState` slot. |
| `packages/web/src/lib/context/use-context-resolution.ts` | `useContextResolution(context)` → `{ context, resolution, loading }` with a **generation-token race guard**: every context change bumps the generation; a resolution only commits if it is still the latest handler — a stale slow `A` can never overwrite a newer `B`. |
| `packages/web/tests/pr3-investigative-context.test.tsx` | 35 tests: pure contract, resolver over the demo bundle, controller + deterministic race, ContextualPanel render-state contract, full shell end-to-end bridge, deep-link intent, source guards (clickable GraphCanvas mock capturing `focusNode` via `vi.hoisted`). |

## D. Files Changed

- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — becomes the context owner: hosts `useInvestigativeContext`, computes `capabilities`, owns `focusRequest`, intercepts action patches (overlay activate→cross-case select, deactivate→clear cross-case only), forwards `select`/`focus`/`reveal` to panels, adds `handleTimelineActivate`, `onEventActivate`, `data-capability`/`data-slot` props (section K).
- `packages/web/src/components/graph/control-center/contextual-panel.tsx` — canonical consumer rewritten around `context` + `useContextResolution`; six distinct render states; `data-context-state/kind/panel-kind/resolved-title/row-value` hooks; unsupported / not-found copy kept honest.
- `packages/web/src/components/graph/control-center/operational-rail.tsx` — Focus is now real and capability-gated; all other investigative commands stay disabled but carry `dataCapability` + capability-aware `disabledHint`.
- `packages/web/src/components/graph/control-center/investigative-intelligence.tsx` — Overview becomes context-aware (`Overview · Entity` + bridge note via `data-intelligence-context-selection`); still refuses to fabricate reasoning data.
- `packages/web/src/components/graph/graph-panel.tsx` — new optional `onContextSelect` + `focusRequest`; node/gap selection and drawer-close emit canonically tagged contexts; foreign nodes map to their owning overlay ref; deep-link intent effect; emit handlers relocated after `finalNodes` (use-before-declaration fix).
- `packages/web/src/components/timeline/timeline-panel.tsx` — diamond events gain `role="button"`, `tabIndex`, `aria-label="Activate {label}"`, click + Enter/Space → optional `onEventActivate`.

## E. Files Removed

None. PR-3 removes nothing; it replaces the PR-2 `selectedContext` placeholder in the contextual panel with the canonical discriminated selection and rewires wiring, not files.

## F. Files Intentionally Untouched (scope discipline)

- `graph-canvas.tsx`, `use-graph-layout.ts`, `graph-hull.tsx`, `graph-live.ts`, hole-burst layer — untouched; the focus seam goes through the existing `controlsRef.focusNode`.
- Demo/Live providers, all demo fixtures, and fixture databases — untouched; `lib/context` and control-center components are source-guarded against importing them.
- `app/investigations/[id]/judge/page.tsx` — still standalone `<GraphPanel activeTimeRange={null} />`.
- Hypothesis engine, robustness measurement, leads, entity-resolution intelligence packages — untouched; the resolver consumes their existing seams only.

## G. The canonical selection — `InvestigativeContext`

Identity = **kind + id**; `source` is interaction metadata only and never changes identity:

```
type ContextKind   = "entity" | "relation" | "evidence" | "observation" | "lead"
                   | "hypothesis" | "gap" | "anomaly" | "cross-case"
type ContextSource = "graph" | "timeline" | "context-panel" | "intelligence"
                   | "rail" | "deep-link" | "drawer" | "external"
interface InvestigativeContext { kind; id; source }
```

Consequences enforced everywhere downstream:

- `contextKey(ctx)` = `"entity:b1e0…041"` — a stable key the shell can compare in O(1).
- `sameContextIdentity(a, b)` compares kind+id only, so a deep-link `{entity, ENT_VICTOR, deep-link}` and a graph click `{entity, ENT_VICTOR, graph}` are the SAME selection.
- Selection ≠ resolution: selecting Victor Aldridge stores only his id. The resolver re-reads `entities.get` at render time, so a later rename or new evidence count shows up without touching selection state.

## H. Context Resolver — selection ≠ resolution

`resolveContext(workspace, context)` never throws. Every failure collapses into a discriminated state:

| Failure | State | UI copy |
|---|---|---|
| provider `ProviderError.NOT_FOUND` / missing lookup | `not-found` | "Object unavailable … no longer exists" |
| `ProviderError.UNSUPPORTED` OR no registered resolver | `unsupported` | "Context unavailable … selection is preserved" |
| any other provider failure | `error` | ErrorDisplay |

Seam decisions (all verified against the actual provider surface):
- **Observation** has no `get(id)` — resolved via `listByInvestigation(investigationId, { pageSize: 200 })` + `find` (the demo observation set is small and deterministic).
- **Hypothesis** authority stays in the hypothesis engine's robustness seam (`robustness.getResult`); the resolver surfaces its deterministic output (`78/100` for `HYP_1`) and never re-derives an InvestigativeLeadReport. Unknown hypotheses → `not-found`.
- **Cross-case** resolved via `crossCase.listForeignOverlays(caseId)` find-by-ref (no `MOCK_FOREIGN_CASES`/`FOREIGN_ENTITIES_DB` exists to lean on).
- **Anomaly** has no provider seam in PR-3 → intentionally unregistered → deterministic `unsupported`. This is the "live-unsupported ≠ nothing-selected" guarantee: the selection is preserved, only the view is unavailable.

The registry pattern means a later PR (entity resolution, reasoning layer) adds a resolver entry without touching consumer components.

## I. Resolution lifecycle + race guard

`useContextResolution` bumps a generation counter on every context change and commits only the latest handler's result:

```
generation = ++generationRef.current
setLoading(true); setResolution(null)
resolveContext(workspace, context).then(res => {
  if (cancelled || generation !== generationRef.current) return; // stale — discard
  setResolution(res); setLoading(false);
})
```

The PR-3 suite proves this deterministically: an entity provider whose `get` sleeps 40ms for Victor Aldridge is rendered, the selection switches to Maria after 5ms, Maria resolves, and even after waiting 60ms the Victor resolution never overwrites Maria. Layout state is untouched by resolution: collapsing/reopening either side panel or churning temporal/intelligence tabs re-resolves the SAME context without clearing it (all tested).

## J. Capability mapping — one source of truth

`getContextualCapabilities(context, { mode })` is the ONLY decision surface for rail enabling — no scattered `selectedEntityId` checks anywhere:

| Kind | Focus | Expand | Trace | Review | Resolve | Challenge |
|---|---|---|---|---|---|---|
| entity | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| relation | – | ✓ | ✓ | ✓ | – | ✓ |
| evidence | – | ✓ | ✓ | ✓ | – | – |
| observation | – | ✓ | ✓ | ✓ | – | – |
| lead | – | ✓ | ✓ | ✓ | ✓ | – |
| hypothesis | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| gap | – | ✓ | ✓ | ✓ | ✓ | – |
| anomaly | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| cross-case (demo) | – | ✓ | – | ✓ | – | – |
| cross-case (live) | – | ✓ | – | – | – | – |

`null` selection → `EMPTY_CAPABILITIES` (all false). **Capability ≠ implementation**: a capability says what the selection conceptually supports; the business command may still be un-wired (PR-4/PR-8), in which case the surface renders disabled-with-hint, never fake-enabled.

## K. Shell wiring — the single owner

`GraphControlCenter` holds `{ layout, actions, context }` as three independent models. Selection never lives inside a panel:

- Node click → `{ entity, id, source:"graph" }` (foreign overlay nodes → `{ cross-case, overlayRef, source:"graph" }`); gap pick → `{ gap, id, source:"graph" }`; drawer close → `select(null)`.
- **One-panel rule:** in the shell, node/gap selection surfaces through the RIGHT contextual panel ONLY — the legacy in-graph `EntityDrawer`/`GapDrawer` are gated on `onContextSelect === undefined` (`isStandalone`), so they remain only for standalone/judge rendering. The shell never renders both surfaces at once. The `selectedNodeId` canvas highlight (and `rightOffset`) is suppressed for the removed drawers in shell mode so the graph keeps full width.
- **Reveal-on-re-click:** graph emissions are handled by `handleGraphContextSelect`, not a bare `select`. A non-null emission reopens the right contextual panel if it was collapsed (re-clicking a still-selected node after collapsing brings the panel back); re-clicking the SAME selection while the panel is open toggles it OFF via `clearSelection` — the "focus goes away" affordance, which ALSO requests a camera refit (zoom out). Identity comparison uses `sameContextIdentity` (kind + id), so a re-clicked entity while a cross-case overlay is active re-selects the entity (never misfires).
- **One analysis surface for right-side overlays:** opening Discover/Detect Gaps collapses `rightPanelOpen` so the overlay never double-covers the graph next to the contextual panel; the legend and the left-side cross-case scan are exempt. Selecting a gap from the overlay reopens the panel with the gap; **re-browsing** — clicking Detect Gaps again while a gap is pitched → `clearSelection` + surface open + panel collapse, so the LIST returns (gaps-list visibility is context-driven in shell mode via `gapListVisible`, not a stale local row flag).
- **Click-away to unfocus:** empty-canvas pointer-down clears the bridge and the graph highlight via a new `onCanvasBackgroundPointerDown` canvas seam, and requests the same refit. The canvas highlight is derived to a GRAPH node id (entity → `finalNodes` id) from the shell context, so it tracks and clears correctly.
- **Gentle focus:** `focusNode` now centers the target with a bounded 1.4x–3x zoom (importance-tuned, `MAX_ZOOM`-capped) instead of diving to up to ~3.15x, keeping neighbors in view while still giving a clear close-up — no abrupt "graph zooms in and nothing can be seen". The focus highlight **follows the selection**: clearing or switching the selection drops the `focusedNode` ring (and background click-away clears it too), so a previously focused node never stays lit after the cursor moves away.
- **Smooth bridge reveal (staged):** activating a cross-case overlay now runs a **two-stage camera sequence** instead of a single jump: `fit()` at 150ms (the camera pulls OUT to frame the whole just-grown graph so the user sees the foreign nodes appear), then after the full graph has a beat to settle, `focusPair(localBridgeAnchor, foreignHead, 1100ms)` at 1700ms — a long, slow, separately-eased move (default `"400ms cubic-bezier(0.22, 1, 0.36, 1)"`, overridden per focus) to the shared-infrastructure BRIDGE: the local target node the foreign case attaches to plus the foreign island head. The connection appears as an intentional camera scene, never an abrupt zoom-out dive.
- **Zoom-out on deselect:** every user-driven deselect (re-click toggle-off, blank-canvas click-away, cross-case overlay deactivation, gap re-browse) clears the bridge AND requests a camera refit via a shell `refitRequest` → GraphPanel `fit()` — the "focus gone" state visibly releases the frame back to the full graph instead of lingering on a ghost point. Deselect is also part of the Cross-case flow's film: exiting a cross-case scan, the camera refits to the case graph, which is precisely the cursor reset the user asked for.
- Operation-rail Focus → `focus(next)` + a nonce-bumped `focusRequest`; GraphPanel resolves entityId → graph node deterministically and calls `controlsRef.current.focusNode`. No match → focus-unavailable; selection untouched.
- Timeline diamond (`onEventActivate`) → `reveal({ evidence|observation, id, source:"timeline" })` + opens the right panel.
- Action-patch interception: activating an overlay selects `{ cross-case, ref, source:"rail" }`; deactivating clears ONLY a cross-case selection — a real entity selection survives overlay toggling (tested both directions).
- `?focus=` deep link is an INITIAL intent: standalone GraphPanel emits `{ entity, ENT_VICTOR, source:"deep-link" }` once and centers the node.

## L. Consumer surfaces

- **ContextualPanel** — the canonical consumer. Six distinct states (empty/loading/resolved/unsupported/not-found/error) exposed via `data-context-state`; resolved view renders title/subtitle/summary/rows from the resolver. Unsupported keeps the selection visible (data-context-state ≠ empty).
- **OperationalRail** — Focus row is fully wired and capability-gated (`data-slot="focus"`, `data-capability`). Expand/Find Connections/Trace Evidence/Review/Resolve/Challenge remain disabled but now reflect the selection's conceptual capability and show a context-aware hint ("This selection has no deterministic graph target", "wired in PR-4", "wired in PR-8"). Cross-case picker unchanged and drives selection on activate/deactivate.
- **InvestigativeIntelligence** — Overview renders `Overview · Entity` + a bridge note (`data-intelligence-context-selection`) while still refusing fabricated reasoning data; the other four tabs keep PR-2 placeholders.
- **TimelinePanel** — every diamond is an accessible `role="button"` (`aria-label="Activate {label}"`) whose click/keyboard activation surfaces the backing evidence or observation via the bridge.
- **GraphPanel** — optional `onContextSelect`/`focusRequest`; deep-link + drawer-close emission; stays fully standalone for the judge stage.

## M. Deep-link intent, source tags, a11y

- `?focus=` maps to `source:"deep-link"` so consumers (e.g. analytics/URL sync in a later PR) can distinguish URL intent from interactive selection without affecting identity.
- Focus moves to the reopen strip on panel collapse (PR-2 behavior preserved); Focus/Expand/etc. are `button` elements with `title` hints and `data-capability` for tests/a11y; renamed diamond affordances are keyboard-operable with visible `focus-visible` rings.
- Source guards: `lib/context` and control-center components import no `providers/(demo|live)`, no demo fixtures, and never construct `create(WorkspaceDemo|Live)Providers` — enforced by a test that inspects import lines only (so documentation prose about guards does not trip the check).

## N. Verification

- `packages/web` — `pnpm test` **425/425 across 41 files**; PR-3's new file alone **42/42**. Suite includes the deterministic race test, both cross-case overlay directions, selection survival across collapse/tab churn, the shell one-panel rule (no legacy drawer), standalone drawer preservation, deep-link emission, and the UX flow fixes (re-click reopens a collapsed panel / toggles off an open one, click-away clears, Detect Gaps collapses the panel, gap re-browse returns the list, deselect requests a camera refit).
- Typecheck exit 0: `web`, `platform`, `contracts`, and all four intelligence packages (`entity-resolution`, `graphology-projection`, `ingestion`, `relation-resolution`).
- Production build (`next build`) exit 0; graph route first-load 212 kB — no bundle blowup from the bridge.
- Behavioral bug found by the PR-3 suite and fixed this PR: `graph-panel.tsx` referenced `finalNodes` in `handleNodeSelect` before its `useMemo` declaration (TS2448/TS2454) — emit handlers relocated below the memo. No runtime regressions in PR-0/1/2 (their suites stay green).

PR-4 can now begin.