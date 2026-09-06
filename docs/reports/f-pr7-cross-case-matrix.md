# F-PR7 — Cross-Case/Relationship Matrix (five-zone adaptive shell + boundary auto-follow)

**Status:** COMPLETE. Typecheck `pnpm --filter @indago/web typecheck` EXIT=0. Build `pnpm --filter @indago/web build` EXIT=0 (stale `.next` cleared first). Full web regression `pnpm --filter @indago/web test` → **65 files / 698 tests, all passed** (including both the shell matrix suite and the parallel PR-6 timeline suite). The pr5+pr7 shell pair was additionally looped 6× (96/96 green) after the boundary-latch stabilization below.

---

## 1. Objective

Matrix represents the investigator's relationship view *as a matrix*: rows are the workspace case's entities (Case A), columns are the comparison boundary (within-case: same Case A; cross-case: a foreign origination case), cells carry honest signal classes derived from real observations/relations/match records — nothing is drawn, every visual has a pure-model cost. The Matrix is **one shell-owned analysis** shared by every supporting zone (rail, grid/panel, context pane, temporal note, intelligence adapter) — no per-zone refetching. The shared workspace `timeRange` is the only temporal controller. A cross-case comparison is **boundary-gated**: nothing is revealed before the analyst authorizes the matched case (idle → confirming → authorized), and provider-backed candidates surface only afterward. Live mode must never silently serve demo matrix data.

## 2. What F-PR7 delivers

**Pure model (`lib/network/matrix/matrix-model.ts`).** `buildMatrix(input)` returns a deterministic `MatrixMeta` — rows (Case-A entity catalog, salience-sorted), columns (`within-case` → Case-A rows; `cross-case` → `buildCrossCaseColumns(boundaryCaseId, label, matches, overlays)` — match-target + overlay-origination islands), cells with `MatrixCellState` (`empty | candidate | multi-signal | conflict`) and typed `MatrixSignal` classes (`financial | communication | location | identity | cross-case | conflict`). The model owns the deterministic selectors: `matrixBoundaryOptions(overlays, matches)` (overlay titles preferred, bare match targets get a short-case-id label) and `defaultBoundaryCaseId` (first match target, else first overlay in ref order). `matrixCellId`/`parseMatrixCellId`/`matrixContextForCell`/`matrixCellFromContext` bridge SELECT ↔ context pane. The `summary` narrates real counts only: zero-boundary says "No authorized cross-case boundary is available…", pre-auth says "X holds N provider-backed cross-case candidates — nothing is shown before authorization", post-auth states candidate cell counts and distinct classes. No `Math.random`/`Date.now`.

**Shared shell-owned hook (`lib/network/matrix/use-matrix.ts`).** ONE `useMatrixAnalysis` fetches canonical surfaces (nodes, observations, relations, contradictions, candidates, and the cross-case `listMatches`) strictly gated to `presentation.zoneTwo === "matrix"`, and derives the single `MatrixMeta` every zone consumes. Fetch identity is keyed on `boundaryKey = boundaryCaseId ?? ""` + `overlaysKey` + `authKey`, so geometry rematerializes on boundary/overlay/auth change and the refetch cascade is the same single pipeline. Idle/loading/ready/error are typed.

**Matrix zones.** `matrix-rail.tsx` (mode toggle within-case ↔ cross-case, boundary picker, honest stats, auth card idle → confirming → authorized, Open-in-Graph/clear-selection), `matrix-panel.tsx` (grid with `data-matrix-*` hooks; cells render empty/candidate/multi-signal/conflict states; SELECT ≠ FOCUS), `matrix-context-summary.tsx` (Zone 3: selected cell → entity + bounded `investigationUrl(?caseId=…&entity=…)` evidence deep-link + View Evidence), `matrix-temporal-note.tsx` (Zone 4: window narration above the unchanged timeline — e.g. "1 of 9 observations in scope"), `matrix-intelligence-insight.tsx` (Zone 5 additive adapter slot).

**Boundary auto-follow (shell, `graph-control-center.tsx`).** When the analyst has not chosen a boundary, the picker deterministically follows `meta.boundaryCaseId ?? options[0]?.caseId`. The matrix refetch cascade (boundary latch → foreign-overlay arrival → mode/auth changes) can transiently report a ready meta with `boundaryCaseId === null`, which previously wedged the picker empty (no auth card, no cells — the 1/6 shell flake). The follow now **re-polls briefly** (bounded 50 ms × 20) until the resolved boundary latches, so the picker never sits empty while comparison candidates exist; switching to within-case keeps the analyst's choice for toggling back. The same refetch cascade unmounts grid/rail nodes for a frame, so the shell tests drive every interaction through `waitFor` with fresh queries each poll, and SELECT/deep-link coverage runs in the deterministic within-case grid while cross-case auth/auto-follow is covered by the shell tests.

