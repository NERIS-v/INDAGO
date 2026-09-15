// ============================================================================
// @indago/graph-hole-judge — Public API (Phase 5A-PR9)
//
// The feature-owned graph-hole LLM judge: converts ONE PR7 analysis result +
// its PR8 deterministic validation verdict + the PR5 qualified candidate into
// a structured, validated GraphHoleJudgeV1 via the shared AI runtime, and
// adjudicates the deterministic decision-state over PR6 status transitions.
//
// Exports are intentionally minimal (frozen contracts only — implementation
// lands in the PR9 implementation PR):
//   1. GraphHoleJudgeV1 / verdict / dimension contracts — the judge output
//      schema (provider-native zod) + all derived types.
//   2. GraphHoleJudgeInput / context-summary — the closed-world input shape.
//   3. GraphHoleJudgeResult / execution envelope — the stamped public result.
//   4. Decision-state adjudication — pure, versioned (v2) transition
//      resolution over the deterministic dimension-gated acceptance policy.
//   5. Policy/version constants — for version-gating / audits.
//
// Authority boundary: the judge CANNOT introduce evidence, mutate the graph,
// persist records, override a PR8 ERROR, or access anything beyond the AI
// runtime. The deterministic decision layer never auto-enters REJECTED /
// SUPERSEDED / RESOLVED and never acts without human review.
// ============================================================================

// ---- Judge output schema (provider-native, model-authorable) ----
export {
  GraphHoleJudgeVerdictSchema,
  GraphHoleJudgeDimensionNameSchema,
  GraphHoleJudgeDimensionSchema,
  GraphHoleJudgeV1Schema,
  GraphHoleJudgeSchemaStampSchema,
} from './contracts/judge-v1.js';
export type {
  GraphHoleJudgeVerdict,
  GraphHoleJudgeDimensionName,
  GraphHoleJudgeDimension,
  GraphHoleJudgeV1,
  GraphHoleJudgeSchemaStamp,
} from './contracts/judge-v1.js';

// ---- Judge closed-world input ----
export type {
  GraphHoleJudgeInput,
  GraphHoleJudgeContextSummary,
  GraphHoleAnalysisContextCompleteness,
} from './contracts/judge-input.js';

// ---- Stamped judge result + execution envelope ----
export {
  toGraphHoleJudgeExecution,
} from './contracts/judge-result.js';
export type {
  GraphHoleJudgeResult,
  GraphHoleJudgeExecution,
} from './contracts/judge-result.js';

// ---- Deterministic decision-state (decision-policy v2, dimension-gated) ----
export {
  adjudicateGraphHoleDecision,
} from './contracts/decision-state.js';
export type {
  GraphHoleDecisionInput,
  GraphHoleDecisionResolution,
} from './contracts/decision-state.js';

// ---- Deterministic acceptance gate (5A-PR9 hardening, policy v2) ----
export {
  evaluateJudgeDecision,
  HARD_FLOOR,
  QUALITY_FLOOR,
  OVERALL_MIN_SCORE,
  OVERALL_MIN_SCORE_EPSILON,
  DIMENSION_WEIGHT,
  JUDGE_FAILURE_REASON,
} from './judgement/evaluate-judge-decision.js';
export type {
  JudgeDecisionEvaluation,
  EvaluateJudgeDecisionInput,
  GraphHoleJudgeDimensionScoreEval,
  GraphHoleJudgeFloorCheck,
  GraphHoleJudgeFailureReason,
} from './judgement/evaluate-judge-decision.js';

// ---- Judge executor (single generateStructured call) ----
export {
  judgeGraphHole,
  enforceJudgeAuthority,
} from './judgement/judge-executor.js';
export type {
  JudgeGraphHoleParams,
} from './judgement/judge-executor.js';

// ---- Judge request builders (deterministic payload) ----
export {
  buildJudgePayload,
  buildJudgeRequest,
} from './judgement/judge-request.js';

// ---- Orchestration: PR8 gate + deterministic adjudication ----
export {
  runJudgeDecision,
  JUDGE_GATE_REASON,
} from './orchestrate/run-judge-decision.js';
export type {
  RunJudgeDecisionParams,
  GraphHoleJudgeDecision,
  JudgeGateReason,
} from './orchestrate/run-judge-decision.js';

// ---- Feature errors ----
export {
  GraphHoleJudgeError,
  isGraphHoleJudgeError,
} from './errors/judge-error.js';
export type {
  GraphHoleJudgeErrorCode,
} from './errors/judge-error.js';

// ---- Policy/version constants ----
export {
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_PROMPT_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
  GRAPH_HOLE_DECISION_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
} from './contracts/judge-policy.js';
export type {
  GraphHoleJudgePolicyVersion,
  GraphHoleJudgePromptVersion,
  GraphHoleJudgeSchemaVersion,
  GraphHoleDecisionPolicyVersion,
  GraphHoleJudgeDecisionPolicyVersion,
} from './contracts/judge-policy.js';