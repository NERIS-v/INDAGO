<div align="center">

<img src="https://img.shields.io/badge/PS-26189-FF6B35?style=for-the-badge&labelColor=0D1117" alt="PS 26189"> <img src="https://img.shields.io/badge/Architecture-v7.0-00D4AA?style=for-the-badge&labelColor=0D1117" alt="Architecture v7.0"> <img src="https://img.shields.io/badge/Status-SIH%20Prototype-FFB800?style=for-the-badge&labelColor=0D1117" alt="Status"> <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&labelColor=0D1117" alt="License: MIT">

&nbsp;

# `INDAGO`

### Evidence-to-Graph Investigative Intelligence

**AI-Powered Criminal Network Analysis System**

---

<img src="https://img.shields.io/badge/OBSERVE-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/RESOLVE-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/CONNECT-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/FIND_LEAD-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/CLASSIFY_GAP-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/REQUEST_EVIDENCE-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/VERIFY-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/UPDATE-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/CHALLENGE-grey?style=flat-square"> <img src="https://img.shields.io/badge/→-grey?style=flat-square"> <img src="https://img.shields.io/badge/REASSESS-grey?style=flat-square">

*From fragmented investigative evidence to defensible, reviewable investigative leads.*

</div>

---

<table>
<tr>
<td align="center" width="100%">

<details>
<summary><h3>📑 Table of Contents — click to expand</h3></summary>

<br>

