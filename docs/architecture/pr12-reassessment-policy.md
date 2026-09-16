# PR12 — Incremental Graph-Hole Reassessment: Policy & Contract Freeze

**Phase 5A-PR12** · `packages/contracts/src/intelligence/reassessment.ts` +
`packages/intelligence/graph-hole-reassessment` (pure) +
`packages/platform/src/reassessment` (orchestration)

Status: **FROZEN (Contract + Policy) — runtime now implemented** (landed 2026-09-16, `feat/m-a13-graph-hole-region`; platform change ledger + `ReassessmentRunner` + producers + orchestrator job; real-Postgres integration suite green 6/6).

> This is the authoritative V1 policy for the incremental graph-hole
> reassessment mechanism. It freezes the trigger taxonomy, effect classes,
> affected-set algorithm, invalidation/version semantics, outcome semantics,
> RESOLVED producer rule, bounds, idempotency, concurrency, and the PR10/PR11
> integration boundaries. No semantic change is permitted without a policy
> version change (`PR12_REASSESSMENT_POLICY_VERSION`).

---

## 1. Product definition

> When authoritative case data changes, recompute only the intelligence that
> could have been affected by that change, while preserving historical
> assessments and preventing stale results from being treated as current.

PR12 is an **incremental intelligence orchestration layer**. It is NOT an
entity-resolution engine, a relation-resolution engine, a replacement for
M-A08 blocking / M-A09 authority / M-A10 relation authority / M-A12 graph
versioning / M-A13 graph semantics, a criminality classifier, an evidence
truth authority, a human approval workflow, a Phase-4 lead lifecycle, a 5B
workflow engine, an evidence-acquisition engine, a new graph engine, a new
event bus, or a general-purpose workflow framework.

Canonical graph truth remains outside PR12. PR12 never mutates canonical
entities/relations, never persists evidence, never creates `EvidenceRequest`s,
and never runs without the existing authority boundaries.

---

## 2. Policy version

```text
PR12_REASSESSMENT_POLICY_VERSION = "v1"
```

Every PR12-derived persisted record/event carries this version plus the
relevant downstream policy versions (qualification, analysis, validation,
judge) so a future reader can determine under which policies a reassessment
was computed.

---

## 3. Trigger taxonomy

The authoritative trigger model supports exactly these trigger types (frozen
discriminated union in `ReassessmentTriggerSchema`):

| Trigger | Payload identity |
| --- | --- |
| `NEW_OBSERVATION` | `caseId`, `observationId` |
| `NEW_EVIDENCE` | `caseId`, `evidenceId` |
| `ENTITY_RESOLUTION_ACCEPTED` | `caseId`, `entityHypothesisId`, `graphVersionId` |
| `RELATION_ACCEPTED` | `caseId`, `relationHypothesisId`, `graphVersionId` |
| `REASSESSMENT_REQUESTED` | `caseId`, explicit `scope` + optional targets |

`REASSESSMENT_REQUESTED` is the manual/replay administrative trigger and is
explicitly scoped (case-wide, specific regions, specific candidates, specific
holes). No additional semantic trigger classes are introduced unless the
repository requires them.

No trigger may carry an assertion of its own impact ("affected region ids",
"resolved=true", scores, or current status). Affectedness is always recomputed
authoritatively (§9). Every trigger must contain enough authoritative identity
to resolve its impact deterministically, and must be case-scoped with cross-case
references failing closed.

---

## 4. Effect classes

```text
EVIDENCE_AFFECTING
GRAPH_AFFECTING
MANUAL_REASSESSMENT
```

Frozen V1 mapping:

| Trigger | Effect class |
| --- | --- |
| `NEW_OBSERVATION` | `EVIDENCE_AFFECTING` |
| `NEW_EVIDENCE` | `EVIDENCE_AFFECTING` |
| `ENTITY_RESOLUTION_ACCEPTED` | `GRAPH_AFFECTING` |
| `RELATION_ACCEPTED` | `GRAPH_AFFECTING` |
| `REASSESSMENT_REQUESTED` | explicit scope defines the class (`GRAPH_AFFECTING` only when a concrete new `graphVersionId` is supplied; otherwise evidence/manual scope against the current version) |

