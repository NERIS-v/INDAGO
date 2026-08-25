<div align="center">

# INDAGO V7 Phase Tracker

**PS 26189 — Mayur x Gurashish**

Check off tasks as they are completed. Each task is tagged with its owner.

</div>

---

## Phase 0 — Architecture & Scope Lock

**Date:** 25 Aug | **Owner:** Both | **Gate:** Scope + ownership locked

- [ ] Confirm V7 is the architecture source of truth `[Both]`
- [ ] Freeze P0 / P0.5 / P1 split `[Both]`
- [ ] Freeze TypeScript/Node.js-first stack `[Both]`
- [ ] Freeze PostgreSQL vs Neo4j responsibilities `[Both]`
- [ ] Confirm temporal strategy (event history + current projection + intervals + checkpoints) `[Both]`
- [ ] Confirm Aion role (reference/optional, not mandatory) `[Both]`
- [ ] Confirm BullMQ + Redis + custom state machine for orchestration `[Both]`
- [ ] Freeze repository / monorepo layout `[Both]`
- [ ] Freeze owner boundary (Mayur = intelligence; Gurashish = execution/platform/UI) `[Both]`
- [ ] Create shared issue tracker with phase/owner/dependency/checkpoint labels `[Both]`

---

## Phase 1 — Common Contracts

**Date:** 25-26 Aug | **Owner:** Both (joint blocker) | **Gate:** Contracts v1 frozen

### 1.1 Domain Contracts (Mayur leads, Gurashish reviews)

- [ ] Define Investigation and Case `[Mayur]`
- [ ] Define EvidenceSource / Artifact / Observation `[Mayur]`
- [ ] Define EntityHypothesis and EntityRoleHypothesis `[Mayur]`
- [ ] Define RelationHypothesis `[Mayur]`
- [ ] Define Hypothesis and InvestigativeLead `[Mayur]`
- [ ] Define InvestigativeGap and EvidenceRequest `[Mayur]`
- [ ] Define ReviewTask `[Mayur]`
- [ ] Define evidence posture T0-T3 `[Mayur]`

### 1.2 Execution Contracts (Gurashish leads, Mayur reviews)

- [ ] Define InvestigationRun and RunState `[Gurashish]`
- [ ] Define ToolRequest / ToolResult `[Gurashish]`
- [ ] Define AgentCheckpoint `[Gurashish]`
- [ ] Define state transitions `[Gurashish]`
- [ ] Define retryability semantics `[Gurashish]`
- [ ] Define execution errors `[Gurashish]`

### 1.3 Shared Contracts (both)

- [ ] ID strategy `[Both]`
- [ ] Correlation and idempotency keys `[Both]`
- [ ] Graph version IDs `[Both]`
- [ ] Event names and payloads `[Both]`
- [ ] Service errors `[Both]`
- [ ] Authentication/authorization context `[Both]`
- [ ] Case-scope enforcement `[Both]`
- [ ] Contract versioning `[Both]`

### 1.4 Intelligence API

- [ ] searchEvidence() `[Mayur]`
- [ ] getEvidence() `[Mayur]`
- [ ] resolveEntity() `[Mayur]`
- [ ] resolveRelation() `[Mayur]`
- [ ] getEntityTimeline() `[Mayur]`
- [ ] findCrossCaseLinks() `[Mayur]`
- [ ] runGraphAnalytics() `[Mayur]`
- [ ] findGraphHoles() `[Mayur]`
- [ ] classifyGap() `[Mayur]`
- [ ] rankEvidenceRequests() `[Mayur]`
- [ ] findCounterEvidence() `[Mayur]`
- [ ] runRobustness() `[Mayur]`

### 1.5 Contract Tests

- [ ] Schema validation tests `[Both]`
- [ ] Serialization/deserialization tests `[Both]`
- [ ] Invalid payload tests `[Both]`
- [ ] Event compatibility tests `[Both]`
- [ ] Mock tool integration tests `[Both]`
- [ ] Error/retry semantics tests `[Both]`

---

## Phase 2A — Mayur Intelligence Foundation

**Date:** 26-28 Aug | **Owner:** Mayur | **Gate:** Intelligence lane compiles independently

- [ ] M-A01: Ingestion skeleton (source adapter interfaces) `[Mayur]`
- [ ] M-A02: FIR/narrative ingestion (raw artifacts + source metadata) `[Mayur]`
- [ ] M-A03: CDR CSV ingestion (normalized communication rows) `[Mayur]`
- [ ] M-A04: Financial CSV ingestion (normalized transaction rows) `[Mayur]`
- [ ] M-A05: Normalization engine (canonical fields + quality metadata) `[Mayur]`
- [ ] M-A06: Observation extraction (Observation[] with provenance) `[Mayur]`
- [ ] M-A07: Entity candidate generator (candidate entities) `[Mayur]`
- [ ] M-A08: Multi-pass blocking (candidate pairs) `[Mayur]`
- [ ] M-A09: Entity resolver (reversible EntityHypothesis) `[Mayur]`
- [ ] M-A10: Relation resolver (RelationHypothesis) `[Mayur]`
- [ ] M-A11: Neo4j graph projection (GraphNode/GraphEdge) `[Mayur]`
- [ ] M-A12: Temporal projection (intervals + graph versioning) `[Mayur]`
- [ ] M-A13: Graph query layer (typed graph service APIs) `[Mayur]`

