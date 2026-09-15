# PR9 — Graph-Hole LLM Judge + Deterministic Decision Pipeline

Status: **Implemented** (Phase 5A-PR9 implementation + production hardening)

Companion audit: [`pr9-llm-judge-audit.md`](./pr9-llm-judge-audit.md)
(the audit defined the missing contracts + test matrix; this document
describes the implementation that landed, including the 5A-PR9 v2
deterministic acceptance gate).

---

## Scope

PR9 adds a feature-owned, closed-world LLM judge for graph-hole analyses plus a
pure, deterministic decision layer. It consumes the already-produced artifacts
of PR5 (qualified candidate), PR7 (analysis result), and PR8 (validation
verdict), produces a structured `GraphHoleJudgeV1` via the shared AI runtime,
and adjudicates the candidate's persistent status transition over PR6 rules.

The judge is a **pure assessor, not an investigator**: it reasons only over the
supplied closed-world payload, never reaches into the database/graph/evidence
store, never mutates anything, never persists, and never overrides a PR8 ERROR.

---

## 1. Public API (`@indago/graph-hole-judge`, `src/index.ts`)

Minimal export surface (mirrors PR7/PR8):

| Symbol | Kind | Purpose |
| --- | --- | --- |
| `GraphHoleJudgeV1Schema`, `GraphHoleJudgeVerdictSchema`, `GraphHoleJudgeDimensionSchema`, `GraphHoleJudgeDimensionNameSchema`, `GraphHoleJudgeSchemaStampSchema` | schema | Strict Zod output contracts (provider-native subset) |
| `GraphHoleJudgeInput`, `GraphHoleJudgeContextSummary`, `GraphHoleAnalysisContextCompleteness` | type | Closed-world input shape |
| `GraphHoleJudgeResult`, `GraphHoleJudgeExecution`, `toGraphHoleJudgeExecution` | type + fn | Stamped result envelope + metadata mapper |
| `adjudicateGraphHoleDecision`, `GraphHoleDecisionInput`, `GraphHoleDecisionResolution` | fn + types | Pure deterministic decision-state |
| `evaluateJudgeDecision`, `JudgeDecisionEvaluation`, `HARD_FLOOR`, `QUALITY_FLOOR`, `OVERALL_MIN_SCORE`, `OVERALL_MIN_SCORE_EPSILON`, `DIMENSION_WEIGHT`, `JUDGE_FAILURE_REASON`, `GraphHoleJudgeFailureReason` | fn + types + consts | v2 deterministic acceptance gate (hard/quality floors, feature-computed overall, closed failure-reason vocabulary) |
| `judgeGraphHole`, `enforceJudgeAuthority`, `JudgeGraphHoleParams` | fn(s) | One-shot executor (single `generateStructured` call) |
| `buildJudgePayload`, `buildJudgeRequest` | fn(s) | Deterministic canonical payload + request assembly |
| `runJudgeDecision`, `JUDGE_GATE_REASON`, `GraphHoleJudgeDecision` | fn + const + type | Orchestration: PR8 gate + adjudication |
| `GraphHoleJudgeError`, `isGraphHoleJudgeError` | error | Feature-level typed failures |
| `GRAPH_HOLE_JUDGE_POLICY_VERSION` (`v1`), `GRAPH_HOLE_JUDGE_PROMPT_VERSION` (`graph-hole-judge-v1`), `GRAPH_HOLE_JUDGE_SCHEMA_VERSION` (`graph-hole-judge-v1`), `GRAPH_HOLE_DECISION_POLICY_VERSION` (`v1`), `GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION` (`v2`) | const | Frozen version identifiers |

Implementation files:
- `src/judgement/judge-executor.ts` — executor + authority enforcement
- `src/judgement/judge-request.ts` — canonical payload + LLMRequest assembly
- `src/judgement/evaluate-judge-decision.ts` — v2 deterministic acceptance gate
- `src/orchestrate/run-judge-decision.ts` — PR8 gate + deterministic adjudication
- `src/prompts/judge-prompt.ts` — static system prompt
- `src/errors/judge-error.ts` — `GraphHoleJudgeError` (codes `INPUT_AUTHORITY_MISMATCH`, `INPUT_UNQUALIFIED_CANDIDATE`)
- `src/contracts/*` — frozen contracts (previous task)

