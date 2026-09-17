// ============================================================================
// Competing Explanation Policy (Phase 5A-PR15, frozen V1)
//
// Single source of truth for the deterministic explanation constants:
//   - policy version (feature-owned, identically-named on the contract)
//   - the per-set explanation bound (policy §14)
//   - support-level priorities (policy §14 order)
//   - the PRIMARY family for each PR14 classification type (policy §4/§9)
//   - the FROZEN alternative-family order (policy §14c)
//   - deterministic uncertainty heuristics (policy §20 — NOT probabilities)
//
// Frozen policy document: docs/architecture/pr15-competing-explanations.md.
// ============================================================================

import {
  COMPETING_EXPLANATION_POLICY_VERSION,
  MAX_COMPETING_EXPLANATIONS,
  type CompetingExplanationSupportLevel,
  type CompetingExplanationType,
} from '@indago/contracts';
import type { GapClassificationType } from '@indago/contracts';

/** Policy version consumed by this runtime (must equal the contract literal). */
export const CONSUMED_COMPETING_EXPLANATION_POLICY_VERSION = COMPETING_EXPLANATION_POLICY_VERSION;

/** Hard bound on explanations emitted for one hole (contract value). */
export const MAX_COMPETING_EXPLANATIONS_BOUND = MAX_COMPETING_EXPLANATIONS;

/** Deterministic support-level priority (higher = ranks first; policy §14). */
export const SUPPORT_LEVEL_PRIORITY: Readonly<Record<CompetingExplanationSupportLevel, number>> = {
  SUPPORTED: 5,
  PLAUSIBLE: 4,
  WEAKLY_SUPPORTED: 3,
  CONTRADICTED: 2,
  INSUFFICIENT_CONTEXT: 1,
};

/** Primary explanation family that explains the same deficit PR14 selected (policy §4/§9). */
export const PRIMARY_EXPLANATION_TYPE: Readonly<Record<GapClassificationType, CompetingExplanationType>> = {
  MISSING_INVESTIGATION: 'MISSING_INVESTIGATION_EXPLANATION',
  MISSING_DATA: 'MISSING_DATA_EXPLANATION',
  MISSING_COMPARISON: 'MISSING_COMPARISON_EXPLANATION',
  INFRASTRUCTURE_GAP: 'INFRASTRUCTURE_EXPLANATION',
  CONCEALMENT_CONSISTENT_PATTERN: 'CONCEALMENT_CONSISTENT_EXPLANATION',
};

/** Frozen alternative-family emission + rank order (policy §14c). */
export const ALTERNATIVE_FAMILY_ORDER: readonly CompetingExplanationType[] = [
  'ENTITY_FRAGMENTATION_EXPLANATION',
  'RELATION_REPRESENTATION_EXPLANATION',
  'TEMPORAL_EXPLANATION',
  'INNOCENT_ALTERNATIVE_EXPLANATION',
];

/** Deterministic uncertainty heuristic (policy §20 — NOT a probability). */
export function uncertaintyHeuristic(
  contradicted: boolean,
  status: GapClassificationResultStatus,
): number {
  if (contradicted) return 0.75;
  if (status === 'CONFIDENT') return 0.35;
  if (status === 'SUPPORTED') return 0.4;
  return 0.55;
}

type GapClassificationResultStatus = 'CONFIDENT' | 'SUPPORTED' | 'AMBIGUOUS' | 'INSUFFICIENT_CONTEXT';