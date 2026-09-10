# Temporal Semantics — Reference (M-A12)

> **Canonical, implementation-ready semantics for domain-time handling in INDAGO.**
> Authoritative design: `docs/platform/m-a12-temporal-architecture.md` (decisions D1–D7).
> Runtime model + API report: same doc, Appendix B.1. This file is the quick reference.
>
> Scope: **live mode only**. Demo mode (`packages/web/src/lib/providers/demo/**`,
> `flow-model.ts`) is untouched.

## 1. The temporal concepts (never conflated)

| Concept | Meaning | Precision |
| --- | --- | --- |
| Event time (`Observation.eventTime`) | When a domain event actually occurred in the real world. Only when confidently extractable. | `exact\|minute\|hour\|day\|month\|year\|range\|approximate\|unknown` |
| Observation time (`observedAt`) | When INDAGO/source observed/recorded the data point. | `exact` |
| Validity interval (`validityInterval`) | Closed `[validFrom, validTo]` real-world period; the authoritative domain-validity window on Relation / RelationHypothesis / Observation. | interval bounds `{value, precision}` |
| Ingestion time | When data entered INDAGO (lexicographic order keeps late evidence ordered). | `exact` |
| Revision time (dimension A) | `GraphVersion.versionNumber` order — the authoritative revision chain, independent of domain time. | — |
| Assertion time (dimension A-amendment) | Each relation's `temporalAssertions` family pins a validity interval to the revision that created it; revisions applied later never rewrite earlier history. | interval + `revisionAtVersionNumber` |
| Lifecycle revision (dimension B-entity) | Entity existence (created/archived) is itself revisioned, so the node universe at a historical version matches what existed then. | `revisionAtVersionNumber`/version |

Rule: `createdAt`/`updatedAt`/`sequence` are **never** substitutes for domain-valid time.

## 2. D5 — closed `[validFrom, validTo]` intervals

- `validTo` inclusive when present; absent `validTo` = open-ended toward the future.
- `validTo < validFrom` is INVALID; boundary equality (`validFrom == validTo`) is VALID.
- Bounds carry their own precision; ordering is compared on parseable instants only — a vague value is
  never coerced into a fake instant.
- Producers never fabricate: no invented year, no invented bounds, no invented precision.

Enforced by `packages/platform/src/temporal/interval-validation.ts`
(`validateEventTime`, `validateTemporalInterval`, `assertValidTemporalInterval`) and wired at the
boundary in `completeMA06` (WS-2: a malformed value throws `TemporalValidationError` before it can
reach a proposal).

## 3. Interval producer (WS-3)

`packages/platform/src/temporal/interval-aggregation.ts` → `deriveValidityInterval(observations)`:

- Contributors: only supporting observations with an explicit `eventTime` parsing to a finite instant.
- `validFrom` = earliest contributor; `validTo` = latest contributor; a single contributor → no `validTo`.
- `semantics: "inferred"` always (the span itself was never directly observed).
- `precision: "exact"` iff every contributing bound is `exact`, else `"range"`.
- No contributing instant → `undefined` (truthful omission; the caller persists NO interval).
- Wired into `completeMA10`: each proposal's `validityInterval` is derived from its evidence basis and
  flows verbatim into the canonical Relation at accept (never recomputed there).

## 4. valid-at (dimension B — domain-time containment, WS-10)

`containsTime(interval, atIso)` + `GraphProjectionService.projectGraphValidAt({investigationId, caseId}, at)`:

- Keeps ACTIVE canonical relations whose persisted `validityInterval` **contains** the instant `at`
  (closed semantics: boundaries inclusive; open-ended stays open-ended).
- ONLY instant-grade bounds (`exact|minute|hour`) that parse to finite values can contribute.
  Coarse bounds (month/year/range/approximate/unknown), unparseable `at`, and relations with **no**
  interval → excluded, never guessed.
- Reads from the CURRENT persisted `validityInterval`, which is always the latest applied interval
  (amendments overwrite the persisted column; they never "rewind" it on read).
- This is an entirely different question from revision order (dimension A). `valid-at` answers
  "what was real-world-valid at instant t"; `/versions/:vid` answers "what did the recorded change
  chain look like by revision N".

### 4a. as-of (dimension A — revision-time projection)

`GraphProjectionService.projectGraphVersion(caseId, {versionNumber})` reconstructs the graph as of a
specific revision:

