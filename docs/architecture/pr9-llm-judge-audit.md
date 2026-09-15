# PR9 LLM Judge — Repository Grounded Audit

> **Status:** AUDIT ONLY — NOT COMMITTED / NOT PUSHED
> **Branch:** `feat/m-a13-graph-hole-region`
> **Date:** 2026-09-14

## Production Hardening (5A-PR9) — 2026-09-15

**Supersession notice:** this audit's v1 stance that the verdict is the sole
deterministic signal — and the §C3 "no thresholds in the judge" design decision —
is **superseded for acceptance decisions** by the deterministic **v2 acceptance
gate** (`GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION = 'v2'`, implemented in
`packages/intelligence/graph-hole-judge`). The v1 decision-policy version stays
frozen and untouched (`GRAPH_HOLE_DECISION_POLICY_VERSION = 'v1'`).

**Authority model (unchanged):** The LLM is a **proposer** of a structured
quality assessment. The deterministic PR9 policy is the **decider** of whether
that assessment is **sufficient for acceptance**. A model `verdict = ACCEPT`
is never sufficient alone.

**The v2 acceptance gate (deterministic conjunction — all must hold):**
1. PR8 valid (`validationValid === true`; any ERROR gates before the judge)
2. Candidate qualified (`candidate.qualified === true`)
3. All six canonical dimensions present, one each, no unknown names, every score
   finite and in `[0,1]`
4. Hard floors (`HARD_FLOOR`): `EVIDENCE_GROUNDING ≥ 0.70`,
   `EPISTEMIC_DISCIPLINE ≥ 0.90`, `UNCERTAINTY_CALIBRATION ≥ 0.70`
5. Quality floors (`QUALITY_FLOOR`): `REASONING_COHERENCE ≥ 0.60`,
   `GAP_ASSESSMENT_QUALITY ≥ 0.60`, `ALTERNATIVE_COVERAGE ≥ 0.60`
6. Feature-computed overall score `Σ(score × weight) ≥ 0.70`
   (`OVERALL_MIN_SCORE`, compared with fixed `OVERALL_MIN_SCORE_EPSILON = 1e-9`)
   [`DIMENSION_WEIGHT`: EG 0.25, RC 0.15, ED 0.20, UC 0.15, GQ 0.15, AC 0.10;
   sums to exactly 1.00]
7. `verdict === 'ACCEPT'`

The overall score is **feature-computed** — the model never supplies an
aggregate; no model-supplied `overallScore`/`acceptanceScore`/`finalScore`/
`confidenceOfAcceptance` is ever trusted (the schema carries none). Any failing
conjunct → final **NON_ACCEPTING** with closed, machine-readable reason(s) from
`JUDGE_FAILURE_REASON` (14 codes: 12 canonical + `JUDGE_DIMENSION_UNKNOWN` +
`JUDGE_DIMENSION_INVALID_SCORE`). The judge result is never mutated. Adjudication
carries the evaluation in `GraphHoleDecisionResolution.evaluation` and gates the
v1 transition table on it. The PR8 gate (Case C) still short-circuits **before**
the LLM call; WARNING-only runs still invoke the judge (contradiction policy
unchanged).

## Trust Boundary

```
DETERMINISTIC REGION → STRUCTURE → QUALIFICATION
→ AI ANALYST (PR7) → DETERMINISTIC VALIDATION (PR8)
→ AI JUDGE (PR9) → DETERMINISTIC DECISION → HUMAN REVIEW
```

The judge receives: the PR7 analysis result, the PR8 validation verdict, the qualified candidate, and the bounded context summary. The judge produces: a structured accept/reject verdict with scored dimensions and a rationale. The judge **cannot** introduce evidence, mutate the graph, persist records, or override a PR8 ERROR.

---

## Section A — Existing Reusable Contracts

### A1 PR7 Analyst Output

| Contract | Source File | Purpose | Producer | Consumer | Mutable? | Persisted? | Versioned? |
|---|---|---|---|---|---|---|---|
| `GraphHoleAnalysisV1` | `graph-hole-analysis/src/contracts/analysis-v1.ts:276` | Structured analysis of one candidate over a bounded context | PR7 analyst (LLM + feature stamping) | PR8 validator, PR9 judge | No | No | Yes (`graph-hole-analysis-v1`) |
| `GraphHoleAnalysisV1Schema` | `graph-hole-analysis/src/contracts/analysis-v1.ts:276` | Zod strict schema for the analysis output; unknown fields rejected | PR7 | PR8, PR9, tests | No | No | Yes |
| `GraphHoleAnalysisResult` | `graph-hole-analysis/src/contracts/analysis-result.ts:50` | Full stamped result: analysis + identity fields + contextSha256 + execution metadata | PR7 | PR8, PR9 | No | No | Yes |
| `GraphHoleAnalysisExecution` | `graph-hole-analysis/src/contracts/analysis-result.ts:32` | Safe execution metadata (requestId, provider, model, latencyMs, retryCount, finishReason, token counts) | PR7 (maps from `LLMExecutionMetadata`) | PR9 judge grounding | No | No | Yes |
| `CandidateAssessment` enum | `analysis-v1.ts:81` | Epistemic assessment enum: `STRUCTURALLY_PLAUSIBLE \| WEAKLY_SUPPORTED \| CONTRADICTED \| INSUFFICIENT_EVIDENCE \| INSUFFICIENT_CONTEXT` | PR7 model | PR8, PR9 | No | No | Yes |
| `MissingRelationshipAssessment` enum | `analysis-v1.ts:101` | Gap consistency: `CONSISTENT_WITH_GAP \| AMBIGUOUS \| CONTRADICTS_GAP \| INSUFFICIENT_EVIDENCE` | PR7 model | PR8, PR9 | No | No | Yes |
| `UncertaintyRating` enum | `analysis-v1.ts:141` | Overall uncertainty: `LOW \| MEDIUM \| HIGH \| CRITICAL` | PR7 model | PR9 judge | No | No | Yes |
| `AnalysisWarningCode` enum | `analysis-v1.ts:153` | Closed warning vocabulary (7 codes) | PR7 model | PR8, PR9 | No | No | Yes |
| `ReasoningStep` | `analysis-v1.ts:217` | Atomized reasoning with explicit reference grounding (kind, statement, observation/hypothesis refs) | PR7 model | PR9 judge | No | No | Yes |
| `AlternativeExplanation` | `analysis-v1.ts:200` | Competing interpretations with uncertainty [0,1] | PR7 model | PR9 judge | No | No | Yes |
| `ReasoningStepKind` enum | `analysis-v1.ts:127` | `OBSERVED_FACT \| HYPOTHESIS \| CONTRADICTION \| STRUCTURAL_SIGNAL \| TEMPORAL \| INFERENCE` | PR7 model | PR8, PR9 | No | No | Yes |

**Key design fact:** `GraphHoleAnalysisV1Schema` is `.strict()` — any field the judge needs is already in the schema. The judge must NOT assume additional fields beyond the frozen schema.

### A2 PR7 Context & Policy

| Contract | Source File | Purpose | Producer | Consumer | Versioned? |
|---|---|---|---|---|---|
| `GraphHoleAnalysisInput` | `graph-hole-analysis/src/contracts/analysis-input.ts` | Caller-assembled input to `analyzeGraphHole` (candidate + context + temporalScope) | PR7 caller | PR7 | Yes |
| `GraphHoleAnalysisContext` | `graph-hole-analysis/src/context/types.ts` | Deterministic bounded context (candidate, observations, hypotheses, groups, structuralSignals, contradictions, provenance, completeness) | PR7 `buildGraphHoleAnalysisContext` | PR7, PR8, PR9 | Yes |
| `GRAPH_HOLE_ANALYSIS_POLICY_VERSION` = `'v1'` | `analysis-policy.ts:41` | Analyst semantics version | PR7 | PR8, PR9, audits | — |
| `GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION` = `'graph-hole-analysis-v1'` | `analysis-policy.ts:45` | Output schema identity | PR7 | PR8, PR9 | — |
| `GRAPH_HOLE_ANALYSIS_PROMPT_VERSION` = `'graph-hole-analysis-v1'` | `analysis-policy.ts:49` | System prompt identity | PR7 | audits | — |
| `DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS` | `analysis-policy.ts:75` | Frozen context bounds: maxObservations, maxHypotheses, maxNodes, maxEdges, maxSerializedContextChars | PR7 | PR8, PR9 | Yes (policy version) |
| `GraphHoleAnalysisError` | `errors/analysis-error.ts:38` | Feature-level typed failures (INPUT_AUTHORITY_MISMATCH, CONTEXT_TOO_LARGE, etc.) | PR7 | PR7 caller | No |
| `canonicalStringify` | `context/serialize.js` | Canonical serializer (context binding reconstruction: zero counts.serializedContextChars) | PR7 | PR8 | — |

### A3 PR8 Validation Output

| Contract | Source File | Purpose | Producer | Consumer | Mutable? | Persisted? | Versioned? |
|---|---|---|---|---|---|---|---|
| `ValidatedGraphHoleAnalysis` | `graph-hole-validation/src/types.ts:95` | Deterministic validation result: valid + findings + summary | PR8 | PR9 judge, orchestrator | No | No | No (frozen types) |
| `valid` boolean | `types.ts:90` | `errorCount === 0` — the hard accept/reject gate | PR8 | PR9 | No | No | — |
| `ValidationFinding` | `types.ts:69` | One deterministic finding: code, severity, path, referenceId?, message | PR8 | PR9 | No | No | — |
| `ValidationFindingCode` (11 codes) | `types.ts:23` | Frozen codes: INVALID_ANALYSIS_REFERENCE, IDENTITY_MISMATCH, CONTEXT_DIGEST_MISMATCH, CONTEXT_BINDING_MISMATCH, TEMPORAL_CONTRADICTION, GRAPH_INCONSISTENCY, EVIDENCE_CLASSIFICATION_MISMATCH, PROVENANCE_MISMATCH, FORBIDDEN_EPISTEMIC_CLAIM, COMPLETENESS_OVERCLAIM, CONTRADICTION_IGNORED | PR8 | PR9 | No | No | — |
| `ValidationSeverity` = `'ERROR' \| 'WARNING'` | `types.ts:59` | ERROR = must not proceed; WARNING = retainable limitation | PR8 | PR9 | No | No | — |
| `ValidationSummary` | `types.ts:81` | errorCount, warningCount, checkedCategories (=15) | PR8 | PR9 | No | No | — |

**Frozen severity matrix (PR8 types.ts:45–57):**
- ERROR: INVALID_ANALYSIS_REFERENCE, IDENTITY_MISMATCH, CONTEXT_DIGEST_MISMATCH, CONTEXT_BINDING_MISMATCH, TEMPORAL_CONTRADICTION, GRAPH_INCONSISTENCY, FORBIDDEN_EPISTEMIC_CLAIM, COMPLETENESS_OVERCLAIM, PROVENANCE_MISMATCH (context-inconsistent)
- WARNING: EVIDENCE_CLASSIFICATION_MISMATCH, PROVENANCE_MISMATCH (missing source), CONTRADICTION_IGNORED

**Judge must respect:** `valid === false` (any ERROR present) → judge verdict MUST NOT be ACCEPT. `valid === true` + warnings → judge may accept or reject based on LLM grounding assessment.

### A4 AI Runtime Infrastructure

| Contract | Source File | Purpose | Producer | Consumer | Mutable? | Persisted? | Versioned? |
|---|---|---|---|---|---|---|---|
| `createAiRuntime` | `ai-agent-runtime/src/core/runtime.ts:256` | Factory: `createAiRuntime(config?, {onEvent?, provider?})` → `AiRuntime` | Runtime | PR9 judge | No | No | — |
| `AiRuntime.generateStructured<T>` | `runtime.ts:235` | Provider-native structured output: converts zod → JSON Schema → provider-native enforcement → parse → validate | Runtime | PR9 judge | No | No | — |
| `AI_RUNTIME_POLICY` | `config/types.ts:49` | `{ policyVersion: 'v2', budgets: DEFAULT_AI_BUDGETS }` | Runtime | PR9 judge execution metadata | No | No | Yes (`v2`) |
| `DEFAULT_AI_BUDGETS` | `budgets/limits.ts:34` | maxInputChars=120k, maxOutputTokens=8192, maxRequestMessages=32, timeoutMs=60k, maxRetries=2, maxSchemaBytes=50k | Runtime | PR9 judge | No | No | — |
| `AiRuntimeError` | `errors/ai-runtime-error.js` | Typed runtime errors (UNSUPPORTED_CAPABILITY, RATE_LIMITED, REQUEST_TIMEOUT, RETRY_EXHAUSTED, etc.) | Runtime | PR9 judge | No | No | — |
| `TRANSIENT_AI_RUNTIME_ERROR_CODES` | `reliability/classification.ts` | Transient error code set for retry classification | Runtime | PR9 judge error handling | No | No | — |
| `convertSchemaDocument` | `structured-output/schema.ts` | Zod → provider-native JSON Schema (MAX_SCHEMA_DEPTH=64, maxSchemaBytes from budgets) | Runtime | PR9 judge | No | No | — |
| `LLMExecutionMetadata` | `metadata/execution.ts` | Safe execution metadata (requestId, provider, model, latencyMs, retryCount, finishReason, token counts) | Runtime | PR7/PR9 execution envelope | No | No | Yes |

**Key design fact:** The judge uses `generateStructured` (not `generate`), receiving a zod schema that the provider enforces natively. No fallback to JSON-mode hints. The judge schema must stay within the provider subset: no top-level unions, no `$ref`, no `pattern`/`minLength`/`maxLength` on strings.

### A5 Qualification & Detection Input

| Contract | Source File | Purpose | Producer | Consumer | Mutable? | Persisted? | Versioned? |
|---|---|---|---|---|---|---|---|
| `QualifiedGraphHoleCandidate` | `graph-hole-qualification.ts:117` | Qualified candidate: rawCandidate + scores (structuralScore, evidenceSupportScore, expectedInformationValue, significance) + failureReasons + regionStatus + scoringPolicyVersion | PR5 | PR7, PR9 | No | No | Yes (`scoringPolicyVersion`) |
| `RawGraphHoleCandidate` | `graph-hole-detection.ts` (contract) | Raw detected candidate: identity + analysis metadata (independentSupportUnits, structuralComponents, scores, detectionPolicyVersion) | PR4 | PR5, PR7, PR9 | No | No | Yes |
| `GraphHoleCandidateIdentityV1` | `graph-hole-candidate.ts:54` | Candidate identity: caseId, graphVersionId, holeType, canonicalNodeIds, expectedRelationshipType?, temporalScope?, detectionPolicyVersion | PR4 | PR5, PR7, PR9 | No | No | Yes (`detectionPolicyVersion`) |
| `GraphHoleCandidateAnalysis` | `graph-hole-candidate.ts:116` | Candidate analysis metadata: candidateId, regionStatus, independentSupportUnits, scores, structuralComponents, detectionPolicyVersion | PR4 | PR5, PR7, PR9 | No | No | Yes |
| `RegionStatus` = `SATURATED \| LIMITED \| DEGRADED` | `graph-hole-region.ts:37` | Region analysis status with precedence: DEGRADED > LIMITED > SATURATED | PR1 | PR4, PR5, PR7, PR9 | No | No | — |

### A6 Persistence Status Vocabulary

| Contract | Source File | Purpose | Producer | Consumer | Mutable? | Persisted? | Versioned? |
|---|---|---|---|---|---|---|---|
| `GraphHolePersistenceStatus` = `ACTIVE \| SUPERSEDED \| REJECTED \| RESOLVED` | `graph-hole-persistence.ts:28` | Intelligence assessment state (NOT a workflow lifecycle) | PR6 | PR9 orchestrator | No | Yes | No |
| `GraphHoleAssessmentType` enum | `graph-hole-persistence.ts:70` | Assessment event kind: QUALIFICATION, REASSESSMENT, SUPERSESSION, REJECTION, REVIVAL, RESOLUTION | PR6 | PR9 orchestrator | No | Yes | No |
| `GRAPH_HOLE_STATUS_TRANSITIONS` | `graph-hole-persistence.ts:49` | Legal state transitions (ACTIVE→SUPERSEDED/REJECTED/RESOLVED; REJECTED→ACTIVE; SUPERSEDED/RESOLVED=terminal) | PR6 | PR9 orchestrator | No | Yes | — |
| `canTransitionGraphHoleStatus` | `graph-hole-persistence.ts:59` | Deterministic transition guard | PR6 | PR9 orchestrator | No | No | — |

**Key design fact:** The judge verdict maps to persistence status transitions, not to autonomous state changes. The judge verdict is an INPUT to the orchestrator, which calls `canTransitionGraphHoleStatus` before persisting.

### A7 Graph-Hole Region & Detection Input

| Contract | Source File | Purpose | Producer | Consumer |
|---|---|---|---|---|
| `GraphHoleRegion` | `graph-hole-region/src/types.ts:176` | Bounded candidate-region: regionId, identity, status, truncated, nodeIds, edgeIds, seedObservationIds, limitations, expansionRounds | PR1 | PR4, PR7, PR8 |
| `GraphHoleDetectionResult` | `graph-hole-detection/src/types.ts:130` | Raw candidates + region + summary | PR4 | PR5, PR7 |
| `GraphHoleDetectionSummary` | `types.ts:112` | Detection accounting: hypothesisContext counts, per-detector summaries, duplicateSuppressions, regionTruncated | PR4 | PR7, PR9 |

### A8 Existing Agent Contracts (Reference Only)

| Contract | Source File | Purpose | Notes |
|---|---|---|---|
| `AgentDecisionSchema` | `contracts/src/agent/agent-decisions.ts:32` | Generic agent decision (investigationId, runId, type, decision string, rationale, confidence) | PR9 must NOT reuse — this is the Phase-4 agent decision shape, not a graph-hole judge verdict |
| `IntelligenceResultSchema` | `contracts/src/intelligence/intelligence-results.ts:32` | Aggregated intelligence results (investigationId, type, confidence, summary, keyFindings) | PR9 may reference for orchestration but not for judge output |
| `RouteStageResponseSchema` | `contracts/src/intelligence/route-stage.ts:53` | Next-route recommendation | PR9 does not own route selection |

---

## Section B — Authority Boundaries

### B1 PR7 Analyst Authority

**Owns:** AI analyst prompt, context construction (`buildGraphHoleAnalysisContext`), analysis output schema (`GraphHoleAnalysisV1Schema`), analysis execution envelope (`GraphHoleAnalysisResult`).

**Cannot:**
- Persist any graph-hole records (PR6 owns persistence)
- Modify candidate qualification scores (PR5 owns scores)
- Override PR8 validation findings
- Access the database, graph, or any tool beyond the AI runtime
- Change region/detection policy versions

**Produces for PR9:** `GraphHoleAnalysisResult` (analysis + stamped identity + contextSha256 + execution metadata). This is the primary judge input.

### B2 PR8 Validator Authority

**Owns:** Deterministic validation of PR7 output against PR7 context + serializedContext. Finding codes, severity matrix, `valid` semantics, 15 checked categories.

**Cannot:**
- Accept or reject a candidate (no decision concept)
- Mutate the analysis, context, or candidate
- Introduce external evidence or knowledge
- Persist validation results (orchestrator persists)
- Access the database, graph, LLM, or any I/O

**Produces for PR9:** `ValidatedGraphHoleAnalysis` (valid boolean + sorted findings + summary). The `valid` field is a hard gate: `valid === false` → judge verdict MUST NOT be ACCEPT.

### B3 PR9 Judge Authority

**Owns:** LLM-based accept/reject judgment of one validated analysis over one qualified candidate. Judge prompt, judge input assembly, judge output schema (`GraphHoleJudgeResult`), judge dimensions/scoring, decision-state semantics.

**Cannot:**
- **Introduce evidence** not present in the supplied PR7 analysis result, PR8 validation findings, or qualified candidate — the judge is a pure assessor, not an investigator
- **Mutate the graph** — no entity/relation/edge creation or modification
- **Persist records** — persistence is orchestrated by the caller
- **Override a PR8 ERROR** — if any ERROR finding exists, `valid === false`, and the judge MUST NOT produce verdict = ACCEPT
- **Access the database, semantic retrieval, tools, or any I/O** beyond the AI runtime
- **Bypass the trust boundary** — the judge sits between PR8 deterministic validation and deterministic decision-state computation; it is the ONLY LLM call between validation and human review
- **Claim criminality, intent, guilt, or wrongdoing** — the PR7 `FORBIDDEN_EPISTEMIC_CLAIM` check (PR8) must pass; the judge inherits this constraint

**Produces for orchestrator:** `GraphHoleJudgeResult` (verdict + dimensions + rationale + judgeVersion). The orchestrator maps this to a deterministic decision-state transition and persists the assessment.

### B4 Deterministic Decision-State Authority (PR9 Orchestrator)

**Owns:** Mapping judge verdict → `GraphHolePersistenceStatus` transition. Transition legality checked via `canTransitionGraphHoleStatus`. Decision-state is pure/versioned/testable.

**Cannot:**
- Modify the judge verdict
- Introduce additional LLM calls
- Bypass transition legality

**Decision-state rules (deterministic, v2-hardened):**
- Judge verdict `ACCEPT` **+ v2 gate passes** + `valid === true` → `ACTIVE` (if current status is not already ACTIVE); gate failure → deterministic NON_ACCEPTING no-op
- Judge verdict `ACCEPT` + `valid === false` → logic error (invariant: judge must not produce ACCEPT when valid=false; PR8 gate short-circuits before the LLM)
- Judge verdict `NON_ACCEPTING` + current `ACTIVE` → **no status change** (v1 expected `REJECTED` is NOT auto-applied — rejection is human-enterable only; documented change from the provisional audit)
- Judge verdict anything else → the orchestrator preserves the current status and records the judge assessment

### B5 Canonical Graph Authority

**Owns:** All node IDs, edge IDs, entity IDs, hypothesis derivedIds, observation IDs, candidate IDs, region IDs. The judge consumes these as opaque strings. The judge does not resolve, create, or modify any canonical identifier.

---

## Section C — Missing Contracts

Each contract is classified as:
- **EXISTS** — contract already exists in the codebase and can be directly reused
- **DERIVABLE** — the contract can be built from existing frozen contracts with a deterministic mapping (no invention)
- **MISSING** — no existing contract; must be designed and frozen before implementation
- **AMBIGUOUS** — existing contracts provide partial guidance but the exact shape is unclear
- **CONFLICTING** — existing contracts appear to conflict or overlap and must be reconciled
- **DEFERRED** — the contract is real but should be designed later (not a V1 gate)

### C1 Judge Input Contract — DERIVABLE

**Status:** DERIVABLE

**Derivation:**
The judge input is a strict composition of existing frozen contracts:
- `GraphHoleAnalysisResult` (PR7) — the analysis + stamped identity + execution metadata
- `ValidatedGraphHoleAnalysis` (PR8) — valid boolean + findings + summary
- `QualifiedGraphHoleCandidate` (PR5) — raw candidate + qualification scores + failureReasons + regionStatus
- `GraphHoleAnalysisContext` counts/completeness summary (PR7) — what the model saw (bounded summary, NOT the full context)

**No invention needed.** The judge input schema wraps these existing types with a strict envelope. The orchestrator assembles this from existing pipeline outputs.

**Shape (derivation):**
```typescript
GraphHoleJudgeInput = {
  candidate: QualifiedGraphHoleCandidate;
  analysis: GraphHoleAnalysisResult;
  validation: ValidatedGraphHoleAnalysis;
  contextSummary: {
    caseId: string;
    graphVersionId: string;
    regionId: string;
    observationCount: number;
    hypothesisCount: number;
    groupCount: number;
    structuralSignalCount: number;
    completeness: GraphHoleAnalysisContext['completeness'];
  };
}
```

### C2 Judge Output / Verdict Contract — MISSING

**Status:** MISSING

**What exists:** Nothing. PR7 has no decision concept. PR8 `ValidatedGraphHoleAnalysis` has no verdict.

**Required for PR9 V1:**
A strict, versioned `GraphHoleJudgeResult` schema:

```typescript
GraphHoleJudgeVerdict = 'ACCEPT' | 'NON_ACCEPTING';
// ACCEPT = the analysis is well-grounded, the candidate assessment is supported,
//          and no PR8 ERROR is present. The candidate may proceed to ACTIVE status.
// NON_ACCEPTING = the judge does not ground the analysis sufficiently.
//                  The candidate must not proceed to ACTIVE without human review.

GraphHoleJudgeResult = {
  verdict: GraphHoleJudgeVerdict;
  dimensions: GraphHoleJudgeDimension[];
  rationale: string;
  judgeVersion: string;       // e.g. 'graph-hole-judge-v1'
  judgePolicyVersion: string; // e.g. 'v1'
  execution: GraphHoleJudgeExecution; // safe metadata, mirrors PR7 pattern
};
```

**Hard invariant:** `verdict === 'ACCEPT'` requires `validation.valid === true` (no ERROR findings). If `valid === false`, the orchestrator MUST NOT pass the judge result through as ACCEPT (the judge itself must also enforce this, but the orchestrator is the safety net).

**Design decision:** The verdict is a boolean-like enum (two values), not a spectrum. The dimensions array carries the nuance. This keeps the deterministic decision-state simple.

### C3 Judge Dimension / Scoring Contract — MISSING

**Status:** MISSING

**Required for PR9 V1:**
Closed vocabulary of scoring dimensions, each with a [0,1] score and a rationale string:

```typescript
GraphHoleJudgeDimension = {
  dimension: GraphHoleJudgeDimensionName;
  score: number; // [0, 1]
  rationale: string;
};

GraphHoleJudgeDimensionName =
  | 'EVIDENCE_GROUNDING'      // Are the cited observations/hypotheses present and relevant?
  | 'REASONING_COHERENCE'     // Do the reasoning steps logically follow from the evidence?
  | 'EPISTEMIC_DISCIPLINE'    // Does the analysis stay within epistemic bounds (no forbidden claims)?
  | 'UNCERTAINTY_CALIBRATION' // Is the stated uncertainty appropriate given the evidence?
  | 'GAP_ASSESSMENT_QUALITY'  // Is the candidateAssessment/missingRelationship assessment grounded?
  | 'ALTERNATIVE_COVERAGE';   // Are competing explanations considered where evidence is ambiguous?
```

**Design decision (v1, superseded for acceptance by the v2 gate / 5A-PR9):** Each
dimension is scored independently by the model; the model itself computes no
weighted aggregate — the verdict it returns is its categorical proposal.
**5A-PR9 production hardening:** the deterministic v2 gate supersedes this v1
stance *for acceptance decisions*. The judge's verdict + dimensions are the
LLM's *proposal*; the deterministic policy feature-computes the weighted
aggregate it uses as the overall-score floor and re-enforces hard/quality
floors over every dimension. This preserves the transparency intent (nothing
hidden in the model) while removing the trust in the model's categorical call.

**Why no thresholds computed in the judge:** The model's verdict remains an
LLM-assessed categorical proposal — the model is never asked to derive
thresholds. The dimensions are the input to the deterministic acceptance gate,
which applies the frozen floors feature-side. Thresholds now live in the
deterministic region (`src/judgement/evaluate-judge-decision.ts`), not in the
prompt, and are fully regression-tested.

### C4 Judge Execution Metadata Contract — DERIVABLE

**Status:** DERIVABLE

**Derivation:** Same pattern as PR7 `GraphHoleAnalysisExecution`:
```typescript
GraphHoleJudgeExecution = {
  requestId: string;
  provider: string;
  model: string;
  modelVersion?: string;
  runtimePolicyVersion: string; // AI_RUNTIME_POLICY.policyVersion ('v2')
  judgePromptVersion: string;   // version of the judge system prompt
  judgePolicyVersion: string;   // judge semantics version
  latencyMs: number;
  retryCount: number;
  finishReason: LLMFinishReason;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
```

Maps directly from `LLMExecutionMetadata` via the same `toGraphHoleAnalysisExecution` pattern. No invention.

### C5 Judge Version / Policy Stamps — DERIVABLE

**Status:** DERIVABLE

**Derivation:** Follows the PR7 versioning pattern exactly:
- `GRAPH_HOLE_JUDGE_POLICY_VERSION = 'v1'` — judge semantics version (what the verdict + dimensions mean)
- `GRAPH_HOLE_JUDGE_PROMPT_VERSION = 'graph-hole-judge-v1'` — system prompt identity
- `GRAPH_HOLE_JUDGE_SCHEMA_VERSION = 'graph-hole-judge-v1'` — output schema version

### C6 Decision-State Mapping (Judge → Persistence) — DERIVABLE

**Status:** DERIVABLE

**Derivation from existing contracts:**
The mapping is deterministic and uses `GraphHolePersistenceStatus` (PR6) + `canTransitionGraphHoleStatus`. **Safe-failure default: a NON_ACCEPTING verdict never auto-changes the persisted status** — consequential state transitions are reserved for human review (trust boundary). This refines the provisional C6 table: the judge filters and records, the decision-state only ever promotes (or refuses to promote) a candidate.

The mapping below is the **v1 transition table frozen in the original
implementation**. Under decision-policy **v2** (5A-PR9 hardening) every `ACCEPT`
row additionally requires the deterministic dimension gate to pass
(all six dimensions present/known/finite, hard floors, quality floors,
feature-computed overall ≥ 0.70); a failing gate resolves to the same
non-accepting no-op row as NON_ACCEPTING. This keeps the v1 table intact while
making `ACCEPT` alone insufficient.

| Judge Verdict | `validation.valid` | Current Status | Next Status | Assessment Type | Notes |
|---|---|---|---|---|---|
| (no judgment yet) | any | anything incl. `null` | unchanged | — | no-op |
| ACCEPT (+ v2 gate passes) | true | `null` (never persisted) | `ACTIVE` | QUALIFICATION | initial persist |
| ACCEPT (+ v2 gate passes) | true | `REJECTED` | `ACTIVE` (legal via `REJECTED → ACTIVE`) | REVIVAL | revive |
| ACCEPT (+ v2 gate passes) | true | `ACTIVE` | `ACTIVE` (no state change) | REASSESSMENT | append-only snapshot |
| ACCEPT (+ v2 gate passes) | true | `SUPERSEDED` | `SUPERSEDED` (terminal) | — | illegal transition → invariant violation recorded, no persist |
| ACCEPT (+ v2 gate passes) | true | `RESOLVED` | `RESOLVED` (terminal) | — | illegal transition → invariant violation recorded, no persist |
| ACCEPT + **v2 gate fails** (any dimension floor / overall) | true | any | unchanged | — | deterministic NON_ACCEPTING, machine-readable failureReasons, no persist |
| ACCEPT | **false** | any | unchanged | — | invariant violation (judge must never ACCEPT an invalid analysis) — safety net, no persist; PR8 gate normally prevents this |
| NON_ACCEPTING | any | anything incl. `null` | unchanged | — | safe default: never auto-reject; human review decides |

**No invention needed.** The orchestrator calls `canTransitionGraphHoleStatus(from, to)` before persisting. If the transition is illegal, the orchestrator records an invariant violation and does not persist. `REJECTED`, `SUPERSEDED`, and `RESOLVED` are never entered automatically by the judge — only a human-consequential action (owner of the Phase-4 Lead authority) enters or exits them, preserving the PR6 rule that consequential state stays owned by human authority.

### C7 Judge Failure Semantics — DERIVABLE

**Status:** DERIVABLE

**Derivation:**
- `AiRuntimeError` with transient code (RATE_LIMITED, REQUEST_TIMEOUT, RETRY_EXHAUSTED) → orchestrator retries or surfaces failure; candidate stays at current status (safe default = no status change)
- `AiRuntimeError` with non-transient code (UNSUPPORTED_CAPABILITY, INPUT_TOO_LARGE) → orchestrator surfaces failure; candidate stays at current status
- `GraphHoleAnalysisError` from judge input assembly → orchestrator surfaces failure; candidate stays at current status
- **Safe failure default:** when the judge cannot complete, the candidate does NOT advance. The candidate requires explicit human review.

### C8 Contradiction Handling by Judge — AMBIGUOUS

**Status:** AMBIGUOUS

**What exists:** PR7 `GraphHoleAnalysisV1` includes `contradictingObservationIds` and `alternativeExplanations`. PR8 `CONTRADICTION_IGNORED` (WARNING) flags when a relevant contradiction is unaddressed.

**Ambiguity:** How should the judge handle a valid analysis (no ERRORs) that has `CONTRADICTION_IGNORED` warnings? Options:
1. Judge may still ACCEPT — the WARNING indicates a known limitation, not a fatal flaw
2. Judge should NON_ACCEPTING — unresolved contradictions suggest the analysis is not fully grounded

**Recommendation for V1:** Option 1 (judge may ACCEPT with `CONTRADICTION_IGNORED` warnings) — the WARNING severity was chosen precisely because the analysis is retainable. The judge's `EVIDENCE_GROUNDING` dimension captures the nuance. The human reviewer sees the warnings in the audit trail.

### C9 Judge Persistence of Assessment Record — DEFERRED

**Status:** DEFERRED

**Notes:** The judge assessment record (GraphHoleJudgeResult) should be persisted alongside the GraphHoleAssessment row for audit trail purposes. However, the exact persistence schema (which Prisma model, which columns) is an implementation detail that depends on the Prisma migration strategy. This is deferred from V1 contract freeze — V1 stores the judge result as a JSON column on the assessment record.

### C10 Integration with Phase-4 AgentDecision — DEFERRED

**Status:** DEFERRED

**Notes:** `AgentDecisionSchema` (contracts/src/agent/agent-decisions.ts) records agent decisions during investigation execution. A graph-hole judge verdict could be surfaced as an `AgentDecision` of type `GAP_ADDRESSING`. However, this integration is outside PR9 scope and depends on Phase-4 orchestrator wiring. Deferred.

---

## Summary Table

| # | Contract | Status | Action Required for V1 |
|---|---|---|---|
| C1 | Judge Input | DERIVABLE | Compose from existing types; no invention |
| C2 | Judge Output / Verdict | **MISSING** | **Design + freeze `GraphHoleJudgeResult` schema** |
| C3 | Judge Dimensions | **MISSING** | **Design + freeze dimension vocabulary** |
| C4 | Judge Execution Metadata | DERIVABLE | Map from `LLMExecutionMetadata` (same as PR7 pattern) |
| C5 | Judge Version Stamps | DERIVABLE | Three constants, same pattern as PR7 |
| C6 | Decision-State Mapping | DERIVABLE | Deterministic mapping using `canTransitionGraphHoleStatus` |
| C7 | Judge Failure Semantics | DERIVABLE | Safe default = no status change; uses `AiRuntimeError` codes |
| C8 | Contradiction Handling | AMBIGUOUS | V1 decision: judge may ACCEPT with CONTRADICTION_IGNORED warnings |
| C9 | Judge Persistence | DEFERRED | JSON column on assessment record; implementation detail |
| C10 | Phase-4 Integration | DEFERRED | Outside PR9 scope |

**V1 gates (must be designed before implementation):** C2 (verdict), C3 (dimensions). Everything else is derivable from existing frozen contracts.

---

## Deterministic Decision-State Design (Preview)

The decision-state is pure, versioned, and testable:

```
GraphHoleDecisionState = {
  candidateId: string;
  currentStatus: GraphHolePersistenceStatus;
  judgeVerdict: GraphHoleJudgeVerdict | null;  // null = not yet judged
  lastJudgeVersion: string | null;
  lastAssessmentType: GraphHoleAssessmentType | null;
  updatedAt: string; // ISO timestamp, NOT part of identity
}
```

Transitions are guarded by `canTransitionGraphHoleStatus`. The judge verdict is an INPUT to the transition function, not the transition function itself. This keeps the decision logic deterministic and auditable.

---

## Authority Boundary Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ DETERMINISTIC REGION (PR1)                                   │
│ └─ GraphHoleRegion: regionId, identity, status, nodeIds...  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ DETERMINISTIC STRUCTURE (PR4)                                │
│ └─ RawGraphHoleCandidate: identity, structuralBasis, scores │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ DETERMINISTIC QUALIFICATION (PR5)                            │
│ └─ QualifiedGraphHoleCandidate: scores, failureReasons...   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ AI ANALYST (PR7) — LLM CALL #1                              │
│ └─ GraphHoleAnalysisResult: analysis + identity + execution │
│    NO persistence, NO graph mutation, NO tool access        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ DETERMINISTIC VALIDATION (PR8)                               │
│ └─ ValidatedGraphHoleAnalysis: valid + findings + summary   │
│    NO decision concept, NO mutation, pure + closed-world    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ AI JUDGE (PR9) — LLM CALL #2                                │
│ └─ GraphHoleJudgeResult: verdict + dimensions + rationale   │
│    NO evidence invention, NO graph mutation, NO persistence │
│    NO override of PR8 ERROR, NO tool access                 │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ DETERMINISTIC DECISION (PR9 orchestrator)                   │
│ └─ GraphHolePersistenceStatus transition                    │
│    Guarded by canTransitionGraphHoleStatus                  │
│    Safe failure default: no status change                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ HUMAN REVIEW                                                │
│ └─ Review task with full audit trail                        │
│    (region → detection → qualification → analysis →         │
│     validation → judge verdict + dimensions + rationale)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Section D — Pre-Implementation Test Matrix

Written BEFORE any PR9 implementation. The frozen contracts
(`@indago/graph-hole-judge`) are the subject under test. Each row is a test
case that MUST pass (or be explicitly waived with a recorded reason) before
PR9 lands.

### D1 Judge Output Contract (schema)

| # | Case | Expected |
|---|---|---|
| D1.1 | `GraphHoleJudgeV1Schema` parses minimal valid output `{verdict, dimensions:[1], rationale}` | parse ok |
| D1.2 | Unknown field rejected (zod strict) | parse fails |
| D1.3 | Verdict not in enum (`ACCEPT`/`NON_ACCEPTING`) | parse fails |
| D1.4 | Empty `dimensions` array | parse fails |
| D1.5 | Dimension name not in the 6-value vocabulary | parse fails |
| D1.6 | Dimension `score` outside [0,1] | parse fails |
| D1.7 | All 6 dimension names accepted; acronyms byte-stable | parse ok |
| D1.8 | `GraphHoleJudgeSchemaStampSchema` accepts only `schemaVersion='graph-hole-judge-v1'`, `judgeType='GraphHoleJudgeV1'` | parse ok / fails otherwise |

### D2 Judge Input & Authority (closed-world)

| # | Case | Expected |
|---|---|---|
| D2.1 | Input assembled from real PR5 `QualifiedGraphHoleCandidate` + PR7 `GraphHoleAnalysisResult` + PR8 `ValidatedGraphHoleAnalysis` fixtures | type-assignable, no invention |
| D2.2 | Authority mismatch: candidate/analysis disagree on caseId/graphVersionId/regionId/candidateId | judge refuses (typed error) |
| D2.3 | `contextSummary.completeness` populated from PR7 `ContextCompleteness` flags (no widened semantics) | matches source of truth |
| D2.4 | Judge input schema contains NO evidence/reference/context fields the judge could invent | static check |

### D3 Deterministic Decision-State (pure adjudication)