**Core**
- [Executive Summary](#executive-summary)
- [What INDAGO Is Not](#what-indago-is-not)
- [V7 Core Thesis](#v7-core-thesis)
- [V7 Engineering Principle](#v7-engineering-principle)
- [Problem Statement Alignment](#problem-statement-alignment)
- [Design Thesis & Innovation Boundary](#design-thesis--innovation-boundary)

**Architecture**
- [Master Architecture](#master-architecture)
- [Ingestion & Source Provenance](#ingestion--source-provenance)
- [Normalization & Data Quality](#normalization--data-quality)
- [Observation / Structured Evidence Layer](#observation--structured-evidence-layer)
- [Entity & Relation Resolution](#entity--relation-resolution)
- [Role-Aware Entity Model](#role-aware-entity-model)
- [Temporal Intelligence Architecture](#temporal-intelligence-architecture)

**Analytics & Discovery**
- [Graph & Discovery Analytics](#graph--discovery-analytics)
- [Cross-Case & Boundary Analysis](#cross-case--boundary-analysis)
- [Investigative Gap & Graph-Hole Engine](#investigative-gap--graph-hole-engine)
- [Concealment-Consistent Pattern Analysis](#concealment-consistent-pattern-analysis)
- [Robustness Engine](#robustness-engine)

**Reasoning & Reliability**
- [Evidence Posture & Analytical Confidence](#evidence-posture--analytical-confidence)
- [Investigation Orchestrator & Agent Reliability](#investigation-orchestrator--agent-reliability)
- [Security, Privacy, Audit & Safety](#security-privacy-audit--safety)

**Data & UX**
- [Canonical Data Model](#canonical-data-model)
- [Scoring & Mathematical Guardrails](#scoring--mathematical-guardrails)
- [Investigator UX](#investigator-ux)

**Delivery**
- [Definition of Done](#definition-of-done)
- [SIH Scope Lock](#sih-scope-lock)
- [Winning Demo](#winning-demo)
- [Competitive Positioning](#competitive-positioning)
- [Non-Negotiable Safety & Epistemic Rules](#non-negotiable-safety--epistemic-rules)
- [Research & Evidence Basis](#research--evidence-basis)
- [Architecture Decision Record](#final-architecture-decision-record)

**Implementation**
- [Implementation Status](#implementation-status)
- [Appendix A — Implementation Blueprint](#appendix-a---implementation-blueprint)
- [Appendix B — Minimal Demo Dataset](#appendix-b---minimal-demo-dataset-design)
- [Appendix C — Judge-Facing Differentiation](#appendix-c---judge-facing-differentiation-in-one-minute)
- [License](#license)

</details>

</td>
</tr>
</table>

---

## Executive Summary

> The problem is not that graph technology does not exist. India's ICJS already integrates major criminal-justice pillars and MHA explicitly lists a Criminal Network Link Analysis capability. Commercial intelligence-analysis platforms also provide graph analytics and entity-resolution workflows. **The opportunity is therefore narrower and more defensible**: reduce the gap between fragmented evidence and a lead that an investigator can actually review, challenge, verify, and act upon.

INDAGO treats the graph as an **observed, incomplete model** of available evidence — **not as reality**. It explicitly separates observation, interpretation, structural analysis, investigative relevance, uncertainty, evidence quality, and human decision.

### The Core Loop

```
OBSERVE → RESOLVE → CONNECT → ANALYZE → FIND LEAD → CLASSIFY GAP
    → REQUEST BEST NEXT EVIDENCE → VERIFY → UPDATE → CHALLENGE → REASSESS
```

### The Product Output

The primary object is an **Investigative Lead**, not a graph. A lead contains:

| Component | Description |
|-----------|-------------|
| **Claim** | The hypothesis or finding |
| **Supporting & Contradicting Observations** | Evidence for and against |
| **Structural & Temporal Signals** | Graph-theoretic and time-based indicators |
| **Independent Source Groups** | Number of independent evidence streams |
| **Coverage** | How much of the relevant observation space is represented |
| **Robustness** | Stability under plausible perturbations |
| **Alternative Explanations** | Competing hypotheses |
| **Intelligence Gaps** | What is missing and why |
| **Recommended Verification** | Next best evidence to acquire |
| **Provenance** | Full traceability to source records |
| **Review Status** | Human decision state |

---

## What INDAGO Is Not

| Not This | What It Is Instead |
|---|---|
| A replacement for CCTNS or ICJS | A reasoning layer that sits above existing systems |
| A generic chatbot over a graph | An evidence-aware investigation loop |
| A "kingpin detector" | A structural signal provider with evidence-backed relevance |
| A guilt, culpability, or legal-admissibility engine | A tool that returns every material decision to human review |
| A system that treats every missing edge as evidence of concealment | A system that classifies gaps and requests evidence to fill them |
| An autonomous investigator making irreversible decisions | An orchestrator with checkpoints, claim grounding, and escalation |

---

## V7 Core Thesis

> INDAGO converts fragmented investigative evidence into a reviewable, uncertainty-aware network model; finds investigative leads; identifies why important information may be missing; recommends the next evidence that could most reduce uncertainty; tests important conclusions against plausible missingness; challenges them with counter-evidence; and returns every material decision to human review.

---

## V7 Engineering Principle

> Every sophisticated capability has an explicit **failure mode** and **recovery path**.

| Concern | V7 Approach |
|---------|-------------|
| Temporal history | Separated from the current projection |
| Robustness | Staged and cached |
| Entity-resolution blocking | Uncertainty is visible |
| Agent execution | Checkpointed and claim-grounded |
| Missingness | Treated as competing causal explanations |
| Analytical confidence | Kept separate from evidentiary posture |

---

## Problem Statement Alignment

| PS Requirement | INDAGO Capability | Status |
|---|---|---|
| Collect/process FIRs, CDRs, financial, surveillance, social, history, intelligence data | Source adapters + provenance-preserving ingestion | Full |
| Extract people, locations, vehicles, phones, organizations | Observation layer + entity/relation resolution | Full |
| Build relationship maps | Temporal evidence-linked graph | Full |
| Identify influential individuals | Structural candidates + evidence-backed investigative relevance; no bare kingpin score | Full, safety-reframed |
| Detect suspicious patterns / unusual activity | Temporal bursts, structural anomalies, discovery mode, cross-case patterns | Full |
| Provide visual/analytical insights | Graph + timeline + lead card + reasoning ledger + next-best evidence | Full |

> **Important framing:** INDAGO satisfies the "influential roles" requirement without equating graph centrality with criminality. A telecom provider, bank, transport hub, or other legitimate infrastructure can be structurally central. Structural importance is therefore a signal requiring evidence-backed investigative relevance.

---

## Design Thesis & Innovation Boundary

Basic graph construction, entity extraction, centrality, community detection, hidden-link search, and AI orchestration are **not claimed as novel**. The defensible innovation boundary is **the controlled transformation of imperfect evidence into reviewable investigative reasoning**.

| Capability | Existing State | INDAGO Stance |
|---|---|---|
| Basic criminal graph | Established | Infrastructure, not novelty |
| Entity extraction | Established | Use it, but preserve provenance and uncertainty |
| Centrality / PageRank | Established | Supporting structural signal only |
| Community detection | Established | Stability-tested candidate structures |
| Multi-hop hidden-link search | Established | Feed into evidence-aware workflow |
| AI agent over graph | Increasingly common | Table stakes, not the pitch |
| **Evidence-gap → next-evidence loop** | **Targeted product gap** | **Primary differentiation** |
| **Robustness under modeled missingness** | **Research-grounded analytical gap** | **Primary differentiation** |
| **Blocking uncertainty / ER recovery** | **Known ER issue, productized for investigation** | **Primary differentiation** |
| **Evidence independence** | **Operationally important** | **Primary differentiation** |
| **Role-aware trafficking mode** | **Sponsor-aligned specialization** | **Secondary differentiation** |

---

## Master Architecture

```
RAW SOURCES
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  01 │ INGESTION + SOURCE PROVENANCE                         │
│  02 │ NORMALIZATION + DATA QUALITY                          │
│  03 │ OBSERVATION / STRUCTURED EVIDENCE                     │
│  04 │ ENTITY + RELATION RESOLUTION                          │
│  05 │ TEMPORAL INTELLIGENCE GRAPH                           │
│  06 │ GRAPH + DISCOVERY ANALYTICS                           │
│  07 │ CROSS-CASE / BOUNDARY ANALYSIS                        │
│  08 │ INVESTIGATION ORCHESTRATOR                            │
│  09 │ HYPOTHESIS + COUNTER-EVIDENCE                         │
│  10 │ ROBUSTNESS + GAP / HOLE ENGINE                        │
│  11 │ HUMAN REVIEW + NEXT BEST EVIDENCE                     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
CROSS-CUTTING: SECURITY │ AUDIT │ EVALUATION │ PII GOVERNANCE │ CLAIM GROUNDING
```

### Architectural Rule

> **The graph is a derived analytical projection. The evidence/observation layer is the system of record.** This prevents graph mutations from silently becoming facts.

---

## Ingestion & Source Provenance

**Inputs:** FIR/police reports, CDR exports, financial records, surveillance artifacts, social-intelligence artifacts, criminal-history records, intelligence reports.

| Principle | Description |
|---|---|
| Raw source references | Preserve content hashes and original evidence pointers |
| Metadata recording | Source type, upstream system, collection method, case scope, ingestion time, access classification |
| Original evidence | Never discard the original pointer after extraction |
| Duplicate detection | Detect duplicate/derived source records before counting as independent corroboration |
| Source health | Track separately from analytical uncertainty |

### Source Health Model

| State | Meaning | Analytical Treatment |
|---|---|---|
| `Available` | Source reachable and processed | Normal coverage |
| `Partial` | Some fields/records unavailable | Coverage penalty / uncertainty |
| `Unavailable` | Expected source cannot be accessed | Infrastructure/data gap |
| `Failed ingestion` | Pipeline failed | **Do not interpret as missing evidence** |
| `Unknown` | Source status not established | Unresolved coverage |

---

## Normalization & Data Quality

- Normalize identifiers, names, transliterations, units, schemas, phone formats, account formats, and locations
- Keep `eventTime`, `reportedTime`, `observedTime`, and ingestion/transaction time **separate**
- Store timestamp precision: `exact`, `minute`, `hour`, `day`, `range`, `approximate`, `unknown`
- Represent missing, conflicting, and low-quality fields **explicitly**
- Track source-level quality rather than assigning one global trust score
- **Preserve conflicting values** instead of overwriting them

---

## Observation / Structured Evidence Layer

This layer is the **epistemic boundary** between what a source actually contains and what INDAGO infers.

| Rule | Description |
|---|---|
| Observations | Create for mentions, events, claims, locations, transactions, communications, ownership records |
| Provenance | Every observation retains source span/document/event provenance |
| Hypotheses | Entity and relation interpretations remain hypotheses until sufficiently supported |
| Contradiction | A **first-class state** |
| Derived observations | Retain links to their upstream observations |

> **Rule:** An extracted observation can be displayed as an observation. It must not silently become a resolved identity, relationship, criminal role, or factual conclusion.

---

## Entity & Relation Resolution

Entity resolution is a **high-risk stage** because both false merges and false splits can poison downstream analysis. INDAGO uses **recall-first candidate generation**, **reversible hypotheses**, and **explicit comparison uncertainty**.

### 7.1 Multi-Pass Candidate Generation

```
Pass 1: Exact / normalized identifiers
Pass 2: Transliterated and normalized names
Pass 3: Phone/email fragments and identifier suffixes
Pass 4: Address/location tokens
Pass 5: Shared temporal/contextual signals
Pass 6: Semantic ANN candidates
```

> **Disjunctive blocking:** A pair enters the candidate set if it qualifies in **any** credible blocking pass.

### 7.2 Blocking Audit

| Metric | Purpose |
|---|---|
| Pair completeness / blocking recall | Estimate how many true matches enter candidate generation |
| Candidate recall @ K | Measure recovery of plausible alternatives |
| Reduction ratio | Measure computational savings |
| False-split rate | Measure missed identity merges |
| False-merge rate | Measure incorrect identity merges |

### 7.3 Targeted ER Recovery

```
GRAPH HOLE
  → Could an entity split explain the missing connection?
    → YES → Generate targeted alternative candidates
           → Run broader ER pass only where justified
           → Resolve / keep unresolved / create comparison gap
```

> **Critical state:** `UNKNOWN BECAUSE NOT COMPARED` is **not** the same as `UNKNOWN BECAUSE DIFFERENT`. A pair excluded by blocking is **never** treated as evidence that the records represent different people.

---

## Role-Aware Entity Model

```
EntityRoleHypothesis
  ├── role: victim | suspect | witness | facilitator | unknown
  ├── roleScore: ranking signal (unless benchmark-calibrated)
  ├── evidenceBasis[]
  ├── contradictions[]
  └── roleReversible: true
```

| Rule | Description |
|---|---|
| Default role | Every person defaults to `unknown` |
| Role ≠ identity | Role is separate from identity |
| No silent promotion | No score silently promotes a person to suspect, victim, witness, or facilitator |
| Evidence required | Role assignments require their own evidence basis, contradiction handling, and reversibility |
| Not culpability | Role is **never** a proxy for legal culpability |

---

## Temporal Intelligence Architecture

INDAGO separates **current graph state** from **temporal history** and supports incremental computation.

### V7 Temporal Storage Decision

```
IMMUTABLE EVIDENCE / EVENT LOG
    ↓
CURRENT SUPPORTED GRAPH PROJECTION
    ↓
INTERVAL-BASED RELATIONSHIP / ENTITY HYPOTHESES
    ↓
PERIODIC CHECKPOINTS / SNAPSHOTS
    ↓
HISTORICAL RECONSTRUCTION
```

| Principle | Description |
|---|---|
| Append-only event log | Stores accepted graph mutations with transaction time and event/valid time |
| Current projection | Optimizes the dominant investigator workflow: what is currently supported? |
| Valid intervals | Use `validFrom`/`validTo` + `observedAt`/`ingestedAt` |
| Historical views | Reconstruct from event history plus periodic checkpoints |
| Hot cache | Cache recent/high-value graph versions for repeated queries |

> **Semantic correction:** INDAGO never labels a relationship "dormant" merely because observations stopped. Preferred wording: **"no qualifying observations detected in the interval."** Absence of observation is not proof of absence.

---

## Graph & Discovery Analytics

| Capability | Description |
|---|---|
| Community candidates | Stability analysis across seeds/parameters where feasible |
| Bridge candidates | Based on connectivity/separation impact, not naive kingpin scoring |
| Key-player / fragmentation | One structural signal among many |
| Temporal bursts | Relationship emergence/decay detection |
| Multi-hop paths | Bounded path and shared-neighbor discovery |
| Discovery mode | Patterns not tied to a preselected suspect |
| **Route/stage analysis** | Explicitly enabled trafficking scenarios |

### Route and Stage Mode

```
RECRUITMENT → TRANSPORT → TRANSIT / HOLDING → DESTINATION
```

- Classify directional path segments using observed evidence, direction, and temporal order
- Keep the mode contextual; do not assume every criminal network is a trafficking route
- Cross-reference stage position with role hypotheses
- Surface role/stage contradictions instead of silently resolving them
- Recurring stage-position patterns across cases are **structural signals**, not identity or culpability labels

---

## Cross-Case & Boundary Analysis

- Find shared entities, infrastructure, communications, financial patterns, locations, and other cross-case signals
- Detect adjacent entities **outside** the current case boundary
- Rank boundary-expansion candidates by evidence support, relevance, and verification value
- Keep external candidates **separate** until human authorization
- **Never** silently contaminate the active case graph

---

## Investigative Gap & Graph-Hole Engine

> **This is the primary product-level differentiator.** The graph is used not only to show observed structure but to expose uncertainty and identify what evidence could most efficiently resolve it.

### The Gap Loop

```
OBSERVED GRAPH
  → LEAD / UNRESOLVED QUESTION
    → GAP CLASSIFICATION
      → CANDIDATE EVIDENCE
        → EXPECTED INFORMATION GAIN
          → NEXT BEST EVIDENCE
            → HUMAN VERIFICATION
              → NEW OBSERVATION
                → UPDATED GRAPH
                  → REASSESS
```

### 12.1 Gap Taxonomy

| Gap Class | Meaning | System Behavior |
|---|---|---|
| **Missing investigation** | Information may exist but has not been queried | Recommend search / cross-case action |
| **Missing data** | Relevant source unavailable/incomplete | Expose coverage limitation; never treat absence as negative evidence |
| **Missing comparison** | Potentially matching records never compared | Trigger targeted broader ER analysis |
| **Infrastructure gap** | Expected data flow unavailable | Separate infrastructure uncertainty from investigative uncertainty |
| **Potential concealment-consistent pattern** | Observed structure unusually consistent with strategic trace-avoidance | Create hypothesis with competing explanations; never assert intent |

### 12.2 Candidate Missing-Link Generation

```
CandidateLink(A,B) =
  + topology similarity
  + shared neighbors
  + temporal compatibility
  + community proximity
  + independent evidence signals
  - contradictions
  - legitimate shared-infrastructure explanations

OUTPUT: candidate link + evidence required to test it
```

> A candidate link is a **hypothesis**, not a fact. INDAGO evaluates whether a recommended evidence request is **useful**, not merely whether a graph algorithm can guess an edge.

### 12.3 Evidence Acquisition Utility

```
U(a) = EIG(a) × Relevance(a) × Feasibility(a) − λ × Cost(a)
```

All components normalized to `[0,1]`. **EIG** = expected reduction in uncertainty among competing hypotheses.

The prototype uses a **transparent heuristic** rather than a learned policy. Every component is displayed so the investigator can understand why an evidence request was prioritized.

### 12.4 Evaluation Metric That Matters

> **Evidence Resolution Rate@K**: Among the top K recommended evidence requests, how often does the retrieved evidence materially resolve a gap, change the lead ranking, reject a false hypothesis, or create a validated connection?

---

## Concealment-Consistent Pattern Analysis

Research on covert networks shows that **missingness can be non-random** and that strategic sparsification can affect network inference. INDAGO therefore models concealment as a **competing hypothesis**, not as an inferred intention.

| Step | Description |
|---|---|
| Compare | Observed sparsity vs. expected interaction patterns |
| Inspect | Timing gaps, substitution patterns, role/stage transitions, local density, channel changes |
| Separate | Source-coverage gaps from behavioral sparsity |
| Compete | Data failure, legitimate non-contact, entity split, compartmentalization, concealment |
| Request | Targeted evidence to distinguish hypotheses |
| Language | **"concealment-consistent pattern"** — never "criminal deliberately hid this connection" |

### Missingness Regimes for Robustness

1. Random observation loss
2. Source-dependent missingness
3. Entity-dependent missingness
4. Structure-dependent missingness
5. Adversarial / strategic sparsification

> **NON-NEGOTIABLE:** Absence of an edge is **never**, by itself, evidence of criminal intent.

---

## Robustness Engine

> Robustness answers a narrow question: **does an important structural conclusion survive plausible perturbations under the stated observation model?** It is not a probability of truth.

### Staged Pipeline

```
STAGE A: CHEAP SCREENING
  Small deterministic perturbation sample + cheap structural proxies
    ↓
STAGE B: CANDIDATE CONFIRMATION
  Only high-impact leads receive the full budget
    ↓
STAGE C: CACHE
  Key = graphVersion + perturbationPolicy + seed + candidateRegion + algorithmVersion
    ↓
STAGE D: INCREMENTAL RECOMPUTATION
  Recompute affected regions where possible
    ↓
STAGE E: PROGRESSIVE PRESENTATION
  Precompute top 3-5 leads after discovery; do not block the live UI
    ↓
STAGE F: REPRODUCIBILITY
  Persist policy, seed, algorithm version, graph version, sample count
```

### Adaptive Stopping

The perturbation budget is **bounded and adaptive**. The system may stop early when the stability estimate has converged sufficiently for the lead's required decision threshold, or continue until the configured budget is exhausted.

### Robustness Output Example

```
Lead X
├── Structural signal:        HIGH
├── Independent source groups: 3
├── Coverage:                 81%
├── Perturbation stability:   87/100
├── Alternatives:             2
└── Status:                   REVIEW
```

---

## Evidence Posture & Analytical Confidence

> **Analytical confidence and evidentiary posture are separate axes.** A high model score does not imply legal admissibility, and strong direct evidence does not need a high model score to deserve attention.

| Tier | Meaning | Typical Use | System Rule |
|---|---|---|---|
| **T0 — Observation** | Directly ingested/extracted observation with provenance | Source review | No inference without labeling |
| **T1 — Investigative Lead** | Model-supported hypothesis with limited corroboration | Prioritization | Never present as established fact |
| **T2 — Corroborated Lead** | Multiple sufficiently independent sources or strong direct evidence | Higher-priority action | Show independence and contradictions |
| **T3 — Evidence Package Candidate** | Evidence chain complete enough for formal human/legal review | Preparation | Never certify legal admissibility |

T3 additionally tracks provenance completeness, integrity metadata, acquisition/handling metadata, and chain-of-custody status where available. **Legal admissibility remains a human/legal determination.**

---

## Investigation Orchestrator & Agent Reliability

> The agent is an **orchestrator**, not the source of graph truth. Deterministic services own graph, temporal, evidence, resolution, and robustness computations.

### Failure Mode Controls

| Failure Mode | V7 Control |
|---|---|
| Malformed tool call | Strict schema validation before execution |
| Duplicate execution | Idempotent tools / operation keys |
| Context drift | Checkpointed investigation state |
| Tool failure | Bounded retry + typed error |
| Repeated semantic failure | Replanning / circuit breaker |
| Contradictory state | Pause + human escalation |
| Agent misreads correct tool output | Claim-grounding verifier |
| Irreversible action | Explicit authorization boundary |
| Long-running interruption | Checkpoint + rollback/replay |

### Claim Grounding Pipeline

```
DETERMINISTIC TOOL RESULT
    ↓
STRUCTURED FACTS / IDS
    ↓
AGENT CLAIM
    ↓
CLAIM-GROUNDING VALIDATOR
    ↓
Every factual field maps to actual returned evidence?
    ├── YES → Continue
    └── NO  → Reject / Replan
```

- Claims reference observation, relation, evidence, or analysis-result IDs
- The validator checks existence, scope, type, and permitted interpretation
- A second LLM is **not** used as the sole correctness judge
- Material failures are written into the Reasoning Ledger

---

## Security, Privacy, Audit & Safety

| Principle | Description |
|---|---|
| Untrusted data | Treat documents, retrieved content, and tool outputs as untrusted |
| Instruction separation | Separate trusted system instructions from untrusted evidence content |
| Input validation | Validate every tool input; enforce case scope and authorization |
| Read-only default | Default agent tools to read-only |
| PII masking | Mask PII by default; reveal only according to role/permission |
| Access logging | Log access to sensitive evidence and investigative objects |
| Tamper evidence | Append-only hash-linked audit records |
| Purpose limitation | Apply conceptually; do not claim full government compliance from a hackathon prototype |
| Role ≠ culpability | Role is never a proxy for culpability |
| Safe failure | When safe recovery is impossible, stop and ask for human review |

---

## Canonical Data Model

| Object | Core Fields |
|---|---|
| `EvidenceSource` | id, type, upstreamSystem, collectionMethod, caseScope, contentHash, timestamps, accessClass |
| `Observation` | id, sourceId, span/eventRef, type, value, timestamp, precision, extractor, status |
| `EntityHypothesis` | id, candidateEntities[], signals[], contradictions[], score, status, provenance, role |
| `EntityRoleHypothesis` | role, roleScore, evidenceBasis[], contradictions[], roleReversible |
| `RelationHypothesis` | sourceEntity, targetEntity, type, supportingEvidence[], contradictingEvidence[], score, status |
| `GraphNode` | entityRef, caseRefs, temporalRange, observabilityMetadata |
| `GraphEdge` | relationRef, relationType, validityInterval, score, evidenceRefs |
| `Hypothesis` | claim, support, contradiction, alternatives, coverage, structuralSignals, status |
| `InvestigativeGap` | type, question, candidateEvidence[], expectedValue, status |
| `ReviewTask` | target, reason, evidence, suggestedVerification, assignee, decision |
| `AuditEvent` | actor, action, object, timestamp, previousHash, hash |
| `AgentCheckpoint` | runId, stepId, stateHash, toolResults, nextAction, timestamp |
| `ClaimGrounding` | claimId, referencedEvidenceIds, validationStatus, validatorReason |

---

## Scoring & Mathematical Guardrails

| Signal | Meaning | Not Equivalent To |
|---|---|---|
| Evidence score | Strength/quality of supporting observations | Probability of truth |
| Structural signal | Graph-theoretic importance | Criminal relevance |
| Resolution score | Support for an identity match | Identity certainty |
| Robustness | Stability under modeled perturbations | Truth probability |
| Coverage | How much relevant observation space is represented | Completeness of reality |
| Hypothesis support | Current support after evidence/counter-evidence | Guilt / culpability |
| Role signal | Evidence-supported role classification | Legal status / culpability |
| Evidence posture | Position in T0-T3 workflow | Court admissibility |

> Unless calibrated on held-out labeled data, scores are **ranking or signal scores**. Probabilities must not be presented without calibration evidence.

---

## Investigator UX

The UI must show the **reasoning state**, not merely decorate the graph.

```
┌───────────────────────────────────────────────────────────────┐
│  CASE 042 — REVIEW                                           │
├───────────────────────────────────────────────────────────────┤
│  OBSERVED     │ TEMPORAL / CASE VIEW  │ INVESTIGATIVE LEAD    │
│  NETWORK      │                       │                       │
│               │                       │ Structural: HIGH      │
│   ●───●───●   │ timeline / lifecycle  │ Relevance: MOD-HIGH   │
│     ╲ │ ╱     │                       │ Coverage: 81%         │
│       ●       │ cross-case candidates │ Stability: 87/100    │
├───────────────────────────────────────────────────────────────┤
│  EVIDENCE FOR | AGAINST | ALTERNATIVES | GAPS | NEXT EVIDENCE │
├───────────────────────────────────────────────────────────────┤
│  REASONING LEDGER: Observation → Resolution → Relation →     │
│  Signal → Hypothesis → Counter-evidence → Review → Action    │
└───────────────────────────────────────────────────────────────┘
```

### Signature Lead Card

```
╔═══════════════════════════════════════════════════════════════╗
║  ROBUST LEAD — Entity X                                      ║
╠═══════════════════════════════════════════════════════════════╣
║  Structural signal:        HIGH                              ║
║  Investigative relevance:  MODERATE-HIGH                     ║
║  Independent source groups: 3                                ║
║  Coverage:                 Source 4/6 | Time 81% | Res 93%   ║
║  Missingness stability:    87/100                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Evidence FOR:     4 communication + 2 transaction obs       ║
║  Evidence AGAINST: conflicting location observation          ║
║  Alternative:      legitimate shared intermediary            ║
║  Gap:              ownership of Account Y unresolved         ║
╠═══════════════════════════════════════════════════════════════╣
║  ➤ NEXT BEST EVIDENCE: Account Y ownership record            ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Definition of Done

- [ ] A deliberately messy multi-source case pack can be compiled into structured observations and a reviewable graph
- [ ] Every material observation retains provenance
- [ ] No probabilistic identity match silently merges entities
- [ ] Blocking uncertainty can be surfaced as a comparison gap
- [ ] At least one cross-case or structural lead can be generated
- [ ] Every lead is traceable to supporting evidence
- [ ] At least one contradicting evidence path or alternative explanation can be surfaced
- [ ] The top lead can be tested under bounded, documented perturbations
- [ ] The UI distinguishes structural signal, investigative relevance, evidence support, coverage, and evidence posture
- [ ] A graph hole can be surfaced without asserting the missing edge as fact
- [ ] At least one graph hole produces a ranked evidence request
- [ ] The graph visibly updates when verified evidence fills the hole
- [ ] Agent claims are grounded to returned evidence/result IDs
- [ ] Agent failure can recover from a checkpoint or escalate to a human
- [ ] A blind benchmark measures known planted relationships and evidence-resolution utility
- [ ] A reviewer can reconstruct the reasoning chain from observation to human decision

---

## SIH Scope Lock

### P0 — Must Have

| Capability | Rule |
|---|---|
| Investigation Compiler | End-to-end with FIR + CDR + financial CSV demo data |
| Observation + provenance | Every material observation source-traceable |
| Reversible ER | No silent probabilistic merges |
| Temporal observed graph | Correct time semantics |
| Cross-case discovery | 2-3 cases with shared entity/infrastructure search |
| Investigative Lead | Lead is primary product object |
| Graph-hole engine | At least one visible gap → evidence → graph update path |
| Next-best evidence | Transparent utility heuristic |
| Counter-evidence + alternatives | Mandatory for high-impact leads |

### P0.5 — Should Have

| Capability | Rule |
|---|---|
| Robustness | Top 1-3 leads; staged/cached perturbations |
| Claim grounding | Material agent claims must reference structured evidence |

### P1 — Nice to Have

| Capability | Rule |
|---|---|
| Discovery mode | Unseeded candidate discovery |
| Boundary expansion | Candidates only; human approval |
| Route/stage mode | One sponsor-aligned trafficking demo path |
| Synthetic benchmark | Blind generator + evaluation |

### P2 — Future

| Capability | Rule |
|---|---|
| Advanced learned link prediction | Only after benchmark evidence |
| Informant workflow | Architecture-ready, implementation deferred |
| Additional connectors | Only after core loop is stable |
| Aion runtime integration | Optional benchmark, not dependency |

> **Scope discipline:** Do not spend the prototype week recreating a graph database, implementing novel community algorithms, or building many source connectors. Reuse mature infrastructure. Spend engineering effort on evidence provenance, reversible resolution, gap classification, evidence requests, robustness, claim grounding, and the investigation UI.

---

## Winning Demo

1. **Upload** a deliberately messy multi-source case pack
2. **Show** INDAGO compiling documents/records into observations, candidate entities, relations, conflicts, and provenance
3. **Show** an ambiguous identity held as a **reversible match hypothesis** rather than silently merged
4. **Show** the temporal graph and a cross-case structural candidate
5. **Enter Discovery Mode** and surface a lead without naming a suspect
6. **Open the lead card**: structural signal, investigative relevance, evidence posture, coverage, alternatives, and robustness
7. **Highlight** a visible graph hole and classify why it may exist
8. **Show** that the system refuses to assert the missing relationship
9. **Show** the evidence most likely to resolve the gap and why it was prioritized
10. **Trigger counter-evidence** and watch the lead status change
11. **Run / reveal** staged robustness results rather than waiting for 100 fresh computations
12. **Verify/import** the recommended evidence
13. **Watch** the graph update and the lead re-rank
14. **Open the Reasoning Ledger** and trace the final lead back to source observations
15. **If trafficking mode is enabled**, show an entity whose role remains unknown — the system withholds role-based ranking

> **Closing line:** *"INDAGO did not decide who is guilty. It showed the investigator what the evidence supports, what could be wrong, what is missing, and what to verify next."*

---

## Competitive Positioning

| System / Class | What It Establishes | INDAGO Distinction |
|---|---|---|
| **ICJS / NCRB ecosystem** | Integrated criminal-justice data, search, analytics | Prototype evidence-to-lead reasoning layer; not a replacement |
| **Commercial intelligence graph platforms** | Graph analysis, entity resolution, hidden-link workflows | Focus on uncertainty, evidence independence, missingness robustness, gap→evidence loop |
| **Generic graph DBs** | Scalable graph storage/query | Use as infrastructure; product value sits above it |
| **Generic AI graph agents** | Agent orchestration and tool use | Deterministic analytics + claim grounding + evidence discipline |
| **Academic link prediction** | Candidate missing-edge prediction | Connect candidate holes to evidence requests and measure resolution utility |

> **Defensible claim:** The evidence-aware investigation loop under imperfect observation.

---

## Non-Negotiable Safety & Epistemic Rules

1. Absence of an edge is **not** evidence of criminal intent
2. A concealment-consistent pattern is a **hypothesis** requiring evidence and counter-explanations
3. A blocked-out entity pair is **not** proof that the entities are different
4. A high centrality score is **not** a culpability score
5. A model confidence score is **not** a legal-admissibility determination
6. Role is a **reversible hypothesis** and never a silent suspect label
7. The graph is a **derived representation** of available evidence, not the source of truth
8. The agent may propose investigative actions, but **deterministic services** own factual computation
9. Every material inference must be **traceable** to observations, transformations, algorithms, and provenance
10. Every high-impact lead must expose **uncertainty, contradictions, alternatives, and coverage**
11. When the system cannot recover safely, it **stops** and requests human review

---

## Research & Evidence Basis

| Ref | Title | Link |
|---|---|---|
| R1 | Ministry of Home Affairs — ICJS | [mha.gov.in](https://www.mha.gov.in/en/commoncontent/inter-operable-criminal-justice-system-icjs) |
| R2 | MHA — CCTNS / Women Safety Division | [mha.gov.in](https://www.mha.gov.in/en/divisionofmha/women-safety-division/cctns) |
| R3 | ICJS Official Portal | [icjs.gov.in](https://icjs.gov.in/ICJS/) |
| R4 | Aion: Efficient Temporal Graph Data Management (EDBT 2024) | [doi.org](https://doi.org/10.48786/edbt.2024.43) |
| R5 | Neo4j Cypher Manual — Temporal Values | [neo4j.com](https://neo4j.com/docs/cypher-manual/current/values-and-types/temporal/) |
| R6 | Neo4j NEP-001 — Native Bitemporal Graph Support | [github.com](https://github.com/neo4j/neo4j/issues/13745) |
| R7 | A Survey of Blocking and Filtering Techniques for ER | [arxiv.org](https://arxiv.org/abs/1905.06167) |
| R8 | LangGraph Persistence Documentation | [docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/persistence) |
| R9 | LangGraph Functional API | [docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/functional-api) |
| R10 | In the Shadow of Silence: Modelling Missing Data in Dark Networks | [arxiv.org](https://arxiv.org/abs/2501.15825) |
| R11 | Link Prediction of Missing Criminal Network Relationships | [pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC4841537/) |
| R12 | Using SNA to Study Crime: Navigating Challenges | [doi.org](https://doi.org/10.1016/j.socnet.2022.01.008) |
| R13 | Untangling SNA: The Use and Underuse Among Crime Analysts | [crimrxiv.com](https://www.crimrxiv.com/pub/es78elne/release/1) |
| R14 | NIJ — Criminal Investigative Failures: Network Analysis | [nij.ojp.gov](https://nij.ojp.gov/library/publications/criminal-investigative-failures-network-analysis) |
| R15 | NIJ — Case Deconstruction / Criminal Investigative Failures | [nij.ojp.gov](https://nij.ojp.gov/library/publications/case-deconstruction-criminal-investigative-failures) |

---

## Final Architecture Decision Record

| Problem | Naive Approach | V7 Decision |
|---|---|---|
| Temporal storage | Snapshot graph after every state change | Event log + current supported projection + intervals + periodic snapshots |
| Historical queries | Walk all state changes | Checkpointed reconstruction + hot cache |
| Robustness | 50-100 full recomputations live | Staged sampling + caching + region restriction + incremental recomputation |
| Entity resolution | One blocking strategy + scorer | Multi-pass recall-first blocking + audit + targeted reblocking |
| Agent failure | Retry the LLM loop | Checkpointed state machine + deterministic verification + idempotency + rollback |
| Agent misinterpretation | Trust generated prose | Claim grounding against structured tool results |
| Missingness | Treat all holes as missing data | Causal gap taxonomy + competing explanations |
| Concealment | Infer intent from absence | Detect concealment-consistent patterns only |
| Evidence quality | One confidence number | Analytical confidence + T0-T3 evidence posture |
| Graph holes | Predict links | Predict candidate holes + identify evidence required to test them |
| Benchmark | One synthetic graph | Independent blind generator + multiple missingness regimes |
| ICJS | Attempt to replace/integrate production system | Canonical reconciliation overlay / proof of concept |
| Temporal DB | Make Aion mandatory | Aion-inspired design; optional benchmark |

---

## Final Architecture Thesis

> **INDAGO — FROM EVIDENCE TO DEFENSIBLE INVESTIGATIVE LEADS**
>
> The graph is not the final answer. It is an observed, incomplete model of the evidence available to the system. INDAGO uses that model to identify leads, expose information gaps, predict candidate missing relationships, rank the evidence that could resolve those gaps, test important conclusions against plausible missingness, challenge them with counter-evidence and alternatives, and return control to a human investigator.

```
OBSERVE → RESOLVE → CONNECT → FIND LEAD → CLASSIFY GAP
  → REQUEST BEST EVIDENCE → VERIFY → UPDATE → CHALLENGE → REASSESS
```

> The engineering threshold is equally important: every sophisticated analytical capability has a **bounded failure mode**. Temporal history has a storage strategy; robustness has staged computation; entity resolution exposes blocking uncertainty; agent reasoning has checkpoints and claim grounding; missingness has competing causal explanations; evidence quality is separated from model confidence; and graph holes lead to evidence requests rather than unsupported assertions.

---

## Appendix A — Implementation Blueprint

| Service / Module | Responsibility | Primary Persistence / Output |
|---|---|---|
| Ingestion Service | Parse/import source artifacts | EvidenceSource + raw pointers |
| Normalization Service | Canonical fields and quality metadata | Normalized observations |
| Observation Service | Extract source-grounded facts | Observation |
| Entity Resolution Service | Candidate generation and scoring | EntityHypothesis |
| Relation Service | Evidence-backed relationship hypotheses | RelationHypothesis |
| Graph Projection Service | Build current supported graph | GraphNode / GraphEdge |
| Temporal Service | Intervals, event log, reconstruction | Graph versions / checkpoints |
| Analytics Service | Community, bridge, burst, paths | Structural signals |
| Cross-Case Service | Boundary and shared-entity analysis | Boundary candidates |
| Gap Engine | Classify gaps / graph holes | InvestigativeGap |
| Evidence Planner | Rank verification actions | NextVerification |
| Robustness Service | Perturbation and stability | RobustnessResult |
| Investigation Orchestrator | Plan bounded tool calls | AgentCheckpoint |
| Claim Grounder | Validate agent claims | ClaimGrounding |
| Review Service | Human decisions / tasks | ReviewTask |
| Audit Service | Tamper-evident event chain | AuditEvent |
| UI | Investigation workspace | Lead / graph / timeline / ledger |

---

## Appendix B — Minimal Demo Dataset Design

Use **2-3 synthetic cases** containing enough ambiguity to demonstrate the full loop without requiring a large graph.

| Artifact | Purpose in Demo |
|---|---|
| FIR / narrative report | Entity mentions, locations, event chronology |
| CDR CSV | Communications and temporal overlap |
| Financial CSV | Account/transaction links |
| Vehicle / ownership record | Cross-source identity resolution |
| Second case | Cross-case boundary expansion |
| Contradicting location record | Counter-evidence |
| Missing ownership record | Graph-hole → next evidence |
| New verified ownership record | Visible graph update |
| Synthetic role ambiguity | Unknown → role evidence workflow |

---

## Appendix C — Judge-Facing Differentiation in One Minute

| Existing Systems | INDAGO |
|---|---|
| Can draw the graph | Asks whether the graph is **trustworthy enough** for the lead being considered |
| Can predict links | Asks **what evidence would actually verify** the suspected missing link |
| Can score centrality | **Separates structural importance** from investigative relevance |
| Can automate workflows | Makes agent claims **traceable to deterministic evidence** and recoverable after failure |
| Can ingest many records | **Exposes when a connection is missing** because data was unavailable, investigation was incomplete, entities were not compared, infrastructure failed, or a concealment-consistent pattern exists |

> **The final output is not "the suspect."** It is **"what the evidence supports, what could be wrong, what is missing, and what should be verified next."**

---

## Implementation Status

<div align="center">

<img src="https://img.shields.io/badge/Phase_1-Foundation-00D4AA?style=for-the-badge&labelColor=0D1117" alt="Phase 1"> <img src="https://img.shields.io/badge/Phase_2-Platform-00D4AA?style=for-the-badge&labelColor=0D1117" alt="Phase 2"> <img src="https://img.shields.io/badge/Phase_3-Integration-00D4AA?style=for-the-badge&labelColor=0D1117" alt="Phase 3">

</div>

<table>
  <tr>
    <td><strong>Phase 1 — Foundation</strong></td>
    <td><img src="https://img.shields.io/badge/Complete-00D4AA?style=flat-square" alt="Complete"></td>
    <td>Monorepo setup, Zod contracts, CI/CD pipeline</td>
  </tr>
  <tr>
    <td><strong>Phase 2 — Platform Core</strong></td>
    <td><img src="https://img.shields.io/badge/Complete-00D4AA?style=flat-square" alt="Complete"></td>
    <td>Express API, RBAC auth, upload queue, SSE streaming</td>
  </tr>
  <tr>
    <td><strong>Phase 3 — Integration & UI</strong></td>
    <td><img src="https://img.shields.io/badge/Complete-00D4AA?style=flat-square" alt="Complete"></td>
    <td>Next.js 15 investigative workspace — five-zone shell, graph control center, intelligence + hypothesis surfaces, deterministic demo mode</td>
  </tr>
</table>

### Monorepo Structure

```
packages/
├── contracts/      Zod schemas for domain models & API validation
├── platform/       Express API server, auth, upload queue, orchestrator
├── web/            Next.js 15 investigative workspace UI (five-zone shell, representable graph)
└── intelligence/   Ingestion pipeline (OCR, NER, CDR/financial parsing)
```

### Features Built

<table>
  <tr>
    <td><img src="https://img.shields.io/badge/API-Express-000000?style=flat-square" alt="API"></td>
    <td>RBAC-secured investigation routes with SSE progress streaming</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Pipeline-Ingestion-1A1A2E?style=flat-square" alt="Pipeline"></td>
    <td>Evidence upload with ingestion job payloads and orchestrator</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/UI-Next.js-000000?style=flat-square" alt="UI"></td>
    <td>Dark investigative theme, file upload, evidence review, investigation detail</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Graph-vis.js-E63946?style=flat-square" alt="Graph"></td>
    <td>Network graph shell for temporal graph visualization</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Contracts-Zod-389826?style=flat-square" alt="Contracts"></td>
    <td>Shared validation schemas across all packages</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Temporal-Graph_Versioning-00D4AA?style=flat-square" alt="Temporal"></td>
    <td>Temporal history store, interval reconstruction, and graph versioning with historical projection</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Workspace-Five--Zone-00D4AA?style=flat-square" alt="Workspace"></td>
    <td>Investigative workspace: five-zone shell (graph, context, temporal, intelligence) over a DEMO/LIVE provider seam with AUTO capability resolution</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Representations-Pulse__Matrix__Flow-6A5ACD?style=flat-square" alt="Representations"></td>
    <td>Representation-aware Zone 2: entity pulse, relationship matrix, and adaptive flow — one shared temporal controller</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Reverse_Hypothesis-Deterministic-00D4AA?style=flat-square" alt="Reverse Hypothesis"></td>
    <td>Deterministic reverse hypothesis mode added beside the preserved pipeline — classifies saved observations as supporting / contradicting / unresolved with reasons; no scores or AI verdicts</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/Relation-Pulse_Authority-1A1A2E?style=flat-square" alt="Relation authority"></td>
    <td>Relation authority (accept/reject), contradiction-backed deep-dive bridges, temporal versions and activity feed replay</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/UX-A11y__Theme-FF6B35?style=flat-square" alt="UX"></td>
    <td>Cinematic semantic color language, reduced-motion support, roving-tab keyboard semantics, deep links, and panel error boundaries</td>
  </tr>
  <tr>
    <td><img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square" alt="CI"></td>
    <td>Build, typecheck, test on every push</td>
  </tr>
</table>

### Investigative Workspace (packages/web)

The web frontend is an investigative workspace over a DEMO / LIVE / AUTO provider seam. Every surface renders from the provider seam. In DEMO mode the provider serves curated demo fixtures (deterministic, covered by `vitest` suites); in LIVE mode it renders authoritative data from the platform API. The seam itself never fabricates data — it selects between demo fixtures and live data, and never injects ad-hoc values at render time. Feature-scoped reports live in `docs/reports/`.

| PR | Surface | Scope |
|---|---|---|
| PR-1 | Workspace navigation dock | Every workspace destination rendered as a link from the provider-backed nav model |
| PR-2 | Graph control center (shell) | Five-zone layout (rail, graph workspace, contextual panel, bottom band, temporal), side-panel collapse/reopen, layered & legend surfaces, roving-tab keyboard semantics |
| PR-3 | Investigative context bridge | Graph → context selection resolves the intelligence Overview, gap/hypothesis context, timeline evidence, node Focus, and `?focus=` deep links; legacy drawer preserved for standalone rendering |
| PR-4 | Operational rail | Action model with real commands (Focus, Detect Gaps, Cross-Case, Filter) and capability-aware disabled stubs; surface exclusivity without faking un-wired commands |
| PR-5 | Interwoven investigative intelligence | Overview / Hypotheses / Signals / Evidence / Activity tabs with grounded counts, entity-filtered re-materialization, and memory-bank activity replay that never duplicates |
| F-PR5 | Provider boundary + AUTO | Capability-level DEMO / LIVE / AUTO resolution, shared workspace-temporal state across sub-routes, two-way URL state |
| PR-6 | Living graph visual language | Six node states / six edge states with semantic posture, band, temporal, role and attention; attention convergence regions, filter honesty (model never polluted), foreign-vs-local scoping, reduced-motion support |
| F-PR6 | Entity pulse representation | Representation-aware Zone 2: multi-entity pulse panel + corrective pass adapting the five-zone shell per representation with one shared `timeRange` controller |
| PR-7 | Temporal activity & version context | Versions panel with an authority gate (Return to current), activity-feed replay via a memory bank, shared temporal workspace across sub-routes |
| F-PR7 | Cross-case relationship matrix | Symmetric matrix grid with summary and active-cell inventory, provider-driven |
| PR-8 | Relation authority & deep-dive | Accept / Reject relation authority (no Reverse), contradiction-backed deep-dive bridges, operational Challenge seam |
| F-PR8 | Adaptive flow representation | Deterministic demo chain in Zone 2 (SELECT ≠ FOCUS), Open-in-Graph handoff to the graph representation |
| PR-9 | Cinematic theme refinement | Semantic color language (restrained rose, contradiction red), attention-driven canvas states, reduced-motion collapse, one state per element at scale |
| PR-10 | Reliability & accessibility | One tab stop per node, unambiguous labeled controls, `?focus=` deep links, panel error boundaries, single-subscription realtime lifecycle, no double-submit mutations, large-graph visual-state derivations, simulation stability |
| F-PR9 | Reverse hypothesis engine | Deterministic reverse-test mode **added beside the preserved pipeline** on `/investigations/[id]/hypothesis` — classifies saved observations as supporting / contradicting / unresolved with reasons, records a session decision trail; no scores, probabilities, or AI verdicts |

Additional workspace routes implemented for the investigation lifecycle: `/investigations/[id]` (detail), `evidence`, `observations`, `graph`, `hypothesis`, `cross-case`, `gaps`, `leads`, `timeline`, `judge`, `ledger`, `review`, `robustness`, plus a case-list dashboard and New Investigation flow.

### Getting Started

```bash
pnpm install          # install all dependencies
pnpm typecheck        # run type checks across packages
pnpm test             # run test suites
pnpm build            # build all packages
```

---

<div align="center">

### Protected / Informant Sources — Future Scope

Informant handling is outside P0. The architecture reserves a source-protection boundary because protected sources require distinct reliability, corroboration, dissemination, and access controls.

- Protected-source identifier separated from analyst-visible identity
- Need-to-know access policy
- Reliability and corroboration metadata separated from source identity
- Audit access without exposing protected identity in ordinary reasoning views
- No informant-specific demo data

<br>

---

<img src="https://img.shields.io/badge/Built_by-NERIS--v-FF6B35?style=for-the-badge&labelColor=0D1117" alt="Built by NERIS-v"> <img src="https://img.shields.io/badge/Architecture-v7.0-00D4AA?style=for-the-badge&labelColor=0D1117" alt="Architecture v7.0"> <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&labelColor=0D1117" alt="MIT License">

*INDAGO does not decide who is guilty. It shows the investigator what the evidence supports, what could be wrong, what is missing, and what to verify next.*

</div>
