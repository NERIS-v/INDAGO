# PR-7 — Temporal Reference, Activity Feed & Version Context

**Status:** DELIVERED. The contextual panel's TIME / ACTIVITY / VERSIONS tabs are now a single coherent **temporal workspace**: one shared time controller (TIMELINE unchanged), one streamed + deduplicated activity feed, and an **honest version surface** that lists deterministic historical snapshots, marks the ACTIVE current one, and lets the user enter a locked historical view that never silently mutates and never fabricates a list. Full web suite **62 files / 667 tests, 667 passed** including all 45 `pr7-*` tests, the re-targeted `pr2-graph-control-center` suite, and the untouched `pr6-*` suites. Version support is **additive-optional by user decision**: `GraphProvider` gained optional `listVersions?`/`getVersionById?`; the demo seam returns a deterministic multi-version series, the live seam throws honest typed-unsupported. Root `pnpm typecheck` and `next build` are currently blocked **only** by the parallel `src/lib/network/matrix/` WIP (untracked, owned by another workstream); every PR-7 file reports clean in the emitted tsc/builder diagnostics.

---

## A. Scope & Goal

PR-7 unifies the three temporal surfaces of the `TemporalContextPanel` into one **temporal workspace state** and gives the version surface real, honest behavior:

- **TIME tab** — unchanged contract: the shared `timeRange` from `useNetworkWorkspace()` is the only temporal controller.
- **ACTIVITY tab** — a live activity feed driven by the realtime/SSE seam, deduplicated against the provider memory-bank replay by a stable `eventKey`, newest-first, bounded, with an honest status badge and a record-only banner in historical view.
- **VERSIONS tab** — a **version list + summary** derived from a deterministic demo series (`v1 SUPERSEDED → v2 SUPERSEDED → v3 ACTIVE COMPLETE`), marking the ACTIVE current version, rendering projection meta from canonical fields only, and supporting an explicit historical selection that locks the surface to that version with an honest replay note (no current-graph fallback, no fabricated projections).

The panel now owns a `TemporalVersionSelection` (`{ mode, versionId }`) — default `current` — while strictly preserving the parent contract `{ tab, onTabChange, children }` consumed by the five-zone shell. No `/as-of` call, no current-graph fallback, no invented version data.

## B. Frozen Contract (untouched by this deliverable)

