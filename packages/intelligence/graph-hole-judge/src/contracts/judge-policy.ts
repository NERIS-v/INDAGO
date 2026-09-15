// ============================================================================
// Graph-Hole Judge Policy (Phase 5A-PR9)
//
// Feature-owned versioning for the GraphHole AI judge + the deterministic
// decision-state semantics.
//
// Versioning discipline (never invent parallel identifiers):
//   - judgePolicyVersion identifies the JUDGE semantics of this feature (what
//     the verdict enum + dimension vocabulary + rationale mean). Analogous to
//     PR7's GRAPH_HOLE_ANALYSIS_POLICY_VERSION: feature-scoped, separate from
//     the shared graph-hole policy.
//   - judgePromptVersion identifies the judge system prompt.
//   - judgeSchemaVersion identifies the GraphHoleJudgeV1 output schema.
//   - decisionPolicyVersion identifies the deterministic decision-state
//     transition semantics (PR9 owns this; it is a pure decision table over
//     PR6 GraphHolePersistenceStatus transitions).
//   - judgeDecisionPolicyVersion (GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION)
//     identifies the production-hardening acceptance policy (5A-PR9): the
//     deterministic dimension gates (hard floors, quality floors, feature-
//     computed overall score) that decide whether a model ACCEPT verdict is
//     sufficient for acceptance. It is a SUPERSEDING addition over the v1
//     transition table — acceptance now requires the deterministic conjunction;
//     an ACCEPT verdict alone is never sufficient.
//   - The AI runtime policy version (AI_RUNTIME_POLICY_VERSION = 'v2') stays
//     owned by @indago/ai-agent-runtime / @indago/contracts. The judge records
//     it in execution metadata, never re-declares it here.
// ============================================================================

/** Version of the GraphHole-judge feature semantics (PR9 owns this). */
export const GRAPH_HOLE_JUDGE_POLICY_VERSION = 'v1' as const;
export type GraphHoleJudgePolicyVersion = typeof GRAPH_HOLE_JUDGE_POLICY_VERSION;

/** Version of the judge system prompt (PR9 owns this). */
export const GRAPH_HOLE_JUDGE_PROMPT_VERSION = 'graph-hole-judge-v1' as const;
export type GraphHoleJudgePromptVersion = typeof GRAPH_HOLE_JUDGE_PROMPT_VERSION;

/** Version of the GraphHoleJudgeV1 output schema (PR9 owns this). */
export const GRAPH_HOLE_JUDGE_SCHEMA_VERSION = 'graph-hole-judge-v1' as const;
export type GraphHoleJudgeSchemaVersion = typeof GRAPH_HOLE_JUDGE_SCHEMA_VERSION;

/** Version of the deterministic GDO decision-state semantics (PR9 owns this). */
export const GRAPH_HOLE_DECISION_POLICY_VERSION = 'v1' as const;
export type GraphHoleDecisionPolicyVersion = typeof GRAPH_HOLE_DECISION_POLICY_VERSION;

/**
 * Version of the deterministic judge-decision acceptance policy (5A-PR9
 * production hardening). v2 adds the dimension gates over the v1 transition
 * table: hard floors (EVIDENCE_GROUNDING 0.70, EPISTEMIC_DISCIPLINE 0.90,
 * UNCERTAINTY_CALIBRATION 0.70), quality floors (REASONING_COHERENCE /
 * GAP_ASSESSMENT_QUALITY / ALTERNATIVE_COVERAGE 0.60), and a feature-computed
 * overall score floor (0.70). An ACCEPT verdict passes ONLY the full
 * deterministic conjunction. v1 semantics (transition legality, no-op safe
 * defaults) are unchanged — acceptance breadth is what shrinks.
 */
export const GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION = 'v2' as const;
export type GraphHoleJudgeDecisionPolicyVersion =
  typeof GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION;