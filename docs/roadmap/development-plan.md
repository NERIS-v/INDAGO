<div align="center">

# INDAGO V7 Parallel Development Plan

**PS 26189 — AI-Powered Criminal Network Analysis System**

**Mayur x Gurashish**

Architecture Version 7.0 — Consolidated / Implementation-Ready / SIH Prototype

</div>

---

## Purpose

Turn the completed INDAGO V7 architecture into an executable two-person development program. The plan is designed for parallel work: Phase 1 is the only jointly blocking phase; after the contracts are frozen, Mayur owns the intelligence/data lane and Gurashish owns the execution/platform/product lane, with continuous vertical integration.

## Timeline Anchor

Planning window: **25 August 2026 — 6 September 2026** (13 calendar days including both dates). If the actual internal milestone shifts, preserve the phase order and compress/expand the time boxes rather than changing ownership.

---

## 1. Team Operating Model

| Owner | Primary Responsibility | Existing Strength Being Leveraged |
|---|---|---|
| **Mayur** | INDAGO intelligence: evidence, entity/relation resolution, graph, temporal reasoning, graph holes, evidence planning, robustness, hypotheses | PRCUS-style evidence/retrieval/graph reasoning |
| **Gurashish** | INDAGO execution: orchestration, queues, state machine, checkpoint/recovery, security, audit, realtime, product/UI | Sentinel + Forge durable execution / systems / AI platform engineering |
| **Both** | Contracts, integration checkpoints, benchmark truth, final demo, hardening | Shared architecture / product decisions |

V7 explicitly separates deterministic intelligence services from the investigation orchestrator: graph, temporal, evidence, resolution and robustness computations are deterministic services, while the agent orchestrates them. This is the core boundary that makes parallel development safe.

> **Rule:** Mayur owns WHAT INDAGO KNOWS. Gurashish owns HOW INDAGO RUNS. Neither person silently changes a shared contract.

---

## 2. Master Timeline

| Dates | Phase | Mayur | Gurashish | Joint Gate |
|---|---|---|---|---|
| 25 Aug | **0. Architecture / scope lock** | Review intelligence boundaries | Review execution/platform boundaries | Lock V7 + P0/P0.5/P1 |
| 25-26 Aug | **1. Common contracts** | Domain + intelligence contracts | Execution + event contracts | Contracts v1 frozen |
| 26-28 Aug | **2. Parallel foundations** | Ingestion > evidence > ER > graph | API > queues > state > worker > agent runtime | Both lanes compile independently |
| 28 Aug | **3. Vertical slice #1** | FIR > observation > graph | Investigation runtime > UI event | One case visible end-to-end |
| 29-30 Aug | **4. Core investigation loop** | Analytics > lead > counter-evidence | Agent/state lifecycle > UI | Lead generation works |
| 31 Aug-1 Sep | **5. Differentiation engine** | Graph holes > gaps > next evidence | Evidence-request workflow + streaming | Graph-hole demo works |
| 2 Sep | **6. Robustness + trust** | Robustness + ER evaluation | Claim grounding + recovery + audit | High-impact lead survives trust checks |
| 3 Sep | **7. Investigator UX** | Define intelligence presentation | Implement workspace/UI | Judge-ready investigation workspace |
| 3-4 Sep | **8. Benchmark + adversarial data** | Ground-truth generator | Blind harness + run control | Metrics produced |
| 4 Sep | **9. Security + safety hardening** | Domain safety checks | Auth/RBAC/PII/tool security | Security pass |
| 5 Sep | **10. P1 wow features** | Discovery / route-stage as time allows | Corresponding workflow/UI | No P0 regression |
| 5 Sep | **11. Final stress + performance** | Data/analytics stress | Runtime/recovery/UI stress | No critical blocker |
| 6 Sep | **12. Demo freeze** | Intelligence demo path | Platform/UI demo path | Final build locked |

---

## 3. Phase Dependency Model

```
PHASE 0 - LOCK SCOPE
        |
PHASE 1 - COMMON CONTRACTS (JOINT BLOCKING)
        |
   +---------+---------+
   |                     |
PHASE 2A            PHASE 2B
MAYUR               GURASHISH
Intelligence Core   Execution Platform
   |                     |
   +---------+---------+
        |
PHASE 3 - VERTICAL INTEGRATION
        |
PHASE 4 - CORE INVESTIGATION
        |
PHASE 5 - DIFFERENTIATION
        |
PHASE 6 - TRUST / ROBUSTNESS
        |
PHASE 7 - UX
        |
PHASE 8 - BENCHMARK
        |
PHASE 9 - SECURITY
        |
PHASE 10 - P1
        |
PHASE 11 - HARDEN
        |
PHASE 12 - DEMO FREEZE
```

The key design is not to wait for an entire phase to finish before integrating. Every major phase has a vertical checkpoint so the two lanes continuously prove that the shared contracts still work.

---

## 4. Phase 0 — Architecture & Scope Lock

**Owner:** BOTH. **Duration:** 25 Aug. **Output:** development baseline.

### Objective

Translate V7 into an implementation contract and eliminate ambiguity before code ownership begins.

### Tasks (both)

- Confirm V7 is the architecture source of truth
- Freeze the P0 / P0.5 / P1 split
- Freeze TypeScript/Node.js-first stack
- Freeze PostgreSQL vs Neo4j responsibilities
- Confirm the temporal strategy: event history + current supported graph projection + intervals + checkpoints
- Confirm Aion's role: implementation/reference to be evaluated, not a blind mandatory dependency unless the compatibility check passes
- Confirm BullMQ + Redis + custom investigation state machine for orchestration
- Freeze repository / monorepo layout
- Freeze owner boundary: Mayur = intelligence; Gurashish = execution/platform/UI
- Create a shared issue tracker with phase labels, owner labels, dependency labels, and integration checkpoints

### Exit Gate

No unresolved ownership ambiguity. Every planned component has exactly one primary owner.

---

## 5. Phase 1 — Common Contracts (Joint Blocking Phase)

**Owner:** BOTH. **Duration:** 25-26 Aug. This is the only phase that intentionally blocks both developers.

