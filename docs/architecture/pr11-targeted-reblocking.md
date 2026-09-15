# PR11 — Targeted Reblocking Architecture

**Date:** 2026-09-16 | **Owner:** Mayur | **Status:** Complete

## Objective

After graph-hole analysis identifies a suspicious local region, selectively re-run entity blocking (M-A08) **only for that region** instead of a case-wide blocking pass. The output is a content-addressed `TargetedReblockRun` record, the bounded pair universe handed to M-A09 (never auto-accepted), and an audit trail.

## Non-Goals

| Constraint | Rationale |
|---|---|
| NOT a new blocking algorithm | M-A08 `blockCandidates` is reused **verbatim** |
| NOT entity resolution | M-A09 decides what pairs mean |
| NOT a case-wide rerun | Region-scoped only; case isolation preserved |
| NOT auto-accept | Hypotheses are PROPOSED at most |
| NO LLM / embeddings / fuzzy similarity | Deterministic rule-based membership only |
| NO new authority | Region truth lives in the PR6 `GraphHoleRegionAnalysis` record |

---

## 1. Region-Scoped Authority

The **persisted** `GraphHoleRegionAnalysis` record (PR6, `packages/platform/src/persistence/graph-hole-region-analysis-store.ts`) is the sole source of region truth:

- `seedObservationIds` — explicit observation ids
- `nodeIds` — graph nodes reachable from the region
- `temporalContext` — closed interval the region covers
- `regionPolicyVersion` — graph-hole policy version used during analysis

A region that has **not been persisted** is rejected with `REGION_NOT_PERSISTED`. Client-supplied membership claims are never trusted.

The store's `findCompletedByRegionIdAndPolicy` (additive in PR11) performs a DB `@@unique([regionId, caseId, graphVersionId, regionPolicyVersion])` lookup without a `semanticRetrievalPolicyVersion` filter — this aligns with PR11 region references which carry only `regionPolicyVersion`.

---

## 2. Membership Rule

Frozen V1 rule constant: `TARGETED_REBLOCK_MEMBERSHIP_RULE = 'REGION_OBSERVATION_MEMBERSHIP_V1'`

Region membership resolution (`resolveRegionMemberObservations`):

```
memberObservationIds =
  seedObservationIds
  ∪ { observations where entityIds ∩ region.nodeIds ≠ ∅ }
  ∩ filter(temporalContext)        — if present
```

- **Closed-interval overlap**: `validFrom ≤ regionEnd` AND `validTo ≥ regionStart`; missing endpoint = unbounded on that side; no resolvable time = retained; `EventTime.value` "A/B" ranges handled; lexicographic ISO comparison.
- **Deduped, sorted, bounded**: hard cap `MAX_REGION_OBSERVATIONS = 500`; truncation surfaced (`regionObservationBoundReached`).
- **Retained if no temporalContext** — no evidence of a temporal window = observation is admitted.

---

## 3. Candidate Universe & M-A08 Reuse

1. All case-scoped `EntityMentionCandidate` rows are loaded (`entityMentionStore.listByCase`).
2. The membership selector (`selectCandidatesForRegion`) admits only candidates whose `observationId` is in the member set. This is the **only admission rule**.
3. The bounded candidate universe (hard cap `MAX_CANDIDATES = 200`) is fed to M-A08 `blockCandidates` **verbatim** — no duplicated engine, no separate pass logic.
4. Pair drafts are bounded (`MAX_PAIRS = 5_000`); truncation surfaced (`pairsTruncated`).

---

## 4. Deterministic Run Identity

```
identityKey = canonicalizeDeterministic({
  namespace: 'indago:targeted-reblock',
  version:   'v1',
  caseId, graphVersionId, regionId,
  regionPolicyVersion, policyVersion: 'v1',
  selectedCandidateIds  (sorted, deduped)
})

runId = sha256Hex(identityKey)   — 64-char lowercase hex
```

An identical re-run over the same processed candidate universe converges to the same `runId` / `identityKey`. This is the idempotency key: the `TargetedReblockRun` row and every pair + hypothesis write are dedup-guarded by their respective `identityKey @unique` DB constraints.

---

## 5. Platform Layer

### TargetedReblockRun model

- `id @id @default(uuid())` — record id
- `runId @unique` — content-addressed hex
- `identityKey @unique` — canonical identity string (dedup guard)
- `accounting Json` — `TargetedReblockAccountingSchema`
- `counts Json` — `TargetedReblockCountsSchema` (includes resolver outcomes)
- `provenance Json` — `TargetedReblockProvenanceSchema`
- `truncated Boolean` — any truncation in the pipeline

`@@index([caseId, graphVersionId])`, `@@index([regionId])`

### New store seams (additive, zero-risk)

