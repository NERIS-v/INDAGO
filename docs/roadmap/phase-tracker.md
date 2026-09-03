<div align="center">

# INDAGO V7 Phase Tracker

**PS 26189 — Mayur x Gurashish**

Check off tasks as they are completed. Each task is tagged with its owner.

</div>

---

## Status Legend

| Mark | Meaning |
|---|---|
| ✅ | **IMPLEMENTED AND VERIFIED** — code exists and is exercised by tests/evidence in-repo |
| 🟡 | **IMPLEMENTED BUT ONLY PARTIALLY VERIFIED** — a real subset exists; verification or full surfacing is missing |
| 🔵 | **PLANNED** — documented intent; not implemented |
| ⚠️ | **KNOWN LIMITATION** — an accepted technical debt / documented limitation, not an implementation gap |
| ❌ | **NOT IMPLEMENTED** |

Advanced items are tagged with their status symbol in front of the checkbox. Backend-correctness and frontend-surfacing are evaluated separately: a backend route existing is **not** treated as the roadmap item "complete" unless the capability is genuinely surfaced end-to-end.

---

## Phase 0 — Architecture & Scope Lock

**Date:** 25 Aug | **Owner:** Both | **Gate:** Scope + ownership locked

- [x] Confirm V7 is the architecture source of truth `[Both]`
- [x] Freeze P0 / P0.5 / P1 split `[Both]`
- [x] Freeze TypeScript/Node.js-first stack `[Both]`
- [x] Freeze PostgreSQL vs Neo4j responsibilities `[Both]`
- [x] Confirm temporal strategy (event history + current projection + intervals + checkpoints) `[Both]`
- [x] Confirm Aion role (reference/optional, not mandatory) `[Both]`
- [x] Confirm BullMQ + Redis + custom state machine for orchestration `[Both]`
- [x] Freeze repository / monorepo layout `[Both]`
- [x] Freeze owner boundary (Mayur = intelligence; Gurashish = execution/platform/UI) `[Both]`
- [x] Create shared issue tracker with phase/owner/dependency/checkpoint labels `[Both]`

---

## Phase 1 — Common Contracts

**Date:** 25-26 Aug | **Owner:** Both (joint blocker) | **Gate:** Contracts v1 frozen

### 1.1 Domain Contracts (Mayur leads, Gurashish reviews)

- [x] Define Investigation and Case `[Mayur]`
- [x] Define EvidenceSource / Artifact / Observation `[Mayur]`
- [x] Define EntityHypothesis and EntityRoleHypothesis `[Mayur]`
- [x] Define RelationHypothesis `[Mayur]`
- [x] Define Hypothesis and InvestigativeLead `[Mayur]`
- [x] Define InvestigativeGap and EvidenceRequest `[Mayur]`
- [x] Define ReviewTask `[Mayur]`
- [x] Define evidence posture T0-T3 `[Mayur]`

### 1.2 Execution Contracts (Gurashish leads, Mayur reviews)

- [x] Define InvestigationRun and RunState `[Gurashish]`
- [x] Define ToolRequest / ToolResult `[Gurashish]`
- [x] Define AgentCheckpoint `[Gurashish]`
- [x] Define state transitions `[Gurashish]`
- [x] Define retryability semantics `[Gurashish]`
- [x] Define execution errors `[Gurashish]`

### 1.3 Shared Contracts (both)

- [x] ID strategy `[Both]`
- [x] Correlation and idempotency keys `[Both]`
- [x] Graph version IDs `[Both]`
- [x] Event names and payloads `[Both]`
- [x] Service errors `[Both]`
- [x] Authentication/authorization context `[Both]`
- [x] Case-scope enforcement `[Both]`
- [x] Contract versioning `[Both]`

### 1.4 Intelligence API

- [x] searchEvidence() `[Mayur]`
- [x] getEvidence() `[Mayur]`
- [x] resolveEntity() `[Mayur]`
- [x] resolveRelation() `[Mayur]`
- [x] getEntityTimeline() `[Mayur]`
- [x] findCrossCaseLinks() `[Mayur]`
- [x] runGraphAnalytics() `[Mayur]`
- [x] findGraphHoles() `[Mayur]`
- [x] classifyGap() `[Mayur]`
- [x] rankEvidenceRequests() `[Mayur]`
- [x] findCounterEvidence() `[Mayur]`
- [x] runRobustness() `[Mayur]`