**Demo seam.** `DemoCrossCaseProvider.listMatches` / `listForeignOverlays` serve `operationFinancialShadowCrossCase` (fixtures/cross-case.ts) and the deterministic cobalt/crimson islands through the provider contract (no fixture imports in UI). `representations.ts` gained `MATRIX_PRESENTATION`; `presentationFor("matrix", matrixAvailable)` serves it in demo and the honest typed NOT_READY pane otherwise.

## 3. Files

**Changed** — `lib/providers/demo/providers.ts` (cross-case provider), `lib/providers/live/providers.ts` (live `network.matrix` declared not-ready), `lib/providers/types.ts`, `lib/providers/capabilities.ts`, `lib/providers/demo/demo-fixtures/{cross-case,lookup,graph,index,validate}.ts`, `components/graph/control-center/graph-control-center.tsx` (matrix state + auto-follow latch + shared hook), `lib/network/representations.ts` (matrix presentation), `lib/context/investigative-context.ts`, `components/graph/control-center/{investigative-intelligence,temporal-context-panel,timeline-panel}.tsx`, `tests/{pr5-representation,pr1-navigation-dock,pr1-provider-boundary,pr2-graph-control-center,capabilities}.test.*`.

**Added** — `lib/network/matrix/matrix-model.ts`, `lib/network/matrix/use-matrix.ts`, `components/graph/control-center/matrix/{matrix-rail,matrix-panel,matrix-context-summary,matrix-temporal-note,matrix-intelligence-insight}.tsx`, `tests/matrix-model.test.ts`, `tests/matrix-panel.test.tsx`, `tests/pr7-matrix-shell.test.tsx`.

## 4. Protected areas confirmation

- Only `packages/web/**` changed. No backend/contracts/platform/judge files.
- `pr6-timeline-default-scope.test.tsx`, `scratch-shared-time.test.tsx` — untouched (parallel PR-6 timeline owner).
- Parallel-owner components untouched: `graph-canvas.tsx`, `graph-panel.tsx`, `graph-visual-state.ts`, `intelligence-signals.tsx`.
- No new dependencies; the grid is semantic HTML + native SVG, model-computed.
- `opencode.json` (untracked parallel artifact) was never staged or committed.

## 5. Honest-data thread

```
rows    = Case-A entity catalog (node.type === "ENTITY", salience-sorted)
columns = within-case: rows  |  cross-case: match.targetCaseId island + overlay origination cases
cell    = signals derived from observations/relations/match records only
state   = empty | candidate | multi-signal | conflict
auth    = idle → confirming → authorized per boundary; pre-auth cells are gated, counts shown, signals hidden
```

The narrative (summary, temporal note, stats) only ever states real counts and labels. "Hidden candidates" leaves the rail once authorized. Match records are comparison facts, not event-timed signals. SELECT vs FOCUS are separated.

## 6. Capability & representation honesty

| View | DEMO / AUTO-demo | LIVE (effective live) |
|---|---|---|
| Network (graph) | `demo` — unchanged | typed graph behavior |
| Entity Pulse | `demo` — rendered | `not-ready` — honest typed pane |
| Matrix | `demo` — rendered (cross-case default) | `not-ready` — honest typed pane |
| Flow | `not-ready` | `not-ready` |

## 7. Test-context facts locked by the suite

- Model: deterministic boundaries (match target before overlay), option labels, cell states/classes, `matrixCellId` round-trip, summary honesty pre/post auth, within-case vs cross-case geometry.
- Panel: grid renders rows × columns with typed cell states; SELECT opens the context pane (SELECT ≠ FOCUS); the related deep-link is bounded to the investigation (`caseId=${CASE_ID}&entity=${rowId}`).
- Shell: matrix is Zone 2 by default in demo with the railed shell; cell SELECT opens the Matrix context pane in the deterministic within-case grid; Open in Graph hands the selected row entity to the graph representation; auth flow idle → confirming → authorized then reveals candidates; mode toggle switches without losing the shell; the temporal note narrates the SHARED timeRange.

## 8. Verification

```
typecheck        pnpm --filter @indago/web typecheck   → EXIT=0
build            pnpm --filter @indago/web build      → EXIT=0 (stale .next cleared first)
web regression   pnpm --filter @indago/web test       → 65 files, 698 tests: 698 passed
matrix model     tests/matrix-model.test.ts            → passed
matrix panel     tests/matrix-panel.test.tsx           → passed
matrix shell     tests/pr7-matrix-shell.test.tsx       → 6 passed
shell stability  pr5-representation + pr7-matrix-shell looped 6× → 96/96
```

## 9. Residual & limitations

- jsdom lacks `matchMedia`/`requestAnimationFrame`; grid/rail motion and reduced-motion handling fall back to instant render there and are fully exercised only in real browsers.
- The cross-case refetch cascade is inherently multi-frame (boundary latch + overlay arrival); the shell self-heals via the bounded re-poll, but a truly empty boundary (no matches, no overlays) intentionally leaves the comparison unstarted with an honest message rather than a fake selection.
- Live matrix stays `not-ready`; the demo provider serves deterministic fixtures only.