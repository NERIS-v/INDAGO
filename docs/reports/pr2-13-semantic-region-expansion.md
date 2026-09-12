# PR2/13 — Semantic Region Expansion + Semantic→Node Adapter

## Status: COMPLETE

`feat/m-a13-graph-hole-region` — commits `2aefa5b` (contracts) + `fc7a93f`
(graph-hole-region), both pushed. All region, contracts and semantic-retrieval
suites green; workspace typecheck green.

---

## 1. Objective

Bridge Phase 5A-PR1.5's semantic recall layer into the M-A13 region builder:
when a region build is given a `SemanticRetrievalPort` + authoritative adapter,
it may expand its bounded node set from semantic hits — never by similarity or
name matching, never fabricating nodes, never forming a semantic feedback loop,
and with full traceability on the result. A region built with no semantic
dependency must behave exactly as PR1 (status `DISABLED`).

---

## 2. Scope & Goal

1. **Contracts** (commit `2aefa5b`, frozen): semantic-expansion statuses,
   per-hit mapping outcomes, per-round + region trace schemas, and the
   `MAX_SEMANTIC_NODES_ADDED` budget in the region policy.
2. **Region integration** (commit `fc7a93f`): optional builder dependency
   `semanticExpansion` = port + adapter + case-scoped source→entity resolver;
   deterministic per-round membership query; shared node budget; per-round +
   region trace on `GraphHoleRegion.semanticExpansion` (traceability only,
   never part of the region identity); PR1 path unchanged.
3. **Production adapter only**: `AuthoritativeSemanticNodeAdapter`.
4. Retire the PR1.5 seam (`retrieveSemanticContext?` on `GraphExpansionProvider`).

The PR1.5 seam conformance test is rewritten to cover the new builder-level
dependency shape; the obsolete seam describe block in `build-region.test.ts`
was removed.

---

## 3. Frozen Contract (contracts PR2, `2aefa5b`)

`packages/contracts/src/intelligence/graph-hole-semantic-expansion.ts`:

- `SemanticExpansionStatusSchema` — exactly six statuses:
  `DISABLED | SUCCESS | EMPTY | PARTIAL | DEGRADED | LIMITED`.
- `SemanticNodeMappingRejectionSchema` — exactly two authoritative rejection
  reasons: `UNRESOLVED` (hit source has no M-A09/M-A10 entity), and
  `NON_NODE_SOURCE` (entity absent from this M-A13 graph version).
  No fuzzy/approximate reasons.
- `SemanticNodeAttributionSchema` — per-hit outcome in port order: `MAPPED`
  must map ≥1 node and carry no rejection reason; `UNRESOLVED`/`REJECTED` must
  map no nodes and require a rejection reason (superRefined).
- `SemanticNodeMappingReportSchema` — `mappedCount` counts hits (results), not
  node ids; `mappedNodeIds` = deduplicated, sorted; `rejectedReasons` sorted by
  reason value, zero counts omitted; attribution preserved in port order.
- `SemanticExpansionRoundTraceSchema` — per-round query, `queryHash`,
  `requestedLimit`, `retrievedCount`, `truncated`, `admittedNodeIds` (sorted,
  unique), mapped/unresolved/rejected counts.
- `SemanticExpansionTraceSchema` — `status`, ordered `rounds`, totals across
  rounds, and the two bound flags (`semanticNodeBoundReached`,
  `totalResultsBoundReached`).
- `graph-hole-policy.ts`: `region.maxSemanticNodesAdded = 50`.

Contract tests: `tests/graph-hole-semantic-expansion.test.ts` (11 tests).

---

## 4. What Was Delivered (graph-hole-region, `fc7a93f`)

### 4.1 Builder dependency (`src/types.ts`)

`RegionBuildDependencies.semanticExpansion?: SemanticExpansionDependency` =
`{ port: SemanticRetrievalPort, adapter: SemanticNodeAdapter,
resolveSourceEntities: (caseId, sourceType, sourceIds) => ... }`. Absent ⇒
`status DISABLED`, PR1 deterministic expansion, identical region.

### 4.2 Query (`src/semantic-query.ts`)

`regionSemanticQueryOf(nodeIds)` = `canonicalizeSemanticText` over the
sorted-unique join of the current region membership. Queries depend ONLY on
membership — retrieval text/similarities are never fed back, so no semantic
feedback loop is possible.

