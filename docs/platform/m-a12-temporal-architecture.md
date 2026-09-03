# M-A12 — Temporal Projection: Architecture & Design Lock

> **Phase:** M-A12-PR0 — Temporal architecture + design lock
> **Owner:** Mayur (intelligence)
> **Status:** **DESIGN / LOCK**
> **Scope:** Design, contract, and documentation ONLY. No runtime implementation in this PR.
> **Downstream:** M-A12-PR1 (temporal history + intervals), M-A12-PR2 (graph versions + historical projection), M-A12-PR3 (APIs + checkpoints + verification).
> **Source of truth:** This document is the locked design. `docs/roadmap/development-plan.md` §23 and `docs/roadmap/phase-tracker.md` M-A12 section reference it.

---

## 1. Purpose

Make INDAGO capable of answering, for any case and any point in time:

> What did the evidence say, when was it observed, when did the claimed event
> occur, what was believed valid at that time, what did the canonical graph
> look like then, and what evidence caused that state?

This requires separating distinct temporal concepts (event time, observation
time, reported time, ingestion time, validity time, system time), persisting
domain-valid temporal information and validity intervals, keeping the source
material authoritative and immutable, and reconstructing canonical state
deterministically from persisted authoritative state rather than from mutable
current rows.

This PR locks the design. It does **not** implement runtime behavior.

### 1.1 Non-goals (locked, out of scope for M-A12)

- Graph version runtime model (PR2).
- Historical graph APIs / as-of temporal queries (PR3).
- Temporal graph projection / Graphology history (PR2/PR3).
- Checkpoint ↔ GraphVersion coupling (PR2/PR3).
- Embeddings, semantic retrieval, LLM/agent judge (future, beyond M-A12).
- Targeted reblocking, graph-hole intelligence, cross-observation semantic intelligence (future).
- Broad M-A06 extraction rewrite, new temporal inference engine, automatic fabrication of dates, automatic event conversion, automatic relation creation.

---

## 2. Repository Archaeology

Verified at HEAD (M-A10/M-A11/M-A13 done; M-A12 not implemented).

### 2.1 Temporal contract vocabulary (contract-only, unused in platform runtime)

Location: `packages/contracts/src/common/timestamps.ts` and `packages/contracts/src/graph/*`.

| Primitive | Meaning | Contract-only? | Reuse in M-A12? |
| --- | --- | --- | --- |
| `TimestampPrecisionSchema` | Enum `exact\|minute\|hour\|day\|range\|approximate\|unknown` | Yes | **Yes** — the precision vocabulary for all temporal values. |
| `EventTimeSchema` | `{ value: string, precision }` — when a domain event actually occurred | Yes | **Yes** — domain-valid event time (D1). |
| `ReportedTimeSchema` | When a source reported the event | Yes | **Yes** — where sources state it distinctly. |
| `ObservedTimeSchema` | When INDAGO/source observed/recorded the data point (`precision: 'exact'`) | Yes | **Yes** — system observation time. |
| `IngestionTimeSchema` | When data entered INDAGO (`precision: 'exact'`) | Yes | **Yes** — ingestion time (D6). |
| `TransactionTimeSchema` | DB/transaction timestamp (`precision: 'exact'`) | Yes | **Yes** — system transaction time. |
| `TemporalIntervalSchema` | `{ validFrom: EventTime, validTo?: EventTime, precision, semantics: observed\|inferred\|hypothesized }` | Yes | **Yes** — the validity-interval representation (D5). |
| `GraphVersionSchema` | `{ id, investigationId, versionNumber, status: DRAFT\|ACTIVE\|SUPERSEDED\|ARCHIVED, parentGraphVersionId?, projectionStatus: COMPLETE\|PARTIAL\|STALE\|ERROR, nodeCount, edgeCount, checkpointId?, createdAt, updatedAt, metadata? }` | Yes | **Yes** (PR2) — logical-revision graph version model (D4). |
| `GraphNodeSchema.temporalRange`, `GraphEdgeSchema.temporalRange` | Optional `TemporalIntervalSchema` on graph nodes/edges | Yes | **Yes** (PR2) — graph elements already tolerate an interval; no new contract concept needed. |
| `ProvenanceSchema.derivedFrom` | `ObservationId[]` lineage | Yes (used in provenance) | **Yes** — source-context grouping lineage vector (D2). |

> **Contract-shape note (non-blocking, flagged):** platform runtime already
> persists `Evidence.observedAt Json?` and `Observation.observedAt Json?` with
> shape `{ value, precision }` (see §2.3) — an older shape that omits the
> `semantics` field present in the current `EventTimeSchema`. PR1 must decide
> (and document) whether to normalize-on-write into the full
> `{ value, precision, semantics }` shape or treat `semantics` as optional in
> the persisted JSON. This is an implementation detail, not a re-decision of D5.
> It is recorded here so PR1 does not silently change contract semantics.

### 2.2 Graph version contracts