| Method | File | Purpose |
|---|---|---|
| `observationStore.listByEntityIds(entityIds, filter)` | `observation-store.ts` | `array_contains` on Json `entityIds` column; loads observations referencing region nodes |
| `candidatePairStore.findByIds(ids, filter)` | `candidate-pair-store.ts` | Bounded (200 cap) case-scoped pair fetch for downstream use |
| `graphHoleRegionAnalysisStore.findCompletedByRegionIdAndPolicy(input)` | `graph-hole-region-analysis-store.ts` | Region lookup without semantic-retrieval filter |
| `targetedReblockRunStore.persistRun(input)` | `targeted-reblock-run-store.ts` | Idempotent run persist + `countRunsForRegionVersion` for ops gate |

### Orchestration (`src/services/targeted-reblocking.ts`)

```
runTargetedReblockForRegion(caseId, graphVersionId, regionId, regionPolicyVersion)
  → TargetedReblockRunRecord
```

1. **Region gate**: `findCompletedByRegionIdAndPolicy` → `REGION_NOT_PERSISTED` if null.
2. **Ops gate**: count existing runs for (case, region, policyVersion) → reject if ≥ `MAX_OPERATIONS_PER_VERSION` (50) with `OPERATION_BOUND_REACHED`.
3. **Membership reads**: `listByEntityIds(nodeIds)` + seeds; project to `RegionObservation`.
4. **Candidate universe**: `listByCase` (case-scoped, full case).
5. **Pure core**: `resolveRegionMemberObservations` → `blockTargetedRegion` (split API keeps DB reads adjacent to stores).
6. **Persist pairs**: `finalizeCandidatePair` → `ensureCandidatePairs` (idempotent).
7. **M-A09 handoff**: `handoffPairsToEntityResolution` over the bounded pair set.
8. **Durable run record**: full counts (including resolver outcomes) → `persistRun`.
9. **Audit**: `TARGETED_REBLOCK_COMPLETED` action, `REBLOCK_RUN` target type, metadata only.

### M-A09 Handoff (`src/services/targeted-reblock-ma09-handoff.ts`)

Faithful replica of the `completeMA09` + `candidateResolutionToHypothesis` loop from `ingest-evidence.ts`, scoped to the caller's pair set. Same stores, same engine, same lifecycle-preserving upsert semantics. Per-pair, partial-failure safe. No whole-case gate.

---

## 6. Contracts Summary

| Constant | Value | Rationale |
|---|---|---|
| `MAX_REGION_OBSERVATIONS` | 500 | Bounded observation read |
| `MAX_CANDIDATES` | 200 | Conservative blocking universe |
| `MAX_PAIRS` | 5 000 | Hard pair cap |
| `MAX_OPERATIONS_PER_VERSION` | 50 | Ops guard on (case, region, policy) |
| `POLICY_VERSION` | `'v1'` | Frozen |

All schemas are **strict** (no undisclosed fields).

### Error codes

| Code | Semantics |
|---|---|
| `AUTHORITY_MISMATCH` | Region ref case/graphVersion ≠ operation context |
| `INVALID_REGION_REFERENCE` | Malformed region reference (Zod parse failure) |
| `REGION_NOT_PERSISTED` | No completed region analysis for the requested identity |
| `OPERATION_BOUND_REACHED` | ≥ 50 distinct runs already durable for (case, region, policy) |

---

## 7. Audit

| Action | Target type | When |
|---|---|---|
| `TARGETED_REBLOCK_COMPLETED` | `REBLOCK_RUN` | After run record persisted (one per invocation) |
| `ENTITY_RESOLUTION_PROPOSED` | `SYSTEM` | Per fresh hypothesis proposal (via handoff layer) |

Both are emitted **only after** the relevant durable write. The handoff layer uses `TARGETED_REBLOCK_PIPELINE` as the actor string to distinguish from `ENTITY_RESOLUTION_PIPELINE` (ingest-evidence).

---

## 8. Verification

| Layer | What | Count |
|---|---|---|
| `@indago/contracts` | Frozen V1 constants, region-ref strict validation, audit action + target type | 425 green (12 PR11) |
| `@indago/targeted-reblocking` | Membership resolution, region selector, bounds, orchestration, identity, region reference | 38 green |
| `packages/platform` | `TargetedReblockRun` prisma model + migration, stores, services, integration (DB-gated) | src compiles; integration `describe.skipIf(!TEST_DATABASE_URL)` |

### Known environment constraint

The platform integration suite (`tests/integration/pr11-targeted-reblocking.integration.test.ts`) requires a reachable Neon DB (`TEST_DATABASE_URL`). On machines where the env var is set but Neon is unreachable (firewall/timeout), the suite fails in `beforeAll`. This matches the behaviour of `pr6-graph-hole-persistence.integration.test.ts` and is not a code defect — the suite must run in CI with DB access.

---

## 9. Open / Deferred

- **Status gate**: the service does not currently reject regions in non-`SATURATED` status; this could be refined if region analysis statuses other than `SATURATED` are expected reblock targets.
- **Multi-region reblock**: a single invocation reblocks one region; multi-region orchestration is deferred.
- **Sequential gate**: the 50-run bound is a simple count; time-windowed or rate-limiting variants are future extensions.
