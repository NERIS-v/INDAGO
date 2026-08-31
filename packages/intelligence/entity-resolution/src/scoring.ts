// ============================================================================
// M-A09 Candidate Resolution — deterministic scoring
//
// Applies the versioned SCORING_V1 weights (see types.ts header for the
// full, one-sentence-justified table). The result is a ResolutionScore that is
// a RANKING / SUPPORT signal, NOT a calibrated probability.
//
// Settlement:
//   raw = baseline
//         + Σ positive weights (exact identifier, exact name, initial match,
//              type compatibility)
//         − Σ contradiction weights (DIFFERENT strong identifier)
//   score = clamp(raw, minScore, maxScore)
//
// ABSENT evidence contributes 0 and is NEVER counted as a contradiction.
// DIFFERENT strong identifiers are recorded as a hard contradiction (−0.30)
// and are never averaged away.
//
// A single hard contradiction drives score down; multiple contradictions are
// summed (bounded by the 0 floor). This may drive a pair to REJECTED /
// CONTRADICTED per the deterministic rule.
// ============================================================================

import type {
  ComparisonEvidence,
  EntityComparisonStatus,
  EntityResolutionStatus,
} from '@indago/contracts';
import {
  RESOLUTION_PROPOSAL_THRESHOLD,
  SCORING_V1,
} from './types.js';

/**
 * Settle the weighted evidence into a bounded ResolutionScore.
 * Sums positive weights minus contradiction weights, clamped to [min, max].
 */
export function settleScore(
  evidence: readonly ComparisonEvidence[],
): number {
  let raw = SCORING_V1.baseline;
  for (const item of evidence) {
    raw += item.weight;
  }
  return Math.min(
    SCORING_V1.maxScore,
    Math.max(SCORING_V1.minScore, raw),
  );
}

/**
 * Deterministic comparison-status based purely on the settlement.
 *
 * COMPARISON STATUS (what the scoring engine found) is separate from the
 * hypothesis LIFECYCLE status. M-A09 v1 is a comparison engine, NOT a
 * canonical identity decider: every machine comparison (whether high or low
 * signal) is COMPARED_AND_UNRESOLVED — meaning "compared, but NO canonical
 * identity decision was made". That is precisely correct: a high score only
 * yields a PROPOSED hypothesis, never a resolved match (human decision owns
 * acceptance). The sole exception is a hard contradiction, which is a negative
 * machine determination → RESOLVED_NON_MATCH (the score objectively says "not
 * the same identity").
 */
export function deriveComparisonStatus(
  score: number,
  hasHardContradiction: boolean,
): EntityComparisonStatus {
  // `score` is retained as part of the stable comparison-status contract; in
  // v1 the machine comparison state does not vary by score (see doc above).
  void score;
  if (hasHardContradiction) return 'RESOLVED_NON_MATCH';
  // Otherwise COMPARED_AND_UNRESOLVED regardless of score — see note above.
  return 'COMPARED_AND_UNRESOLVED';
}

/**
 * Deterministic hypothesis LIFECYCLE status.
 *
 * CRITICAL: score NEVER auto-accepts. A high score maps only to PROPOSED —
 * the reversibility product requirement. A hard contradiction maps to
 * CONTRADICTED (rejected by the deterministic rule). Low-signal pairs map to
 * UNRESOLVED (no positive identity proposition is manufactured from weak
 * evidence). Human acceptance is a separate, explicit decision path.
 */
export function deriveHypothesisStatus(
  score: number,
  hasHardContradiction: boolean,
): EntityResolutionStatus {
  if (hasHardContradiction) return 'CONTRADICTED';
  if (score < RESOLUTION_PROPOSAL_THRESHOLD) return 'UNRESOLVED';
  return 'PROPOSED';
}

/**
 * Whether a comparison produced enough signal to generate a PROPOSED
 * hypothesis. Highly-scored comparisons generate PROPOSED (never ACCEPTED).
 * Hard contradictions and low-signal pairs do not propose a positive identity.
 */
export function shouldProposeHypothesis(
  score: number,
  hasHardContradiction: boolean,
): boolean {
  return !hasHardContradiction && score >= RESOLUTION_PROPOSAL_THRESHOLD;
}

/** True if any evidence item is a DIFFERENT strong-identifier contradiction. */
export function hasHardContradiction(
  evidence: readonly ComparisonEvidence[],
): boolean {
  return evidence.some(
    (e) => e.relation === 'DIFFERENT' && e.weight === SCORING_V1.hardContradiction,
  );
}