### 4.3 Adapter (`src/semantic-node-adapter.ts`)

`AuthoritativeSemanticNodeAdapter.mapSemanticResultsToNodes(results,
context, deps)`:

- maps each hit `source → canonical entity (resolveSourceEntities, M-A09/M-A10)
  → M-A13 node id` present in this `caseId` graph version;
- `UNRESOLVED` (no entity) / `NON_NODE_SOURCE` (entity not a node in this graph
  version) are counted + reason-tagged;
- dedup + sort mapped ids; attribution preserves port order; fully
  deterministic; never consults similarity, model metadata or normalizedText.

### 4.4 Pipeline (`src/build-region.ts`)

Per region-expansion round, when semantic expansion is enabled and not failed:

1. `requestedLimit = min(MAX_SEMANTIC_RESULTS_PER_ROUND,
   MAX_TOTAL_SEMANTIC_RESULTS - totalResults)` (positive when the total cap
   remains).
2. Port `retrieve({ caseId, query, limit })`; envelope `caseId` re-asserted at
   the boundary → `AUTHORITY_MISMATCH` ⇒ `DEGRADED` + `SEMANTIC_RETRIEVAL_FAILURE`.
3. `totalResults += results.length`; results cap is checked **after** the
   increment so a round clipped mid-way by the cap ends `LIMITED`, never
   `SATURATED`.
4. Authoritative mapping → node ids; shared `MAX_REGION_NODES`(100)-first
   budget + `MAX_SEMANTIC_NODES_ADDED`(50) semantic admission budget
   (first-come, sorted, deterministic).
5. Observation context surface = sourceIds of **all `OBSERVATION`-type `MAPPED`
   hits** each round (not only hits whose nodes were admitted) — preserves PR1
   observation parity.
6. Round record appended to the trace; admitted semantic nodes pull their
   incident edges into the region like PR1 frontier nodes.