### 1.5 Contract Tests

- [x] Schema validation tests `[Both]`
- [x] Serialization/deserialization tests `[Both]`
- [x] Invalid payload tests `[Both]`
- [x] Event compatibility tests `[Both]`
- [x] Mock tool integration tests `[Both]`
- [x] Error/retry semantics tests `[Both]`

---

## Phase 2A — Mayur Intelligence Foundation

**Date:** 26-28 Aug | **Owner:** Mayur | **Gate:** Intelligence lane compiles independently

- [x] M-A01: Ingestion skeleton (source adapter interfaces) `[Mayur]`
  - [x] M-PR1: Artifact Acquisition Core (fetcher, hasher, mime-detector, storage, acquisition-service) `[Mayur]`
  - [x] M-PR2: Artifact Classification & Parser Routing (classifier, encoding-detector, router, registry) `[Mayur]`
  - [x] M-PR3: Raw Extraction Layer (7 parsers, ExtractionService, OCR, PDF extraction) `[Mayur]`
- [ ] M-A02: FIR/narrative ingestion (raw artifacts + source metadata) `[Mayur]`
- [ ] M-A03: CDR CSV ingestion (normalized communication rows) `[Mayur]`
- [ ] M-A04: Financial CSV ingestion (normalized transaction rows) `[Mayur]`
- [x] M-A05: Normalization engine (canonical fields + quality metadata) `[Mayur]`
- [x] M-A06: Observation extraction (Observation[] with provenance) `[Mayur]`
  - [x] Evidence read seam: durable `GET /investigations/:id/evidence` (`EvidenceProjection` — documented local shape, no fabricated strength/posture), live `listEvidence` server action + `LiveEvidenceProvider.listByInvestigation`, Evidence tab renders persisted artifacts in live mode `[Mayur]`
