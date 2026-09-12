# PR2/13 — Semantic Region Expansion + Semantic→Node Adapter

## Status: COMPLETE (incl. PR2 production-grade correction pass)

`feat/m-a13-graph-hole-region` — commits `2aefa5b` (contracts) + `fc7a93f`
(graph-hole-region), both pushed; this revision adds the correction pass
(fix + docs commits, pushed). All region, contracts and semantic-retrieval
suites green; workspace typecheck + build green.

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
  rounds, the two bound flags (`semanticNodeBoundReached`,
  `totalResultsBoundReached`) and `providerTruncated` (explicit provider-
  reported truncation; never inferred from a short result set).
- Query-context budget constants: `MAX_SEMANTIC_CONTEXT_ITEMS = 32`,
  `MAX_SEMANTIC_CONTEXT_CHARS = 4096`, `MAX_SEMANTIC_QUERY_CHARS = 8192`.
- `graph-hole-policy.ts`: `region.maxSemanticNodesAdded = 50`.

Contract tests: `tests/graph-hole-semantic-expansion.test.ts` (13 tests).

---

## 4. What Was Delivered (graph-hole-region, `fc7a93f`)

### 4.1 Builder dependency (`src/types.ts`)

`RegionBuildDependencies.semanticExpansion?: SemanticExpansionDependency` =
`{ port: SemanticRetrievalPort, adapter: SemanticNodeAdapter,
resolveSourceEntities: (caseId, sourceType, sourceIds) => ... }`. Absent ⇒
`status DISABLED`, PR1 deterministic expansion, identical region.

### 4.2 Query (`src/semantic-query.ts`)

`buildRegionSemanticQuery(contextItems, nodeIds)` builds the round query from
**bounded authoritative region context** + sorted membership:

`contextItems` come from the injected `getSemanticContextForRegion` resolver
(case/graph-version/temporal-scoped, read-only) and are sorted by
(canonical content, `sourceType`, `sourceId`), capped at
`MAX_SEMANTIC_CONTEXT_ITEMS` (32) units and `MAX_SEMANTIC_CONTEXT_CHARS`
(4096) of context; the total query is capped at `MAX_SEMANTIC_QUERY_CHARS`
(8192) and canonicalized. Node ids are supplementary stable identifiers listed
after the context — the query is NEVER a UUID-only payload. Queries depend
ONLY on authoritative pre-round state (membership + injected context):
retrieval text/similarities/orderings are never fed back, so no semantic
feedback loop is possible (pinned by tests).

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

Per region-expansion round, when semantic expansion is enabled and not
failed/truncated/bound, semantic rounds do the following (graph rounds ALWAYS
proceed regardless):

1. `requestedLimit = min(MAX_SEMANTIC_RESULTS_PER_ROUND,
   MAX_TOTAL_SEMANTIC_RESULTS - totalResults)` (positive when the total cap
   remains).
2. Regional context is fetched from the injected `getSemanticContextForRegion`
   resolver; the query is built by `buildRegionSemanticQuery` (see §4.2).
3. Port `retrieve({ caseId, query, temporalContext, limit })`; envelope `caseId`
   re-asserted at the boundary → `AUTHORITY_MISMATCH` ⇒ handled as a semantic
   failure.
4. `totalResults += results.length`; results cap is checked **after** the
   increment so a round clipped mid-way by the cap ends `LIMITED`, never
   `SATURATED`. `envelope.truncated` (the explicit provider-reported contract
   field — never inferred from `retrievedCount < requestedLimit`) sets
   `providerTruncated` ⇒ `LIMITED` + `SEMANTIC_RESULTS_TRUNCATED`.
5. Authoritative mapping → node ids; shared `MAX_REGION_NODES`(100)-first
   budget + `MAX_SEMANTIC_NODES_ADDED`(50) semantic admission budget
   (sorted, deterministic).
6. Observation context surface = sourceIds of **all `OBSERVATION`-type `MAPPED`
   hits** each round (not only hits whose nodes were admitted) — preserves PR1
   observation parity and is independent of node admission.
7. Round record appended to the trace; admitted semantic nodes pull their
   incident edges into the region like PR1 frontier nodes.

**Failure isolation (corrected):** a semantic failure (provider, adapter, or
context resolver) disables semantic expansion for the REST of the build —
`DEGRADED` + `SEMANTIC_RETRIEVAL_FAILURE` — and NEVER halts the deterministic
M-A13 graph expansion. Semantic bounds/truncation likewise disable FUTURE
semantic retrieval only. Per-round `budgetBoundReached` reflects graph caps
only (node/edge/observation); semantic stop-reasons are reported via the
trace's status + limitation codes, never as a graph budget break.

