# PR-1 — Application Navigation Dock + Provider-Boundary Cleanups (T1–T5)

**Status:** DELIVERED — all verification green (web 362/362 tests, all packages typecheck exit 0, production build exit 0).

## A. Scope & Goal

PR-1 delivers INDAGO V7's shell + swappability slice:

1. **Application navigation dock** — the fixed left application sidebar (which doubled as an oversized fixture of the graph redesign) is replaced by a detached, horizontal, workspace-level navigation dock. It is a pure navigation surface with **no graph functionality**; the graph redesign and five-zone "graph control center" is PR-2.
2. **T1–T5 provider-boundary cleanups** — finish the work started in PR-0: GraphPanel imports no demo fixtures, cross-case overlays and investigative gaps flow through typed provider seams, the timeline contract is normalized to a single global sort, and the `f-pr4` test config wart is migrated off stale fields.

PR-1 changes no graph rendering, layout algorithm, panel behavior, or the `?focus=`/`controlsRef` contract. All seams listed in section B are unchanged.

## B. Frozen Contract (untouched by PR-1)

- `WorkspaceProviders` bundle shape and factory signatures in `lib/providers/types.ts`.
- All provider interfaces in `lib/providers/types.ts` (existing members unchanged; `CrossCaseProvider` only gained a new optional capability member `listForeignOverlays`, which default types ignore).
- `GraphRealtimeCatalog`, `catalogKey()`, `RealtimeProvider`, `GraphProvider` interfaces.
- `GraphPanel` public export name, props, and `controlsRef` behavior (`fit`, `focusNode`, `fitGraphToBounds`); `GraphCanvas`, `useGraphLayout`, `?focus=` deep-link semantics.
- Timeline panel member behavior (domain/density computation) and the demo realtime choreography (initial paint, SSE-ish diffs, out-of-band stack-invariant).
- `getDataModeConfig`, `dataModeFromEnv`, latency helpers (`baseLatency`/`heavyLatency` now read `config.demoTimingScale`).

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/workspace/nav.ts` | Dependency-free shared navigation module: `NavEntry`, `WORKSPACE_NAV` (13 entries), `workspaceSubroute`, `isNavEntryActive`, `isDashboardPathname`, `isInvestigationWorkspacePathname`. |
| `packages/web/src/components/layout/workspace-nav-dock.tsx` | Detached horizontal dock rendered inside every investigation workspace: Brand, all 13 destinations, `aria-current="page"`, case-boundary hrefs, investigation context (real title/status + graph version `v{n}` with silent catch), Demo/Live mode pill. |
| `packages/web/src/components/layout/app-nav-dock.tsx` | App-level dock (Brand + Dashboard) for non-workspace routes; returns `null` on investigation paths. |
| `packages/web/src/lib/intel/gap-adapter.ts` | `mapInvestigativeGapToGapMock(gap, resolveLabel?)` + `GapEntityLabelResolver` — canonical `InvestigativeGap` → display `GapMock` (T3). |
| `packages/web/tests/pr1-provider-boundary.test.ts` | Provider seam, nav-module, T4 regression, and source-guard unit tests. |
| `packages/web/tests/pr1-navigation-dock.test.tsx` | DOM test of both docks (mocked `next/navigation` + `next/link`, real demo provider bundle). |
| `packages/web/tests/pr0-graph-baseline.test.ts` | New PR-0 regression suite (already present from PR-0; coupling guard now expects `[]`, timeline comment updated for T4). |

## D. Files Changed

- `packages/web/src/app/layout.tsx` — removed `<Sidebar />` + `pl-60` body padding; mounts `<AppNavDock />`; `<main>` becomes `min-h-screen`.
- `packages/web/src/lib/providers/workspace/shell.tsx` — shell now renders `<WorkspaceNavDock />` above children; navigation state logic removed from the shell; provider-agnostic (guarded by test).
- `packages/web/src/lib/providers/types.ts` — added `ForeignGraphNode`, `ForeignGraphEdge`, `ForeignCaseOverlay`, and `CrossCaseProvider.listForeignOverlays(caseId, query?)`.
- `packages/web/src/lib/providers/demo/providers.ts` — `DemoEntityProvider.get` falls back into `FOREIGN_ENTITIES_DB` (T2); `DemoCrossCaseProvider.listForeignOverlays` serves `MOCK_FOREIGN_CASES` paginated by ref; `DemoTimelineProvider.getTimeline` globally sorted via stable `compareTimelineAscending` (T4).
- `packages/web/src/lib/providers/live/providers.ts` — `UnsupportedCrossCaseProvider.listForeignOverlays()` → `providerUnsupportedPaginated("crossCase.listForeignOverlays")` (T4).
- `packages/web/src/components/graph/graph-panel.tsx` — T1/T2/T3 (section G/I), now demo-free.
- `packages/web/tests/f-pr4.test.ts` — T5 config migration (section K).

## E. Files Removed

- `packages/web/src/components/layout/sidebar.tsx` — the fixed left application sidebar (only `app/layout.tsx` imported it). Its remnants (graph mock-up, demo-fixture "catalog", overflow nav) are fully superseded by the dock and must NOT be resurrected into the PR-2 layout.

## F. Files Intentionally Untouched (scope discipline)

- `src/app/investigations/[id]/gaps/page.tsx` — keeps its own separate `DEMO_GAPS` copy. Documented follow-up: replace with the provider seam + adapter. Not changed to avoid pre-empting PR-2's five-zone containers.
- Demo fixture modules (`MOCK_FOREIGN_CASES`, `FOREIGN_ENTITIES_DB`, gaps/cross-case/timeline fixtures, `upload-demo-sequence`) — still exported so the PR-0 fixture regression suites stay green; their *importers within `src`* are gone.
- All graph internals (`graph.ts`, `use-graph-layout.ts`, `graph-canvas.tsx`, `graph-hull.tsx`, `graph-legend.tsx`, panel headers/legend styles).

## G. T1 — GraphPanel demo decoupling (graph-panel.tsx)

Removed from `graph-panel.tsx`:
- `import { uploadDemoCatalog }` and the speculative merge/upload effect.
- Direct imports of `MOCK_FOREIGN_CASES` / `FOREIGN_ENTITIES_DB`.
- The `useEffect` that monkey-patched `workspace.entities.get` to serve fixture entities.

GraphPanel now consumes only provider seams. Nodes/edges of merged foreign cases are cast from canonical overlay data (`ForeignGraphNode`/`ForeignGraphEdge`) into the canvas shape.

**Guards:** `tests/pr0-graph-baseline.test.ts` coupling guard expects **no** references to `MOCK_FOREIGN_CASES` / `FOREIGN_ENTITIES_DB` / `DEMO_GAPS` / `uploadDemoCatalog` / `providers/demo` anywhere under `src/components/graph/`; `tests/pr1-provider-boundary.test.ts` extends the same guard to `src/components/layout/` and asserts the shell + nav module carry no provider imports.

## H. T2 — Cross-case capability behind the provider seam

- New typed seam `crossCase.listForeignOverlays(caseId, query?)` returning `Paginated<ForeignCaseOverlay>`.
- Demo: `DemoCrossCaseProvider` serves `MOCK_FOREIGN_CASES` (keyed `cobalt`/`crimson`, `localTargetMatch` VICTOR/MARIA, `bridgeSupport` 0.87/0.76), paginated.
- Live: `UnsupportedCrossCaseProvider.listForeignOverlays()` rejects with `ProviderError.code = "UNSUPPORTED"` via `providerUnsupportedPaginated` — the UI's `catch` surfaces an empty state (no cross-case menu) rather than silently falling back to demo data.
- Foreign entity resolution: `DemoEntityProvider.get` falls back into `FOREIGN_ENTITIES_DB` (empty-array defaults for optional relationship buckets), so the EntityDrawer resolves foreign node IDs with **no UI monkey-patch required**. Unknown ids still surface `NOT_FOUND`.

## I. T3 — Investigative gaps adapter

`gap-adapter.ts` maps canonical `InvestigativeGap` → display `GapMock`:

| Canonical | Display (GapMock) |
|---|---|
| `type` MISSING_EVIDENCE / UNRESOLVED_IDENTITY·RELATION / TEMPORAL·GEOGRAPHIC·FINANCIAL·COMMUNICATION / other | `holeType` MISSING_COMPARISON / ISOLATED_NODE / INFRASTRUCTURE_GAP / ISOLATED_NODE |
| `priority` HIGH·CRITICAL / MEDIUM / LOW | `impact` HIGH / MODERATE / LOW |
| `status` ACKNOWLEDGED·PARTIALLY_ADDRESSED / ADDRESSED·WONFIX / else | `status` EVIDENCE_REQUESTED / RESOLVED / OPEN |
| `description \|\| title` | `missingRelationship` |
| `relatedEntityIds` (default `[]`) | `affectedEntities` via resolver → node labels (falls back to the raw id) |

`graph-panel.tsx` builds the label map from `finalNodes` (`entityId → label`) and adapts the three demo gaps ("Unknown counterparties on account 0093", "Principal behind signing authority", "Timing of laundering operations") at the provider boundary. `GapsPage` remains on its own copy (section F).

## J. T4 — Timeline contract normalization (single global sort)

`DemoTimelineProvider.getTimeline` returns globally ascending items via a stable `compareTimelineAscending` (unknown-precision timestamps sort last). This is SAFE by design: the timeline panel's band assignment and density derivation are order-independent (domain derived from min/max; count from length), and the live/SSE listener already performed an equivalent global sort (`lib/providers/workspace/timeline.ts:99`). PR-0's per-band membership assertions remain green; the new test locks global monotonicity + member determinism across two calls.

## K. T5 — f-pr4 config wart migration

`tests/f-pr4.test.ts` no longer passes the stale `{ simulateLatency: false }` flag (latency helpers read `config.demoTimingScale`). It now builds its mode config with `getDataModeConfig({ NODE_ENV: "test", DATA_MODE_ENV: "demo", DEMO_CASE_ID_ENV: CASE_ID, TIMING_SCALE_ENV: "0.001" })`, matching `f-pr2`/`f-pr3` setup.

## L. Verification

| Gate | Result |
|---|---|
| Web unit suite (`pnpm test` in `packages/web`) | **362/362 passing** across 39 files (333 pre-existing + 29 new PR-1). Zero failures, zero regressions. |
| New suites | `pr1-provider-boundary.test.ts` (17 tests: overlay seam, foreign entity fallback, NOT_FOUND, gaps seam + adapter incl. label resolution, T4 monotonic regression, live UNSUPPORTED, ProviderError shape, nav-module, source guards), `pr1-navigation-dock.test.tsx` (10 tests: all 13 destinations, `aria-current` per route, case-boundary hrefs, no `/investigations/new` link, investigation context + mode pill, AppNavDock visibility). |
| Typecheck | `packages/web`, `packages/platform`, `packages/contracts`, `packages/intelligence` (all sub-packages) — exit 0. |
| Production build (`pnpm build` in `packages/web`) | exit 0; all `/investigations/[id]/…` routes + `/` + `/investigations/new` present. |
| Platform integration/e2e | Not run — require live Neon Postgres + Upstash Redis and exceed the 5-minute shell cap. PR-0 acceptance already ran the DB-free platform units. |

## M. Known Caveats / Cosmetic Deltas

- **Cross-case action labels are title-derived** — the merged/active menus show `"Match: Operation Cobalt"` / `"Merged: Operation Crimson"` (from overlay `title`) instead of the old hardcoded labels. Intentional; title is the canonical surface.
- **The dock is in-flow, not `fixed`** — a centered `max-w-fit` card (rounded, bordered, backdrop-blur, `flex-wrap`) mounted inside `WorkspaceShell`/`AppShell`. It reserves no left-edge gutter and "floats above the graph" visually, but scrolls with the page. If PR-2 requires a truly fixed control-center bar, that is a layout follow-up (PR-2's five-zone containers), not a correctness change.
- **GapsPage keeps its separate hardcoded copy** of gaps fixtures (section F). The two copies can drift until the follow-up lands.
- **Investigation title in the dock is the real data** ("Financial Shadow — Shell Network"), which differs from the PR spec's illustrative "OPERATION FINANCIAL SHADOW" — the dock shows live fixture values by design.
- PR-0's genuinely-blocked DB-backed checks (per-zone seeding, order-book persistence) remain unresolved and out of PR-1's scope.

## N. Risks / Notes for PR-2

- The dock is low-risk for the graph redesign: it touches no graph internals and forwards the case boundary + active route to the same layout slot the sidebar used.
- PR-2 must not reintroduce fixture content into `components/graph/**`; the coupling guards in `pr0-graph-baseline.test.ts` and `pr1-provider-boundary.test.ts` will fail on any such import.
- If PR-2 reuses the cross-case/jurisdiction "control center" bar as five-zone header furniture, base it on the provider-driven overlays (section H) rather than re-adding fixture imports.
- The `sidebar.tsx` relic (fixture merge + "graph control center" mock) is deleted; PR-2's containers should be implemented against provider canvas state, not resurrected fixture logic.

---

**PR-2 can now begin.**