`totalMappedNodes` = sum of newly **admitted** node ids per round (matches the
contract's "unique node ids admitted"). Status decision
(`src/build-region.ts:623`): `DISABLED` > `DEGRADED` > `LIMITED` >
`PARTIAL`/`SUCCESS` > `EMPTY`. A provider/adapter failure degrades the region —
never a fake-empty. Semantic admission caps map to
`SEMANTIC_NODE_BOUND_REACHED` / `SEMANTIC_RESULTS_BOUND_REACHED` limitations
and are part of `REGION_TRUNCATING_LIMITATIONS`.

Budgets (all from frozen contracts): `MAX_SEMANTIC_RESULTS_PER_ROUND = 20`,
`MAX_TOTAL_SEMANTIC_RESULTS = 50`, `MAX_SEMANTIC_NODES_ADDED = 50`,
`MAX_REGION_NODES = 100`, `MAX_CONTEXT_OBSERVATIONS = 150`.

### 4.5 Surface changes

- `src/index.ts` — exports updated (`SemanticExpansionDependency`,
  `SemanticNodeAdapter`, `SemanticNodeMappingContext`,
  `AuthoritativeSemanticNodeAdapter`, `regionSemanticQueryOf`; retired
  `SemanticRetrievalRequest`).
- `src/graph-expansion-provider.ts` — stale seam comment removed.
- `package.json` — `@indago/semantic-retrieval: workspace:*` dependency linked
  via `pnpm install` (lockfile committed).

---

## 5. Determinism & Isolation

- Identical region state ⇒ identical query ⇒ identical result; attribution in
  port order; mapped ids sorted+deduped; rejection reasons sorted.
- Case isolation asserted at the adapter boundary (mapping context = one
  `(caseId, graphVersionId)`), the port boundary (envelope `caseId`), and the
  SQL boundary (persistence layer).
- Semantic expansion never mutates graph state and never creates
  entities/relations/evidence/observations.
- Semantic trace is deterministic but deliberately **not** part of the region
  identity — a region id is unchanged whether semantic expansion was enabled
  or not.

---

## 6. Verification Matrix

| Package | Typecheck | Tests |
|---|---|---|
| `@indago/contracts` | ✅ exit 0 | **273/273** (15 files) incl. 11 new `graph-hole-semantic-expansion` |
| `@indago/semantic-retrieval` | ✅ exit 0 | **47/47** (7 files) |
| `@indago/graph-hole-region` | ✅ exit 0 | **85/85** (10 files) |
| Workspace (`pnpm typecheck`) | ✅ 9 projects exit 0 | — |

graph-hole-region test breakdown: `calculate-saturation` 13, `build-region`
21 (incl. semantic 7, obsolete seam block removed), `expand-region` 10,
`region-identity` 8, `semantic-node-adapter` 8, `region-bounds` 5,
`resolve-observation-nodes` 4, conformance `semantic-retrieval-seam` 4,
integration `build-region-integration` 5.

New/rewritten suites cover: SUCCESS / EMPTY honest-empty / PARTIAL /
DEGRADED (port failure + envelope cross-case) / LIMITED at 50/50 with
`requestedLimits [20,20,10]` / semantic incident edges / adapter
authoritativeness, no-similarity, case-scoping, determinism / no-feedback /
identity-linkage (region id unchanged by semantic enablement) / PR1-without-
semantic = `DISABLED`.

**Honest caveats (pre-existing, unrelated to PR2, packages untouched by this
PR):** `packages/web` has 3 prior PR-18 graph-focus-lifecycle timeouts and
`packages/intelligence/graphology-projection` has 1 prior timeout in
"M-A13 — reports accurate edge truncation independently of node truncation".
Both are out of scope and were not run/passed as part of this PR's suite.

---

## 7. Notable Debugging Discoveries

- **Mid-round results cap ends `LIMITED`, not `SATURATED`** — the
  post-increment `totalResults >= MAX_TOTAL_SEMANTIC_RESULTS` check was added
  after the first test run to ensure a round clipped by the cap is honestly
  reported as a bound-reached limitation.
- **Observation surface = all `MAPPED` OBSERVATION hits** — initial draft
  surfaced only hits whose nodes were admitted; refined to surface sourceIds
  of every mapped observation hit each round to preserve PR1 observation
  parity (matches PR1 behavior where observation context is unaffected by
  node admission).
- **Test-only `uuid` helper** lives in `tests/helpers/fixtures.ts` and is NOT
  exported from the package index (avoid leaking test helpers); the conformance
  file is one directory deeper and imports `../../src/index.js` + `../helpers/
  fixtures.js` (vitest/esbuild with the package's `tsc`-only test exclusion).
- **Dist rebuilds required** for workspace typecheck — contracts + semantic-
  retrieval `dist` were rebuilt before `pnpm typecheck` (they back the
  workspace link).

---

## 8. Audit Rules Compliance

- Semantic→node mapping is authoritative only (source → M-A09/M-A10 entity →
  M-A13 node); no string/prefix/fuzzy/name matching, no similarity
  thresholding, no fabricated node ids.
- No semantic feedback loop: queries derive solely from sorted membership ids.
- A provider/adapter failure is reported as `DEGRADED` — never silently
  replaced by an empty success.
- With no semantic dependency, region builds keep PR1 behavior exactly
  (`DISABLED`), and the region identity is unaffected by semantic enablement.
- Case isolation re-asserted at three boundaries (SQL, port envelope, adapter
  context).
- No `retrieveSemanticContext?` seam remains; PR1.5's obsolete seam describe
  block removed.

---

## 9. Artifacts

| Artifact | Location |
|---|---|
| Contracts | `packages/contracts/src/intelligence/graph-hole-semantic-expansion.ts`, `graph-hole-policy.ts` (+ tests, 11) |
| Query | `packages/intelligence/graph-hole-region/src/semantic-query.ts` |
| Adapter | `packages/intelligence/graph-hole-region/src/semantic-node-adapter.ts` |
| Pipeline | `packages/intelligence/graph-hole-region/src/build-region.ts` |
| Types / exports | `packages/intelligence/graph-hole-region/src/{types,index}.ts` |
| Tests | adapter unit (8), `build-region-semantic` (7), conformance `semantic-retrieval-seam` (rewritten, 4) |
| Docs | `docs/architecture/semantic-retrieval.md` (PR2 note), `docs/roadmap/phase-tracker.md` (PR2/13 row) |
| Commits | `2aefa5b` contracts, `fc7a93f` graph-hole-region + lockfile (pushed to `feat/m-a13-graph-hole-region`) |

---

**PR2/13 complete.** Region construction now expands semantically with full
traceability whenever a provider + authoritative adapter are supplied, and
runs deterministically as PR1 otherwise.