`totalMappedNodes` = sum of newly **admitted** node ids per round (matches the
contract's "unique node ids admitted", never re-counting duplicate hits).
Status decision (`build-region.ts`): `DISABLED` > `DEGRADED` > `LIMITED` >
`PARTIAL`/`SUCCESS` > `EMPTY`, where `LIMITED` also covers provider-reported
truncation and `EMPTY` means "no usable hits" (zero returned OR every return
unresolved/rejected). A provider/adapter failure degrades the region — never a
fake-empty. Semantic admission caps map to `SEMANTIC_NODE_BOUND_REACHED` /
`SEMANTIC_RESULTS_BOUND_REACHED` / `SEMANTIC_RESULTS_TRUNCATED` limitations,
all part of `REGION_TRUNCATING_LIMITATIONS`.

Budgets (all from frozen contracts): `MAX_SEMANTIC_RESULTS_PER_ROUND = 20`,
`MAX_TOTAL_SEMANTIC_RESULTS = 50`, `MAX_SEMANTIC_NODES_ADDED = 50`,
`MAX_SEMANTIC_CONTEXT_ITEMS = 32`, `MAX_SEMANTIC_CONTEXT_CHARS = 4096`,
`MAX_SEMANTIC_QUERY_CHARS = 8192`, `MAX_REGION_NODES = 100`,
`MAX_CONTEXT_OBSERVATIONS = 150`.

### 4.5 Surface changes

- `src/index.ts` — exports updated (`SemanticExpansionDependency`,
  `SemanticNodeAdapter`, `SemanticNodeMappingContext`,
  `AuthoritativeSemanticNodeAdapter`, `buildRegionSemanticQuery`,
  `SemanticContextItem`, `RegionSemanticContextRequest`,
  `RegionSemanticContextResolver`; retired `regionSemanticQueryOf` and
  `SemanticRetrievalRequest`).
- `src/semantic-node-adapter.ts` — `SemanticNodeMappingContext` no longer
  carries `temporalContext` (dead field): temporal validity is authoritative at
  the retrieval/storage boundary (the port is invoked with the region's
  `temporalContext`), so the adapter performs no temporal revalidation.
- `src/graph-expansion-provider.ts` — stale seam comment removed.
- `package.json` — `@indago/semantic-retrieval: workspace:*` dependency linked
  via `pnpm install` (lockfile committed).

### 4.7 TEMPORAL AUTHORITY MODEL (explicit)

Temporal filtering is authoritative at the semantic **retrieval/storage
boundary** — PR1.5's closed-interval overlap lives in the repository's SQL, and
the port is always invoked with the region's `temporalContext`. Every hit that
reaches the adapter is therefore already temporally valid for the requested
window; the adapter performs no temporal revalidation and claims none. A build
test proves `temporalContext` flows into both the context resolver and the port
request.

---

## 5. Determinism & Isolation

- Identical region state ⇒ identical query ⇒ identical result; attribution in
  port order; mapped ids sorted+deduped; rejection reasons sorted. Reordered
  retrieval results yield the identical region (pinned by test).
- Case isolation asserted at the adapter boundary (mapping context = one
  `(caseId, graphVersionId)`), the port boundary (envelope `caseId`), and the
  SQL boundary (persistence layer).
- Semantic expansion never mutates graph state and never creates
  entities/relations/evidence/observations.
- Semantic trace is deterministic but deliberately **not** an input to the
  region identity — however, nodes/edges **admitted via semantic expansion are
  membership**, and membership changes DO deterministically change the region
  id. Correct statement: *a region id changes iff semantic admission changes
  membership; the trace alone never affects it* (A/B/C regression test: PR1
  control = semantic-enabled-with-no-admission ⇒ same id; admission ⇒
  different id).

---

## 6. Verification Matrix

| Package | Typecheck | Tests |
|---|---|---|
| `@indago/contracts` | ✅ exit 0 | **275/275** (15 files) incl. 13 `graph-hole-semantic-expansion` (new: context-budget caps, provider-truncated trace) |
| `@indago/semantic-retrieval` | ✅ exit 0 | **47/47** (7 files) |
| `@indago/graph-hole-region` | ✅ exit 0 | **105/105** (11 files) |
| Workspace | `pnpm typecheck` ✅ 9 projects exit 0 · `pnpm build` ✅ | — |

graph-hole-region test breakdown: `calculate-saturation` 13, `build-region`
21, `build-region-semantic` 16 (incl. semantic integration), `semantic-query`
6 (new), `expand-region` 10, `region-identity` 8, `semantic-node-adapter`
13 (adapter unit incl. adversarial hardening), `region-bounds` 5,
`resolve-observation-nodes` 4, conformance `semantic-retrieval-seam` 4,
integration `build-region-integration` 5.

New/rewritten suites cover: SUCCESS / EMPTY honest-empty / PARTIAL /
DEGRADED (port failure + envelope cross-case) / LIMITED at 50/50 with
`requestedLimits [20,20,10]` / LIMITED provider-truncation / explicit-vs-
inferred truncation / failure isolation (failing port ⇒ identical PR1 control
region) / no-recount of duplicate hits / observation-surface independence /
temporal-context reaching the retrieval boundary / query determinism +
bounded serialization + not-UUID-only / no-feedback across differing retrieved
text / reordered-retrieval determinism / adapter authoritativeness,
no-similarity, case-scoping, adversarial no-entity, cross-case, name-match,
determinism / identity A/B/C (id changes iff admission changes membership) /
PR1-without-semantic = `DISABLED`.

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
  thresholding, no fabricated node ids (adversarial tests pin the no-entity,
  cross-case and name-likeness cases).
- No semantic feedback loop: queries derive solely from bounded authoritative
  context + sorted membership — retrieved text/rankings never enter a query
  (pinned on two builds with differing retrieved text).
- A provider/adapter/context failure is reported as `DEGRADED` — never silently
  replaced by an empty success, and NEVER halting the deterministic M-A13 graph
  expansion of the same build.
- With no semantic dependency, region builds keep PR1 behavior exactly
  (`DISABLED`); enabling semantics with no membership change keeps the identical
  region id, and semantic ADMISSION changes membership (hence the id)
  deterministically.
- Case isolation re-asserted at three boundaries (SQL, port envelope, adapter
  context).
- Temporal validity is authoritative at the retrieval/storage boundary; the
  port receives the region `temporalContext` on every request.
- No `retrieveSemanticContext?` seam remains; PR1.5's obsolete seam describe
  block removed.

---

## 9. Artifacts

| Artifact | Location |
|---|---|
| Contracts | `packages/contracts/src/intelligence/graph-hole-semantic-expansion.ts`, `graph-hole-policy.ts` (+ tests, 13) |
| Query | `packages/intelligence/graph-hole-region/src/semantic-query.ts` (+ tests, 6) |
| Adapter | `packages/intelligence/graph-hole-region/src/semantic-node-adapter.ts` |
| Pipeline | `packages/intelligence/graph-hole-region/src/build-region.ts` |
| Types / exports | `packages/intelligence/graph-hole-region/src/{types,index}.ts` |
| Tests | adapter unit (13), `build-region-semantic` (16), `semantic-query` (6), conformance `semantic-retrieval-seam` (rewritten, 4) |
| Docs | `docs/architecture/semantic-retrieval.md` (PR2 note + correction pass), `docs/roadmap/phase-tracker.md` (PR2/13 row) |
| Commits | `2aefa5b` contracts, `fc7a93f` graph-hole-region + lockfile, correction pass: fix + docs commits (pushed to `feat/m-a13-graph-hole-region`) |

---

## 10. PR2 Production-Grade Correction Pass

Five corrections hardened the initial PR2 delivery (prior to this revision):

1. **Semantic failure isolation** — the initial loop shared a per-round
   `providerFailure` flag that `break`-ed the WHOLE expansion loop on the first
   semantic fault. Corrected: an explicit `semanticDisabledAfterFailure` flips
   semantic expansion off for the rest of the build (`DEGRADED` +
   `SEMANTIC_RETRIEVAL_FAILURE`) while the deterministic M-A13 graph expansion
   continues every round. Regression: a failing-port build is byte-identical
   (node/edge/rounds/regionId) to the PR1 control build with no semantic dep.
2. **Authoritative context query construction** — queries were built as a
   UUID-only payload (`regionSemanticQueryOf(nodeIds)`). Corrected:
   `buildRegionSemanticQuery(contextItems, nodeIds)` derives the PRIMARY
   recall signal from bounded authoritative regional context (injected
   `getSemanticContextForRegion`, case/graph-version/temporal-scoped;
   `MAX_SEMANTIC_CONTEXT_ITEMS=32` / `MAX_SEMANTIC_CONTEXT_CHARS=4096` /
   `MAX_SEMANTIC_QUERY_CHARS=8192`), with node ids only supplementary; fully
   deterministic + no-feedback (queries never contain retrieved text).
3. **Temporal-boundary clarification** — removed the dead `temporalContext`
   field on `SemanticNodeMappingContext` and documented the model: temporal
   filtering is authoritative at the retrieval/storage boundary, the port is
   always invoked with the region `temporalContext`, the adapter performs no
   temporal revalidation (test proves the context reaches the port/resolver).
4. **Region identity documentation correction** — the report previously claimed
   "region id is unchanged whether semantic expansion was enabled or not"
   (FALSE). Corrected: the trace is never an identity INPUT, but semantically
   ADMITTED nodes/edges are membership and DO deterministically change the id
   (A/B/C regression test).
5. **Provider truncation handling** — the provider's explicit `truncated` flag
   is now honored (`providerTruncated` on the trace + `SEMANTIC_RESULTS_TRUNCATED`
   limitation, `LIMITED` status, no further retrieval rounds, graph expansion
   unaffected), and never inferred from `retrievedCount < requestedLimit`.

Contract additions: `providerTruncated: z.boolean()` on
`SemanticExpansionTraceSchema` and the three context-budget constants.
Re-verified after the correction pass: contracts 275, semantic-retrieval 47,
graph-hole-region 105; workspace `pnpm typecheck` + `pnpm build` green.

---

**PR2/13 complete.** Region construction now expands semantically with full
traceability whenever a provider + authoritative adapter are supplied, and
runs deterministically as PR1 otherwise.