| # | Case | Expected |
|---|---|---|
| D3.1 | ACCEPT + valid + currentStatus null | ACTIVE / QUALIFICATION / transitionApplied=true |
| D3.2 | ACCEPT + valid + REJECTED | ACTIVE / REVIVAL / transitionApplied=true |
| D3.3 | ACCEPT + valid + ACTIVE | ACTIVE (no change) / REASSESSMENT / transitionApplied=false |
| D3.4 | ACCEPT + valid + SUPERSEDED | no transition, invariant violation recorded |
| D3.5 | ACCEPT + valid + RESOLVED | no transition, invariant violation recorded |
| D3.6 | ACCEPT + validationValid=false | no transition, `ACCEPT must not be issued when validation.valid is false` violation (safety net) |
| D3.7 | NON_ACCEPTING (all currentStatuses) | no transition, no violations, safe default |
| D3.8 | judgeVerdict null | no-op |
| D3.9 | Determinism: identical input twice | byte-equivalent resolutions |
| D3.10 | Every resolution | `candidateId` passthrough + `decisionPolicyVersion='v1'` |

### D4 Judge Grounding (behavioral, LLM-dependent)

| # | Case | Expected |
|---|---|---|
| D4.1 | Well-grounded valid analysis (fixture) | verdict ACCEPT with ≥1 dimension, each score in [0,1] + rationale |
| D4.2 | Analysis with unresolved relevant contradictions / thin grounding (valid with `CONTRADICTION_IGNORED` WARNING) | judge MAY accept (WARNING ≠ ERROR); dimension `EVIDENCE_GROUNDING` reflects the limitation; verdict is the model's categorical call |
| D4.3 | Judge output references only ids present in the supplied input (no invented ids anywhere) | static + behavioral check |
| D4.4 | Judge never emits forbidden epistemic language (criminality/intent/guilt/concealment) | static grep + behavioral check |
| D4.5 | `judgedContextSha256` === judge input `analysis.contextSha256` | equality invariant |

### D5 Failure Handling & Reliability

| # | Case | Expected |
|---|---|---|
| D5.1 | Transient `AiRuntimeError` (RATE_LIMITED / REQUEST_TIMEOUT / RETRY_EXHAUSTED) | classified transient; retryable; surfaced through execution metadata |
| D5.2 | Non-transient `AiRuntimeError` (UNSUPPORTED_CAPABILITY / INPUT_TOO_LARGE) | propagates unchanged, no partial judge record |
| D5.3 | `GraphHoleAnalysisError`-class input failures | typed, distinct from AI failure |
| D5.4 | Safe failure default | on any judge failure the candidate does NOT advance toward ACTIVE |

### D6 Authority & Static Security Proofs (source-level)

| # | Case | Expected |
|---|---|---|
| D6.1 | Judge source imports no Prisma, no persistence client, no canonical mutation | grep clean |
| D6.2 | Judge source imports no HTTP/fetch/semantic-retrieval/graph-traversal | grep clean |
| D6.3 | Provider obtained ONLY via runtime `createAiRuntime` (no direct Gemini/ollama construction) | grep clean |
| D6.4 | Model-authorable surface (`GraphHoleJudgeV1`) has no identity/execution/stamp fields — those are feature-stamped | type-level proof |
| D6.5 | `decision-state.ts` imports no LLM/runtime modules (pure adjudication module) | grep clean |
| D6.6 | Judge result `verdict=ACCEPT` is impossible to derive when PR8 `valid=false` (orchestrator guard + adjudicator safety net) | unit proof D3.6 |
| D6.7 | Judge never consults an id the input envelope does not contain (input surface closed) | type-level + static |

### D7 Integration Verification

| # | Case | Expected |
|---|---|---|
| D7.1 | Orchestrator applies adjudication resolution; calls `canTransitionGraphHoleStatus` independently before persisting | both paths agree |
| D7.2 | Full pipeline smoke: region → detection → qualification → analysis (PR7) → validation (PR8) → judge → decision | deterministic end-to-end fixture |
| D7.3 | Judge result carries schema/prompt/policy/runtime version stamps matching frozen constants | byte-stable |

### D8 Deterministic v2 Acceptance Gate (5A-PR9 hardening, additive)

| # | Case | Expected |
|---|---|---|
| D8.1 | Conforming dimensions (all floors + overall pass) + ACCEPT + valid + qualified | gate passes; decision advances per v1 table |
| D8.2 | `EVIDENCE_GROUNDING = 0.69` vs `0.70` | 0.69 fails hard floor; 0.70 passes (exact `>=`) |
| D8.3 | `EPISTEMIC_DISCIPLINE = 0.89` vs `0.90` | 0.89 fails hard floor; 0.90 passes |
| D8.4 | `UNCERTAINTY_CALIBRATION = 0.69` vs `0.70` | 0.69 fails hard floor; 0.70 passes |
| D8.5 | `REASONING_COHERENCE` / `GAP_ASSESSMENT_QUALITY` / `ALTERNATIVE_COVERAGE` = 0.59 vs 0.60 | 0.59 fails each quality floor; 0.60 passes |
| D8.6 | Feature-computed overall at/above 0.70 (incl. epsilon boundary) | passes; below → `JUDGE_OVERALL_SCORE_BELOW_FLOOR` |
| D8.7 | Anti-gaming: all-zero + ACCEPT; duplicate/missing/unknown dimension; NaN / non-finite / out-of-range score | structurally invalid → `JUDGE_DIMENSION_*`, overall null, gate fails |
| D8.8 | All-ones + NON_ACCEPTING verdict | fails on `JUDGE_VERDICT_NON_ACCEPTING` (never converted) |
| D8.9 | `candidateQualified=false`; `validationValid=false` | `JUDGE_CANDIDATE_NOT_QUALIFIED` / `JUDGE_VALIDATION_ERROR` |
| D8.10 | Determinism: dimension order independence; byte-identical repeated evaluation; deep-frozen evaluation | byte-equivalent output; no mutation of the judge result |
| D8.11 | Minimum all-floors-passing set sums to exactly 0.70 | accepted (clamped boundary, fixed epsilon) |

---

*This audit was produced from direct inspection of the source files listed above. All claims are grounded in the actual codebase state on `feat/m-a13-graph-hole-region` as of 2026-09-14.*