V7 already defines the canonical objects: EvidenceSource, Observation, EntityHypothesis, EntityRoleHypothesis, RelationHypothesis, GraphNode, GraphEdge, Hypothesis, InvestigativeGap, ReviewTask, AuditEvent, AgentCheckpoint and ClaimGrounding.

### 5.1 Domain Contracts — Mayur leads, Gurashish reviews

- Define Investigation and Case
- Define EvidenceSource / Artifact / Observation
- Define EntityHypothesis and EntityRoleHypothesis
- Define RelationHypothesis
- Define Hypothesis and InvestigativeLead
- Define InvestigativeGap and EvidenceRequest
- Define ReviewTask
- Define evidence posture T0-T3

### 5.2 Execution Contracts — Gurashish leads, Mayur reviews

- Define InvestigationRun and RunState
- Define ToolRequest / ToolResult
- Define AgentCheckpoint
- Define state transitions
- Define retryability semantics
- Define execution errors

### 5.3 Shared Contracts — both

- ID strategy
- Correlation and idempotency keys
- Graph version IDs
- Event names and payloads
- Service errors
- Authentication/authorization context
- Case-scope enforcement
- Contract versioning

### 5.4 Intelligence API

```
searchEvidence()
getEvidence()
resolveEntity()
resolveRelation()
getEntityTimeline()
findCrossCaseLinks()
runGraphAnalytics()
findGraphHoles()
classifyGap()
rankEvidenceRequests()
findCounterEvidence()
runRobustness()
```

### 5.5 Contract Tests

- Schema validation tests
- Serialization/deserialization tests
- Invalid payload tests
- Event compatibility tests
- Mock tool integration tests
- Error/retry semantics tests

### Exit Gate

Contracts package v1 is published; both branches compile against it; mock calls work; no direct cross-lane database coupling.

---

## 6. Phase 2 — Parallel Foundations

Owner model: Mayur and Gurashish work independently after Phase 1, using contracts + mocks.

### 6A. MAYUR — Intelligence Foundation

| Task ID | Task | Output | Dependency |
|---|---|---|---|
| M-A01 | Ingestion skeleton | Source adapter interfaces | Contracts |
| M-A02 | FIR/narrative ingestion | Raw artifacts + source metadata | M-A01 |
| M-A03 | CDR CSV ingestion | Normalized communication rows | M-A01 |
| M-A04 | Financial CSV ingestion | Normalized transaction rows | M-A01 |
| M-A05 | Normalization engine | Canonical fields + quality metadata | M-A02-04 |
| M-A06 | Observation extraction | Observation[] with provenance | M-A05 |
| M-A07 | Entity candidate generator | Candidate entities | M-A06 |
| M-A08 | Multi-pass blocking | Candidate pairs | M-A07 |
| M-A09 | Entity resolver | Reversible EntityHypothesis | M-A08 |
| M-A10 | Relation resolver | RelationHypothesis | M-A06/M-A09 |
| M-A11 | Graph projection | GraphNode/GraphEdge | M-A09/10 |
| M-A12 | Temporal projection | Intervals + graph versioning | M-A11 |
| M-A13 | Graph query layer | Typed graph service APIs | M-A11/12 |

> **Note (post-integration reconciliation):** M-A11 was **delivered via Graphology** (`@indago/graphology-projection`: build-graph / traversal / centrality / communities) integrated through M-A10, **not** Neo4j. Neo4j is deferred to a reversible seam. M-A13 (graph query layer) is the GraphRuntime + express routes (`graph`, `graph/traversal`, `graph/centrality`, `graph/communities`), backend-verified (9 graph-http integration tests). M-A12 (temporal projection) remains the **next major foundation milestone** — see §23 "M-A12 Entry Gate" and the reconciled phase tracker.

### 6B. GURASHISH — Execution / Platform Foundation

| Task ID | Task | Output | Dependency |
|---|---|---|---|
| G-A01 | API/service skeleton | Node.js service base | Contracts |
| G-A02 | PostgreSQL/Prisma base | Persistent execution store | Contracts |
| G-A03 | Redis + BullMQ | Queues/workers | Contracts |
| G-A04 | Investigation state machine | Run lifecycle | Contracts |
| G-A05 | Checkpoint store | Resume/replay state | G-A04 |
| G-A06 | Tool registry | Tool metadata + validation | Contracts |
| G-A07 | Tool execution runtime | Request/result pipeline | G-A06 |
| G-A08 | Agent orchestrator | Bounded planning loop | G-A04/G-A07 |
| G-A09 | Retries/circuit breakers | Failure controls | G-A03/G-A08 |
| G-A10 | Realtime event stream | Investigation progress events | G-A04 |
| G-A11 | Audit event infrastructure | Append-only audit records | G-A04 |
| G-A12 | Auth/RBAC skeleton | Protected endpoints | G-A01 |

> **Parallel rule:** Neither side imports internal implementation files from the other side. Both consume contracts only.

---

## 7. Phase 3 — Vertical Integration #1: Evidence > Graph > Investigation

**Duration:** 28 Aug. **Goal:** prove the architecture can cross the ownership boundary.

### Mayur

- Expose ingestion API
- Expose observation API
- Expose entity resolution API
- Expose graph projection/query API
- Seed one deliberately messy synthetic case

### Gurashish

- Create investigation run
- Queue ingestion job
- Consume tool results
- Persist state
- Emit progress events
- Show graph-ready state in UI shell

### Joint Integration Test

```
FIR > INGEST > OBSERVATIONS > ENTITY HYPOTHESES > RELATIONS > GRAPH > INVESTIGATION STATE > UI
```

### Exit Gate

One case enters the system and a human can inspect the resulting graph. No manual database edits.

---

## 8. Phase 4 — Core Investigation Loop

**Duration:** 29-30 Aug.

### Mayur Tasks

- Implement temporal burst detection
- Implement community candidates
- Implement bridge/connector candidates
- Implement bounded path queries
- Implement cross-case shared-entity/infrastructure discovery
- Create InvestigativeLead structure
- Attach evidence FOR / AGAINST
- Generate alternative explanations
- Persist lead provenance

### Gurashish Tasks

