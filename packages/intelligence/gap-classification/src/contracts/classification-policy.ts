// ============================================================================
// Gap Classification Policy (Phase 5A-PR14, frozen V1)
//
// Single source of truth for the deterministic classification constants:
//   - policy version (feature-owned, identically-named on the contract)
//   - predicate thresholds (policy §6, frozen V1)
//   - priority bands (deterministic heuristic — NOT a probability)
//   - canned suggested actions per category (policy §16)
//
// Frozen policy document: docs/architecture/pr14-gap-classification.md.
// ============================================================================

import { GAP_CLASSIFICATION_POLICY_VERSION } from '@indago/contracts';
import type { GapClassificationType } from '@indago/contracts';

/** Policy version consumed by this runtime (must equal the contract literal). */
export const CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION = GAP_CLASSIFICATION_POLICY_VERSION;

/** P1 concealment predicate: significance floor for "clearly significant". */
export const MIN_SIGNIFICANCE = 0.7;

/** P1 concealment predicate: structural-score floor for "strong structural expectation". */
export const MIN_STRUCTURAL_SCORE = 0.78;

/** Priority band boundary for CRITICAL (>=). */
export const HIGH_SIGNIFICANCE = 0.85;

/** Priority band boundary for MEDIUM (>=). */
export const MEDIUM_SIGNIFICANCE = 0.5;

/** Normalizer for alternative-coverage saturation (min(1, competingAtomics / N)). */
export const ALTERNATIVE_COVERAGE_NORM = 3;

/** Canned suggested actions per category (policy §16). Never an authorization. */
export const SUGGESTED_ACTIONS: Readonly<Record<GapClassificationType, readonly string[]>> = {
  MISSING_DATA: ['request evidence covering the expected relationship window'],
  MISSING_COMPARISON: ['generate competing explanations (PR15 owner)'],
  MISSING_INVESTIGATION: ['evaluate the grounded investigative question'],
  INFRASTRUCTURE_GAP: ['represent the missing source/relationship type'],
  CONCEALMENT_CONSISTENT_PATTERN: ['treat as pattern-compatible only; do not assert concealment'],
};

/** Canned suggested action when the classifier was not given enough context. */
export const INSUFFICIENT_CONTEXT_SUGGESTED_ACTIONS = ['provide additional bounded context'] as const;