---

## Phase 2B — Gurashish Execution / Platform Foundation

**Date:** 26-28 Aug | **Owner:** Gurashish | **Gate:** Execution lane compiles independently

- [ ] G-A01: API/service skeleton (Node.js service base) `[Gurashish]`
- [ ] G-A02: PostgreSQL/Prisma base (persistent execution store) `[Gurashish]`
- [ ] G-A03: Redis + BullMQ (queues/workers) `[Gurashish]`
- [ ] G-A04: Investigation state machine (run lifecycle) `[Gurashish]`
- [ ] G-A05: Checkpoint store (resume/replay state) `[Gurashish]`
- [ ] G-A06: Tool registry (tool metadata + validation) `[Gurashish]`
- [ ] G-A07: Tool execution runtime (request/result pipeline) `[Gurashish]`
- [ ] G-A08: Agent orchestrator (bounded planning loop) `[Gurashish]`
- [ ] G-A09: Retries/circuit breakers (failure controls) `[Gurashish]`
- [ ] G-A10: Realtime event stream (investigation progress events) `[Gurashish]`
- [ ] G-A11: Audit event infrastructure (append-only audit records) `[Gurashish]`
- [ ] G-A12: Auth/RBAC skeleton (protected endpoints) `[Gurashish]`

---

## Phase 3 — Vertical Integration #1

**Date:** 28 Aug | **Owner:** Both | **Gate:** One case visible end-to-end

### Mayur

- [ ] Expose ingestion API `[Mayur]`
- [ ] Expose observation API `[Mayur]`
- [ ] Expose entity resolution API `[Mayur]`
- [ ] Expose graph projection/query API `[Mayur]`
- [ ] Seed one deliberately messy synthetic case `[Mayur]`

### Gurashish

- [ ] Create investigation run `[Gurashish]`
- [ ] Queue ingestion job `[Gurashish]`
- [ ] Consume tool results `[Gurashish]`
- [ ] Persist state `[Gurashish]`
- [ ] Emit progress events `[Gurashish]`
- [ ] Show graph-ready state in UI shell `[Gurashish]`

### Joint Integration Test

- [ ] FIR > INGEST > OBSERVATIONS > ENTITY HYPOTHESES > RELATIONS > GRAPH > INVESTIGATION STATE > UI `[Both]`

---

## Phase 4 — Core Investigation Loop

**Date:** 29-30 Aug | **Owner:** Both | **Gate:** Lead generation works

### Mayur

- [ ] Implement temporal burst detection `[Mayur]`
- [ ] Implement community candidates `[Mayur]`
- [ ] Implement bridge/connector candidates `[Mayur]`
- [ ] Implement bounded path queries `[Mayur]`
- [ ] Implement cross-case shared-entity/infrastructure discovery `[Mayur]`
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
- [ ] Trigger targeted reblocking `[Mayur]`
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

### 6B. Gurashish

- [ ] Implement checkpoint/recovery tests `[Gurashish]`
- [ ] Implement bounded retries and circuit breakers `[Gurashish]`
- [ ] Implement tool idempotency `[Gurashish]`
- [ ] Implement claim-grounding validator `[Gurashish]`
- [ ] Reject unsupported agent claims `[Gurashish]`
- [ ] Persist AgentCheckpoint `[Gurashish]`
- [ ] Record recovery in audit trail `[Gurashish]`
- [ ] Implement safe human escalation `[Gurashish]`

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

- [ ] Authentication `[Gurashish]`
- [ ] RBAC `[Gurashish]`
- [ ] Case-scope authorization `[Gurashish]`
- [ ] PII masking `[Gurashish]`
- [ ] Tool authorization boundaries `[Gurashish]`
- [ ] Prompt-injection defenses for untrusted evidence `[Gurashish]`
- [ ] Audit access logging `[Gurashish]`
- [ ] Hash-linked audit events `[Gurashish]`
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

| Phase | Total Tasks | Mayur | Gurashish | Both |
|---|---|---|---|---|
| 0 | 10 | 0 | 0 | 10 |
| 1 | 40 | 20 | 6 | 14 |
| 2A | 13 | 13 | 0 | 0 |
| 2B | 12 | 0 | 12 | 0 |
| 3 | 12 | 5 | 6 | 1 |
| 4 | 16 | 9 | 6 | 1 |
| 5 | 18 | 9 | 8 | 1 |
| 6 | 20 | 8 | 8 | 4 |
| 7 | 18 | 7 | 11 | 0 |
| 8 | 22 | 7 | 6 | 9 |
| 9 | 17 | 7 | 10 | 0 |
| 10 | 10 | 5 | 5 | 0 |
| 11 | 30 | 10 | 10 | 10 |
| 12 | 16 | 7 | 8 | 1 |
| **Total** | **254** | **107** | **96** | **51** |