- Implement investigation state transitions around analysis
- Add tool orchestration for graph analytics
- Persist Lead/Hypothesis lifecycle
- Stream analysis progress to UI
- Implement human-review state
- Add pause/resume behavior

### Joint Checkpoint

```
CASE > GRAPH > STRUCTURAL SIGNAL > INVESTIGATIVE LEAD > EVIDENCE FOR/AGAINST > HUMAN REVIEW
```

---

## 9. Phase 5 — Differentiation Engine

**Duration:** 31 Aug-1 Sep. This is the most important product phase.

### 9A. MAYUR — Graph-Hole / Intelligence-Gap Core

- Detect candidate missing relationships
- Classify gap: missing investigation / missing data / missing comparison / infrastructure gap / concealment-consistent pattern
- Generate competing explanations
- Detect when an entity-resolution split could explain a graph hole
- Trigger targeted reblocking
- Generate candidate evidence requests
- Calculate normalized evidence utility
- Implement Evidence Resolution Rate@K evaluation
- Add evidence-independence tracking

### 9B. GURASHISH — Investigation Workflow Around the Gap

- Add graph-hole event type
- Add gap lifecycle state
- Add evidence-request job
- Implement human approval for request
- Implement WAITING_FOR_EVIDENCE state
- Handle evidence arrival event
- Re-trigger reassessment
- Stream graph/lead changes live

### 9C. Signature Integration

```
GRAPH > LEAD > GRAPH HOLE > WHY IS IT MISSING? > BEST NEXT EVIDENCE > HUMAN VERIFICATION > NEW OBSERVATION > GRAPH UPDATE > REASSESS
```

### Exit Gate

This loop works on the demo dataset without manual backend intervention.

---

## 10. Phase 6 — Robustness, Trust, and Agent Reliability

**Duration:** 2 Sep.

### 10A. Mayur

- Implement staged robustness
- Add graph version + perturbation policy cache key
- Add candidate-region restriction
- Add incremental recomputation where possible
- Add adaptive stopping
- Evaluate ER pair completeness / false split / false merge
- Run missingness regimes: random, source-dependent, entity-dependent, structure-dependent, strategic sparsification
- Separate structural signal from robustness from evidence posture

### 10B. Gurashish

- Implement checkpoint/recovery tests
- Implement bounded retries and circuit breakers
- Implement tool idempotency
- Implement claim-grounding validator
- Reject unsupported agent claims
- Persist AgentCheckpoint
- Record recovery in audit trail
- Implement safe human escalation

### 10C. Joint Trust Checkpoint

```
CORRECT TOOL RESULT + WRONG AGENT CLAIM > CLAIM GROUNDING > REPLAN
MISSING EDGE > GAP CLASSIFICATION > NO INTENT INFERENCE
HIGH CENTRALITY > STRUCTURAL SIGNAL ONLY
HIGH MODEL SCORE > NOT LEGAL ADMISSIBILITY
```

---

## 11. Phase 7 — Investigator UX

**Duration:** 3 Sep.

### 11A. Gurashish — Implementation Ownership

- Investigation workspace shell
- Graph visualization
- Timeline visualization
- Lead card
- Evidence FOR / AGAINST panels
- Gap / graph-hole visualization
- Next-best-evidence panel
- Reasoning ledger
- Review/approval UI
- Realtime progress and recovery states
- Premium loading/empty/error states

### 11B. Mayur — Intelligence Presentation Ownership

- Define exact meaning of every intelligence score shown
- Define language for structural signal vs investigative relevance
- Define gap labels and explanations
- Define evidence posture presentation
- Define alternative-explanation presentation
- Define what evidence must be clickable/source-traceable
- Review graph semantics for misleading visual interpretations

### UI Success Criterion

A non-technical judge should understand the lead, the uncertainty, the graph hole, and the next evidence request without a technical explanation.

---

## 12. Phase 8 — Synthetic Benchmark and Adversarial Evaluation

**Duration:** 3-4 Sep. Run this in parallel with late UX work.

### 12A. Mayur

- Build development generator
- Generate ground-truth networks
- Transform into observations with aliases, duplicates, missingness, contradictions and sparsification
- Generate known hidden relationships
- Generate entity collisions and splits
- Create expected graph-hole/evidence mappings
- Define intelligence metrics

### 12B. Gurashish

- Build blind evaluation harness
- Hide ground truth during inference
- Run repeatable experiment jobs
- Persist metrics
- Record runtime and failure/recovery metrics
- Generate experiment summary

### Metrics

| Metric | Purpose |
|---|---|
| Entity-resolution precision/recall | Identity quality |
| False-merge / false-split rate | Identity risk |
| Relation precision/recall | Relationship extraction quality |
| Graph-hole precision | Quality of candidate holes |
| Evidence Resolution Rate@K | Whether recommended evidence actually helps |
| Robustness stability | Lead sensitivity to missingness |
| Claim-grounding accuracy | Agent factual grounding |
| Recovery rate | Execution resilience |
| Time-to-lead | Operational usefulness |

---

## 13. Phase 9 — Security, Privacy, Safety

**Duration:** 4 Sep.

### 13A. Gurashish

- Authentication
- RBAC
- Case-scope authorization
- PII masking
- Tool authorization boundaries
- Prompt-injection defenses for untrusted evidence
- Audit access logging
- Hash-linked audit events
- Secret management
- Failure isolation

### 13B. Mayur

- Review all intelligence wording for epistemic overclaim
- Verify role != culpability
- Verify absence != concealment
- Verify structural signal != criminal relevance
- Verify confidence != legal admissibility
- Verify blocked pair != different entity
- Verify alternatives/counter-evidence are surfaced for high-impact leads

---

## 14. Phase 10 — P1 / WOW Layer

**Duration:** 5 Sep. Only proceed if all P0/P0.5 tests are green.

| Feature | Mayur | Gurashish | Rule |
|---|---|---|---|
| Discovery Mode | Detection logic | Workflow + UI | No P0 regression |
| Boundary Expansion | Candidate logic | Approval/UI | Never auto-add to active case |
| Route/Stage Mode | Stage classifier + role checks | Visualization + workflow | One strong demo path |
| Advanced robustness | Analytics | Worker execution | Only if benchmark/runtime permits |
| Advanced ER recovery | Candidate generation | Job orchestration | Only if core ER is stable |

---

## 15. Phase 11 — Final Stress Test and Hardening

**Duration:** 5 Sep.

### Mayur Stress Tests

- Duplicate evidence
- Entity collisions
- False splits
- Contradictory timestamps
- Missing source classes
- Legitimate high-degree entities
- False bridge candidates
- Sparse networks
- Concealment-consistent patterns with innocent alternatives
- Graph-hole false positives

### Gurashish Stress Tests

- Duplicate jobs
- Worker crash/restart
- Redis interruption
- Database timeout
- Malformed tool request
- Stale checkpoint
- Agent loop
- Contradictory tool output
- Unauthorized tool call
- Partial realtime connection

### Joint Release Gate

| Gate | Pass Condition |
|---|---|
| Functional | End-to-end demo path completes |
| Data | No silent evidence loss |
| ER | False merges/splits measured |
| Graph | Provenance available |
| Gap | At least one graph-hole > evidence > update cycle works |
| Robustness | Top lead has reproducible stability result |
| Agent | Claims are grounded and failures recover/escalate |
| Security | Unauthorized actions blocked |
| UI | No critical visual or state defects |
| Demo | Resettable and repeatable |

---

## 16. Phase 12 — Final Demo Freeze

**Duration:** 6 Sep.

### Mayur Owns

- Seed final intelligence dataset
- Verify the lead is deterministic enough for demo
- Verify graph-hole detection
- Verify evidence recommendation
- Verify counter-evidence story
- Verify robustness numbers are reproducible
- Prepare technical judge explanations

### Gurashish Owns

- Freeze UI
- Freeze investigation state flow
- Freeze worker/queue configuration
- Freeze realtime display
- Freeze auth/demo access
- Prepare reset path
- Prepare fallback path if a service fails
- Prepare deployment package

### Demo Sequence

```
MESSY CASE PACK
  > OBSERVATIONS
    > ENTITY / RELATION RESOLUTION
      > TEMPORAL GRAPH
        > CROSS-CASE SIGNAL
          > INVESTIGATIVE LEAD
            > GRAPH HOLE
              > GAP CLASSIFICATION
                > BEST NEXT EVIDENCE
                  > COUNTER-EVIDENCE
                    > ROBUSTNESS
                      > VERIFIED EVIDENCE ARRIVES
                        > GRAPH UPDATES
                          > LEAD REASSESSMENT
                            > REASONING LEDGER
```

---

## 17. Rules for Parallel Work

| Rule | Description |
|---|---|
| **1. Contracts before implementation** | No shared-domain schema changes without updating the contracts package |
| **2. Mocks unblock parallelism** | A service may be implemented against a mocked contract; do not wait for the real service |
| **3. One owner per subsystem** | One primary owner; the other reviewer. Avoid two people editing the same subsystem |
| **4. No direct internal imports** | Consume another subsystem through contracts/APIs only |
| **5. Small integration checkpoints** | Integrate at every vertical slice instead of one giant final integration |
| **6. Intelligence decides semantics** | Mayur defines what an intelligence result means; Gurashish defines how it is executed and surfaced |
| **7. Platform never invents evidence semantics** | The runtime does not reinterpret evidence/graph results |
| **8. Intelligence never owns orchestration semantics** | Analytics services return typed results; they do not manage the investigation lifecycle |
| **9. No hidden P1 work** | P1 features cannot destabilize P0/P0.5 |
| **10. Demo path is a product feature** | Every major phase must keep the end-to-end demo path runnable |

---

## 18. Daily Execution Board

| Date | Mayur | Gurashish | Joint Checkpoint |
|---|---|---|---|
| 25 Aug | Architecture review | Architecture review | Scope + ownership locked |
| 26 Aug | Domain contracts | Execution/event contracts | Contracts v1 |
| 27 Aug | Ingestion/ER | API/queues/state | Compile against contracts |
| 28 Aug | Graph/temporal | Agent/tool runtime | Vertical slice #1 |
| 29 Aug | Graph analytics | Investigation lifecycle | Lead loop |
| 30 Aug | Cross-case/hypothesis | Agent + realtime | Core investigation |
| 31 Aug | Graph holes/gap engine | Evidence-request workflow | Hole > request |
| 1 Sep | Next evidence/concealment | Reassessment loop | Evidence > graph update |
| 2 Sep | Robustness + ER eval | Recovery + grounding + audit | Trust gate |
| 3 Sep | Intelligence UX definitions | Full investigator workspace | Judge UI |
| 4 Sep | Benchmark generator | Benchmark harness + security | Evaluation/security |
| 5 Sep | Stress tests/P1 | Stress tests/P1 | Release candidate |
| 6 Sep | Final intelligence verification | Final runtime/UI verification | DEMO FREEZE |

---

## 19. Definition of Ready for Each Task

1. Task has a named owner
2. Task has a contract dependency identified
3. Input/output schema is known
4. Acceptance criteria are written
5. No hidden cross-branch dependency exists
6. Mock data or fixture exists if the real dependency is unfinished
7. Test strategy is known
8. Integration checkpoint is identified

---

## 20. Stop Rules / Scope Protection

1. Do not introduce Python just because an ML library exists; the current product stack is TypeScript-first unless a concrete requirement proves otherwise
2. Do not make Aion mandatory until the exact integration path has been tested; the V7 architecture treats it as an implementation/reference option
3. Do not build new graph algorithms when Neo4j/GDS already provides the needed primitive
4. Do not add more source connectors before the FIR/CDR/financial path is stable
5. Do not build informant-source workflow for SIH
6. Do not implement advanced learned link prediction before the synthetic benchmark exists
7. Do not add an additional agent framework if the custom state machine + BullMQ is sufficient
8. Do not sacrifice the graph-hole > evidence > update demo path for secondary features

---

## 21. Final Ownership Map