---

## 2. `JudgeInputV1` (closed world) and the judgment payload

`GraphHoleJudgeInput` carries exactly:

- `candidate: QualifiedGraphHoleCandidate` (PR5 output, `qualified === true`)
- `analysis: GraphHoleAnalysisResult` (PR7 output)
- `validation: ValidatedGraphHoleAnalysis` (PR8 output)
- `contextSummary: GraphHoleJudgeContextSummary` (bounded digest of what the analyst saw)

The executor **enforces the authority boundary before any LLM call**
(`enforceJudgeAuthority`, `GraphHoleJudgeError`):
- `INPUT_UNQUALIFIED_CANDIDATE` if `candidate.qualified !== true`
- `INPUT_AUTHORITY_MISMATCH` if `candidateId` / `caseId` / `graphVersionId` /
  `regionId` disagree across candidate, analysis, and context summary.

`buildJudgePayload` serializes the closed world with
`canonicalStringify` (from `@indago/graph-hole-analysis`) — deterministic,
byte-stable across identical inputs. Top-level fields:

- `judgedContextSha256` (the PR7 context digest the impartial judge was shown)
- `candidate` (id stamps, detector type, expected relationship, node/edge scope,
  structural basis, qualification scores, region status)
- `analysis` (the full `GraphHoleAnalysisV1` + feature policy/schema versions)
- `validation` (`valid` boolean + findings with code/severity/path/referenceId/message)
- `contextSummary` (the frozen bounded digest)

The model sees **only** this payload plus the static system prompt — no graph
traversal, no retrieval, no tool calls.

---

## 3. `GraphHoleJudgeV1` output schema

Strict Zod object (`src/contracts/judge-v1.ts`, frozen in contract freeze):

- `verdict: 'ACCEPT' | 'NON_ACCEPTING'` (closed enum)
- `dimensions: GraphHoleJudgeDimension[]` — six closed dimensions with
  `score ∈ [0,1]` + `rationale`
- `rationale: string`

The six dimensions:

1. `EVIDENCE_GROUNDING` — cited observations/hypotheses are present + relevant
2. `REASONING_COHERENCE` — reasoning steps follow from the evidence
3. `EPISTEMIC_DISCIPLINE` — no forbidden epistemic claims; inference is labeled
4. `UNCERTAINTY_CALIBRATION` — stated uncertainty matches the supplied evidence
5. `GAP_ASSESSMENT_QUALITY` — candidateAssessment / missingRelationship grounded
6. `ALTERNATIVE_COVERAGE` — competing explanations considered where ambiguous

Semantics: scores are **not probabilities**; **the model computes no aggregate
and determines no threshold.** The verdict is the model's categorical
proposal. Whether that proposal is **sufficient for acceptance** is decided
deterministically by the v2 acceptance gate (Section 7a), never by the model —
the LLM proposes a structured quality assessment; the deterministic PR9 policy
decides whether it clears the frozen hard floors, quality floors, and the
feature-computed overall score. The executor **re-sorts dimensions by name** so
the stamped record is byte-stable regardless of model ordering. Identity
(`candidateId` / `caseId` / `graphVersionId` / `regionId`) and
`judgedContextSha256` are stamped by the feature from the authoritative
analysis — never echoed by the model.

---

## 4. Request construction and runtime usage

`buildJudgeRequest(payload)` returns an `LLMRequest` with:

- `messages[0]` = static `GRAPH_HOLE_JUDGE_SYSTEM_PROMPT`
- `messages[1]` = the canonical payload string
- `promptVersion` / `schemaVersion` / `policyVersion` = frozen judge versions

