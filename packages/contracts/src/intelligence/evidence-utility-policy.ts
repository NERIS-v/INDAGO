import { z } from 'zod';

// ============================================================================
// Evidence Utility Policy — V1 (Phase 5A-PR10 Freeze)
//
// Defines how a request-level EvidenceUtility.score is composed from its
// normalized components. This is the PROTOCOL the future PR10 calculator must
// obey. This module does NOT implement the calculator.
//
// Relationship to PR5 (frozen):
//   - PR5 `expectedInformationValue` (graph-hole-qualification / graph-hole-policy)
//     is a candidate/GraphHole-level DETERMINISTIC decision-value signal.
//     It is versioned by GRAPH_HOLE_SCORING_POLICY_VERSION and is NOT
//     redefined by this policy.
//   - PR10 request-level `expectedInformationGain` describes how much ONE
//     additional evidence request is expected to discriminate among the
//     EXPLICITLY CONSIDERED competing explanations.
//   expectedInformationValue != expectedInformationGain unless a future policy
//   version deliberately changes that relationship.
//
// Score composition (frozen formula, deterministic and reproducible):
//   effectiveCost = 1 - cost
//   score = clamp01(round6(
//       wEIG * expectedInformationGain
//     + wRel * relevance
//     + wFeas * feasibility
//     + wCost * effectiveCost ))
//
// All components and score are NORMALIZED HEURISTICS in [0,1]:
//   - NOT calibrated probabilities
//   - NOT calibrated information-theoretic quantities
//   - cost is NOT a monetary value
// ============================================================================

/** Version of the PR10 evidence-utility policy (PR10 owns this). */
export const EVIDENCE_UTILITY_POLICY_VERSION = 'v1' as const;
export type EvidenceUtilityPolicyVersion = typeof EVIDENCE_UTILITY_POLICY_VERSION;

/**
 * Frozen request-level utility weights. Sum to exactly 1.0.
 *
 * Justification (why these weights):
 *   - 0.40 expectedInformationGain — PR10's sole purpose is selecting evidence
 *     that discriminates among competing explanations; discrimination
 *     capability is the dominant objective.
 *   - 0.25 relevance — a request only helps if it ties directly to the
 *     GraphHole and hypotheses being discriminated; second-largest.
 *   - 0.20 feasibility — the selection must be actionable within the
 *     investigation's authorized scope, but a hard-to-obtain discriminative
 *     piece can still be the right selection; middle weight.
 *   - 0.15 effectiveCost — cost chiefly prunes/breaks ties: prefer
 *     discriminative evidence over cheap evidence, so burden is the
 *     smallest weight.
 *   The exact weights are frozen; a re-calibration is a NEW policy version.
 */
export const EVIDENCE_UTILITY_WEIGHTS = {
  expectedInformationGain: 0.40,
  relevance: 0.25,
  feasibility: 0.20,
  effectiveCost: 0.15,
} as const;
export type EvidenceUtilityWeights = typeof EVIDENCE_UTILITY_WEIGHTS;

/** The components consumed by the frozen utility formula. */
export const EvidenceUtilityComponentSchema = z.enum([
  'expectedInformationGain',
  'relevance',
  'feasibility',
  'effectiveCost',
]);
export type EvidenceUtilityComponent = z.infer<typeof EvidenceUtilityComponentSchema>;

export const EVIDENCE_UTILITY_COMPONENTS: readonly EvidenceUtilityComponent[] = [
  'expectedInformationGain',
  'relevance',
  'feasibility',
  'effectiveCost',
];

/** Cost is directionally inverted in scoring: effectiveCost = 1 - cost. */
export const EVIDENCE_UTILITY_COST_INVERSION = 'effectiveCost = 1 - cost' as const;

/** Score is clamped to [0,1] after composition. */
export const EVIDENCE_UTILITY_NORMALIZATION_RULE = 'CLAMP_01' as const;

/** Score is rounded to 6 decimal places after clamping (mirrors PR5 discipline). */
export const EVIDENCE_UTILITY_ROUNDING_RULE = 'ROUND_6_DECIMALS' as const;

/**
 * Deterministic overall ranking order for PR10 selection. Ties at one step
 * fall through to the next; the final step is the canonical request identity
 * (byte-stable), which makes the total order total and deterministic.
 */