| Subsystem | Primary Owner | Secondary Reviewer | Integration Contract |
|---|---|---|---|
| Ingestion | Mayur | Gurashish | EvidenceSource / Observation |
| Normalization | Mayur | Gurashish | Observation |
| Observation extraction | Mayur | Gurashish | Observation |
| Entity resolution | Mayur | Gurashish | EntityHypothesis |
| Relation resolution | Mayur | Gurashish | RelationHypothesis |
| Graph projection | Mayur | Gurashish | GraphNode / GraphEdge |
| Temporal layer | Mayur | Gurashish | GraphVersion / temporal contract |
| Graph analytics | Mayur | Gurashish | AnalysisResult |
| Graph holes / gap engine | Mayur | Gurashish | InvestigativeGap |
| Evidence planner | Mayur | Gurashish | EvidenceRequest |
| Hypothesis/counter-evidence | Mayur | Gurashish | Hypothesis / Lead |
| Robustness | Mayur | Gurashish | RobustnessResult |
| State machine | Gurashish | Mayur | InvestigationRun |
| BullMQ/Redis | Gurashish | Mayur | Job/Run contracts |
| Agent runtime | Gurashish | Mayur | ToolRequest/ToolResult |
| Checkpoint/recovery | Gurashish | Mayur | AgentCheckpoint |
| Claim grounding | Gurashish | Mayur | ClaimGrounding |
| Audit/security | Gurashish | Mayur | AuditEvent |
| Realtime | Gurashish | Mayur | InvestigationEvent |
| Investigator UI | Gurashish | Mayur | Lead/Gap/Evidence UI model |
| Benchmark truth | Mayur | Gurashish | Evaluation schema |
| Benchmark harness | Gurashish | Mayur | Evaluation run schema |
| Final demo | Both | Both | Locked vertical path |

---

## 22. One-Page Skim — What Each Person Does

### MAYUR

Build the intelligence: ingest > normalize > observe > resolve > graph > temporal analysis > cross-case > lead > graph hole > gap classification > next-best evidence > counter-evidence > robustness > benchmark truth.

### GURASHISH

Build the execution platform: API > Redis/BullMQ > state machine > workers > agent orchestration > checkpoints > recovery > claim grounding runtime > audit/security > realtime > investigator UI > benchmark harness.

### BOTH

Phase 1 contracts > continuous integration > vertical checkpoints > benchmark interpretation > final stress test > final demo.

---

## 23. Pre-M-A12 Tracker Reconciliation & Architecture Update (V7)

> **Nature of this section:** documentation / planning only. It reconciles the roadmap
> tracker with what is **actually implemented**, documents the architectural direction agreed
> in the pre-M-A12 review, and makes the future improvements explicit **planned work**. It does
> **not** change any implementation, contract, schema, route, worker, scoring, or Graphology code.
> See the reconciled `docs/roadmap/phase-tracker.md` for per-item status.

### 23.1 Current Verified State (at hardening HEAD)