The executor makes **exactly one** `runtime.generateStructured(request,
GraphHoleJudgeV1Schema)` call. The runtime is supplied by the caller (usually
`createAiRuntime` from `@indago/ai-agent-runtime`); the judge package never
constructs a runtime or provider. Provider/model resolution,
schema→provider-native JSON Schema conversion, structured-output parsing, and
Zod validation happen **in the runtime** (same pattern as PR7).

There is **no fallback, no silent retry, no tool call, no autonomous loop.**
Runtime-provider errors propagate untransformed (fail-closed).

---

## 5. PR8 gate (runJudgeDecision)

`runJudgeDecision` wires gate + adjudication:

- **Case A — valid (`validation.valid === true`), no findings:** judge runs
  normally; verdict feeds the decision layer.
- **Case B — valid, warnings only:** judge runs normally; the PR8 findings
  (including retained warnings) stay visible in the returned decision result
  (auditability — never removed/rewritten).
- **Case C — any ERROR (`validation.valid !== true`):** the judge is **not
  invoked** (`gatedReason = 'VALIDATION_ERROR'`), no judge result is produced,
  and the decision resolves deterministically to the safe default (no
  transition). Severity is never re-interpreted: ERROR ⇒ gated, WARNING ⇒ not.

When the judge runs, its verdict is passed to
`adjudicateGraphHoleDecision({ candidateId, currentStatus, judgeVerdict,
validationValid })`. When gated, `judgeVerdict = null`.

---

## 6. `CONTRADICTION_IGNORED` warning semantics

The frozen V1 policy **permits acceptance** with a retained
`CONTRADICTION_IGNORED` WARNING: a warning is a known limitation to weigh in
`ALTERNATIVE_COVERAGE` / `GAP_ASSESSMENT_QUALITY`, not an automatic
NON_ACCEPTING. The pipeline:

- never hides or rewrites the warning; it stays in `decision.validation.findings`;
- surfaces it in the decision/audit structure (`GraphHoleJudgeDecision.validation`);
- regression-tested (Cases B + WARNING-permits-ACCEPT).

---

## 7. Deterministic adjudication

`adjudicateGraphHoleDecision` (`src/contracts/decision-state.ts`) is the **sole
authority** over the next status. It is pure, deterministic, bounded,
versioned, and has no network/persistence/AI/clock. It runs the v2 acceptance
gate (`evaluateJudgeDecision`, Section 7a) and then applies the frozen PR6
transition rules. Deliberately:

- It consumes **only structured fields** (verdict + dimension scores +
  `validationValid` + `candidateQualified` + `currentStatus`). It never parses
  prose, never infers a score from text, never trusts a model-generated "final
  decision" string, and never trusts a model-supplied aggregate.
- `judgeVerdict = null` → no-op (`nextStatus = currentStatus`,
  `transitionApplied = false`).
- `NON_ACCEPTING` → no-op (never auto-changes status; never invents
  auto-REJECTED).
- `ACCEPT` + `validationValid === false` → invariant violation no-op (safety
  net; the judge contract forbids ACCEPT over an ERROR).
- `ACCEPT` + v2 gate **fails** → non-accepting no-op with machine-readable
  `failureReasons` (Section 7a).
- `ACCEPT` + v2 gate **passes** + `currentStatus = null` →
  `ACTIVE` / `QUALIFICATION`.
- `ACCEPT` + gate passes + `currentStatus = ACTIVE` → same-state snapshot
  `REASSESSMENT` (no transition).
- `ACCEPT` + gate passes + `currentStatus = REJECTED` → `ACTIVE` / `REVIVAL`
  (only via the legal PR6 edge `canTransitionGraphHoleStatus('REJECTED','ACTIVE')`).
- `SUPERSEDED` / `RESOLVED` are terminal — never re-entered (violation no-op).

## 7a. Deterministic acceptance gate (v2, 5A-PR9 hardening)

`evaluateJudgeDecision` (`src/judgement/evaluate-judge-decision.ts`) decides
whether an LLM `ACCEPT` verdict is **sufficient**. The LLM proposes; the
deterministic policy decides. Version: `GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION
= 'v2'` (superseding addition; the v1 transition table above is unchanged).

The authoritative acceptance conjunction (all required):

1. PR8 valid (`validationValid === true`)
2. Candidate qualified (`candidateQualified === true`)
3. All six canonical dimensions present, one each, no unknown names, every
   score finite and in `[0,1]` (defensive — re-enforced independently of the
   schema)
4. Hard floors — `EVIDENCE_GROUNDING ≥ 0.70`,
   `EPISTEMIC_DISCIPLINE ≥ 0.90`, `UNCERTAINTY_CALIBRATION ≥ 0.70`
5. Quality floors — `REASONING_COHERENCE ≥ 0.60`,
   `GAP_ASSESSMENT_QUALITY ≥ 0.60`, `ALTERNATIVE_COVERAGE ≥ 0.60`
6. Feature-computed overall `Σ(score × weight) ≥ 0.70` — weights fixed:
   EG 0.25, RC 0.15, ED 0.20, UC 0.15, GQ 0.15, AC 0.10 (sum 1.00);
   compared with fixed `OVERALL_MIN_SCORE_EPSILON = 1e-9`
7. `verdict === 'ACCEPT'`

Failure reasons come from the closed `JUDGE_FAILURE_REASON` vocabulary (14
codes: 12 canonical + `JUDGE_DIMENSION_UNKNOWN` + `JUDGE_DIMENSION_INVALID_SCORE`).
The evaluation is pure, deterministic (canonical name-sorted iteration), and
deep-frozen; the judge result is never mutated. Every comparison uses exact
decimal semantics (`score >= floor`); only the overall floor uses the explicit
epsilon flag.

---

## 8. Safe failure

Every failure path resolves **fail-closed** to the frozen default:

| Path | Result |
| --- | --- |
| PR8 ERROR (gate Case C) | judge skipped, `null` verdict, deterministic no-op decision (evaluation carries `JUDGE_VALIDATION_ERROR`) |
| Runtime rejects (`RATE_LIMITED`, `REQUEST_TIMEOUT`, …) | error propagates; **no** decision result is emitted |
| Invalid structured output (`STRUCTURED_OUTPUT_INVALID`) | error propagates; **no** invented ACCEPT |
| `INPUT_AUTHORITY_MISMATCH` / `INPUT_UNQUALIFIED_CANDIDATE` | typed `GraphHoleJudgeError` before the LLM call |
| `NON_ACCEPTING` verdict | no status change |
| `ACCEPT` + v2 gate fails (dimension floor / overall / structure / qualification) | no status change; machine-readable `evaluation.failureReasons` |

No failure path can produce an accidental ACCEPT. The decision-table's
invariant-violation no-ops and the v2 gate failures are regression-tested.

---

## 9. Terminal-state behavior

Terminal statuses (`SUPERSEDED`, `RESOLVED`) can never be re-entered by the
judge from any verdict; `REJECTED`/`RESOLVED` are never entered automatically.
Tested for terminal→terminal, terminal→non-terminal, terminal→ACCEPT, and
terminal→NON_ACCEPTING.

---

## 10. Authority boundaries

The judge package:

- CAN import + call `@indago/ai-agent-runtime` (`AiRuntime`) for exactly one
  `generateStructured`.
- CANNOT construct/run a runtime or provider (`createAiRuntime`,
  `createLLMProvider`), call `fetch`, read `process.env`, or touch `fs`.
- CANNOT query/read/write Prisma models, SQL, or the persistence layer.
- CANNOT mutate the graph, create evidence, create observations/edges/nodes, or
  perform graph traversal / semantic retrieval.
- CANNOT call tools, run autonomous loops, or do its own network I/O.

Enforced statically by grep-based security/architecture tests over `src/`.

---

## 11. Versions