export const EvidenceUtilityRankStepSchema = z.enum([
  'SCORE_DESC',
  'EXPECTED_INFORMATION_GAIN_DESC',
  'RELEVANCE_DESC',
  'FEASIBILITY_DESC',
  'CANONICAL_REQUEST_KEY_ASC',
]);
export type EvidenceUtilityRankStep = z.infer<typeof EvidenceUtilityRankStepSchema>;

export const EVIDENCE_UTILITY_RANK_ORDER: readonly EvidenceUtilityRankStep[] = [
  'SCORE_DESC',
  'EXPECTED_INFORMATION_GAIN_DESC',
  'RELEVANCE_DESC',
  'FEASIBILITY_DESC',
  'CANONICAL_REQUEST_KEY_ASC',
];

/** Frozen semantic meanings of the utility components (documented + enforced as literals). */
export const EvidenceUtilityPolicyV1Schema = z.object({
  version: z.literal(EVIDENCE_UTILITY_POLICY_VERSION)
    .describe('PR10 evidence-utility policy version.'),
  weights: z.object({
    expectedInformationGain: z.number().min(0).max(1),
    relevance: z.number().min(0).max(1),
    feasibility: z.number().min(0).max(1),
    effectiveCost: z.number().min(0).max(1),
  }).strict()
    .describe('Frozen PR10 utility weights. Must sum to exactly 1.0.'),
  components: z.array(EvidenceUtilityComponentSchema).length(4)
    .describe('The components consumed by the frozen formula (in weighted-sum order).'),
  costInversion: z.literal(EVIDENCE_UTILITY_COST_INVERSION)
    .describe('Higher cost lowers utility contribution: effectiveCost = 1 - cost.'),
  normalizationRule: z.literal(EVIDENCE_UTILITY_NORMALIZATION_RULE)
    .describe('Score clamped to [0,1].'),
  roundingRule: z.literal(EVIDENCE_UTILITY_ROUNDING_RULE)
    .describe('Score rounded to 6 decimal places after clamping.'),
  rankOrder: z.array(EvidenceUtilityRankStepSchema).length(5)
    .describe('Deterministic overall ranking/tie-breaking order for PR10 selection.'),
  semantics: z.object({
    expectedInformationGain: z.literal('HIGHER_EIG_GREATER_DISCRIMINATION_AMONG_BOUNDED_EXPLANATIONS')
      .describe('Greater expected reduction of uncertainty among the explicitly considered competing explanations. NOT a probability; NOT a calibrated information-theoretic quantity.'),
    relevance: z.literal('HIGHER_RELEVANCE_STRONGER_DIRECT_LINK')
      .describe('Stronger direct connection to the GraphHole and the hypotheses being discriminated.'),
    feasibility: z.literal('HIGHER_FEASIBILITY_EASIER_WITHIN_SCOPE')
      .describe('Easier/more realistically obtainable within the investigation\'s authorized scope and practical constraints.'),
    cost: z.literal('HIGHER_COST_MORE_BURDEN')
      .describe('More expensive/burdensome to obtain. Normalized heuristic; NOT a monetary value unless a future policy says otherwise.'),
  }).strict(),
}).strict();
export type EvidenceUtilityPolicyV1 = z.infer<typeof EvidenceUtilityPolicyV1Schema>;

/**
 * The single authoritative frozen V1 PR10 evidence-utility policy.
 * Future utility calculators MUST consume this object rather than
 * re-discovering weights/semantics.
 */
export const EVIDENCE_UTILITY_POLICY_V1: EvidenceUtilityPolicyV1 = {
  version: EVIDENCE_UTILITY_POLICY_VERSION,
  weights: { ...EVIDENCE_UTILITY_WEIGHTS },
  components: [...EVIDENCE_UTILITY_COMPONENTS],
  costInversion: EVIDENCE_UTILITY_COST_INVERSION,
  normalizationRule: EVIDENCE_UTILITY_NORMALIZATION_RULE,
  roundingRule: EVIDENCE_UTILITY_ROUNDING_RULE,
  rankOrder: [...EVIDENCE_UTILITY_RANK_ORDER],
  semantics: {
    expectedInformationGain: 'HIGHER_EIG_GREATER_DISCRIMINATION_AMONG_BOUNDED_EXPLANATIONS',
    relevance: 'HIGHER_RELEVANCE_STRONGER_DIRECT_LINK',
    feasibility: 'HIGHER_FEASIBILITY_EASIER_WITHIN_SCOPE',
    cost: 'HIGHER_COST_MORE_BURDEN',
  },
};