- Provider seams are **additive only**: `GraphProvider` gained two optional members, `listVersions?` and `getVersionById?`; every existing method and signature is unchanged. Demo/live provider bundles, `getDataModeConfig`, `ProviderError` codes, `WorkspaceProvider`, capability table: untouched.
- `TemporalContextPanel` parent pipeline — `{ tab, onTabChange, children }` and the `activeTab` handshake with `graph-control-center.tsx` — unchanged; the shell renders it exactly as before.
- The five-zone shell geometry, `graph-canvas.tsx`, `graph-panel.tsx`, `use-graph-layout.ts`, D3 physics, selection, temporal filtering, cross-case layers: untouched.
- Investigative Intelligence tabs, operational rail, pulse/matrix/flow WIP, `nav.ts`/`page.tsx`/`capabilities.ts`/`timeline-panel.tsx` (parallel WIP, never touched here).
- `GraphVersion` / `ObservedTime` contracts in `@indo contracts` — read as-is; `createdAt`/`updatedAt` are `{ value, precision }` observed-time objects, rendered via `.value`.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/context/temporal-workspace.ts` | **Pure, deterministic temporal-version module** (no React, no provider imports). `TemporalVersionMode "current"\|"historical"`, `TemporalVersionSelection { mode, versionId: string\|null }`, `CURRENT_VERSION_SELECTION`, `isHistoricalView`, `realtimeMayMutateVisibleGraph`, `deriveVersionViewState` (union `loading / current / historical / historical-unavailable / unsupported`; unsupported wins over pending; historical without a selected version → `historical-unavailable`, never a current fallback), `sortVersionsByNumber` (ascending, no mutation), `activeVersion` (ACTIVE status wins, else newest), `versionLabel "vN"`, `HISTORICAL_SURFACE_UNAVAILABLE` + `HISTORICAL_NO_SILENT_MUTATION` messages. |
| `packages/web/src/lib/context/activity-feed.ts` | **Pure activity-feed reducer**. `ActivityFeedState { events, seen }`, `createActivityFeedState`, `eventKey` (`id ?? action\|targetId\|timestamp` composite), immutable `reduceActivityEvent` (stable-key dedupe, newest-first, bounded), `reduceActivityBatch`, `formatActivityTime` (`"--"` for missing/invalid, else UTC ISO slice), default bound `DEFAULT_ACTIVITY_FEED_LIMIT = 100`. |
| `packages/web/src/components/graph/control-center/temporal/activity-feed.tsx` | `TemporalActivityFeed` — subscribes through the realtime seam (`connect`/`subscribe` with the memory-bank replay), reduces events into the feed, status badge, interval refresh, `data-activity-*` hooks, record-only banner when historical. |
| `packages/web/src/components/graph/control-center/temporal/versions-panel.tsx` | `TemporalVersionsPanel` — loads `getVersion` (current) + `listVersions` (series; missing/unsupported → typed unsupported state), `deriveVersionViewState`, `VersionSummary` (n / m nodes·edges · PROJECTION, `data-version-badge`, `.value` timestamps), `VersionList` (`data-version-number`, `aria-label="view-version-N"`, `data-version-current-mark`, `aria-pressed`, status badges), return-to-current control, honest unsupported pane, replay note. |
| `packages/web/tests/pr7-temporal-workspace-context.test.ts` | **19 pure tests** — unsupported-wins, pending-loading, historical not downgraded to current, no-current-fallback for historical, `historical-unavailable` with the honest message, integrity guards, ascending sort (no mutation), `activeVersion` ACTIVE-wins/newest/empty rules, `versionLabel`, default selection. |
| `packages/web/tests/pr7-activity-feed.test.ts` | **16 pure tests** — `eventKey` id/composite/fallback, dedupe (id, composite, id-overrides-composite), newest-first append, custom + default bounds, immutability, `reduceActivityBatch`, `formatActivityTime`. |
| `packages/web/tests/pr7-activity-feed.test.tsx` | **3 component tests** — streams events through the realtime seam, de-duplicates memory-bank replay by stable key, record-only banner under historical selection. |
| `packages/web/tests/pr7-versions-panel.test.tsx` | **7 component tests (demo fast env `TIMING_SCALE_ENV=0.001`)** — series listed ascending; v3 ACTIVE marked current with statuses; summary projection meta; select-dispatches `GRAPH_VERSION_V1`; locked historical view + honest replay note (never mutates); return-to-current; live seam honesty — unsupported surface without any fabricated list. |

## D. Files Changed

- `packages/web/src/lib/providers/types.ts` — (`GraphProvider`) added optional `listVersions?(investigationId, query?) → Promise<Paginated<GraphVersion>>` and `getVersionById?(investigationId, graphVersionId) → Promise<GraphVersion>`. Additive only; nothing removed.
- `packages/web/src/lib/providers/demo/providers.ts` — `DemoGraphProvider` implements `listVersions` (heavyLatency, `resolveSignal`, `ProviderError.notFound`, `paginate` over the fixture series) and `getVersionById` (baseLatency, not-found guard).
- `packages/web/src/lib/providers/live/providers.ts` — `UnsupportedGraphProvider` throws `providerUnsupportedPaginated("graph.listVersions")` / `providerUnsupported("graph.getVersionById")`. The web surface renders the honest typed-unsupported pane, never a fake list.
- `packages/web/src/lib/providers/demo/demo-fixtures/graph.ts` — `versionSeriesData` fixture (v1 SUPERSEDED nodes 3 / v2 SUPERSEDED nodes 5 `parentGraphVersionId: v1` / v3 ACTIVE COMPLETE nodes 6 `parentGraphVersionId: v2`, ascending observed `createdAt/updatedAt`) → exported `operationFinancialShadowVersions`, each `GraphVersionSchema.parse`d at build time.
- `packages/web/src/lib/providers/demo/demo-fixtures/lookup.ts` — `GRAPH_VERSION_V1` / `GRAPH_VERSION_V2` id constants.
- `packages/web/src/lib/providers/demo/demo-fixtures/index.ts` — `DemoFixtureSet` + `demoFixtures`: `graphVersions` added.
- `packages/web/src/lib/providers/demo/demo-fixtures/validate.ts` — `["graphVersions", …]` added to the build-time validation arrays.
- `packages/web/src/components/graph/control-center/temporal-context-panel.tsx` — now owns `useState<TemporalVersionSelection>` (default `current`), renders `TemporalActivityFeed` for the ACTIVITY tab and `TemporalVersionsPanel` for the VERSIONS tab; TIME keeps children. Parent contract `{ tab, onTabChange, children }` unchanged.
- `packages/web/tests/pr2-graph-control-center.test.tsx` — the single stale assertion at line 152 re-targeted from the old VERSIONS stub copy to `getByText("Graph versions")`; suite intent unchanged (still 21 tests, all green).

## E. Files Removed

None. The activity/versions **stub branches** inside `temporal-context-panel.tsx` (placeholder text like "/Graph version list, historical view, and replay/") were replaced by the real components — grep-verified no references remain.

## F. Files Intentionally Untouched (scope discipline)

- Graph engine, five-zone shell geometry, `graph-control-center.tsx` (parallel), `page.tsx`, `capabilities.ts`, `nav.ts` (parallel), pulse/matrix/flow WIP — never opened.
- `timeline-panel.tsx` / `pr6-timeline-default-scope.test.tsx` (parallel PR-6 timeline) — no PR-7 line edits; full suite confirms both still green 3/3.
- All provider interfaces, fixture databases, contracts, platform, intelligence, monitor — `packages/web/**` only.
- `investigative-intelligence.tsx`, pulse/, `representation-switcher.tsx`, `pr1-*`, `pr5-*` — untouched.

## G. The honest-data thread

- The version series is **canonical fixture data** parsed through `GraphVersionSchema` at build time; every shown number (`n nodes · m edges`, `PROJECTION`, timestamps) is a field of a parsed `GraphVersion` — nothing is computed, ranked, or invented.
- `getVersionById?` exists on the seam (by user decision, additive) but is **not yet consumed** by the panel, which stays on `getVersion` + `listVersions`; the optional method is the future replay seam, not a present-day hop.
- Historical selection locks the surface: the summary/labels mark the chosen historical version and the replay note states explicitly that nothing will silently mutate the current graph; the realtime feed shows a record-only banner instead of staging events.
- The live seam reports a typed unsupported surface (`providerUnsupported"graph.listVersions"`); the panel renders the honest pane with `HISTORICAL_SURFACE_UNAVAILABLE` — the list UI is never populated from fake data.

## H. Capability & version honesty

- Live workspaces resolve `unsupported` (list unavailable) → `deriveVersionViewState` guarantees **unsupported wins over pending** and **historical never falls back to current**; `derivationUnavailable-is-truthful` is asserted in the pure suite and in the live component test.
- `activeVersion` marks ACTIVE else newest — asserted for both branches.
- ACTIVITY feed honesty: the status badge reflects the realtime conn/segue state; the record-only banner communicates that historical + realtime are intentionally kept disjoint (`realtimeMayMutateVisibleGraph` = false).

## I. Accessibility

- Version rows are real `<button>`s with `aria-label="view-version-N"`, `aria-pressed` for the selected historical state, and an accessible return-to-current button.
- Feed uses live-region-friendly status text; replay/record-only notes are visible text, not color-only signals; badges carry explicit monospace labels (SUPERSEDED / ACTIVE / COMPLETE / Current).
- Timing/slow paths honor the test fast-env (`TIMING_SCALE_ENV=0.001`) exactly as prior suites.

## J. Test-context facts locked by the suite

- `eventKey` uses `id` when present, else `action|targetId|timestamp` composite, else the description-bearing content hash — the feed's dedupe is stable across replay.
- Newest-first ordering and bounds (custom N / default 100) are deterministically exercised.
- `obs()` `{ value, precision }` shapes flow through the demo series and are rendered via `.value` (component + pure tests fix the type so `tsc` accepts them).
- 45 `pr7-*` tests pass standalone **and** inside the full suite; `pr2` (re-target) and `pr6` (untouched) both green in the same runs.

## K. Source guards

- `lib/context/temporal-workspace.ts` and `lib/context/activity-feed.ts` are pure — zero imports from demo/live/fixtures/React.
- The components reach data only through `useWorkspace()` + the realtime/SSE seam (same pattern as `intelligence-activity.tsx`).

## L. De-scoped (explicitly NOT in this part)

- Replay *of historical graph states* (clicking a SUPERSEDED version and re-running the window) — `getVersionById?` is seam-ready but the full replay pipeline is a later slice.
- `/as-of`-style point-in-time restructuring, matrix/flow representation, realtime mutation of historical views (intentionally forbidden).
- Anything outside `packages/web/**`.

## M. Risks & residual

- Root `pnpm typecheck` currently fails **only** in the parallel untracked `src/lib/network/matrix/matrix-model.ts` (6 diagnostics) and `next build` only in the parallel `matrix-panel.tsx` (`MATRIX_CELL_STATE_LABELS` unused) — both files owned by another workstream; emitted diagnostics contain **zero PR-7 files**.
- `getVersionById?` is implemented-on-the-seam but unconsumed (documented above) — a deliberate additive stub for the future replay pipeline.
- Two benign `act(...)` warnings during async load under jsdom persist as before.

## N. Verification

```
packages/web tests      pnpm --filter @indago/web test → 62 files, 667 tests, 667 passed
PR-7 suite              tests/pr7-temporal-workspace-context.test.ts → 19 passed
                        tests/pr7-activity-feed.test.ts → 16 passed
                        tests/pr7-activity-feed.test.tsx → 3 passed
                        tests/pr7-versions-panel.test.tsx → 7 passed
Regression              tests/pr2-graph-control-center.test.tsx → 21 passed (re-targeted assertion green)
                        tests/pr6-timeline-default-scope.test.tsx → 3 passed (untouched, no regression)
typecheck               pnpm -r typecheck → EXIT=1, but every diagnostic is in the parallel
                        untracked src/lib/network/matrix/{matrix-model,matrix-panel}.tsx; PR-7 files type-clean
build (web)             pnpm --filter @indago/web build → compile OK; type-stage fails ONLY on the
                        parallel matrix-panel.tsx unused-import diagnostic; PR-7 code builds clean
```

PR-0–6 suites and the full ship remain green (667/667). The contextual panel now presents TIME / ACTIVITY / VERSIONS as one coherent, honest temporal workspace: one shared window, one deduplicated live feed, and a real version list that marks the ACTIVE current snapshot, locks to a chosen historical one without silent mutation, and refuses to fabricate a list when the surface is unsupported.

---

PR-8 can now begin.