- **Entity universe is revisioned.** `replayEntityLifecycle(chain, N)` folds ENTITY_CREATED /
  ENTITY_ARCHIVED revisions into a `{createdAtVersion, archivedAtVersion}` map; at revision N a node
  exists iff `createdAtVersion <= N` and (`archivedAtVersion` absent or `> N`). Legacy chains (no
  entity revisions) keep the full universe for backward compatibility.
- **Edge intervals are revisioned.** Each relation's temporal-assertion family carries the revision
  that recorded it (`revisionAtVersionNumber`); the projected interval at revision N is the last
  assertion with `revisionAtVersionNumber <= N`. An amendment applied at a later revision therefore
  does NOT leak into older snapshots — the original interval stays visible as-of version 1, the
  corrected one appears only from the amendment's revision onward.
- The projection is derived from the persisted chain, NOT recomputed from "latest evidence".

API: `GET /api/v1/cases/:caseId/graph/valid-at?at=<ISO>` (400 when `at` missing/unparseable).

## 5. History (WS-13) — append-only temporal state

`packages/platform/src/persistence/temporal-state-change-store.ts` + DB trigger
(`prisma/migrations/20240102000000_append_only_temporal_state_change/migration.sql`):

- `temporal_state_change_append_only` trigger rejects UPDATE/DELETE on `TemporalStateChange`.
- `logicalKey` (`caseId:entityType:entityId:stateType[:eventRef]`) is unique → replay of an identical
  transition is an idempotent no-op (P2002 → re-read by id → by `{logicalKey, caseId}`).
- Same-transaction writes: relation accept/reverse/amend → `RELATION:{ACCEPTED,REVERSED,AMENDED}`;
  entity create/archive → `ENTITY:{CREATED,ARCHIVED}`. Canonical write + version + history row all
  commit atomically.
- Test reset seam: `TRUNCATE TABLE "TemporalStateChange"` (row triggers do not fire on TRUNCATE).

## 6. Amendments (M-A12 item A) — append-only temporal assertions

`packages/platform/src/persistence/relation-store.ts` (`seedOriginalAssertion`, `amendValidity`) +
`packages/platform/src/relations/relation-materialization.ts` (`amendRelationValidity`):

- **Append-only family.** `Relation.temporalAssertions` is an ordered `ORIGINAL → AMENDMENT…` chain.
  The ORIGINAL is seeded in the SAME transaction as the relation's accept (recording the accept
  revision's `versionNumber`); an amendment APPENDS a new assertion and NEVER mutates the original.
- **Correction interval = domain interval.** The persisted `validityInterval` column is overwritten
  with the amendment's interval so current consumers (`valid-at`, routes) read the latest corrected
  value; the historical as-of projection reads the assertion chain instead.
- **Version + TSC in one transaction.** `amendRelationValidity` re-validates D5
  (`assertValidTemporalInterval`), guards the relation is ACTIVE, then commits version
  `RELATION_AMENDED:<relationId>`, an `AMENDMENT` assertion (with `supersedesAssertionId` pointing at
  the prior assertion), and a `RELATION:AMENDED` TSC row together.
- **Idempotent.** Amending to the exact interval already in force → `versionCreated:false`, no
  duplicate version/TSC/assertion.
- Stability guarantee: revision chain remains contiguous, monotonic, no gaps; the amendment does NOT
  create a new GraphVersion chain, it appends a new revision like any other graph change.

## 7. Graph revision events (M-A12 item C)

`packages/platform/src/relations/graph-version-service.ts`:

- Every version consumed by `decodeChange` maps to a typed `GraphRevisionEvent`:
  `RELATION_ACCEPTED` / `RELATION_REVERSED` / `RELATION_AMENDED` / `ENTITY_CREATED` /
  `ENTITY_ARCHIVED` — each carrying the affected entity/relation id.
- NEW writes MUST go through `toGraphRevisionMetadata(event)`; decode is strict (a known event with a
  missing/empty id is a corruption error; unknown types/prefixes are skipped not misparsed). Legacy
  reason-string formats are still parsed for replay compatibility.

## 8. DB invariants (M-A12 item D)

- `GraphVersion` has a **partial unique index on `(caseId) WHERE status = 'ACTIVE'`** → at most ONE
  active version per case at the DB level, independent of application logic
  (`prisma/migrations/20240103000000_graph_version_unique_active_per_case/migration.sql`).
- `@@unique([caseId, versionNumber])` remains the safety net against duplicate revision numbers.
- The advisory lock (`pg_advisory_xact_lock`) remains the primary concurrency mechanism for version
  allocation; the unique index is the fail-closed backstop.