Rationale (encoded in tests): in this repository, observations/evidence do NOT
create a new `GraphVersion`; accepted entity/relation **materialization does**
(curve `entity-materialization`/`relation-materialization` → `createVersion`).
A graph-affecting change is never silently classified as evidence-only.

---

## 5. Region membership never mutates retroactively

Once a region has been constructed, `region.nodeIds`, `region.edgeIds`,
`region.seedObservationIds`, and `region.temporalContext` are frozen for that
`regionId`. A later observation/evidence change:

- NEVER expands or mutates an existing region's membership;
- MAY seed a new region on a future region build;
- MAY change the *evidence/hypothesis context* evaluated against the SAME
  region identity.

`regionId` is content-addressed (SHA-256 over the canonical region identity
including `graphVersionId` + policy versions), so an unchanged region keeps its
id and changed membership produces a different id through the normal identity
rule — never by rewriting history. This prevents region identity churn on every
observation.

---

## 6. Single-version binding

Every reassessment execution operates against EXACTLY ONE authoritative
`graphVersionId` (in practice the ACTIVE version, or the version named by a
graph-affecting trigger / manual scope). The runtime input contains
`graphVersionId` and `computedAt`, where `computedAt` is a REQUIRED
caller-provided timestamp. There is no wall clock, no silent default, no
`new Date()` / `Date.now()` in the deterministic core. Timestamps follow PR10
discipline: ISO-8601 UTC + `ObservedTimeSchema` round-trip. A reassessment never
silently combines multiple GraphVersion snapshots. `computedAt` never
influences affected-set, identity, ranking, or semantic outcome.

Pre-existing system stamps (`transactionTime`, `analyzedAt`) remain
implementation metadata and are excluded from semantic computation.

---

## 7. Change cursor / watermark

`TemporalStateChange.sequence` is scoped per `(caseId, entityType, entityId)`
and is NOT a per-case global order. PR12 therefore maintains a dedicated
per-case persisted ordered change ledger + cursor:

```text
CaseReassessmentChange
  id              deterministic UUID
  caseId
  graphVersionId? nullable — the ACTIVE version the change was evaluated on
  sequence        per-case monotonic (max+1, advisory-locked), @@unique[caseId, sequence]
  changeId        deterministic per-change identity (buildReassessmentChangeId) — @unique
  trigger         ReassessmentTrigger (Json, zod-validated)
  effectClass     EVIDENCE_AFFECTING | GRAPH_AFFECTING | MANUAL_REASSESSMENT
  status          PENDING | COMPLETED | PARTIAL | FAILED | SKIPPED
```

```text
CaseReassessmentCursor
  caseId                  @id
  lastProcessedSequence   0 when nothing processed
  updatedAt
  policyVersion           PR12_REASSESSMENT_POLICY_VERSION
```

Semantics (frozen):

- A change is **published** once per `changeId` (unique constraint). Duplicate
  delivery of the same authoritative change is an idempotent no-op.
- The worker drains `PENDING` changes in canonical `sequence` order (bounded),
  classifies + coalesces them, resolves the affected set, executes the plan,
  persists per-change outcome rows, and advances the cursor to the highest
  `sequence` fully processed in that run.
- A change whose own processing partially/or fully failed is recorded
  `PARTIAL`/`FAILED` **before** the cursor advances — the cursor never claims
  failed work was fully applied. `FAILED` is terminal for that changeId
  (no silent infinite retry); a new `REASSESSMENT_REQUESTED` may re-open it.
- Coalescing preserves semantics: applying the coalesced change set is
  equivalent to applying the individual changes under the frozen model.
  Mutually incompatible graph-version transitions are never coalesced
  (each graph-affecting change carries its own `graphVersionId`).

---

## 8. Idempotency

Duplicates (same trigger delivered twice / after crash / concurrently / after
retry) must not create duplicate semantic state.

- Authoritative change identity: `buildReassessmentChangeId(trigger)` — a
  canonical SHA-256 over the trigger discriminator + canonical ids. Where a
  repository-native change id already exists (e.g. a persisted event/graph
  revision id), it is preferred.