| Component | Milestone | Verified status | Evidence |
|---|---|---|---|
| Ingestion skeleton / acquisition / classification / raw extraction | M-A01 (M-PR1/2/3) | ✅ implemented | `packages/platform/src/ingest/*`, `packages/intelligence/ingestion/src/{classify,parser}/*` |
| Normalization engine | M-A05 | ✅ implemented / frozen | `normalize/`, `docs/platform/m-a05-normalization.md`; "no LLM/OCR reruns" rule |
| Observation extraction (with provenance) | M-A06 | ✅ implemented (deterministic) | `observation/`, durable `GET /evidence` seam, live `listEvidence` provider |
| Entity mention candidates | M-A07 | ✅ implemented (backend) — 🟡 not UV-surfaced | `completeMA07` in `packages/platform/src/queue/ingest-evidence.ts` |
| Multi-pass blocking | M-A08 | ✅ implemented (backend) — 🟡 not UV-surfaced | `completeMA08`, CandidatePair persistence |
| Entity resolver (reversible EntityHypothesis) | M-A09 | ✅ implemented (backend) — 🟡 UX surface pending | `entity-hypothesis-store.ts`, accept/reject/reverse routes |
| Relation resolver (RelationHypothesis) | M-A10 | ✅ implemented + **hardened** (`caa74cd`, merged PR #49) | 43/43 platform integration across 5 suites |
| Graph projection | M-A11 | ✅ implemented **via Graphology** (not Neo4j) | `@indago/graphology-projection` |
| Graph query layer | M-A13 | ✅ implemented (backend) — 🟡 live-mode UI surfacing pending | GraphRuntime + express routes; 9 graph-http integration tests |
| Temporal projection | M-A12 | ❌ not implemented — **next major foundation milestone** | — |
| FIR / CDR / Financial ingestion | M-A02/M-A03/M-A04 | ❌ not implemented | — |

**Owner / boundary note (unchanged):** Mayur owns WHAT INDAGO KNOWS (deterministic intelligence
services). Gurashish owns HOW INDAGO RUNS. Neither silently changes a shared contract.

### 23.2 Known Limitations & Follow-Ups

**A. Non-blocking technical debt**
- No full live Redis/BullMQ+Postgres harness in CI (Redis-gated `real-stack.e2e` tests) — infra/test limitation, not a bug.
- NO-FK `@relation`-less relation/hypothesis endpoints — retained **by design** (case-scoped integrity enforced transactionally in code; schema review is a documented, non-blocking follow-up).
- Real production authentication (JWT/OIDC) is a **separate dependency / future migration**, behind the `verifyToken` seam (currently dev-grade `demo-token` bypass).
- `schema.prisma` comment typo ("harded-as-audited") — cosmetic; prisma not modified in this planning pass.
- Pre-existing environmental failures not caused by M-A10: `entity-hypothesis-store.test.ts` (Neon pooled-connection) and `real-stack.e2e.test.ts` (Redis-gated) — zero diff from the PR.

**B. Future intelligence improvements (explicit planned work)**
- ✅ Deterministic recall-control layer exists (M-A08). **Targeted reblocking** (bounded, selective, NOT O(N²)) is future.
- ✅ Deterministic explainable scoring exists (M-A09/M-A10). **Semantic retrieval** (embeddings / LLM-assisted relevance) is future and must feed *signals* into the existing deterministic policy — never become canonical truth.
- ✅ Same-observation co-occurrence relation candidate generation exists. **Cross-observation relation retrieval** (shared infrastructure / temporal / explicit claims / graph-gap / semantic) is future.
- **Temporal projection (M-A12)** is unbuilt: event/observation-time separation, intervals, graph versioning, reconstruction from authoritative history — see §23.5.

**C. Infrastructure / test limitations**
- No full live harness for a single end-to-end `HTTP → BullMQ → worker → resolution → graph` **demo pass** (backend legs individually proven; the combined demo pass + temporal projection are the remaining gaps).
- Graphology does not retain history — it is a **derived, disposable projection** of current canonical state.

**D. Architecture decisions intentionally deferred**
- Neo4j (deferred to a reversible seam in favor of Graphology).
- Semantic embedding / LLM scoring (gated by a future benchmark — §23.8).
- Production deployment model (object storage S3, migrations dir, secrets mgmt).

### 23.3 Observation-Context Preservation (M-A06 upstream concern)

The main upstream architectural concern: rich narratives may be over-fragmented into atomic
observations (e.g. "Rakesh met Suresh at Warehouse 17" → disconnected fragments) **without
retaining the contextual relationship between them**. Future architecture preserves **both**:

```
ATOMICITY FOR COMPUTATION   +   CONTEXTUALITY FOR INVESTIGATION
```

Source artifact stays authoritative; observations stay traceable to artifact / section /
context span / location / source / evidence. Intended future representation (schema to be
determined by auditing existing M-A06 contracts first, **not** by adding arbitrary fields):

```
Artifact → document/section → context span → observation → mention        (narrative)
Artifact → sheet/table → row → observation → field/cell                     (structured)
```

This is a **pre-M-A12 foundation audit** item (tracker G1) — not a schema change made now.

### 23.4 Future Intelligence Pipeline (target architectural direction)

```
SOURCE
 → EVIDENCE                                            (authoritative, traceable)
 → CONTEXTUAL OBSERVATION                              (fragment + parent context — §23.3)
 → ATOMIC OBSERVATION
 → DETERMINISTIC RETRIEVAL (blocking)                  (cheap recall-control — M-A08)
 → SEMANTIC RETRIEVAL  (future, high-recall)            (+ embeddings)
 → RELEVANCE / EVIDENCE JUDGE (future)                  (+ LLM → structured signals only)
 → DETERMINISTIC RESOLUTION                             (explainable scoring — M-A09/M-A10)
 → EXPLICIT AUTHORITY                                   (canonical decision boundary)
 → CANONICAL STATE                                      (Postgres = authority)
 → TEMPORAL PROJECTION (M-A12)                          (disposable Graphology)
 → GRAPH
 → INVESTIGATIVE SIGNAL                                 (structural signal ≠ conviction)
 → LEAD
 → EVIDENCE REQUEST
 → REASSESSMENT
```

Key invariants: **semantic similarity ≠ evidence**; **retrieval optimizes recall**,
**deterministic policy optimizes precision/explainability**; **authority creates canonical
state**; **embeddings/LLM never directly create canonical entities or relations**.

### 23.5 M-A12 Entry Gate

Before M-A12 is started, the following **audits** must be completed and documented. Semantic
retrieval is **NOT** required to enter M-A12.

| ID | Entry-gate audit | Required evidence |
|---|---|---|
| G1 | M-A06 observation representation audited for silent source-context loss | remediation planned **if** loss found |
| G2 | M-A07 candidate provenance verified | candidate ≠ entity; candidateId never becomes EntityId |
| G3 | M-A08 blocking semantics verified | cheap deterministic recall layer; bounded; pair ≠ identity |
| G4 | M-A09 authority boundary verified | candidate → pair → hypothesis → authority → canonical Entity |
| G5 | M-A10 relation authority verified | canonical Entity + evidence → candidate → scoring → hypothesis → authority → canonical Relation → Graphology |
| G6 | M-A11 graph projection verified | Graphology derived/disposable; Postgres authoritative |
| G7 | M-A13 current graph APIs verified | graph, traversal, centrality, communities |
| G8 | DEMO / LIVE / AUTO regression status documented | frontend provider seam intact; demo untouched |

**Entry criterion:** G1–G8 satisfied (documented) + DEMO/LIVE/AUTO regression status recorded.

### 23.6 Intelligence Architecture Principles

1. Source evidence is authoritative.
2. Observation extraction must not destroy context.
3. Candidate ≠ Entity.
4. CandidatePair ≠ identity.
5. Hypothesis ≠ canonical truth.
6. Semantic similarity ≠ evidence.
7. Retrieval optimizes recall.
8. Deterministic policy optimizes precision/explainability.
9. Authority creates canonical state.
10. Graph analytics do not manufacture evidence.
11. Graphology is derived, not authoritative.
12. Temporal history must be reconstructable.
13. Cross-observation reasoning must preserve provenance.
14. Absence of evidence ≠ evidence of absence unless explicitly justified.
15. Structural connectivity ≠ criminal relevance.

### 23.7 Explicit Non-Goals (this plan does not authorize)

- No rewrite of M-A06/M-A07/M-A08/M-A09/M-A10 to satisfy this document.
- No LLM/embedding that directly returns "this is definitely the same entity" as an authority action.
- No "embedding = better" assumption; no semantic scoring adopted ahead of a benchmark (§23.8).
- No Graphology-based temporal history (Graphology is disposable; history lives in authoritative Postgres temporal/event data).
- No `updatedAt` used as a domain-valid time.
- No new APIs / schema / workers introduced by this planning pass (implementation frozen).

### 23.8 Future Work Placement (no cramming into M-A12)

| Where | Work |
|---|---|
| **Pre-M-A12 / foundation audit** | G1: M-A05/M-A06 information-preservation + observation-fragmentation audit; establish contextual-evidence representation if needed (§23.3) |
| **M-A12** | Temporal projection: event/ingestion vs observation vs validity times; interval & boundary semantics; open/late/out-of-order evidence; deterministic graph-version IDs + checkpoint relationship; temporal reconstruction from authoritative history (Graphology disposable); reversal-over-time |
| **Phase 4/5** | Cross-observation relation retrieval; targeted reblocking (bounded); graph-hole / graph-gap-driven retrieval; richer relation-candidate generation (DIRECT relation evidence vs INDIRECT structural linkage vs SEMANTIC association — kept distinct) |
| **Phase 6/8** | Semantic retrieval (embeddings); LLM relevance/evidence judge (→ structured signals); benchmark: V1 deterministic vs V2 +embeddings vs V3 +embeddings +LLM judge; measures: candidate recall, entity/relation precision/recall, false merges/splits, graph-hole precision, evidence-retrieval utility, robustness stability, latency, cost; versioned model-feature schemas |
| **Phase 7** | Source / context visualization; provenance UX; uncertainty / evidence presentation (supporting vs contradicting, score vs probability, confidence vs admissibility, absence vs concealment, role vs culpability) |

### 23.9 Dependency Graph (ordering)

```
M-A06 obs representation (G1 gate)
        │
        ▼
M-A07 proof → M-A08 blocking (G2/G3) ──────────────┐
        └──────────┐                               │
M-A09 entity authority (G4) ───────────────────────┼──► M-A12 temporal projection
        ▼                                          │
M-A10 relation authority (G5) ──────────────────────┤
        ▼                                          │
M-A11 graphology + M-A13 graph APIs (G6/G7) ────────┤
        └──────────────── G8: DEMO/LIVE/AUTO reg ───┘
   (deterministic lane complete + entry gate documented)

M-A12 ─► Phase 4 cross-observation / Phase 5 targeted reblocking + graph holes + leads
        │
        ▼
Phase 6/8 semantic retrieval + LLM judge  (benchmark-gated)
        │
        └► Phase 7 source/context + provenance/uncertainty UX
```

Direction of travel: deterministic foundation first (complete), then temporal (M-A12), then
cross-observation / targeted reblocking / graph-hole retrieval (Phase 4/5), then semantic
retrieval + benchmark (Phase 6/8), with provenance/uncertainty UX (Phase 7) parallel to the
semantic work. Semantic-retrieval signals only **additive** features over deterministic policy.

### 23.10 Status Vocabulary (consistent with the tracker)

| Mark | Meaning |
|---|---|
| ✅ | IMPLEMENTED AND VERIFIED |
| 🟡 | IMPLEMENTED BUT ONLY PARTIALLY VERIFIED (e.g. backend done, UX surfacing pending) |
| 🔵 | PLANNED |
| ⚠️ | KNOWN LIMITATION |
| ❌ | NOT IMPLEMENTED |

Final recommendation: **READY TO START M-A12**, conditioned on completing + documenting the
G1–G8 entry-gate audits (§23.5), chiefly the M-A06 observation-context audit (G1) and the
DEMO/LIVE/AUTO regression status (G8). Semantic retrieval is intentionally non-blocking for
M-A12 and lands in Phase 6/8.

### 23.11 M-A12-PR0 — Temporal Architecture + Design Lock (DESIGN/LOCK)

**Status:** 🔵 DESIGN / LOCK — architecture locked; runtime not implemented.
**Authoritative design doc:** `docs/platform/m-a12-temporal-architecture.md`.

M-A12 is implemented as three PRs. PR0 locks the design; **PR1 (temporal history
+ intervals), PR2 (graph versioning + historical projection), and PR3 (APIs +
checkpoints + verification) are implemented and verified end-to-end** (pure unit
suites green + real-Postgres integration suites green 43/43 against a migrated
`TEST_DATABASE_URL`). The locked decisions (D1–D7) and semantics are recorded in the
design doc and must not be re-interpreted by downstream PRs.

#### Locked decisions (summary — see design doc for full detail)

- **D1 Event-time anchor — Hybrid:** domain-valid event time persisted where
  confidently extractable (existing `EventTimeSchema` vocabulary);
  `RawExtraction` remains authoritative for source context/time; never fabricate
  a missing year or precision from values such as `"14 March"`.
- **D2 Cross-observation grouping — Hybrid (source-context, not event
  identity):** lightweight durable source-context grouping/lineage via
  `ProvenanceSchema.derivedFrom`; grouping never implies real-world event
  identity; `RawExtraction` authoritative for rich context.
- **D3 Temporal contract vocabulary — Adopt** the existing `EventTime`,
  `ReportedTime`, `ObservedTime`, `IngestionTime`, `TransactionTime`,
  `TemporalIntervalSchema`, `GraphVersionSchema`. No competing vocabulary.
- **D4 GraphVersion — Logical revision (PR2):** UUID `GraphVersionId`; natural
  logical key `(caseId, versionNumber)`; determinism via replay, not content-hash;
  `parentGraphVersionId`, statuses, projectionStatus, checkpointId per contract.
- **D5 Interval semantics — Closed `[validFrom, validTo]`**, aligned to
  `TemporalIntervalSchema`; boundary equality valid; `validTo < validFrom`
  invalid.
- **D6 Late/out-of-order evidence — New version on canonical change (PR2);**
  audit/ingestion order immutable; domain time carried separately; reconstruction
  from persisted temporal state, not mutable current rows.
- **D7 Checkpoint relationship — Light one-way coupling (PR2/3);** preserve
  `AgentCheckpoint`; record `GraphVersion.checkpointId` and a small reverse
  mapping at the active `stepId`.

#### PR breakdown

| PR | Scope | Status |
| --- | --- | --- |
| M-A12-PR0 | Temporal architecture + design lock (this) + dev-plan/tracker updates | 🔵 DESIGN / LOCK (complete as a design PR) |
| M-A12-PR1 | Temporal history + intervals: persist domain event-time, validity intervals, immutable temporal history for reconstruction; event-time propagation where confident; runtime validation; indexes; deterministic reconstruction primitives; tests | ✅ IMPLEMENTED (`Observation.eventTime/sourceContextId/validityInterval` + `Relation`/`RelationHypothesis.validityInterval`; `temporal/interval-validation.ts` D5 rules + `containsTime`; `TemporalStateChange` append-only store + logicalKey idempotency + WS-2 boundary validation in completeMA06; MA06 event-time/source-context propagation + D6 history wiring; PR1 unit suite green; real-Postgres PR1 integration suite green (7) — verified against a migrated `TEST_DATABASE_URL`, same path as CI Postgres service) |
| M-A12-PR2 | Graph versions + historical graph projection: `GraphVersion`, version creation on canonical change, historical projection via node/edge `temporalRange`, current-vs-historical semantics | ✅ IMPLEMENTED (`GraphVersion` model + store with per-case transaction-scoped advisory-lock serialization of `versionNumber`; WS-7 auto-activation on create + ACTIVE→SUPERSEDED demotion in the same tx; WS-8 strict `decodeChange` (`GraphRevisionCorruptError` on corrupt known changes, unknown types still skippable); enable-on-canonical-change coupling in `relation-materialization.ts` — accept/reverse in the same tx, reject none; `relation/graph-version-service.ts` current + historical projection via revision-order replay + WS-10 `projectGraphValidAt`; PR2 pure unit suite green (21 tests); real-Postgres PR2 integration suite green (10) against migrated `TEST_DATABASE_URL` — verified WS-7 demote-before-create is genuinely ACID-correct on real Postgres) |
| M-A12-PR3 | APIs + checkpoints + verification: minimal API surface (`current`, `versions`, `versions/:vid`, `valid-at`, `as-of`), checkpoint↔version coupling, full test matrix | ✅ IMPLEMENTED (case-scoped `GET /cases/:caseId/graph/{current,versions,versions/:vid,valid-at,as-of}` routes with fail-closed auth; D7 `associateCheckpoint`/`resolveVersionByCheckpoint` via existing `GraphVersion.checkpointId` field — no schema migration; `listByCasePaginated` with total count; `valid-at` = dimension-B domain-time containment (400 on unparseable `at`); `as-of` deferred as 501 — PR0 lacks revision-boundary semantics; WS-13 same-tx TSC writers (RELATION ACCEPTED/REVERSED, ENTITY CREATED); WS-3 `deriveValidityInterval` producer wired into completeMA10; PR3 pure unit suite green (18 tests); real-Postgres PR3 integration suite green (8) against migrated `TEST_DATABASE_URL`; `m-a12-temporal-architecture.md` B.1.15/B.1.16 updated) |

#### Temporal model rules (locked; enforced from PR1)

- Temporal concepts kept separate: domain time, source/report time, observation
  time, ingestion time, transaction/system time, validity interval.
- `createdAt`/`updatedAt` are **never** substitutes for domain-valid time.
- `REVERSED` ≠ temporal deletion; reversal preserves workflow + temporal history.
- No automatic event conversion / relation creation / date fabrication.

#### Future work (explicitly outside M-A12)

embeddings · semantic retrieval · LLM judge · targeted reblocking · graph-hole
intelligence · cross-observation semantic intelligence (Phase 4/5, 6/8).

#### Live-mode delivery (M-A12 post-PR3 hardening)

Semantics reference: `docs/platform/temporal-semantics.md`. Runtime model + API: `docs/platform/m-a12-temporal-architecture.md` (B.1.3–B.1.16).

Delivered (live mode only; demo mode/web flow-model untouched):
- **WS-2** boundary validation — completeMA06 validates `eventTime`/`validityInterval` of freshly finalized
  observations; malformed values throw `TemporalValidationError` instead of reaching a proposal.
- **WS-3** interval producer — completeMA10 derives each proposal's closed `validityInterval` via
  `deriveValidityInterval` from the REAL parseable `eventTime` instants of its evidence basis; no
  contribution → no interval (never fabricated); `semantics: inferred`, `precision: exact` iff all-exact.
- **WS-7** auto-activation — `createVersion` creates ACTIVE by default and demotes the prior ACTIVE to
  SUPERSEDED (STALE when COMPLETE) in the same transaction; exactly one ACTIVE version per case.
- **WS-8** strict typed replay — `decodeChange` throws `GraphRevisionCorruptError` on known-prefix
  malformed revisions; unknown/non-graph change types stay skippable (replay contract preserved).
- **WS-10** `GET /cases/:caseId/graph/valid-at?at=<ISO>` — dimension-B domain-time containment via
  `containsTime` (instant-grade bounds only; closed intervals; never guessed). as-of remains 501.
- **WS-13** TSC hardening — `logicalKey` idempotency + `eventRef` + `ENTITY` type; RELATION ACCEPTED/REVERSED/AMENDED
  and ENTITY CREATED/ARCHIVED recorded in the SAME transaction as the canonical write; DB trigger makes the history
  append-only (TRUNCATE unblocked as the sanctioned test-reset seam).
- **DB-backed CI** — Postgres 16 service + `TEST_DATABASE_URL` + `prisma migrate deploy` (baseline +
  append-only trigger + unique-ACTIVE index). Verified locally against a migrated `TEST_DATABASE_URL`
  (Neon/Postgres): all 5 M-A12 DB suites green (43/43 — PR2 10, PR3 8, temporal-history 7,
  hardening 11, HTTP-security 7), which surfaced + fixed two genuine concurrency bugs
  (`createVersion` insert-before-demote vs. partial unique ACTIVE index; `recordChange` P2002
  re-read inside an aborted tx → `createMany(skipDuplicates)` + winner re-read) — see
  `m-a12-temporal-architecture.md` B.1.15 verification record.
- **M-A12 hardening (second pass)** — amendment authority + assertion family (item A), entity mutation
  versioning (item B), typed `GraphRevisionEvent`s (item C), DB-level unique ACTIVE per case (item D),
  concurrency/idempotency guarantees (items E/F/G), HTTP security + case-isolation over the graph
  endpoints (item O). See `docs/platform/temporal-semantics.md` §§6–8 and
  `m-a12-temporal-architecture.md` B.1.7/B.1.13–B.1.16.
- **Deferred (documented):** WS-14 contract-field rename (breaks demo fixtures), WS-1 extractor change
  (D1/D2 enforced at the boundary instead), entity transitions beyond ACTIVE→ARCHIVED (MERGED/SPLIT/CANDIDATE
  need authority semantics), HTTP `as-of` endpoint (501 — revision-time resolution is available via the
  projection service, the endpoint stays undefined). Baseline + trigger + unique-ACTIVE migrations created;
  `prisma migrate deploy` verified path.