- `GRAPH_HOLE_JUDGE_POLICY_VERSION = 'v1'` — judge semantics
- `GRAPH_HOLE_JUDGE_PROMPT_VERSION = 'graph-hole-judge-v1'` — system prompt
- `GRAPH_HOLE_JUDGE_SCHEMA_VERSION = 'graph-hole-judge-v1'` — `GraphHoleJudgeV1` schema
- `GRAPH_HOLE_DECISION_POLICY_VERSION = 'v1'` — decision-state transition semantics (frozen, untouched)
- `GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION = 'v2'` — deterministic acceptance gate (5A-PR9 hardening), superseding addition
- Runtime policy version stays owned by `@indago/ai-agent-runtime` /
  `@indago/contracts` (recorded as `execution.runtimePolicyVersion`, never
  re-declared by the judge).

---

## 12. PR10 non-goals (explicitly out of scope)

PR9 does not implement:
- next-best-evidence retrieval, `EvidenceRequest` orchestration, or retrieval loops;
- evidence acquisition or new observation/ingestion;
- re-blocking / incremental re-assessment of the graph;
- any re-query of the database or semantic layer.

The judge may *evaluate the usefulness of next evidence* only as a note within
`reasoning`/`rationale`, but never executes retrieval.

---

## 13. Persistence deferral

No new Prisma models are added by PR9. The executor and the decision layer stay
pure and in-memory; persistence of judge records / applied transitions is left
to a future integration PR (ownership conflict documented in the audit). No
code path writes to the database.

---

## 14. Testing

`vitest` suite (`tests/*.test.ts`), 99 tests across 9 files:

- `judge-executor.test.ts` — single call, feature stamping, dimension sorting,
  request assembly, authority enforcement, fail-closed invalid output, runtime
  error propagation, immutability.
- `gate.test.ts` — PR8 gate Cases A/B/C, severity not re-interpreted, verdict
  never auto-changes status, `adjudicateGraphHoleDecision` sole authority.
- `scenarios.test.ts` — §11 named scenarios (good / weak / contradiction-ignored
  / unsupported / alternative-weakness / over-specific / insufficient /
  invalid-structured-fail-closed).
- `decision.test.ts` — deterministic adjudication, safe-failure defaults,
  terminal-state rule, decision boundaries (`score ∈ [0,1]` incl. epsilon
  rejection), documented transitions; ACCEPT boundary now exercised through the
  v2 gate.
- `judge-decision-policy.test.ts` — v2 acceptance gate (§16/5A-PR9): frozen
  floors/weights, acceptance matrix at every floor boundary (0.59/0.60,
  0.69/0.70, 0.89/0.90), overall-at/below 0.70, anti-gaming (all-zero, duplicate/
  missing/unknown/NaN/non-finite/out-of-range, all-ones+NON_ACCEPTING),
  verdict/validation/qualification gates, contradiction-warning + PR8-ERROR
  integration, determinism (dimension-order independence, byte-identical),
  deep-freeze immutability, v2 adjudication integration.
- `determinism.test.ts` — byte-identical payload/stamp/adjudication; dimension
  order independence.
- `prompt.test.ts` — frozen versions, closed-world rules, criminality/intent/
  concealment prohibitions, PR8 inviolability, contradiction handling, verdict
  discipline, dimension vocabulary.
- `security.test.ts` + `architecture.test.ts` — static grep audit + minimal API
  surface + offline smoke round-trip.

Fixtures reuse the PR7/PR8 base scenario (MISSING_EDGE candidate A–C) and the
real PR8 validator where possible; synthetic PR8 verdicts only where a specific
finding code is required.

---

## Verification status

- `pnpm -r typecheck` — 17/17 packages green (incl. web)
- `pnpm -r build` — 17/17 packages green (incl. web + platform prebuild)
- `pnpm test` (judge) — 99/99 tests green across 9 files
- `pnpm-lock.yaml` updated (registers `@indago/graph-hole-judge`) — intentional
- `packages/intelligence/graph-hole-judge/dist` + `tsconfig.tsbuildinfo` cleaned
- Readiness: batched implementation + 5A-PR9 production hardening verified;
  API ready for integration.