- The `CaseReassessmentChange.changeId` unique constraint is the dedup guard.
- Persisted assessments dedupe via the existing `GraphHoleAssessment.logicalKey`
  semantics.
- Cursor advancement is the progress guard.

---

## 9. Affected-set algorithm (deterministic, lazy)

Content-addressed identities are the truth. There is NO permanent invalidation
table. `AffectedSetSchema` distinguishes `NO AFFECTED OBJECTS` from `AFFECTED
BUT TRUNCATED` — truncation is always surfaced, never a silent empty set.

The resolution chain depends on effect class:

### 9.1 Evidence-affecting (`NEW_OBSERVATION`, `NEW_EVIDENCE`)

Same `graphVersionId`, same existing region/candidate identities. Do NOT
require or create a new GraphVersion.

1. **Affected hypotheses:** hypotheses (relation/entity) whose authoritative
   evidence sets reference the changed observation/evidence:
   `evidenceBasis`, `contradictions`, `supportingObservationIds`,
   `contradictingObservationIds`, `candidateEntities[].evidence` (entity), and
   the atomic projection's supporting/contradicting observation sets.
2. **Affected groups:** groups whose member atomics include any affected
   hypothesis (group membership is a pure function of the atomic set; unchanged
   memberships produce unchanged group ids).
3. **Affected regions:** regions whose `nodeIds`/`edgeIds` intersect the
   affected hypotheses' canonical entity references (evidence-scope overlap),
   filtered by region temporal context. Region membership is NOT mutated.
4. **Affected candidates:** persisted holes bound to the affected regions
   (same `graphVersionId`).

### 9.2 Graph-affecting (`ENTITY_RESOLUTION_ACCEPTED`, `RELATION_ACCEPTED`)

A new `graphVersionId` is supplied.

1. **Affected regions (current version):** rebuild ONLY the regions that
   overlap the change (node overlap for entity materialization; node + edge
   overlap + derived node overlap for relation acceptance), using the SAME
   seeds, on the new version. The rebuilt region's `graphVersionId` is inside
   its identity, so its `regionId` is new; the old region/`regionId` stays
   historical. Regions unaffected by the change are untouched.
2. **New candidates:** detection runs over each rebuilt region on the new
   version; candidate identity (which includes `graphVersionId`) is new.
3. **Supersession:** the old ACTIVE `GraphHole` becomes `SUPERSEDED` ONLY when
   a replacement `GraphHole` record is actually created and the existing
   single-demotion persistence rule permits the transition. Never passive
   demotion on a bare version change.

### 9.3 Affected-region predicate matrix (frozen)

| Trigger | Node | Edge | Evidence | Hypothesis | Temporal |
| --- | --- | --- | --- | --- | --- |
| `NEW_OBSERVATION` | conditional (hypothesis refs) | conditional | yes | yes | yes |
| `NEW_EVIDENCE` | no graph mutation | no graph mutation | yes | yes | yes |
| `ENTITY_RESOLUTION_ACCEPTED` | yes | derived | indirect | yes | yes |
| `RELATION_ACCEPTED` | yes | yes | indirect | yes | yes |

Temporal overlap reuses the authoritative M-A12 interval primitives
(`intervalsOverlap`); absent/unbounded context follows existing repository
semantics (no guessing). Test overlap / boundary-overlap / non-overlap /
unknown-unbounded.

---

## 10. Reassessment plan (pure, bounded, canonical)

`buildReassessmentPlan(...)` resolves the affected set into canonical ordered
work items (one per affected region) BEFORE any side effect:

```text
RegionWorkItem { regionId, effectClass, recomputeIdentity: boolean, reusable: boolean }
```

Ordering is canonical (regionId asc); it never depends on DB insertion order,
queue arrival, Map/Set iteration, or worker scheduling. The plan may be
inspected (dry-run) and is the unit of deterministic testing.

---

## 11. Execution path

For each affected region, in canonical order:

1. Verify case/graphVersion/region scope (fail closed on cross-case/cross-version).
2. Determine effect class:
   - GRAPH_AFFECTING: rebuild bounded region on the new version → derive new
     identity.
   - EVIDENCE_AFFECTING: preserve region identity on the same version.
