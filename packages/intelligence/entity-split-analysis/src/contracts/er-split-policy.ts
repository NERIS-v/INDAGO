// ============================================================================
// ER-Split Explanation Policy (Phase 5A-PR16, frozen V1)
//
// Single source of truth for the deterministic ER-split constants:
//   - policy version (feature-owned, identically-named on the contract)
//   - the per-set explanation bound (policy §14)
//   - the bounded M-A08/M-A09 input slice sizes (policy §5)
//   - the RESOLVED_MATCH direct-evidence threshold (policy §12)
//   - identity-score weights and status thresholds (policy §10.2/§12)
//   - structural-fit weights (policy §13)
//   - contradiction burden weights (policy §12/§17)
//   - uncertainty heuristic weights (policy §19 — NOT probabilities)
//
// All values import their contract counterparts by reference; weights are
// frozen here and documented in docs/architecture/pr16-er-split-graph-hole.md.
// ============================================================================

import {
  ER_SPLIT_EXPLANATION_POLICY_VERSION,
  MAX_ER_SPLIT_EXPLANATIONS,
  MAX_CANDIDATE_PAIRS_PER_QUERY,
  MAX_ENTITY_HYPOTHESES_PER_QUERY,
  RESOLUTION_MATCH_SCORE_THRESHOLD,
  type ErSplitExplanationStatus,
} from '@indago/contracts';

/** Policy version consumed by this runtime (must equal the contract literal). */
export const CONSUMED_ER_SPLIT_POLICY_VERSION = ER_SPLIT_EXPLANATION_POLICY_VERSION;

/** Hard bound on explanations emitted for one hole (contract value). */
export const MAX_ER_SPLIT_EXPLANATIONS_BOUND = MAX_ER_SPLIT_EXPLANATIONS;

/** Hard bound on the candidate-pair slice (contract value). */
export const MAX_CANDIDATE_PAIRS_BOUND = MAX_CANDIDATE_PAIRS_PER_QUERY;

/** Hard bound on the hypothesis slice (contract value). */
export const MAX_ENTITY_HYPOTHESES_BOUND = MAX_ENTITY_HYPOTHESES_PER_QUERY;

/** M-A09 score at which a RESOLVED_MATCH becomes direct identity evidence (contract value). */
export const RESOLUTION_MATCH_SCORE_THRESHOLD_BOUND = RESOLUTION_MATCH_SCORE_THRESHOLD;

/** Deterministic status priority (higher = ranks first; policy §14). */
export const STATUS_PRIORITY: Readonly<Record<ErSplitExplanationStatus, number>> = {
  SUPPORTED: 5,
  PLAUSIBLE: 4,
  WEAKLY_SUPPORTED: 3,
  CONTRADICTED: 2,
};

// ---------------------------------------------------------------------------
// Identity evidence weights (policy §12)
// ---------------------------------------------------------------------------

/** Contribution of a deterministic strong-identifier blocking pass (M-A08 pass 1). */
export const IDENTITY_WEIGHT_STRONG_IDENTIFIER = 0.55;
/** Contribution of a canonical-value blocking pass (M-A08 pass 2). */
export const IDENTITY_WEIGHT_CANONICAL_VALUE = 0.25;
/** Contribution of a name-initial blocking pass (M-A08 pass 3 — deliberately weak). */
export const IDENTITY_WEIGHT_NAME_BLOCK = 0.10;
/** Maximum contribution borrowed from the M-A09 hypothesis score (never exceeds the strong pass). */
export const IDENTITY_HYPOTHESIS_MAX_CONTRIBUTION = 0.25;
/** Scaling of the M-A09 hypothesis score into its contribution (score * this). */
export const IDENTITY_HYPOTHESIS_SCORE_WEIGHT = 0.30;
/** Per-contradicting-observation burden (capped; policy §12). */
export const IDENTITY_CONTRADICTION_UNIT_BURDEN = 0.10;
/** Burden of a proven non-match (RESOLVED_NON_MATCH), policy §12. */
export const IDENTITY_NON_MATCH_BURDEN = 0.25;
/** Burden of temporal incompatibility (policy §12/§16). */
export const IDENTITY_TEMPORAL_INCOMPATIBLE_BURDEN = 0.20;
/** Cap on the total contradiction burden (policy §12). */
export const IDENTITY_CONTRADICTION_BURDEN_CAP = 0.35;

// ---------------------------------------------------------------------------
// Structural fit weights (policy §13)
// ---------------------------------------------------------------------------

/** Dominant weight: both hole-boundary sides covered with NO connecting path. */
export const STRUCTURAL_WEIGHT_BRIDGING = 0.60;
/** Weight of boundary coverage ratio. */
export const STRUCTURAL_WEIGHT_COVERAGE = 0.20;
/** Weight of the two-sided presence property. */
export const STRUCTURAL_WEIGHT_BOTH_SIDES = 0.20;

// ---------------------------------------------------------------------------
// Status thresholds (policy §10.2)
// ---------------------------------------------------------------------------

export const STATUS_THRESHOLD_SUPPORTED_IDENTITY = 0.55;
export const STATUS_THRESHOLD_PLAUSIBLE_IDENTITY = 0.30;

// ---------------------------------------------------------------------------
// Emission rule (policy §9b)
// ---------------------------------------------------------------------------

/** An explanation is emitted only when BOTH scores are strictly positive. */
export const EMIT_REQUIRES_IDENTITY_SCORE_GT = 0;
export const EMIT_REQUIRES_STRUCTURAL_SCORE_GT = 0;

// ---------------------------------------------------------------------------
// Uncertainty heuristic weights (policy §19 — heuristic, NOT probability)
// ---------------------------------------------------------------------------

export const UNCERTAINTY_WEIGHT_IDENTITY = 0.45;
export const UNCERTAINTY_WEIGHT_STRUCTURAL = 0.30;
export const UNCERTAINTY_TEMPORAL_COMPATIBLE_BONUS = 0.10;
export const UNCERTAINTY_DIRECT_BONUS = 0.05;

/** Deterministic uncertainty heuristic (policy §19 — NOT a probability). */
export function erSplitUncertaintyHeuristic(
  identitySupportScore: number,
  structuralFitScore: number,
  temporalCompatibility: 'COMPATIBLE' | 'PARTIALLY_COMPATIBLE' | 'INCOMPATIBLE' | 'INSUFFICIENT',
  direct: boolean,
): number {
  const raw =
    1 -
    UNCERTAINTY_WEIGHT_IDENTITY * identitySupportScore -
    UNCERTAINTY_WEIGHT_STRUCTURAL * structuralFitScore -
    (temporalCompatibility === 'COMPATIBLE' ? UNCERTAINTY_TEMPORAL_COMPATIBLE_BONUS : 0) -
    (direct ? UNCERTAINTY_DIRECT_BONUS : 0);
  return Math.min(1, Math.max(0, raw));
}