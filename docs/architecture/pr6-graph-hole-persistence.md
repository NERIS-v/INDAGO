# PR6 — GraphHole Identity, Persistence & Deduplication (Phase 5A)

> Branch: `feat/m-a13-graph-hole-region` · Status: implemented (V1)

PR6 makes the deterministic PR4 (detection) / PR5 (qualification) pipeline
durable. It is a **persistence boundary**, nothing more.

```
PR1/PR2  GraphHoleRegion (bounded analysis context, deterministic)
            │
PR4       RawGraphHoleCandidate (detection output, deterministic, persistence-free)
            ↓
PR5       QualifiedGraphHoleCandidate (scored + ranked, deterministic, persistence-free)
            ↓
PR6       persistence stores  →  authoritative persisted GraphHole intelligence
```

---

## 1. Ownership Decision

### Producer

GraphHole production is owned by the deterministic Phase-5A intelligence
pipeline — PR4 detection (`@indago/graph-hole-detection`) then PR5
qualification (`@indago/graph-hole-qualification`). Both are pure,
persistence-free, and byte-stable.

### Persistence owner

Exactly **one** authoritative persistence boundary: the PR6 stores in
`packages/platform/src/persistence`:

| Store | Responsibility |
|---|---|
| `GraphHoleRegionAnalysisStore` | Region-analysis results required for no-repeat behavior + reassessment traceability. |
| `GraphHoleStore` | The authoritative persisted GraphHole (current record) **and**, atomically, its detector contributions and its append-only assessment history. |

These stores persist already-derived deterministic results. They never
detect, never score, never derive identity (identity is recomputed only to
**verify** server-side).

### Lifecycle owner

The **GraphHole intelligence lifecycle** — `ACTIVE → {SUPERSEDED, REJECTED,
RESOLVED}`, `REJECTED → ACTIVE` — is owned by `GraphHoleStore`. These are
**intelligence assessment states**, explicitly NOT an investigation workflow:

- Persisted GraphHole records are **intelligence findings** (what the graph
  analysis produced), never investigation workflow objects.
- Human consequential state (review, promotion, dismissal, the decision
  "this mattered") is owned by the Phase-4 **Lead** authority
  (`src/leads/lead-store.ts`, `status ∈ NEW→…→PROMOTED|REJECTED|STALE`,
  append-only `LeadEvent`). PR6 creates **no competing workflow lifecycle**.
- `RESOLVED` on a GraphHole is a terminal **mirror** reached only through an
  explicit authority path; the consequential workflow record that the human
  acted on remains the Lead.

The audit found that before PR6 **nothing** owned GraphHole state (the whole
5A stack was pure), so no existing lifecycle was extended or displaced.
`InvestigationRun` owns run state, `Lead` owns the investigation-loop,
`Case` owns the case catalogue — each remains exactly where it was.

---

## 2. Identity

Both identities are computed by the existing authoritative pure functions and
verified again by the store at persist time (server recomputes, per security
policy). Canonicalization never contains timestamps, random values, request
IDs, detector ordering, scoring values, or insertion-order dependence.

### Region identity

```text
regionId = SHA-256(canonicalizeRegionIdentity(identity))

identity = {
  caseId,
  graphVersionId,
  temporalContext,          // TemporalInterval | absent
  seedObservationIds,       // sorted unique
  nodeIds,                  // sorted unique
  edgeIds,                  // sorted unique
  regionPolicyVersion,            // GRAPH_HOLE_POLICY_VERSION = 'v1'
  semanticRetrievalPolicyVersion, // SEMANTIC_RETRIEVAL_POLICY_VERSION = 'v1'
}
```

Implementation: `@indago/graph-hole-region` `buildRegionIdentity` /
`hashRegionIdentity` under the frozen `RegionIdentityV1Schema`
(`@indago/contracts` `canonicalizeRegionIdentity`).

### Candidate identity

```text
candidateId = SHA-256(canonicalizeGraphHoleCandidateIdentity(identity))

identity = {
  caseId,
  graphVersionId,
  holeType,
  canonicalNodeIds,          // sorted unique
  expectedRelationshipType,  // absent when the detector cannot state one
  temporalScope,             // absent unless content-derived (TEMPORAL_GAP)
  detectionPolicyVersion,    // DETECTION_POLICY_VERSION = 'v1'
}
```