3. Rebuild the relevant bounded context (region rebuild + PR3 hypothesis
   context + observations + canonical nodes/edges).
4. Region no-repeat gate: reuse existing `findCompletedByRegionIdentity` /
   `findCompletedByRegionId`; a completed equivalent assessment on the same
   identity short-circuits recomputation (record `regionsReused`).
5. Run PR4 detection + PR5 qualification over the rebuilt bounded context.
6. Build the PR7 bounded analysis context (deterministically), compute
   `contextSha256`. Compare to the last relevant persisted context digest:

   - **unchanged** → SKIP AI analyst + judge entirely (`regionsSkippedContextUnchanged`).
   - **changed** → analyst → validator → judge, through their existing
     authority boundaries (never altering the rules).

7. Derive the deterministic lifecycle outcome (see §13).
8. Persist legal assessment/state transition (append-only; legal transitions
   only).
9. Optionally recompute next-best-evidence ONLY when PR10 inputs changed (§16).
10. Emit per-region accounting; then publish `GRAPH_HOLE_REASSESSED`.

No whole-case fallback exists. If affectedness cannot be determined, the run
fails closed (or enters an explicitly bounded, audited degraded mode) — never a
hidden "rerun everything". AI (LLM/embeddings) is never involved in impact
analysis.

---

## 12. Context-hash reuse and stale-output protection

PR12 reuses PR7's `buildGraphHoleAnalysisContext` → `(context, contextSha256,
serialized)` EXACTLY. No second hashing format. AI skip is:

```text
new bounded contextSha256 vs last relevant assessment contextSha256
  equal      → analyst SKIPPED + judge SKIPPED (accounting explains why)
  different  → analyst → validator → judge
```

A result is current only when bound to the exact authoritative context it was
generated from. The persisted reassessment envelope preserves at least:
`graphVersionId`, `regionId`, `candidateId`, `temporalContext`,
`contextSha256`, `analysisPolicyVersion`, `qualificationPolicyVersion`,
`validationPolicyVersion`, `judgePolicyVersion`, `reassessmentPolicyVersion`.
An assessment generated from an old context remains historical and can never
silently become current after authoritative input changes.

---

## 13. Outcome semantics and the RESOLVED producer rule

The frozen outcome vocabulary (`ReassessmentOutcomeSchema`):

| Outcome | Meaning | How it is derived (deterministic) |
| --- | --- | --- |
| `STRENGTHENED` | New context increases support for the same hole condition without resolving it | independentSupportUnitCount / evidence-support or structural score increased vs prior snapshot |
| `WEAKENED` | New context reduces support/importance without contradiction or resolution | score decreased vs prior snapshot |
| `RESOLVED` | The hole's previously missing expected condition is NOW satisfied by authoritative graph/evidence state | deterministic predicate (below) — NEVER the LLM alone |
| `CONTRADICTED` | New authoritative context directly conflicts with the structural/hypothesis expectation | candidate's contradicting observation set became non-empty / a conflicting authoritative relation exists |
| `SUPERSEDED` | Current hole representation replaced by a new-graph-version legal replacement record | a real replacement `GraphHole` row was created + the single-demotion persistence rule allowed the transition |

Precedence (frozen, tested): `SUPERSEDED` > `RESOLVED` > `CONTRADICTED` >
direction-of-score (`STRENGTHENED`/`WEAKENED`) > no-change (skip; append nothing
for evidence-affecting).

**RESOLVED producer rule (V1).** `RESOLVED` is a deterministic lifecycle
conclusion derived from authoritative graph/evidence state plus the existing
validated assessment gates. It is produced when the hole's expected structural
condition is directly satisfied:

- `MISSING_EDGE` / `EXPECTED_PATH_BROKEN` / `BROKEN_CHAIN`-style candidates
  with a concrete `expectedRelationshipType` and `nodeIds` are resolved when an
  authoritative canonical `Relation` (projected into the current graph) exists
  whose endpoints equal the candidate's `nodeIds` (set-equality; direction per
  the relation's directedness) and whose `relationType` equals the candidate's
  `expectedRelationshipType`.
- Related detector expectations resolve only through the equivalent
  deterministic satisfaction predicate for that detector's structural basis —
  never through language.

Touchstones (frozen): evidence that merely makes a hole "less interesting" ⇒
`WEAKENED`, NOT `RESOLVED`. Evidence directly conflicting ⇒ `CONTRADICTED`, NOT
`RESOLVED`. A newer graph-version candidate replacing the old logical candidate
⇒ `SUPERSEDED`, NOT `RESOLVED`.

**Reassessment of a RESOLVED/CONTRADICTED hole.** A resolved/contradicted hole
is not reopened by unrelated evidence changes. Only a genuinely new
authoritative graph/evidence condition that changes the hole's defining
expectation may create new analytical work.

---

## 14. Supersession

Old `ACTIVE` → `SUPERSEDED` ONLY when an actual replacement `GraphHole` record
has been created and the existing persistence rule permits it. A bare version
change never auto-demotes. Historical assessments remain append-only and
queryable.

---

## 15. Bounds

Run-level fanout limits (aligned to existing 5A ceilings; reused where
available):

| Bound | Value | Justification |
| --- | --- | --- |
| `MAX_CHANGES_PER_RUN` | 25 | Drains a bounded batch of pending changes per run |
| `MAX_AFFECTED_HYPOTHESES_PER_CHANGE` | 50 | Equal to `MAX_HYPOTHESES_IN_CONTEXT` (frozen hypothesis-context budget) |
| `MAX_AFFECTED_GROUPS_PER_CHANGE` | 25 | Equal to `MAX_ATOMIC_HYPOTHESES_PER_GROUP` alignment |
| `MAX_AFFECTED_REGIONS_PER_CHANGE` | 10 | Equal to `MAX_GRAPH_HOLES_PER_REGION` / `MAX_AI_ANALYSES_PER_REGION` ceilings |
| `MAX_REASSESSMENTS_PER_CHANGE` | 10 | One work item per affected region, capped by region ceiling |
| `MAX_REGION_NODES` / `MAX_REGION_EDGES` | 100 / 250 | Reused region-builder ceilings (region identity/truncation semantics) |
| `MAX_CONTEXT_OBSERVATIONS` / `MAX_HYPOTHESES_IN_CONTEXT` | 150 / 50 | Reused PR7 bounded-context budgets |
| `MAX_AI_ANALYSES_PER_REGION` | 10 | Reused AI-analysis ceiling per region |

Every bound stops deterministically, surfaces truncation (`truncated` +
counts), preserves auditability, and never silently drops impact.

---

## 16. Failure isolation

Per-region isolation: a bad region never blocks other affected regions. A run
records per-region per-change statuses (SUCCESS / REUSED / SKIPPED_NO_CHANGE /
SKIPPED_CONTEXT_UNCHANGED / FAILED). A failed region is recorded
`FAILED / NOT CURRENT`; it never masquerades as up-to-date and never replaces a
trustworthy old assessment with apparently-current state from an incomplete
run.

Failure semantics (frozen): invalid authoritative input → fail closed;
downstream AI/validator/judge failure → preserve historical state, mark the new
reassessment failed/incomplete, never present stale results as newly current;
persistence conflicts → retry/idempotent path via existing uniqueness/logicalKey
semantics; missing GraphVersion/region/candidate/hypothesis or stale references
→ typed fail-closed errors surfaced in accounting+audit.

---

## 17. PR11 integration boundary

PR11 (targeted reblocking) is a parallel task. PR12 integrates ONLY through
PR11's explicit public contract (`TargetedReblockRunRecord` /
`CandidatePair`/`EntityHypothesis` outputs). Conceptual loop:

```text
authoritative change → PR12 affected-region analysis
  → region requires targeted reblocking → PR11
  → CandidatePair → M-A09 → new authoritative resolution/hypothesis change → PR12