- [x] M-A07: Entity candidate generator (candidate entities) `[Mayur]` — `completeMA07` mention-candidate extraction wired into worker; **backend-verified; candidate-provenance recheck is part of the M-A12 entry audit** 🟡
- [x] M-A08: Multi-pass blocking (candidate pairs) `[Mayur]` — `completeMA08` CandidatePair + per-pair idempotent blocking pipeline; **backend-verified; blocking-semantics recheck is part of the M-A12 entry audit** 🟡
- [x] M-A09: Entity resolver (reversible EntityHypothesis) `[Mayur]` — canonical-entity authority boundary, identity key, worker, audit; **backend-verified (`entity-hypothesis-store` + accept/reject/reverse HTTP); NOT yet surfaced in a full frontend resolution-review surface** 🟡
- [x] M-A10: Relation resolver (RelationHypothesis) `[Mayur]` — source-grounded scoring v1, canonical Relation decision authority, directionality-aware identity, completeMA10 wiring, Graphology runtime + HTTP routes; **hardened (`caa74cd`, merged via PR #49) — prior 2 P2 findings (audit-log + @relation FK, non-transactional accept) requested and resolved as documented hardening follow-ups**; verified 43/43 platform integration across 5 suites (relation 18, graph 6, graph-http 9, contradiction 2, ingest-http 8)
- [x] M-A11: Graph projection (GraphNode/GraphEdge) `[Mayur]` — delivered via Graphology (`@indago/graphology-projection`: build-graph/centrality/communities), NOT Neo4j; Neo4j deferred to a reversible §13 seam
- [ ] M-A12: Temporal projection (intervals + graph versioning) `[Mayur]` — **next major foundation milestone**; **PR0 design locked** (`docs/platform/m-a12-temporal-architecture.md`, dev-plan §23.11); **PR1 implemented** (persistence/validation/history; integration suite pending TEST_DATABASE_URL reachability); PR2/PR3 planned (see M-A12 section below)
- [x] M-A13: Graph query layer (typed graph service APIs) `[Mayur]` — GraphRuntime bounded traversal/centrality/communities + express routes (`graph`, `graph/traversal`, `graph/centrality`, `graph/communities`); **backend-verified 9 graph-http integration tests; broad live-mode UI surfacing (entities/graph/relations providers) still stub (`UnsupportedGraphProvider`/`UnsupportedEntityProvider`/`UnsupportedRelationProvider`) — frontend-phase work** 🟡

### Pre-M-A12 Foundation Audit (gate for M-A12)

Before M-A12 starts, the following audit items gate it (see `development-plan.md` "M-A12 Entry Gate" and "Known Limitations"). Future semantic retrieval is **NOT** required to enter M-A12.

- [ ] M-A12-G1: M-A06 observation representation audited for silent source-context loss (fragmentation concern) — remediation planned if loss found `[Both]`
- [ ] M-A12-G2: M-A07 candidate provenance verified (candidate ≠ entity; candidateId never becomes EntityId) `[Both]`
- [ ] M-A12-G3: M-A08 blocking semantics verified (cheap deterministic recall-control layer; bounded; pair ≠ identity) `[Both]`
- [ ] M-A12-G4: M-A09 authority boundary verified (candidate → pair → hypothesis → explicit authority → canonical Entity) `[Both]`
- [ ] M-A12-G5: M-A10 relation authority verified (canonical Entity + evidence → relation candidate → scoring → hypothesis → explicit authority → canonical Relation → Graphology) `[Both]`
- [ ] M-A12-G6: M-A11 graph projection verified (Graphology derived/disposable; Postgres authoritative) `[Both]`
- [ ] M-A12-G7: M-A13 current graph APIs verified (graph, traversal, centrality, communities) `[Both]`
- [ ] M-A12-G8: DEMO / LIVE / AUTO regression status documented (frontend provider seam intact; demo untouched) `[Both]`

> **Entry criterion:** G1–G8 satisfied (documented), plus DEMO/LIVE/AUTO regression status recorded. Semantic retrieval may remain unimplemented at M-A12 entry, by design.

### M-A12 — Temporal Projection

**Design lock (authoritative):** `docs/platform/m-a12-temporal-architecture.md` — locked D1–D7, temporal vocabulary, interval/graph-version/history semantics, data model, API/index/test plans, PR breakdown.

- [x] 🔵 M-A12-PR0: Temporal architecture + design lock (design/contract/docs only; **DESIGN / LOCK**) `[Mayur]` — no runtime implementation; all D1–D7 decisions locked; dev-plan §23.11 + design doc updated; PR1/PR2/PR3 remain **planned**
- [x] M-A12-PR1: Temporal history + intervals (persist domain event-time + validity intervals + immutable temporal history; runtime validation; indexes; deterministic reconstruction) — maps T1 + T2 `[Mayur]` — **IMPLEMENTED** (contract fields, D5 validation module, temporal columns + `TemporalStateChange` store, MA06 event-time/source-context propagation + D6 history wiring; PR1 unit suite green; real-Postgres PR1 integration suite written — execution deferred until TEST_DATABASE_URL is reachable)
- [ ] M-A12-PR2: Graph versions + historical projection (`GraphVersion` D4, version on canonical change D6, current-vs-historical §8) — maps T3 + T4 `[Mayur]`
- [ ] M-A12-PR3: Temporal/history APIs + checkpoint coupling + full verification — maps T4/T5 `[Mayur]`

And the underlying temporal sub-items (tracked to reflect reality):

- [x] M-A12-T1: Temporal model (event/ingestion time vs observation time vs validity interval vs materialization/reversal time — **never `updatedAt` as domain-valid time**) `[Mayur]` — model **locked in PR0**; runtime persistence in PR1 **done** (`Observation.eventTime/sourceContextId/validityInterval`, `Relation`/`RelationHypothesis.validityInterval`, `TemporalStateChange`)
- [x] M-A12-T2: Interval semantics, open-ended intervals, boundary semantics, late / out-of-order evidence (event order ≠ domain time) `[Mayur]` — semantics **locked in PR0**; runtime enforcement in PR1 **done** (`temporal/interval-validation.ts` D5 rules + deterministic reconstruction primitives in `TemporalStateChangeStore`)
- [ ] M-A12-T3: Graph version boundary + deterministic graph version IDs + checkpoint relationship `[Mayur]` — design **locked in PR0**; runtime in PR2/PR3
- [ ] M-A12-T4: Temporal reconstruction: Postgres authoritative history → temporal selection → Graphology projection → analytics (Graphology stays disposable) `[Mayur]` — design in PR0; runtime in PR2/PR3
- [ ] M-A12-T5: Reversal-over-time + interaction with checkpoints (immutable audit history; do not reorder) `[Mayur]` — design in PR0; runtime in PR2/PR3

> **Status:** M-A12-PR0 = DESIGN/LOCK (complete as a design PR). M-A12-PR1 = **IMPLEMENTED** (persistence/validation/history; PR1 integration suite pending TEST_DATABASE_URL reachability). M-A12-PR2/PR3 = 🔵 PLANNED.
> **M-A12 itself is NOT fully implemented** (PR2/PR3 remain). G1–G8 entry-gate audits above remain the gate; semantic retrieval not required.

---

## Phase 2B — Gurashish Execution / Platform Foundation

**Date:** 26-28 Aug | **Owner:** Gurashish | **Gate:** Execution lane compiles independently

- [x] G-A01: API/service skeleton (Node.js service base) `[Gurashish]`
- [x] G-A02: PostgreSQL/Prisma base (persistent execution store) `[Gurashish]`
- [x] G-A03: Redis + BullMQ (queues/workers) `[Gurashish]`
- [x] G-A04: Investigation state machine (run lifecycle) `[Gurashish]`
- [x] G-A05: Checkpoint store (resume/replay state) `[Gurashish]`
- [x] G-A06: Tool registry (tool metadata + validation) `[Gurashish]`
- [x] G-A07: Tool execution runtime (request/result pipeline) `[Gurashish]`
- [x] G-A08: Agent orchestrator (bounded planning loop) `[Gurashish]`
- [x] G-A09: Retries/circuit breakers (failure controls) `[Gurashish]`
- [x] G-A10: Realtime event stream (investigation progress events) `[Gurashish]`
- [x] G-A11: Audit event infrastructure (append-only audit records) `[Gurashish]`
- [x] G-A12: Auth/RBAC skeleton (protected endpoints) `[Gurashish]`

---

## Phase 3 — Vertical Integration #1

**Date:** 28 Aug | **Owner:** Both | **Gate:** One case visible end-to-end

### Mayur

- [x] Expose ingestion API `[Mayur]` — `POST /investigations/:id/evidence`: submission body → artifact fetch/sha256-verify/mime-detect → BullMQ job → worker; verified in the REAL-STACK E2E and the live case-deletion gate
- [x] Expose observation API `[Mayur]` — `GET /investigations/:id/observations` (full ObservationSchema records, case-scoped via auth → latest run → run.caseId; routes.ts)
- 🟡 [x] Expose entity resolution API `[Mayur]` — decision authority exists (accept/reject/reverse route + canonical materialization, integra-verified); full resolution UX/review surface is frontend-phase work, not yet exposed end-to-end
- 🟡 [x] Expose graph projection/query API `[Mayur]` — projection/query routes exist (graph, traversal, centrality, communities, 404/401/403 integration-tested); broad live-mode UI surfacing is frontend-phase work `[graph-http 9 tests]`
- [ ] Seed one deliberately messy synthetic case `[Mayur]` — no seed script exists (only test fixtures + legacy mock-ingestion toggle)

### Gurashish

- [x] Create investigation run `[Gurashish]`
- [x] Queue ingestion job `[Gurashish]`
- [x] Consume tool results `[Gurashish]`
- [x] Persist state `[Gurashish]`
- [x] Emit progress events `[Gurashish]`
- [x] Show graph-ready state in UI shell `[Gurashish]`

### Joint Integration Test

- 🟡 [ ] FIR > INGEST > OBSERVATIONS > ENTITY HYPOTHESES > RELATIONS > GRAPH > INVESTIGATION STATE > UI `[Both]`
  - Partial: the `INGEST > OBSERVATIONS > INVESTIGATION STATE > SSE > UI(live)` leg is proven by the REAL-STACK E2E (HTTP → BullMQ → worker → Postgres → SSE) plus the M-A06 Option A live re-ingest test. The `ENTITY HYPOTHESES > RELATIONS > GRAPH` leg is now built (M-A07–A10, A13: canonical entity/relation authority + Graphology projection), with the backend proven end-to-end (real Postgres 43/43 integration across 5 suites incl. graph/traversal/centrality/communities over real HTTP via `m-a10-ingest-http.e2e` + `m-a10-graph-http`); remaining gaps: a single full `HTTP → BullMQ → worker → resolution → graph` demo pass, the temporal projection (M-A12), and live-mode frontend surfacing of entities/graph/relations (providers are still `Unsupported*` stubs).

---

## Phase 4 — Core Investigation Loop

**Date:** 29-30 Aug | **Owner:** Both | **Gate:** Lead generation works

### Mayur

- [ ] Implement temporal burst detection `[Mayur]`
- [ ] Implement community candidates `[Mayur]`
- [ ] Implement bridge/connector candidates `[Mayur]`
- [ ] Implement bounded path queries `[Mayur]`
- [ ] Implement cross-case shared-entity/infrastructure discovery `[Mayur]`
- 🔵 [ ] Cross-observation relation retrieval `[Mayur]` — recover relation candidates that span different observations (shared infrastructure / temporal / explicit relation claims / graph-gap-driven / semantic retrieval); must preserve "candidate relationship ≠ canonical relationship" and distinguish DIRECT RELATION EVIDENCE vs INDIRECT STRUCTURAL LINKAGE vs SEMANTIC ASSOCIATION
- [ ] Create InvestigativeLead structure `[Mayur]`
- [ ] Attach evidence FOR / AGAINST `[Mayur]`
- [ ] Generate alternative explanations `[Mayur]`
- [ ] Persist lead provenance `[Mayur]`

### Gurashish

- [ ] Implement investigation state transitions around analysis `[Gurashish]`
- [ ] Add tool orchestration for graph analytics `[Gurashish]`
- [ ] Persist Lead/Hypothesis lifecycle `[Gurashish]`
- [ ] Stream analysis progress to UI `[Gurashish]`
- [ ] Implement human-review state `[Gurashish]`
- [ ] Add pause/resume behavior `[Gurashish]`

### Joint Checkpoint

- [ ] CASE > GRAPH > STRUCTURAL SIGNAL > INVESTIGATIVE LEAD > EVIDENCE FOR/AGAINST > HUMAN REVIEW `[Both]`

---

## Phase 5 — Differentiation Engine

**Date:** 31 Aug-1 Sep | **Owner:** Both | **Gate:** Graph-hole demo works

### 5A. Mayur — Graph-Hole / Intelligence-Gap Core

- [ ] Detect candidate missing relationships `[Mayur]`
- [ ] Classify gap (missing investigation / missing data / missing comparison / infrastructure gap / concealment-consistent pattern) `[Mayur]`
- [ ] Generate competing explanations `[Mayur]`
- [ ] Detect when an ER split could explain a graph hole `[Mayur]`
- 🔵 [ ] Targeted reblocking `[Mayur]` — selectively generate candidate pairs around a suspicious candidate/entity/evidence region after downstream analysis suggests a missed match; **NOT** an O(N²) all-candidate sweep; preserve case isolation, deterministic identity, pair-level idempotency, bounded computation, auditability
- [ ] Generate candidate evidence requests `[Mayur]`
- [ ] Calculate normalized evidence utility `[Mayur]`
- [ ] Implement Evidence Resolution Rate@K evaluation `[Mayur]`
- [ ] Add evidence-independence tracking `[Mayur]`

### 5B. Gurashish — Investigation Workflow Around the Gap

- [ ] Add graph-hole event type `[Gurashish]`
- [ ] Add gap lifecycle state `[Gurashish]`
- [ ] Add evidence-request job `[Gurashish]`
- [ ] Implement human approval for request `[Gurashish]`
- [ ] Implement WAITING_FOR_EVIDENCE state `[Gurashish]`
- [ ] Handle evidence arrival event `[Gurashish]`
- [ ] Re-trigger reassessment `[Gurashish]`
- [ ] Stream graph/lead changes live `[Gurashish]`

### 5C. Signature Integration

- [ ] GRAPH > LEAD > GRAPH HOLE > WHY IS IT MISSING? > BEST NEXT EVIDENCE > HUMAN VERIFICATION > NEW OBSERVATION > GRAPH UPDATE > REASSESS `[Both]`

---

## Phase 6 — Robustness, Trust, and Agent Reliability

**Date:** 2 Sep | **Owner:** Both | **Gate:** High-impact lead survives trust checks

### 6A. Mayur

- [ ] Implement staged robustness `[Mayur]`
- [ ] Add graph version + perturbation policy cache key `[Mayur]`
- [ ] Add candidate-region restriction `[Mayur]`
- [ ] Add incremental recomputation where possible `[Mayur]`
- [ ] Add adaptive stopping `[Mayur]`
- [ ] Evaluate ER pair completeness / false split / false merge `[Mayur]`
- [ ] Run missingness regimes (random, source-dependent, entity-dependent, structure-dependent, strategic sparsification) `[Mayur]`
- [ ] Separate structural signal from robustness from evidence posture `[Mayur]`
- 🔵 [ ] Semantic retrieval architecture (future) `[Mayur]` — high-recall embedding/LLM retrieval feeding structured analytical signals into the existing deterministic scoring; semantic similarity is **NOT** evidence and embeddings/LLMs **never** create canonical entities/relations; recall-optimizing retrieval layer, precision/explainability stays in the deterministic policy + explicit authority

### 6B. Gurashish

- [x] Implement checkpoint/recovery tests `[Gurashish]`
- [x] Implement bounded retries and circuit breakers `[Gurashish]`
- [x] Implement tool idempotency `[Gurashish]`
- [x] Implement claim-grounding validator `[Gurashish]`
- [x] Reject unsupported agent claims `[Gurashish]`
- [x] Persist AgentCheckpoint `[Gurashish]`
- [x] Record recovery in audit trail `[Gurashish]`
- [x] Implement safe human escalation `[Gurashish]`

### 6C. Joint Trust Checkpoint

- [ ] CORRECT TOOL RESULT + WRONG AGENT CLAIM > CLAIM GROUNDING > REPLAN `[Both]`
- [ ] MISSING EDGE > GAP CLASSIFICATION > NO INTENT INFERENCE `[Both]`
- [ ] HIGH CENTRALITY > STRUCTURAL SIGNAL ONLY `[Both]`
- [ ] HIGH MODEL SCORE > NOT LEGAL ADMISSIBILITY `[Both]`

---

## Phase 7 — Investigator UX

**Date:** 3 Sep | **Owner:** Both | **Gate:** Judge-ready investigation workspace

### 7A. Gurashish (Implementation)

- [ ] Investigation workspace shell `[Gurashish]`
- [ ] Graph visualization `[Gurashish]`
- [ ] Timeline visualization `[Gurashish]`
- [ ] Lead card `[Gurashish]`
- [ ] Evidence FOR / AGAINST panels `[Gurashish]`
- [ ] Gap / graph-hole visualization `[Gurashish]`
- [ ] Next-best-evidence panel `[Gurashish]`
- [ ] Reasoning ledger `[Gurashish]`
- [ ] Review/approval UI `[Gurashish]`
- [ ] Realtime progress and recovery states `[Gurashish]`
- [ ] Premium loading/empty/error states `[Gurashish]`

### 7B. Mayur (Intelligence Presentation)

- [ ] Define exact meaning of every intelligence score shown `[Mayur]`
- [ ] Define language for structural signal vs investigative relevance `[Mayur]`
- [ ] Define gap labels and explanations `[Mayur]`
- [ ] Define evidence posture presentation `[Mayur]`
- [ ] Define alternative-explanation presentation `[Mayur]`
- [ ] Define what evidence must be clickable/source-traceable `[Mayur]`
- [ ] Review graph semantics for misleading visual interpretations `[Mayur]`
- 🔵 [ ] Source / context visualization `[Mayur]` — surface contextual source-grounded spans (artifact → section → context span → observation → mention) alongside atomic observations; preserve "atomicity for computation + contextuality for investigation"
- 🔵 [ ] Provenance / uncertainty / absence UX `[Mayur]` — show supporting vs contradicting evidence, spanning, uncertainty, absence vs concealment distinction, score vs probability, confidence vs legal admissibility

---

## Phase 8 — Synthetic Benchmark and Adversarial Evaluation

**Date:** 3-4 Sep | **Owner:** Both | **Gate:** Metrics produced

### 8A. Mayur

- [ ] Build development generator `[Mayur]`
- [ ] Generate ground-truth networks `[Mayur]`
- [ ] Transform into observations (aliases, duplicates, missingness, contradictions, sparsification) `[Mayur]`
- [ ] Generate known hidden relationships `[Mayur]`
- [ ] Generate entity collisions and splits `[Mayur]`
- [ ] Create expected graph-hole/evidence mappings `[Mayur]`
- [ ] Define intelligence metrics `[Mayur]`
- 🔵 [ ] Semantic intelligence benchmark (future, must precede major adoption of semantic scoring) `[Mayur]` — compare V1 deterministic-only vs V2 +embeddings vs V3 +embeddings +LLM judge; measure candidate recall, entity precision/recall, false merges/splits, relation precision/recall, graph-hole precision, evidence-retrieval utility, robustness stability, latency, cost
- 🔵 [ ] Model versioning for future semantic features `[Mayur]` — embeddings/LLM-feature schema and weights determined by benchmark evidence, versioned separately; do not treat "embedding = better" as an assumption

### 8B. Gurashish

- [ ] Build blind evaluation harness `[Gurashish]`
- [ ] Hide ground truth during inference `[Gurashish]`
- [ ] Run repeatable experiment jobs `[Gurashish]`
- [ ] Persist metrics `[Gurashish]`
- [ ] Record runtime and failure/recovery metrics `[Gurashish]`
- [ ] Generate experiment summary `[Gurashish]`

### Benchmark Metrics

- [ ] Entity-resolution precision/recall measured `[Both]`
- [ ] False-merge / false-split rate measured `[Both]`
- [ ] Relation precision/recall measured `[Both]`
- [ ] Graph-hole precision measured `[Both]`
- [ ] Evidence Resolution Rate@K measured `[Both]`
- [ ] Robustness stability measured `[Both]`
- [ ] Claim-grounding accuracy measured `[Both]`
- [ ] Recovery rate measured `[Both]`
- [ ] Time-to-lead measured `[Both]`

---

## Phase 9 — Security, Privacy, Safety

**Date:** 4 Sep | **Owner:** Both | **Gate:** Security pass

### 9A. Gurashish

- [x] Authentication `[Gurashish]`
- [x] RBAC `[Gurashish]`
- [x] Case-scope authorization `[Gurashish]`
- [ ] PII masking `[Gurashish]`
- [ ] Tool authorization boundaries `[Gurashish]`
- [ ] Prompt-injection defenses for untrusted evidence `[Gurashish]`
- [ ] Audit access logging `[Gurashish]`
- [x] Hash-linked audit events `[Gurashish]`
- [ ] Secret management `[Gurashish]`
- [ ] Failure isolation `[Gurashish]`

### 9B. Mayur

- [ ] Review all intelligence wording for epistemic overclaim `[Mayur]`
- [ ] Verify role != culpability `[Mayur]`
- [ ] Verify absence != concealment `[Mayur]`
- [ ] Verify structural signal != criminal relevance `[Mayur]`
- [ ] Verify confidence != legal admissibility `[Mayur]`
- [ ] Verify blocked pair != different entity `[Mayur]`
- [ ] Verify alternatives/counter-evidence surfaced for high-impact leads `[Mayur]`

---

## Phase 10 — P1 / WOW Layer

**Date:** 5 Sep | **Owner:** Both | **Gate:** No P0 regression

- [ ] Discovery Mode — detection logic `[Mayur]`
- [ ] Discovery Mode — workflow + UI `[Gurashish]`
- [ ] Boundary Expansion — candidate logic `[Mayur]`
- [ ] Boundary Expansion — approval/UI `[Gurashish]`
- [ ] Route/Stage Mode — stage classifier + role checks `[Mayur]`
- [ ] Route/Stage Mode — visualization + workflow `[Gurashish]`
- [ ] Advanced robustness — analytics `[Mayur]`
- [ ] Advanced robustness — worker execution `[Gurashish]`
- [ ] Advanced ER recovery — candidate generation `[Mayur]`
- [ ] Advanced ER recovery — job orchestration `[Gurashish]`

---

## Phase 11 — Final Stress Test and Hardening

**Date:** 5 Sep | **Owner:** Both | **Gate:** No critical blocker

### Mayur Stress Tests

- [ ] Duplicate evidence `[Mayur]`
- [ ] Entity collisions `[Mayur]`
- [ ] False splits `[Mayur]`
- [ ] Contradictory timestamps `[Mayur]`
- [ ] Missing source classes `[Mayur]`
- [ ] Legitimate high-degree entities `[Mayur]`
- [ ] False bridge candidates `[Mayur]`
- [ ] Sparse networks `[Mayur]`
- [ ] Concealment-consistent patterns with innocent alternatives `[Mayur]`
- [ ] Graph-hole false positives `[Mayur]`

### Gurashish Stress Tests

- [ ] Duplicate jobs `[Gurashish]`
- [ ] Worker crash/restart `[Gurashish]`
- [ ] Redis interruption `[Gurashish]`
- [ ] Database timeout `[Gurashish]`
- [ ] Malformed tool request `[Gurashish]`
- [ ] Stale checkpoint `[Gurashish]`
- [ ] Agent loop `[Gurashish]`
- [ ] Contradictory tool output `[Gurashish]`
- [ ] Unauthorized tool call `[Gurashish]`
- [ ] Partial realtime connection `[Gurashish]`

### Joint Release Gate

- [ ] Functional: End-to-end demo path completes `[Both]`
- [ ] Data: No silent evidence loss `[Both]`
- [ ] ER: False merges/splits measured `[Both]`
- [ ] Graph: Provenance available `[Both]`
- [ ] Gap: At least one graph-hole > evidence > update cycle works `[Both]`
- [ ] Robustness: Top lead has reproducible stability result `[Both]`
- [ ] Agent: Claims are grounded and failures recover/escalate `[Both]`
- [ ] Security: Unauthorized actions blocked `[Both]`
- [ ] UI: No critical visual or state defects `[Both]`
- [ ] Demo: Resettable and repeatable `[Both]`

---

## Phase 12 — Final Demo Freeze

**Date:** 6 Sep | **Owner:** Both | **Gate:** DEMO FREEZE

### Mayur

- [ ] Seed final intelligence dataset `[Mayur]`
- [ ] Verify lead is deterministic enough for demo `[Mayur]`
- [ ] Verify graph-hole detection `[Mayur]`
- [ ] Verify evidence recommendation `[Mayur]`
- [ ] Verify counter-evidence story `[Mayur]`
- [ ] Verify robustness numbers are reproducible `[Mayur]`
- [ ] Prepare technical judge explanations `[Mayur]`

### Gurashish

- [ ] Freeze UI `[Gurashish]`
- [ ] Freeze investigation state flow `[Gurashish]`
- [ ] Freeze worker/queue configuration `[Gurashish]`
- [ ] Freeze realtime display `[Gurashish]`
- [ ] Freeze auth/demo access `[Gurashish]`
- [ ] Prepare reset path `[Gurashish]`
- [ ] Prepare fallback path if a service fails `[Gurashish]`
- [ ] Prepare deployment package `[Gurashish]`

### Demo Sequence

- [ ] MESSY CASE PACK > OBSERVATIONS > ENTITY/RELATION RESOLUTION > TEMPORAL GRAPH > CROSS-CASE SIGNAL > INVESTIGATIVE LEAD > GRAPH HOLE > GAP CLASSIFICATION > BEST NEXT EVIDENCE > COUNTER-EVIDENCE > ROBUSTNESS > VERIFIED EVIDENCE ARRIVES > GRAPH UPDATES > LEAD REASSESSMENT > REASONING LEDGER `[Both]`

---

## Summary

| Phase | Total Tasks | Done | Mayur | Gurashish | Both |
|---|---|---|---|---|---|
| 0 | 10 | 10 | 0 | 0 | 10 |
| 1 | 40 | 40 | 20 | 6 | 14 |
| 2A | 30 | 13 | 22 | 0 | 8 |
| 2B | 12 | 12 | 0 | 12 | 0 |
| 3 | 12 | 10 | 5 | 6 | 1 |
| 4 | 17 | 0 | 10 | 6 | 1 |
| 5 | 18 | 0 | 9 | 8 | 1 |
| 6 | 21 | 8 | 9 | 8 | 4 |
| 7 | 20 | 0 | 9 | 11 | 0 |
| 8 | 24 | 0 | 9 | 6 | 9 |
| 9 | 17 | 4 | 7 | 10 | 0 |
| 10 | 10 | 0 | 5 | 5 | 0 |
| 11 | 30 | 0 | 10 | 10 | 10 |
| 12 | 16 | 0 | 7 | 8 | 1 |
| **Total** | **277** | **97** | **122** | **96** | **59** |

> Counts are derived from the actual `[x]` / `[ ]` checkboxes in this file (owner-tagged rows only for Mayur/Gurashish/Both). Phase 2A total includes the 13 un-done M-A12 entry-gate (G1–G8, `[Both]`) and temporal (T1–T5, `[Mayur]`) sub-task rows added by the V7 tracker reconciliation.
