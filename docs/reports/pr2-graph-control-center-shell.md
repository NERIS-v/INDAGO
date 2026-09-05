# PR-2 — Graph Control Center (Five-Zone Workspace Shell)

**Status:** DELIVERED — all verification green (web 383/383 tests across 40 files, all packages typecheck exit 0, production build exit 0). One behavioral bug was found and fixed by the PR-2 suite (`toggleAction` was dropping the independent legend on exclusive surface-openers).

## A. Scope & Goal

PR-2 delivers INDAGO V7's **Graph Control Center** workspace shell — a five-zone layout and composition PR:

1. **Top row (three columns).** Left **operational rail** (commands), center **graph workspace** (the preserved graph engine), right **contextual panel** (structural container for object context).
2. **Bottom band (two halves).** **Temporal / case context** (hosts the existing TimelinePanel under a TIME/ACTIVITY/VERSIONS tab system) and **investigative intelligence** (OVERVIEW/HYPOTHESES/SIGNALS/EVIDENCE/ACTIVITY structural container).
3. **Side-panel collapse/reopen.** Either side panel independently collapses to a narrow reopen strip; the graph column — always `minmax(0, 1fr)` — genuinely reclaims the width and is **never unmounted**.

PR-2 is **layout + composition only**. It rewrites no graph rendering, layout algorithm, or physics; it adds no intelligence/AI, hypotheses, evidence reasoning, or backend behavior. Disabled rail slots say "Planned"; overview/intelligence surfaces show quiet readiness without fabricated numbers.

## B. Frozen Contract (untouched by PR-2)

- `GraphPanel` public export name and props; `GraphCanvas` engine glue (`controlsRef.fit/focusNode/fitGraphToBounds`), `useGraphLayout`, `graph-canvas.tsx`, `graph-hull.tsx`, hole bursts, drag/zoom/pan, `?focus=` deep-link, temporal filtering, community/bridge rendering.
- `TimelinePanel` (`onTimeRangeChange`, domain/density computation, play choreography, global sort) and the demo realtime choreography.
- All provider interfaces in `lib/providers/types.ts` (including `CrossCaseProvider.listForeignOverlays` and `GraphRealtimeCatalog`).
- `WorkspaceProviders` bundle shape/factories and `getDataModeConfig` latencies.
- **Layout state is separate from investigative selection state.** Selection (selected entity/edge/gap, active foreign overlay) stays inside the graph panel; the shell owns presentation only. PR-3 introduces the discriminated context bridge.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/layout/control-center.ts` | PURE state model: `ControlCenterLayoutState`, `TemporalTab`, `IntelligenceTab`, `GraphControlCenterActions`, defaults, and the geometry contract `controlCenterColumns(layout)` + `bottomBandHeightClass()`. |
| `packages/web/src/components/graph/control-center/graph-control-center.tsx` | Zone 0 orchestrator: SINGLE OWNER of layout + actions; exclusive-toggle logic (legend independent); lifts `listForeignOverlays` once and feeds both the rail picker and the graph panel. |
| `packages/web/src/components/graph/control-center/control-center-layout.tsx` | Five-zone geometry owner; `data-control-center-main`, `data-cols` (`rail-graph-context` / `rail-graph` / `graph-context` / `graph`), `data-graph-workspace`; moves focus to the reopen strip on collapse. |
| `packages/web/src/components/graph/control-center/panel-toggle.tsx` | Shared collapse/reopen affordance: open → compact collapse button inside the panel header; closed → full-column reopen strip. `aria-expanded`/`aria-controls`, focus forwarded. |
| `packages/web/src/components/graph/control-center/operational-rail.tsx` | Command rail (Graph / Investigate / Act-Verify groups). Wired slots: Layers→legend, Discover→DiscoveryPanel, Detect Gaps→gaps overlay, Cross-Case→provider-driven picker, Add Evidence→upload modal. Unimplemented slots are capability-aware disabled rows ("Planned"). |
| `packages/web/src/components/graph/control-center/contextual-panel.tsx` | Reusable context container with header, title area, content region, empty/loading/unsupported/error structural states, and a footer slot. PR-3 seam: `selectedContext?: ContextSelection \| null`. |
| `packages/web/src/components/graph/control-center/temporal-context-panel.tsx` | Bottom-left panel: TIME/ACTIVITY/VERSIONS tabs (roving `role=tab`, arrow keys); TIME composes the TimelinePanel; Activity/Versions structural placeholders. |
| `packages/web/src/components/graph/control-center/investigative-intelligence.tsx` | Bottom-right panel: five tabs (Overview default); structural, no fabricated data. |
| `packages/web/tests/pr2-graph-control-center.test.tsx` | 21 DOM + guard + geometry tests (mocked GraphCanvas + `next/navigation` + `next/link`, real demo provider bundle). |

## D. Files Changed

- `packages/web/src/components/graph/graph-panel.tsx` — controlled reachability for the shell (section L); console toolbar removed (section E); root containers now `h-full min-h-0`.
- `packages/web/src/app/investigations/[id]/graph/page.tsx` — page now composes the five-zone `GraphControlCenter` (keeps `Suspense`, `?focus=` searchParams, `timeRange` state at page level).
- `packages/web/src/lib/providers/workspace/shell.tsx` — height model replaced with a single contract: `flex h-dvh flex-col overflow-hidden`, dock `shrink-0`, children wrapper `flex-1 min-h-0 overflow-y-auto`.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — `toggleAction` now preserves `legendOpen` (and `activeForeignCaseId`) when opening other exclusive surfaces. **Bug fixed: the legend must coexist with discovery/gaps/cross-case/upload.**

## E. Files Removed

- Inside `graph-panel.tsx`: the second console toolbar (Legend / Discovery / Upload Evidence / Gaps / Cross-Case buttons + inline cross-case picker) and the `ConsoleButton` helper. The rail in the control center owns those functions now; the graph panel keeps only its legend popup.

## F. Files Intentionally Untouched (scope discipline)

- `app/investigations/[id]/judge/page.tsx` — still renders standalone `<GraphPanel activeTimeRange={null} />`; the optional-props fallback keeps it working with no control center.
- `graph-canvas.tsx`, `use-graph-layout.ts`, `graph-hull.tsx`, hole-burst layer, `graph-live.ts` — untouched; the shell relies on GraphCanvas's own ResizeObserver remeasure.
- `timeline-panel.tsx` — mounted as-is inside the TIME tab (its natural height is scrolled inside the tab panel).
- Demo/Live providers and fixtures — untouched; control-center source is guarded against importing them.

## G. Zone 0 — State model and the single owner

`GraphControlCenter` is the only component that holds layout and action state:

```
ControlCenterLayoutState { leftRailOpen, rightPanelOpen, temporalTab, intelligenceTab }
GraphControlCenterActions  { legendOpen, discoveryOpen, gapsOpen, crossCaseOpen, uploadOpen, activeForeignCaseId }
```

Every zone derives its open/closed/tab allocation from these objects — no scattered margin/padding hacks. `toggleAction` treats the legend as independent (it never resets it) while surface-openers are mutually exclusive among themselves. The shell fetches the foreign-case overlays **once** and passes them to both the rail picker and the graph panel (GraphPanel skips its own fetch when the prop is provided).

## H. Geometry contract — collapse reclaims real width

`controlCenterColumns()` returns `"{rail} minmax(0, 1fr) {right}"` used verbatim as `gridTemplateColumns`:

- open rail = `minmax(12rem, 15rem)`; open right panel = `minmax(16rem, 20rem)`; collapsed side = `2.5rem` reopen strip.
- The middle graph column is always `minmax(0, 1fr)` and absorbs exactly the space the side columns do not consume. Collapsing a side panel therefore genuinely grows the canvas container; GraphCanvas's existing ResizeObserver (400ms debounce) remeasures against the new dimensions. The canvas is never unmounted (test-verified same-element identity through collapse cycles).

Height model: the workspace shell owns the scroll region (`flex-1 min-h-0 overflow-y-auto`) and the control center fills it with `h-full`; the bottom band uses `h-[clamp(14rem,34vh,26rem)]` with each half scrolling internally. No magic pixel offsets.

## I. Zone 2 — Operational rail

Three groups: **Graph** (Search/Focus/Expand/Filter disabled; Layers→legend; Layout disabled), **Investigate** (Discover→DiscoveryPanel overlay; Find Connections disabled; Detect Gaps→gaps overlay; Trace Evidence disabled; Cross-Case→picker), **Act / Verify** (Add Evidence→upload modal; Review/Resolve/Challenge disabled). Connected slots set shell actions; disabled slots render as capability-aware rows ("Planned") instead of inventing business logic. The cross-case picker lists real provider titles (`Match: Operation Cobalt` / `Match: Operation Crimson`) and reflects an active overlay.

## J. Zone 4 — Contextual panel

A reusable container (not a bespoke widget) with header, selected-object title area, content region, empty/loading/unsupported/error states, and a reserved footer slot. PR-2 renders the quiet empty state. PR-3 will feed it through a single discriminated bridge (`selected * { kind, id }`).

## K. Zone 5 — Temporal and Intelligence tabs

- Temporal (left half): TIME composes the existing TimelinePanel; ACTIVITY and VERSIONS are structural placeholders (PR-7 wires the realtime feed and version replay).
- Intelligence (right half): OVERVIEW (default) renders a quiet readiness panel; HYPOTHESES/SIGNALS/EVIDENCE/ACTIVITY are structural (PR-5 wires the reasoning layer). No invented metrics on either side.
- Both implement the full APG tab pattern: `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`, `tabIndex` roving, arrow-key rotation with focus follow.

## L. GraphPanel — controlled-actions refactor

New optional props `actions?: GraphControlCenterActions`, `onActionsChange?: (patch) => void`, `foreignOverlays?: ForeignCaseOverlay[]`. When provided, the panel is controlled by the shell (no duplicate fetch); when absent (Judge stage), a `localActions` fallback + `publish()` keeps the panel fully functional. Internal surfaces now read `effectiveActions.*` (legend/discovery/gaps/upload/cross-case) and report changes through `publish`, so the shell, rail, and panel stay in one reactive loop. All root containers use `h-full min-h-0` to fill the graph cell.

## M. Responsive, reduced motion, a11y

- Wide: three-column top + two-column bottom. Constrained desktop wraps/overflows through the PR-1 dock; narrow mode degrades gracefully (no mobile redesign).
- `transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none`.
- Toggles expose `aria-expanded` + `aria-controls`; rail slots expose `aria-pressed`; panels are labelled regions (`Graph operations`, `Contextual panel`, `Temporal and case context`, `Investigative intelligence`); focus moves to the reopen strip on collapse so nothing is stranded.

## N. Verification

- **Web suite:** 383/383 tests / 40 files green, including the 21-test `pr2-graph-control-center.test.tsx` (geometry contract; five-zone initial layout; left/right/both collapse + reopen with `data-cols` transitions and graph-cell identity preservation; focus-to-strip; rail wiring and exclusivity — Layers persists across Discover, surface-openers close each other; Add Evidence modal; Cross-Case match activation; disabled "Planned" slots; tab systems with arrow-key roving; quiet Overview; source guards for `components/graph/control-center/**` + `lib/layout/control-center.ts`).
- **Typecheck:** exit 0 for `web`, `platform`, `contracts`, `intelligence` (incl. `intelligence/ingestion`).
- **Production build:** exit 0 (Next 15, 18 routes; graph route bundles the shell composition).
- **Manual visual verification checklist (browser, when running the app):** wide; left collapsed; right collapsed; both collapsed; reopen each; bottom tabs (Time↔Activity↔Versions); intelligence tabs; isolated panel scrolling; graph interactions (drag/zoom/fit) after a resize; keyboard nav (tab order, arrow-key tab rotation); reduced-motion preference; Live mode (unsupported stays unsupported — no Demo leakage).

## O. Risks / Notes for PR-3

- The contextual panel is a pure container awaiting the PR-3 discriminated context bridge (`selectedContext`/`state`/`title`/`footerSlot` are already plumbed as seams).
- `TimelinePanel` keeps its natural height inside the TIME tab and scrolls within the tab body; if PR-3/PR-7 restyles timeline density, keep the scroll ownership inside the tab panel.
- Platform integration / live e2e remain unverifiable here (require live Neon + Upstash Redis); the DB-free units remain the PR-2 acceptance surface.
- The `toggleAction` legend-preservation fix is covered by the Layers test — do not regress independent-legend coexistence in later PRs.
- Judge stage keeps using the GraphPanel fallback (uncontrolled) — changing GraphControlCenter's action model must not break that path.

---

**PR-3 can now begin.**