- `packages/contracts/src/graph/graph-version.ts` — full `GraphVersionSchema` (see above). IDs are `z.string().uuid()` (`ids.ts:52`).
- `graph-node.ts`, `graph-edge.ts` — carry optional `temporalRange: TemporalIntervalSchema` (a ready hook for PR2's temporal projection).
- `graph-analysis.ts` — `GraphAnalysisResult.graphVersionId` (PR3 historical analytics can target a version).

All IDs in the repository are UUIDs (`packages/contracts/src/common/ids.ts`), produced at runtime with `randomUUID` (platform) or deterministic SHA-256→UUID for canonical rows. **Determinism is expressed via natural keys + replay, not via content-hashed row IDs** (§7).

### 2.3 Platform persistence (runtime-used)

Location: `packages/platform/prisma/schema.prisma`.

| Model | Relevant temporal fields | Notes |
| --- | --- | --- |
| `Evidence` | `observedAt Json?` (EventTime value+precision); `createdAt` | Event-time from submission; immutable next to `sha256`/artifact refs |
| `Observation` | `observedAt Json?` (EventTime, only when unambiguous); `createdAt`; `provenance Json` (ProvenanceSchema) | Durable, identityKey-deduped; entityIds always `[]` |
| `Entity` | `createdAt`/`updatedAt`; `provenance Json`; `status` | Canonical lifecycle; no validity interval yet |
| `RelationHypothesis` | `createdAt`/`updatedAt`; `status` (PROPOSED/ACCEPTED/REJECTED/REVERSED) | Lifecycle + reversal; no interval |
| `Relation` | `createdAt`/`updatedAt`; `reversedAt DateTime?`; `status` ACTIVE/REVERSED | **Reversal is non-destructive** — precedent for D5/D6 "REVERSED ≠ deletion" |
| `AuditEvent` | `timestamp`, append-only hash-linked (`previousHash`, `hash`) | **Immutable audit history** primitive (G-A11) |
| `AgentCheckpoint` | `stepId`, `stateHash`, `timestamp` | Unrelated to graph versions today; D7 coupling deferred to PR2/3 |
| `RawExtraction` | `extractedAt DateTime` | Authoritative byte-extract context; immutable |

Key precedent: `Relation.reversedAt` + `REVERSED` status already implement the
principle that reversal records history and does not erase the row. PR1 extends
this to temporal validity *without* changing the existing lifecycle semantics.

### 2.4 M-A06 event-time extraction

Location: `packages/intelligence/ingestion/src/observation/observation-rules.ts`.

- `detectObservedAt(content)` (lines 286-302) sets `observedAt` **only** when the
  assertion content carries an unambiguous ISO-8601 timestamp
  (`OBSERVED_AT_RE`). Produces `precision` of `exact` (with offset/Z), `minute`
  (time, no offset), or `day` (date only).
- It does **not** propagate M-A05 normalized named dates (e.g. `"14 March"` →
  `NAMED_DMY_RE` normalizes, but M-A06 leaves `observedAt` unset) — this is the
  G1 "sparse observedAt for narrative sources" finding. The design response is
  D1 (below): never fabricate; preserve RawExtraction as authoritative.

### 2.5 M-A12 entry-gate audit outcome

The M-A12 entry-gate audit (tracker G1–G8) concluded: **READY FOR M-A12 — WITH
REQUIRED DESIGN NOTE.** Gates G2–G8 passed. **G1 is PARTIAL:**
1. `Observation.observedAt` is sparse for narrative sources (see §2.4).
2. There is no durable cross-observation grouping/event-link representation.

Importantly, raw artifact bytes, `RawExtraction`, and source spans remain
preserved, so contextual evidence is recoverable — information is not proven
irreversibly destroyed. These are temporal-design inputs (addressed by D1/D2),
not a mandate to rewrite M-A06 now.

---

## 3. Locked Architectural Decisions (D1–D7)

These are locked. Do not reinterpret them in PR1/PR2/PR3.

### D1 — Event-time anchor: HYBRID

- Introduce a domain-valid temporal field using the existing `EventTimeSchema`
  vocabulary **where confidently extractable** from source content/fields.
- `RawExtraction` remains authoritative for source context/time.
- **Never fabricate** a missing year or precision from values such as `"14 March"`.
- Uncertainty is preserved through the `precision`/`semantics` vocabulary, never
  upgraded into false precision.
- Rationale: propagates confidently extractable event time for direct querying
  (Option A benefit) while retaining `RawExtraction` as the authoritative
  contextual/time source (Option B benefit), with minimal schema impact
  (Option C). Late evidence, explainability, and future semantic retrieval all
  benefit.

### D2 — Cross-observation grouping: HYBRID (source-context, not event identity)

- Lightweight durable **source-context grouping/lineage** reusing
  `ProvenanceSchema.derivedFrom` / observation-lineage semantics.
- Grouping represents "these observations came from the same source context
  (same document/section/row/paragraph/sequence)" — it **must not** imply they
  describe the same real-world event.
- `RawExtraction` remains authoritative for rich context.
- Rationale: durable lightweight grouping + sequence metadata (Option C) gives
  stable ordering/lineage for replay and multi-observation narrative reasoning,
  while explicitly separating *source-context grouping* from *real-world event
  identity* (which is a future semantic/intelligence concern, never a schema
  assertion).

### D3 — Temporal contract vocabulary: ADOPT

Reuse existing `EventTime`, `ReportedTime`, `ObservedTime`, `IngestionTime`,
`TransactionTime`, `TemporalIntervalSchema`, `GraphVersionSchema`. **No
competing temporal vocabulary** is introduced. Gaps are closed by extension of
these types (documented), not by parallel replacements.

### D4 — GraphVersion: LOGICAL REVISION (implemented in PR2)

- `GraphVersionId` is a **random UUID** (repository ID convention).
- Deterministic logical identity is the natural key **(caseId, versionNumber)**,
  with `versionNumber` monotonically increasing per case.
- "Same history + same boundary ⇒ same versionNumber sequence ⇒ same projected
  graph" is guaranteed by **replay determinism**, not by a content-hashed UUID.
- `parentGraphVersionId` links the revision chain; `status`
  DRAFT/ACTIVE/SUPERSEDED/ARCHIVED and `projectionStatus` are already in the
  schema.
- A `graphVersionId` is **never** a random request UUID, Graphology object ID,
  HTTP request ID, or arbitrary row ID without logical semantics — it is a case
  revision whose semantics are (case, versionNumber).
- Implemented in PR2; PR1 only provides the underlying temporal state.

### D5 — Interval semantics: CLOSED `[validFrom, validTo]`

- Aligned to the existing `TemporalIntervalSchema` (`validFrom: EventTime`,
  `validTo?: EventTime`). Closed-interval semantics. See §5.
- Boundary equality (`validFrom == validTo`) is valid under closed semantics
  (an instantaneous/zero-length interval), unless §5 states otherwise.

### D6 — Late / out-of-order evidence: NEW VERSION ON CANONICAL CHANGE

- Ingestion/audit order is **immutable**; domain/event time is carried
  separately.
- A canonical temporal change (from late evidence) requires a **new graph
  version later** (PR2). Historical reconstruction relies on persisted temporal
  state, **not** mutable current state.
- January's historical state is not overwritten because March evidence arrived
  later.
- PR1 provides the persisted temporal state enabling this; PR2 creates versions.

### D7 — Checkpoint relationship: LIGHT ONE-WAY COUPLING (PR2/3)

- Preserve existing `AgentCheckpoint` behavior (do not modify it in PR1).
- The existing `GraphVersion.checkpointId` is kept. PR2/PR3 add the smallest
  reverse mapping so a checkpoint can locate the graph version (or temporal
  boundary) active at its `stepId`. Do not couple beyond that justification.

---

## 4. Temporal Vocabulary (final)

| Concept | Definition | Representative contract/field |
| --- | --- | --- |
| **A. Event time** | When the real-world event/fact is claimed to have happened. | `EventTimeSchema` → domain-valid temporal field |
| **B. Observed time** | When the system/evidence source observed/recorded the event. | `ObservedTimeSchema` / `Evidence.observedAt` |
| **C. Reported time** | When a source reports the event, if distinct and supported. | `ReportedTimeSchema` |
| **D. Ingestion time** | When INDAGO acquired/ingested the evidence. | `IngestionTimeSchema` / `Evidence.createdAt`-adjacent ingestion record |
| **E. Extraction time** | When `RawExtraction` produced the extracted representation. | `RawExtraction.extractedAt` |
| **F. Materialization time** | When INDAGO turned a hypothesis into canonical domain state. | `Relation.createdAt`, `Entity.createdAt` |
| **G. Reversal time** | When a canonical relation/authority state was reversed. | `Relation.reversedAt` |
| **H. Validity time** | The interval during which a domain fact is treated as temporally valid. | `TemporalIntervalSchema` (validFrom/validTo) |
| **I. Graph version time / boundary** | The temporal/logical boundary selecting canonical state for a graph version. | `GraphVersionSchema` (PR2) |
| **J. System update time** | `createdAt`/`updatedAt`. | `DateTime @default(now())`, `@updatedAt` |

**Explicit rule:** `createdAt`/`updatedAt` are **system timestamps** and **must
never** silently substitute for domain-valid time, event time, or validity time.
If only observation time is known, say so; never derive `validFrom` from
materialization/creation time as a substitute for domain validity.

---

## 5. Interval Semantics (D5, closed `[validFrom, validTo]`)

Uses `TemporalIntervalSchema`:
`{ validFrom: EventTime, validTo?: EventTime, precision, semantics }`.

### 5.1 Rules

| Aspect | Rule |
| --- | --- |
| Start inclusivity | `validFrom` inclusive. |
| End inclusivity | `validTo` inclusive (closed interval). |
| Open-ended interval | `validTo` omitted → no upper bound ("from X onward"). |
| Unknown start | Represented via `precision: 'unknown'` and/or `semantics`; never a fabricated `validFrom`. |
| Unknown end | `validTo` omitted (open-ended), or `precision: 'unknown'` on `validTo`. |
| Instantaneous event / zero-length | `validFrom == validTo` is **valid** (closed semantics); `precision` reflects the source confidence. |
| Invalid interval | `validTo < validFrom` → **invalid**, rejected at the application boundary. |
| Adjacent intervals | `[A,B]` then `[B,C]` — B is shared (closed). No gap; representable. |
| Overlapping intervals | Allowed; may coexist for independent facts, but a single canonical fact should not claim overlapping validity without `semantics` justification. |
| Timezone | Event times carry explicit ISO-8601 offset; comparisons are normalized to UTC. Never compare offset-less vs offset values as equal. |
| Precision | `exact\|minute\|hour\|day\|range\|approximate\|unknown` (existing enum). A value's precision must be justified by the source; never upgraded. |
| Partial dates | e.g. `"14 March"` → `validFrom = { value: "03-14" (or the source-normalized partial), precision: 'approximate' }` **without** inventing a year. `semantics` reflects inference. |
| Uncertain dates | `precision: 'approximate'/'unknown'`, `semantics: 'inferred'/'hypothesized'`. Do not convert to a false exact instant. |

### 5.2 Examples

| Source | Persisted representation (illustrative) |
| --- | --- |
| `2026-01-10` | `validFrom { value: "2026-01-10T00:00:00Z", precision: 'day' }` |
| `2026-01-10T12:30:00Z` | `validFrom { value: "2026-01-10T12:30:00Z", precision: 'exact' }` |
| `"14 March"` | `validFrom { value: "03-14", precision: 'approximate' }` (no year invented); `semantics: 'inferred'`; RawExtraction retains full text. |
| `"early March"` | `validFrom { precision: 'range'/'approximate' }` with RawExtraction; never a fabricated exact date. |
| `"between March 10 and March 15"` | `validFrom { value: "03-10", precision: 'range' }`, `validTo { value: "03-15", precision: 'range' }`; semantics reflected. |
| unknown end | `validFrom { ... }, validTo: omitted` (open-ended). |
| unknown start | open from start; `validTo` set; `validFrom` omitted or `precision: 'unknown'`. |

**Rule:** Vague temporal expressions are never presented as exact dates. If the
source does not justify a date or precision, retain the uncertainty via
`precision`/`semantics` and preserve `RawExtraction`/source text.

---

## 6. Entity & Relation Temporality

### 6.1 Entity temporality

Distinguish, and do **not** conflate:
- **Entity existence** — a canonical entity exists across an investigation; by
  default the canonical `Entity` is **not** itself an interval.
- **Attribute validity** — e.g. an address association is valid only from T1 to
  T2. These belong to the *association/attribute* level, not to the entity row.
- **Observation time** — when an observation about the entity was made.
- **Evidence time** — when the evidence related to the entity was produced.

Principle: temporal validity lives where it changes (attribute/association/
relation), not on the bare canonical entity identity. PR1 introduces interval
persistence on the entities/relations that need it per PR0's data model, not an
interval on entity identity itself.

### 6.2 Relation temporality

For a canonical `Relation`, keep distinct:
- `observedAt` — when observed (evidence-derived event time).
- `validFrom` / `validTo` — the domain-valid period (`TemporalIntervalSchema`).
- `createdAt` — materialization/system time.
- `reversedAt` — reversal/system time.

Rules:
- **Never derive `validFrom` from `createdAt`** (materialization). If only
  observation time is known, say so (`semantics: 'inferred'`, `precision`
  matching), do not invent a validity interval from system time.
- **Reversal interacts with validity as follows:** `REVERSED` is a
  lifecycle/workflow state; the domain-valid period and its evidence remain in
  the historical record. Reversal does not delete the row and does not erase
  that the relation "existed/applied" at any time it was valid.
- Example: relation accepted on Mar 10 but evidence says the real-world
  relationship existed Jan–Feb. The system stores:
  - `validFrom`/`validTo` = Jan–Feb (domain validity),
  - `createdAt` = Mar 10 (materialization),
  - `reversedAt` = when reversed (if/when),
  so domain-valid period is distinguishable from system-materialization period.

---

## 7. Graph Version Semantics (D4 — PR2)

`GraphVersionSchema` is the model.

- **Identity:** `GraphVersionId` = random UUID (row PK). Logical identity =
  `(caseId, versionNumber)` natural key.
- **versionNumber:** monotonically increasing per case; the deterministic
  revision ordinal.
- **Case scope:** versions are scoped to one case/investigation.
- **Ordering:** `versionNumber` ascending; `parentGraphVersionId` for lineage.
- **Parent version:** optional — each new version references the version it was
  derived from.
- **Temporal boundary:** a version is created at a point in ingestion/state
  history; the temporal boundary determines which canonical state (per validity
  intervals) belongs in the projection.
- **Event/history boundary:** the version corresponds to a position in the
  immutable audit/event history; it does not rewrite history.
- **Creation semantics:** created when canonical state changes materially
  (including late-evidence-driven changes, D6).
- **Determinism:** same authoritative history + same boundary ⇒ same
  versionNumber sequence ⇒ same projected graph. Reconstructable.
- **Immutability:** versions are append-only; existing versions are not mutated.
- **Rebuildability:** a version can be re-derived from persisted temporal state.

The implementation detail (projection of nodes/edges per version using each
element's optional `temporalRange`) belongs to PR2.

---

## 8. Current vs Historical Graph

- **Current graph:** latest canonical state according to current domain
  lifecycle (ACTIVE/REJECTED/REVERSED workflow states, current validity).
- **Historical graph:** canonical state selected according to a temporal/version
  boundary.

### 8.1 Relation inclusion by validity

Example — Relation `R`: `validFrom = Jan 10`, `validTo = Mar 10`:
- `graph @ Feb 01` → **R included** (Feb 01 ∈ [Jan 10, Mar 10]).
- `graph @ Apr 01` → **R excluded** (Apr 01 ∉ [Jan 10, Mar 10]).

### 8.2 Workflow state vs real-world validity

- `REJECTED` / `REVERSED` / `ACTIVE` are **lifecycle/authority** states.
- Historical **validity** is independent: a relation that was *valid* Jan–Feb
  but later *reversed* (workflow) should still appear in a historical graph of
  its valid period, with its reversal recorded in history.
- Do not confuse workflow lifecycle with real-world validity. Reversal ≠
  temporal deletion (§6.2).

---

## 9. Late / Out-of-Order Evidence (D6)

Behavior:
- Evidence ingested today describing an event in January: preserve **ingestion
  order** (immutable audit/ingestion chronology) and **domain/event time**
  separately.
- A late observation may affect:
  - **current graph** → a new version is created on canonical change (PR2);
  - **historical graph** → recomputed deterministically from persisted interval
    state + evidence, not from mutable current rows;
  - **graph versions** → new version, parent-linked (D6/D4);
  - **temporal intervals** → new/changed validity persisted without rewriting
    prior state;
  - **replay** → deterministic across the same history region;
  - **audit history** → never rewritten; new audit lines appended.
- New versions are created when late evidence changes a historical view; the
  pre-existing versions remain immutable.

PR1's obligation is to persist domain/event time separately from ingestion time
so this reconstruction is possible without graph-version creation (PR2).

---

## 10. Replay / Determinism

- Same authoritative history + same temporal boundary ⇒ same graph version
  semantics ⇒ same projected graph (§7).
- **Idempotent:** no repeated processing may:
  - duplicate intervals,
  - duplicate versions,
  - alter historical audit chronology,
  - produce a different deterministic graph identity without a legitimate state
    change.
- Idempotency follows the existing `identityKey @unique` exact-dedup pattern and
  append-only audit (§2.3).

---

## 11. Checkpoint Relationship (D7)

- A `GraphVersion` already carries optional `checkpointId` (contract).
- PR1: preserve `AgentCheckpoint` untouched.
- PR2/PR3: add the smallest reverse mapping so a checkpoint can locate the graph
  version / temporal boundary active at its `stepId`. Couple only where that
  makes replay/recovery coherent; do not couple merely because both are called
  "version/state".

---

## 12. History Model

Keep distinct (do **not** collapse into one table):

| Type | Records | Mutable/Reversible? |
| --- | --- | --- |
| Immutable source/evidence/extraction history | `Artifact`, `RawExtraction`, `Evidence`, `Source` | Immutable |
| Canonical state history | `Entity`, `Relation`, `RelationHypothesis` lifecycle transitions | Reversible (status changes; never deletion) |
| Temporal validity | Validity intervals (domain-valid time) | Grows; prior state preserved |
| Reversible workflow state | status transitions (ACCEPTED/REJECTED/REVERSED...) | Reversible |
| Audit events | `AuditEvent` (hash-linked) | Append-only, immutable |
| Derived graph projection | `GraphNode`/`GraphEdge` (Graphology, disposable) | Reconstructable from authoritative state |

Canonical temporal state must be **reconstructable** from persisted
authoritative state + temporal metadata, independent of today's mutable rows.

---

## 13. Context Preservation (from G1 findings)

- **RawExtraction-context lookup** — source span, surrounding context, source
  artifact, document/section/row, temporal clues, candidate mentions, provenance
  all remain recoverable from `RawExtraction` + `Evidence` + `Observation`
  provenance. This is authoritative.
- **New Observation context metadata** — a lightweight, bounded pointer/metadata
  for source-context grouping (D2 lineage) without duplicating raw payloads.
- **Hybrid (selected):** authoritative `RawExtraction`/source provenance
  **+** lightweight source-context grouping metadata (D2). No duplication of raw
  payloads; a derived temporal value always retains provenance back to its source
  observation/extraction.

Future embedding/LLM retrieval will operate over these same contextual spans
(§15); M-A12 neither implements nor hard-wires any of it.

---

## 14. Future Semantic Retrieval Compatibility

M-A12 must not implement embeddings/LLMs but must not obstruct them.

Future pipeline (unchanged target):
`deterministic retrieval + embedding retrieval → high-recall pool → semantic/LLM judge → structured signals → deterministic scoring → explicit authority`.

Future retrieval will operate over:
- contextual evidence spans (from `RawExtraction`),
- atomic observations (`Observation.content`),
- temporal windows (`TemporalIntervalSchema`),
- event/context groups (D2 source-context lineage),
- entity/infrastructure links (canonical `Entity`/`Relation`).

M-A12's data model deliberately keeps source text, intervals, and lineage
first-class so these consumers need no M-A06 redesign. No provider/model is
referenced; determinism remains the authority boundary.

---

## 15. Multi-Source Temporal Semantics

| Source family | Natural time concepts | Expected precision | Event time explicit? | Intervals sensible? | Uncertainty |
| --- | --- | --- | --- | --- | --- |
| Narrative / FIR | event date/time in prose; reported/observation order | day–minute (varies) | Sometimes (strict ISO) or inferred from prose | Yes, often partial | High on year/precision; ambiguity common |
| CDR | explicit timestamp per record | exact–second | Yes (explicit field) | Yes (call windows) | Low |
| Financial | transaction date/time per record | day/exact | Yes (explicit) | Yes (account activity windows) | Low–medium |
| Surveillance | capture timestamp | exact | Yes | Yes | Low |
| Social | posted/observed timestamp, claimed event time | day–minute | Mixed | Sometimes | Medium |
| Intel | reporting time, claimed activity time | varies | Often reporting time only | Sometimes | High |
| Manual | as entered by analyst | varies | As provided | As provided | As provided |

Do **not** force every source into identical temporal semantics; precision and
uncertainty are source-family-aware (§5).

---

## 16. Proposed Data Model (implementation-ready for PR1/PR2/PR3)

The following are the PR0-approved model changes. **No Prisma changes are made
in PR0.** Each entry records which PR introduces it.

### 16.1 Domain event-time representation

| Field/entity | Type | Meaning | Nullable? | ID part. | Provenance | Lifecycle | Index | Unique | Why | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Observation.eventTime` | `Json?` (EventTimeSchema: value+precision+semantics) | Domain-valid event time when confidently extractable (D1) | Yes | No | via provenance → Observation/RawExtraction | set at extraction | no (JSON) | no | direct queryable event time w/o losing RawExtraction authority | PR1 |
| `Observation.sourceContextId` | `String?` | Lightweight source-context grouping key (D2 lineage); e.g. stable per document/section/row/sequence | Yes | No | derived from provenance coords | set at extraction | yes | no | group by source context, not event identity | PR1 |
| `Observation.validityInterval` | `Json?` (TemporalIntervalSchema) | Domain-valid interval where justified | Yes | No | via provenance | set at extraction or later | no (JSON) | no | validity persistence (D5) | PR1 |

### 16.2 Validity interval on canonical Relation

| Field | Type | Meaning | Nullable? | ... | Why | PR |
| --- | --- | --- | --- | --- | --- | --- |
| `Relation.validityInterval` | `Json?` (TemporalIntervalSchema) | Domain-valid period; independent of `createdAt`/`reversedAt` (D5, §6.2) | Yes | never derived from materialization | PR1 |
| `RelationHypothesis.validityInterval` | `Json?` (TemporalIntervalSchema) | Proposed domain-valid period | Yes | PR1 |

### 16.3 Temporal history persistence (canonical state changes)

| Model | Purpose | PR |
| --- | --- | --- |
| `TemporalStateChange` (new) | Append-only record of canonical state transitions carrying domain/event time, ingestion time, and system transaction time, so canonical temporal state is reconstructable independent of mutable current rows (D6) | PR1 |

### 16.4 Graph version (PR2)

Use existing `GraphVersionSchema` + `GraphNode.temporalRange` /
`GraphEdge.temporalRange`. No new primitive beyond what the contract defines.
PR1 does **not** create this table.

### 16.5 Provenance / context model

- Extend existing `ProvenanceSchema` usage (already persisted on
  `Observation`/`Entity`/`Relation`) — a derived temporal value carries
  provenance back to its source observation/extraction. No raw payload
  duplication.

---

## 17. API Plan (PR3 — with # of endpoints required, minimal set)

Do not implement APIs in PR0/PR1. PR3's **minimal** needed surface:

| Method | Route | Purpose | Input | Output | Temporal semantics |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/cases/:id/graph/current` | Current canonical graph | case id | graph (nodes/edges) | current lifecycle/validity |
| `GET` | `/api/v1/cases/:id/graph/versions` | List graph versions | case id, pagination | version list | version chronology |
| `GET` | `/api/v1/cases/:id/graph/versions/:vid` | A specific version's graph | case id, vid | graph snapshot + metadata | that version's boundary |
| `GET` | `/api/v1/cases/:id/graph/as-of` | Historical graph at a temporal boundary | case id, asOf (event/validity time) | graph snapshot | temporal selection |

All endpoints: case-scoped, authorized like existing routes, bounded/paginated.
Whether `as-of` (temporal) vs `version` (logical) both ship is decided in PR3
against the PR2 capability; the above is the full candidate set, not a promise
to build all.

---

## 18. Database / Index Plan (PR1/PR2)

Query patterns to support:

| Pattern | Index (fields) | Why | Cardinality rationale |
| --- | --- | --- | --- |
| case + temporal boundary | `Observation(sourceContextId)`, `Observation(caseId)` (exists) | bounded narrative/group lookups | per-case observations bounded |
| relation + validity | `Relation(caseId, status)` (exists) + validity selection at app layer | current/historical relation inclusion | relations per case bounded |
| event/history + sequence | `TemporalStateChange(caseId, sequence)` | deterministic reconstruction order (§10) | append-only per case |
| version + case | `GraphVersion(caseId, versionNumber)` (PR2) | version listing + natural key lookup | few versions per case |

Only indices justified by the above access patterns are added. No speculative
indices.

---

## 19. Test Plan (M-A12 verification matrix)

Tiering: **C**=contract/unit, **P**=real Postgres persistence, **T**=transaction,
**W**=worker (if touched), **H**=HTTP (if an existing endpoint is touched).

| # | Case | Setup | Expected | Layer | Real PG? |
| --- | --- | --- | --- | --- | --- |
| 1 | Exact timestamp | event-time with offset | parsed, precision exact | C | no |
| 2 | Partial date | `"14 March"` | no fabricated year; precision approximate | C | no |
| 3 | Uncertain date | `"early March"` | precision approximate/unknown; RawExtraction retained | C | no |
| 4 | Open-ended interval | no validTo | representable, no upper bound | C/P | yes |
| 5 | Ended interval | validFrom/validTo set | stored, bounded | C/P | yes |
| 6 | Boundary condition | validFrom==validTo | valid (closed semantics) | C | no |
| 7 | Invalid interval | validTo<validFrom | **rejected** at application boundary | C/P | yes |
| 8 | Late evidence | Jan event evidence ingested later | ingestion order + domain time both preserved | P/T | yes |
| 9 | Out-of-order evidence | reversed arrival order | deterministic reconstruction order | P/T | yes |
| 10 | Replay | same history+boundary | identical projected outcome; no duplicates | P/T | yes |
| 11 | Duplicate ingestion | same identityKey | deduped, not duplicated | P | yes |
| 12 | Deterministic graph version | same state+boundary | same versionNumber semantics (PR2) | P | yes |
| 13 | Historical reconstruction | canonical change over time | reconstruct prior state from persisted intervals | P/T | yes |
| 14 | Current vs historical graph | relation valid Jan–Mar | included @ Feb, excluded @ Apr | P | yes |
| 15 | Relation reversal over time | reversed relation | history retained; reversal != deletion | P | yes |
| 16 | Case isolation | two cases | no cross-case bleed | P | yes |
| 17 | Historical traversal | PR3 | traversal over historical graph | P | yes |
| 18 | Historical centrality | PR3 | analytics over historical graph | P | yes |
| 19 | Historical community detection | PR3 | communities over historical graph | P | yes |
| 20 | Checkpoint/version behavior | PR3 | checkpoint↔version mapping | P | yes |

PR0/PR1 do not run cases 17–19 (PR3) or graph-version 12 (PR2). PR1 runs cases
1–11, 13–16 and the PR1-scoped subset.

---

## 20. Core Principle

The goal is not merely to add timestamps. It is to make INDAGO capable of
answering "what did the evidence say, when was it observed, when did the claimed
event occur, what was believed valid at that time, what did the canonical graph
look like then, and what evidence caused that state" — source-grounded,
case-scoped, deterministic where required, temporally explicit, reconstructable,
auditable, and compatible with future semantic intelligence.

---

## Appendix A — Design Self-Review (all resolved)

1. Event time vs system time clearly separated? **Yes** (§4, §6.2).
2. Vague dates representable without false precision? **Yes** (§5).
3. Late evidence without rewriting audit history? **Yes** (§9, D6).
4. Historical graphs reconstructable from Postgres? **Yes** (§12, §13).
5. Graphology remains disposable? **Yes** (§12).
6. Current vs historical projections unambiguous? **Yes** (§8).
7. Two observations groupable by source context without claiming same event? **Yes** (D2, §13).
8. Future embeddings retrieve rich context without redesigning M-A06? **Yes** (§14, §13).
9. GraphVersionIds meaningful and deterministic? **Yes** (§7, D4).
10. Relation reversal representable without deleting history? **Yes** (§6.2, §8.2).
11. Checkpoints coupled only where justified? **Yes** (D7, §11).
12. Model works across narrative/CDR/financial/other sources? **Yes** (§15).
13. Over-engineered? **No** — minimal field set; existing contracts reused.
14. Anything important underspecified? **One non-blocking note** — the persisted
    `observedAt` JSON shape (`{value,precision}`) vs full `EventTimeSchema`
    (`+semantics`) normalization decision, explicitly deferred to PR1 as an
    implementation detail (§2.1). Not a design ambiguity for M-A12 scope.

---

## Appendix B — PR Breakdown

### M-A12-PR1 — Temporal History + Intervals
- **Purpose:** first runtime slice — persist domain-valid temporal info, validity
  intervals, immutable temporal history for reconstruction; propagate event time
  where confidence-existing; relation/entity interval persistence where
  specified; runtime validation; indexes; deterministic reconstruction
  primitives; tests. Keep current behavior working.
- **Scope:** §16.1/16.2/16.3 persistence + validation + history.
- **Dependencies:** PR0 (this doc).
- **Non-goals:** graph version, historical graph, APIs, checkpoint coupling,
  embeddings/LLM.
- **Acceptance:** PR1 prompt acceptance matrix (§16 there).

### M-A12-PR2 — Graph Versions + Historical Graph Projection
- **Purpose:** implement `GraphVersion` (D4), version creation on canonical
  change (D6), historical projection from persisted temporal state into
  Graphology using node/edge `temporalRange`, current-vs-historical semantics
  (§8).
- **Dependencies:** PR1 (persisted temporal state).
- **Non-goals:** temporal query APIs (PR3), checkpoint mapping (PR3).
- **Acceptance:** version-determinism + historical reconstruction cases (plan
  matrix 12–16, and PR2-scoped 17–19 readiness).

### M-A12-PR3 — APIs + Checkpoints + Verification
- **Purpose:** the minimal API surface (§17), checkpoint↔version coupling (D7),
  full end-to-end verification (test matrix 1–20).
- **Dependencies:** PR1 + PR2.
- **Non-goals:** semantic retrieval / embeddings / LLM / reblocking.
- **Acceptance:** §17 + §19 matrix green end-to-end.

---

## Appendix B.1 — M-A12-PR2 Implementation Report (actual runtime model)

> This section records the **implemented** PR2 runtime behaviour. It does not
> rewrite the locked PR0 decisions in the body above ($3, $7, $8, $12, $16, $18) —
> it documents how those decisions were carried out in code and the precise
> guarantees actually delivered. **Real-Postgres integration verification is
> BLOCKED** (TEST_DATABASE_URL unreachable); the statements below describe the
> implemented + unit-verified behaviour.

### B.1.1 GraphVersion runtime model
- `GraphVersion` persisted on PostgreSQL (Prisma model, `packages/platform/prisma/schema.prisma`).
- `id` = **random UUID** (repo row-ID convention; NOT a content hash) per D4.
- Natural key `@@unique([caseId, versionNumber])` — deterministic logical identity;
  "same history + same boundary ⇒ same projection" comes from **replay determinism**, not hashing.
- Allocation: `versionNumber` = case-scoped `MAX(versionNumber)+1`, computed **inside an interactive
  transaction** after acquiring a **transaction-scoped PostgreSQL advisory lock**
  `SELECT pg_advisory_xact_lock(hashtextextended(caseId,0))`.
- **Concurrency guarantee (genuine):** because the whole allocation runs inside the caller's
  transaction and the advisory lock is scoped to that transaction, two simultaneous canonical
  changes for the **same case BLOCK** until the in-flight allocation commits, then read a fresh
  MAX — they can never compute the same — or silently share a — `versionNumber`. `@@unique`
  `([caseId, versionNumber])` remains a hard safety invariant, not the primary mechanism (STOP #4
  satisfied). A P2002 under the lock indicates a genuine invariant bug and propagates (aborting the
  joint transaction with the canonical mutation) rather than fabricating an in-transaction retry.
- Fields: `caseId`, `investigationId?`, `versionNumber`, `status` (default `DRAFT`),
  `parentGraphVersionId?` (auto-linear to immediate predecessor when not explicit),
  `projectionStatus` (default `PENDING`), `nodeCount`/`edgeCount` (default 0), `checkpointId?`
  (field preserved; reverse-link is PR3/D7), `reason?`, `metadata?`, `createdAt`/`updatedAt`.

### B.1.2 Version numbering + allocation
- `GraphVersionStore.nextVersionNumber(caseId, client)` reads `MAX(versionNumber)` for the case
  (desc order) and returns `+1`. Monotonic per case, never reused, persisted.
- `createVersion(input, tx?)` acquires the advisory lock, validates explicit parent, computes
  `MAX+1`, auto-links linear parent lineage, inserts. Runs in its own transaction when no `tx` is
  passed, otherwise in the caller's `tx` (the authority's joint transaction).
- Two same-case canonical changes serialize via the advisory lock and are never silently over-written.

### B.1.3 Lifecycle + parent lineage
- Legal transitions (enforced, locked matrix): `DRAFT→ACTIVE`, `ACTIVE→SUPERSEDED`,
  `SUPERSEDED→ARCHIVED`; `ARCHIVED` terminal. Anything else throws
  `GraphVersionLifecycleError("ILLEGAL_TRANSITION")`.
- Parent validation (`createVersion` with explicit `parentGraphVersionId`): parent exists
  (`PARENT_NOT_FOUND`), parent is same case (`PARENT_CROSS_CASE`), ancestor / positive
  (`PARENT_NOT_ANCESTOR`). Auto-lineage yields a linear, non-branching chain to the immediate
  predecessor.

### B.1.4 Canonical mutation coupling (D6)
- Hook lives at the authority boundary `relation-materialization.ts`. The version is created **in
  the same `relStore.transaction`** as the canonical mutation (via injected `tx`) ⇒
  "canonical changed but no version" and "version but canonical rolled back" are both impossible.
- **Accept** (canonical ACTIVE relation newly materialized, `!reusedExisting`): creates a version,
  `reason`/`metadata` `RELATION_ACCEPTED:<relationId>`. Reusing an already-materialized relation
  (`reusedExisting=true`, retry) does **not** duplicate a version.
- **Reverse** (an ACTIVE canonical actually flips to `REVERSED`, `canonical !== null`): creates a
  version, `reason`/`metadata` `RELATION_REVERSED:<relationId>`. Already-reversed (retry) creates
  none.
- **Reject**: creates **no** version.
- Created versions are `status: DRAFT`, `projectionStatus: PENDING`.

### B.1.5 Projection-status semantics
- Vocabulary: `PENDING` (exists, projection not started = not part of contract enum),
  plus `COMPLETE | PARTIAL | STALE | ERROR` (contract subset).
- `setProjectionStatus` is case-scoped, idempotent, retry-safe — it is the projection-materialization
  bookkeeping seam. `COMPLETE` + counts are set **only after a valid projection has been materialized**.
- **Retry idempotency:** projecting a version again does not create a second GraphVersion — it only
  (re)updates `projectionStatus`/counts on the existing row.

### B.1.6 Current graph model
- `GraphProjectionService.projectCurrentGraph({ investigationId, caseId })`:
  nodes = canonical **ACTIVE** entities; edges = canonical **ACTIVE** relations (REVERSED/PROPOSED/REJECTED
  excluded). Identical selection to the existing `GraphRuntime.loadCaseProjection` so HTTP behaviour is
  unchanged. Additionally threads `temporalRange` from the authoritative relation `validityInterval`.
  Marks the case's latest ACTIVE version `projectionStatus=COMPLETE` with counts.

### B.1.7 Historical graph model
- `GraphProjectionService.projectGraphVersion(caseId, { versionNumber } | { graphVersionId })`.
- **Historical-selection mechanism (dimension A — revision order only):** replay the persisted
  `GraphVersion` chain for the case ascending, up to and including the target version, tracking each
  accepted / reversed canonical relation from `reason`+`metadata` (`RELATION_ACCEPTED:<rid>` /
  `RELATION_REVERSED:<rid>`). An edge is included iff its accept version ≤ target AND (if reversed) its
  reverse version > target (not yet reversed by the target). This preserves ACTIVE/REJECTED/REVERSED
  history without deleting rows and without turning a reversal into "never existed". It never reads or
  reuses current Graphology.
- Edges are loaded from the authoritative `Relation` store, carrying persisted `validityInterval` →
  `temporalRange` + persisted `provenance`. Entity nodes = canonical non-ARCHIVED universe (consistent).
- Marks the projected version `projectionStatus=COMPLETE` with counts.

### B.1.8 The two independent dimensions (D: A vs B)
- **A — GraphVersion order** ("which canonical revision") drives edge **inclusion** in a historical projection.
- **B — Domain temporal validity** ("real-world period") drives the `temporalRange` carried on edges/nodes.
- They are never conflated. A version created on 10 Mar for activity on 10 Jan: the edge is included per
  the *revision chain* (A), while its `temporalRange` is the *Jan 10* `validityInterval` (B). Both remain
  representable and distinct.

### B.1.9 ACTIVE / REJECTED / REVERSED behaviour
- ACTIVE relation → a graph edge (current and, while accepted-and-not-yet-reversed, historical).
- REJECTED hypothesis → never a canonical edge (no canonical Relation row; rejection history auditable).
- REVERSED relation → not an ACTIVE edge in any version at/after its reversal version; the Relation row
  remains (status `REVERSED`) so history is preserved.

### B.1.10 Temporal interval selection (PR1 semantics)
- Uses PR1's closed `[validFrom, validTo]` semantics (both inclusive; `validTo=null` open-ended) via
  the PR1 `interval-validation.ts` rules. `temporalRange` is the **persisted** `validityInterval`,
  carried verbatim — precision/semantics are never fabricated. No PR1 temporal information was lost;
  the distinction between two states is driven by the revision chain + persisted intervals.

### B.1.11 Deterministic replay
- `normalizeBuiltGraph(graph, caseId)` reads a Graphology graph back into **sorted order-independent**
  structures: node `id/entityType/canonicalName/temporalRange`; edge `id/relationType/source/target
  (lexicalized for undirected)/directed/temporalRange/provenance`. Determinism test: project N →
  discard Graphology → project N again → normalize → deep-equal, without relying on object identity or
  insertion order.

### B.1.12 Provenance / context preservation
- `provenance` is carried verbatim from the authoritative Relation onto the edge. Projection never
  manufactures evidence from graph structure — a connected pair is a recorded relation, not an inferred
  criminal relationship.

### B.1.13 Indexes
- `@@unique([caseId, versionNumber])`, `@@index([caseId, versionNumber])`, `@@index([caseId, status])`,
  `@@index([caseId, projectionStatus])`, `@@index([parentGraphVersionId])`. No Prisma FK (repo NO-FK
  decoupling convention).

### B.1.14 Files
- `packages/platform/prisma/schema.prisma` (GraphVersion model; no migration created — schema push BLOCKED).
- `packages/platform/src/persistence/graph-version-store.ts` (advisory-lock allocation, lifecycle, parent, projection status).
- `packages/platform/src/relations/relation-materialization.ts` (accept/reverse → version in same tx; reject → none).
- `packages/platform/src/relations/graph-version-service.ts` (current + historical projection, replay, normalize).
- `packages/intelligence/graphology-projection/src/types.ts` + `build-graph.ts` (optional `temporalRange` threading).
- Tests: `tests/m-a12-pr2-graph-projection.test.ts` (pure, 16 green),
  `tests/integration/m-a12-pr2-versioning.integration.test.ts` (real Postgres, gated, **BLOCKED**).

### B.1.15 Known limitations / deferred (documented, not COMPLETE green)
- **Real Postgres verification BLOCKED** — TEST_DATABASE_URL unreachable; schema push + all DB suites cannot execute.
- **GraphVersion table not live on prod** — schema absent on prod and unreachable on test DB ⇒ coupling is
  "implemented but not yet activated" (authority tolerates absent `graphVersionStore` in isolated M-A10 tests;
  production `DEFAULT_STORES` always supplies it).
- Checkpoint↔version reverse-link is PR3/D7 (field `checkpointId` present only).
- Public version/as-of query APIs are PR3.
- Historical entity-node selection uses the canonical non-ARCHIVED universe (entity-mutation version triggers
  are not wired in PR2; only relation accept/reverse trigger versions).

---

## Appendix C — Explicit Future Work (out of M-A12 scope)

embeddings · semantic retrieval · LLM judge · targeted reblocking · graph-hole
intelligence · cross-observation semantic intelligence.
