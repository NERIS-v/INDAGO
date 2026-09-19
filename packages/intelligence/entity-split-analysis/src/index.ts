// ============================================================================
// @indago/entity-split-analysis — public surface (Phase 5A-PR16)
//
// Deterministic / structured ER-split explanations over certified
// PR1-PR15 + M-A07/M-A08/M-A09 outputs. Pure function over the supplied
// closed-world package. Read-only reuse of candidate pairs / hypotheses.
// ============================================================================

// ---- Public API ----
export { generateErSplitExplanations } from './pipeline/generate.js';
export { buildBoundContext } from './pipeline/boundary.js';
export type { ErSplitBoundContext } from './pipeline/boundary.js';
export { buildStructuralFit } from './pipeline/structural-fit.js';
export type { StructuralFitEvidence } from './pipeline/structural-fit.js';
export {
  buildIdentityEvidence,
  computeIdentitySupportScore,
  highestScoringHypothesis,
  hasAcceptedHypothesis,
} from './pipeline/identity-evidence.js';
export type { IdentityEvidence } from './pipeline/identity-evidence.js';
export {
  computeExplanationId,
  dedupeByExplanationId,
  explanationIdentityFor,
} from './pipeline/dedupe.js';
export type { ErSplitExplanationIdentityTuple } from './pipeline/dedupe.js';
export { rankingKeyFor, sortByRankingKey } from './pipeline/rank.js';
export type { RankingInput } from './pipeline/rank.js';
export { ErSplitExplanationError, ErSplitExplanationErrorCodes } from './pipeline/errors.js';
export type { ErSplitExplanationErrorCode } from './pipeline/errors.js';
export { sha256Hex } from './pipeline/sha256.js';
export { sortedUniqueString, sortedUnique } from './pipeline/sorted.js';
export { intervalsOverlap, temporalCompatibilityFor } from './pipeline/temporal.js';

// ---- Input surface ----
export type { ErSplitExplanationInput } from './contracts/er-split-input.js';

// ---- Policy constants ----
export {
  CONSUMED_ER_SPLIT_POLICY_VERSION,
  MAX_ER_SPLIT_EXPLANATIONS_BOUND,
  MAX_CANDIDATE_PAIRS_BOUND,
  MAX_ENTITY_HYPOTHESES_BOUND,
  RESOLUTION_MATCH_SCORE_THRESHOLD_BOUND,
  STATUS_PRIORITY,
  IDENTITY_WEIGHT_STRONG_IDENTIFIER,
  IDENTITY_WEIGHT_CANONICAL_VALUE,
  IDENTITY_WEIGHT_NAME_BLOCK,
  IDENTITY_HYPOTHESIS_MAX_CONTRIBUTION,
  IDENTITY_HYPOTHESIS_SCORE_WEIGHT,
  IDENTITY_CONTRADICTION_UNIT_BURDEN,
  IDENTITY_NON_MATCH_BURDEN,
  IDENTITY_TEMPORAL_INCOMPATIBLE_BURDEN,
  IDENTITY_CONTRADICTION_BURDEN_CAP,
  STRUCTURAL_WEIGHT_BRIDGING,
  STRUCTURAL_WEIGHT_COVERAGE,
  STRUCTURAL_WEIGHT_BOTH_SIDES,
  STATUS_THRESHOLD_SUPPORTED_IDENTITY,
  STATUS_THRESHOLD_PLAUSIBLE_IDENTITY,
  EMIT_REQUIRES_IDENTITY_SCORE_GT,
  EMIT_REQUIRES_STRUCTURAL_SCORE_GT,
  UNCERTAINTY_WEIGHT_IDENTITY,
  UNCERTAINTY_WEIGHT_STRUCTURAL,
  UNCERTAINTY_TEMPORAL_COMPATIBLE_BONUS,
  UNCERTAINTY_DIRECT_BONUS,
  erSplitUncertaintyHeuristic,
} from './contracts/er-split-policy.js';

// ---- Authoritative result types (frozen contract, re-exported for convenience) ----
export type {
  ErSplitExplanation,
  ErSplitExplanationSet,
  ErSplitExplanationStatus,
  ErSplitExplanationPolicyVersion,
  ErSplitExplanationFailureCode,
  ErSplitExplanationStructuralFit,
  TargetedReblockingHandoff,
  SharedSignalCode,
  TemporalCompatibility,
  DiscriminatingGapCode,
} from '@indago/contracts';
export {
  ErSplitExplanationSchema,
  ErSplitExplanationSetSchema,
  ErSplitExplanationStatusSchema,
  ErSplitExplanationFailureCodeSchema,
  ErSplitExplanationStructuralFitSchema,
  TargetedReblockingHandoffSchema,
  SharedSignalCodeSchema,
  TemporalCompatibilitySchema,
  DiscriminatingGapCodeSchema,
  MAX_ER_SPLIT_EXPLANATIONS,
  MAX_CANDIDATE_PAIRS_PER_QUERY,
  MAX_ENTITY_HYPOTHESES_PER_QUERY,
  RESOLUTION_MATCH_SCORE_THRESHOLD,
  ER_SPLIT_EXPLANATION_POLICY_VERSION,
} from '@indago/contracts';