Implementation: `@indago/graph-hole-detection` `makeCandidateIdentity` /
`computeCandidateId` under the frozen `GraphHoleCandidateIdentityV1Schema`.

### `scoringPolicyVersion` is NOT candidate identity

**Confirmed:** `scoringPolicyVersion` does **not** participate in `candidateId`
and was **not** added — it exists only because PR5 introduced it, and PR5's
scoring revision deliberately did not alter candidate identity. It is
persisted as **metadata** (with `qualificationPolicyVersion`) on the record so
the scoring semantics that produced the scores always remain explainable. A
change in `scoringPolicyVersion` alone leaves `candidateId` unchanged (proved
by test).

---

## 3. Persistence model

Four new Prisma models (`packages/platform/prisma/schema.prisma`), hand-authored
migration `20240106000000_pr6_graph_hole_persistence`:

### `GraphHoleRegionAnalysis` — one row per completed region analysis

Unique: `identityKey @unique` (canonical region identity string) and
`@@unique([regionId, caseId, graphVersionId, regionPolicyVersion])`. Stores the
bounded region facts needed for **no-repeat** + traceability: seed/node/edge id
sets (bounded by region policy) as JSON, region status, truncation flag,
`temporalContext`, and a small bounded `summary`. **No graph payloads**; the
persisted model stays intentionally scoped.

### `GraphHole` — the authoritative current intelligence finding

One row per candidate identity. `id` is a **random UUID record id**, distinct
from the deterministic domain `candidateId` (the repo already distinguishes
database IDs from content IDs — same stance as `GraphVersion`, whose natural
key is `(caseId, versionNumber)`).

Unique: `identityKey @unique` (canonical candidate identity) +
`@@unique([caseId, candidateId])`. Carries the persisted scores
(`structuralScore`, `evidenceSupportScore`, `expectedInformationValue`,
`significance`), every policy version (`detectionPolicyVersion`,
`scoringPolicyVersion`, `qualificationPolicyVersion`), status, and
`supersedesGraphHoleId` (lineage to the prior-version record of the same
logical hole).

### `GraphHoleDetectorContribution` — every detector that proposed the candidate

One row per `(graphHoleId, detectorType, detectionPolicyVersion)`. Different
detectors converging on the same candidate **coexist** — the first detector's
provenance is never overwritten. Carries the detector's own `structuralBasis`,
observation sets (`supportingObservationIds`, `contradictingObservationIds`),
`observedEdgeIds`, hypothesis grounding, `detectorMetadata`, and `provenance`.

### `GraphHoleAssessment` — append-only history (LeafEvent/TemporalStateChange discipline)

One row per assessment/state event, monotonic `sequence` per
`graphHoleId` (app-side `max+1`). `logicalKey @unique` dedups identical
re-runs. `assessmentType ∈ QUALIFICATION | REASSESSMENT | SUPERSESSION |
REJECTION | REVIVAL | RESOLUTION`. `snapshot` preserves the exact qualified
output of each assessment; state events carry the persisted state summary at
event time.

### Idempotency

Every write path uses `createMany({ skipDuplicates: true })` inside an
interactive `$transaction` — i.e. the DB unique constraints are the duplicate
prevention mechanism, **never** `SELECT`-then-`INSERT`. Repeated invocation
(retry, timeout+retry, duplicate HTTP request, duplicate detector output,
replayed analysis) converges to the same authoritative record(s).

### Case & graph-version isolation

- `candidateId`/`regionId` already hash `caseId` and `graphVersionId`, but the
  store still enforces case-scoped reads/writes on every method and the DB
  carries composite case-scoped uniques (`@@unique([caseId, candidateId])`,
  `@@unique([regionId, caseId, graphVersionId, regionPolicyVersion])`).
- A GraphHole stays tied to the graph version that produced it (identity). The
  same logical hole under a **new** graph version is a **new candidate**
  (different `candidateId`) persisted as a new row — V1 is never silently
  rewritten to represent V2; old rows remain queryable.

---

## 4. Deduplication (multi-detector)

Multiple detectors (e.g. different `GraphHoleType`s) may converge on the same
canonical candidate identity → the same `candidateId`. `GraphHoleStore`
persists **one** authoritative `GraphHole` row (identity uniqueness) while
`GraphHoleDetectorContribution` preserves **every** detector's own artifacts.
Contribution uniqueness makes additional detector passes converge to the same
contribution row instead of duplicating GraphHole lifecycle records.

---

## 5. Reassessment / supersession

- Initial persist → assessment `QUALIFICATION` seq 1, status `ACTIVE`.
- Same candidate, new assessment (e.g. scoring-policy change, new evidence →
  new graph version is a new candidate; explicit human reassessment):
  - new `GraphHoleAssessment` row (append-only, seq `max+1`);
  - the current `GraphHole` row is updated to the latest assessment scores /
    policy versions (mutable current + append-only history, matching
    `EntityHypothesis`/`TemporalStateChange`);
  - if the new assessment no longer qualifies → status `REJECTED`.
- Supersession across graph versions: the caller links new → old via
  `supersedesGraphHoleId`; the store demotes the prior `ACTIVE` row to
  `SUPERSEDED` (same "demote prior active" pattern as
  `GraphVersionStore.createVersion`) and appends a `SUPERSESSION` assessment
  to the old record carrying the forward link. Both directions are traceable.
- `RESOLVED`/`REJECTED` transitions are explicit authority operations; they
  append the corresponding assessment record.
- Old analysis is **never deleted and never rewritten** to pretend it had later
  evidence. Superseded/rejected assessments stay queryable via
  `GraphHoleAssessment`.

### Bounded V1 no-repeat behavior

A caller must call `regionAnalysisStore.findCompletedByRegionIdentity(...)`
before re-analyzing; an equivalent completed analysis → skip. Reassessment
triggers are the responsibility of the caller (explicit). Affected-region
indexing and automatic invalidation are **not** implemented in V1 — explicitly
bounded: no global recomputation, no case-wide scans on writes; supersession
links are caller-supplied, never discovered by scanning.

---

## 6. Concurrency

Duplicate concurrent writes are prevented by the database, not an in-memory
lock:

- region + candidate rows: unique `identityKey` (canonical identity) and
  case-scoped composite uniques;
- all writes inside interactive `$transaction`s;
- `createMany({ skipDuplicates: true })` turns a unique-conflict race into a
  safe no-op that converges to one authoritative row;
- retry after a raw `P2002` (pre-check-missed collision) converges on the next
  idempotent pass.

Tested with **real Postgres** concurrent inserts (two or more transactions) and
final-state assertions.

---

## 7. Policy versioning

Persisted and queryable on every record:

| Field | Value |
|---|---|
| `regionPolicyVersion` | `GRAPH_HOLE_POLICY_VERSION` (`v1`) |
| `semanticRetrievalPolicyVersion` | `SEMANTIC_RETRIEVAL_POLICY_VERSION` (`v1`) |
| `detectionPolicyVersion` | `DETECTION_POLICY_VERSION` (`v1`) |
| `qualificationPolicyVersion` | `GRAPH_HOLE_POLICY_VERSION` (`v1`, the qualification-policy schema version) |
| `scoringPolicyVersion` | `GRAPH_HOLE_SCORING_POLICY_VERSION` (`v2`) |

`scoringPolicyVersion` is persisted metadata that does **not** participate in
candidate identity (§2).

---

## 8. Security / authority

- Every store method is case-scoped; mismatched `caseId` is rejected
  (`AUTHORITY_MISMATCH`).
- A caller cannot persist Case-B data under Case A (caseId, graphVersionId,
  regionId, candidateId relationships are validated before write).
- Deterministic ids supplied by producers are **recomputed server-side** from
  the canonical fields and rejected on mismatch (`INVALID_IDENTITY`) — no
  client-supplied digest is trusted blindly.
- `supersedesGraphHoleId` must reference the same case and an `ACTIVE` record.

## 9. Scope

Not implemented (explicitly out of PR6): PR7 LLM/AI analysis, Ollama, agent
runtime, embeddings/semantic-retrieval changes, new hypothesis lifecycle,
canonical Entity/Relation mutation, criminality/intent/concealment inference,
probabilistic interpretation, graph-analysis redesign, background
queues/jobs, Graphology as an authoritative persistence layer, affected-region
indexing.