```

**Recursion guard (frozen):** PR11-derived `CandidatePair` *creation* or fresh
`EntityHypothesis` *proposal* does NOT itself publish a case change and does
NOT trigger reassessment. Only authoritative acceptance through M-A09/M-A10
(accepted entity/relation → new GraphVersion) produces a PR12 trigger
(`ENTITY_RESOLUTION_ACCEPTED` / `RELATION_ACCEPTED`). An explicit
`ReassessmentPr11Port` provides PR11 outputs to PR12; the loop terminates
because pending-hypothesis creation cannot self-trigger. The maximum causal
depth is bounded by the authoritative change id + processed watermark — never a
sleep/counter heuristic.

---

## 18. PR10 / next-best-evidence interaction

PR10 selection is recomputed only when its inputs change: the affected hole's
deterministic candidate set (`canonicalRequestKey` set) or the evidence-utility
inputs changed. A pure comparator decides before running
`selectNextBestEvidence`. An arbitrary observation never forces a PR10 run.
PR10 remains an optional final stage.

---

## 19. Event / queue wiring

- Reuse the existing `GraphEvent` contract vocabulary where applicable and add a
  `GRAPH_HOLE_REASSESSED` event representing the completed semantic outcome. The
  event never implies a canonical graph mutation unless one actually happened
  through the appropriate authority path, and never itself retriggers PR12.
- A single repository-native publication seam:
  `publishCaseChange(trigger, ...)` — authoritative write → coalesced, idempotent
  reassessment scheduling. Producers are wired at: observation/evidence ingestion
  completion, entity materialization, relation materialization/amend/reverse.
- Reassessment runs are enqueued as a `graph-hole-reassessment` job on the
  existing BullMQ investigation queue; the worker (1) acquires the per-case
  advisory lock, (2) drains pending changes in sequence order, (3) classifies/
  coalesces deterministically, (4) resolves affected sets, (5) executes the plan,
  (6) persists results, (7) advances the watermark. Concurrency: one logical
  cursor owner per case; independent cases process in parallel; no global lock.

---

## 20. Transaction boundaries

Separate atomic units: (a) change publication; (b) per-region reassessment
persistence; (c) cursor advancement. Results are never persisted then lost to a
crash-then-rerun duplication because changeId + logicalKey uniqueness make all
re-applications idempotent. No single enormous per-case transaction.

---

## 21. Authorization / case isolation / trust model

Every trigger, affected-set operation, region, candidate, hole, assessment,
cursor, and job is case-scoped. Cross-case reference mismatch fails closed.
Every trigger is untrusted at the orchestration boundary: discriminator, UUIDs,
case scope, graphVersion scope, ownership, temporal validity, policy version,
and bounded cardinality are validated. Caller-supplied "affected region ids",
"current status", "resolved=true", and scores are never trusted — affectedness
is recomputed. A caller may request reassessment; it may not declare the result.

---

## 22. Deterministic ordering & timestamp discipline

All affected collections use canonical ordering (id asc / changeId asc /
sequence asc). Never DB insertion order, queue arrival, Map/Set iteration, or
worker scheduling order. The same effective change set produces the same
reassessment plan. `computedAt` is the ONLY timestamp in the deterministic core
and comes from the caller; tests prove byte-identical plans for identical
inputs and that timestamps never affect semantics.

---

## 23. No-op semantics

A valid trigger may legitimately affect no hole (e.g., new observation → no
relevant hypotheses → no affected region), or affect a region whose context hash
is unchanged (no AI work). These are recorded `NO_OP`/`SKIPPED` in accounting —
never a fake recomputation, never an error.

---

## 24. Observability

Structured audit/accounting per run: `caseId`, `triggerType`, `triggerId` /
`changeId`, `graphVersionId`, `policyVersion`, `affectedRegions`, `recomputed`,
`reused`, `skipped`, `failed`, `truncated`, `assessmentsAppended`, `outcomes`,
`cursorBefore`, `cursorAfter`. Raw sensitive evidence is not emitted.

---

## 25. Non-goals (explicit)

- No new blocking/entity/relation/graph engine.
- No canonical mutation from intelligence.
- No LLM/embedding/heuristic in impact analysis.
- No whole-case rerun fallback.
- No new event bus / workflow framework.
- No human approval workflow (human consequence is owned by Lead / 5B).
- No evidence acquisition (evidence requests stay PR10 lifecycle scope).
- No alteration of PR8 validator rules, PR9 v2 judge thresholds, PR5
  qualification math, PR7 analyst contract, or PR10 frozen utility policy.