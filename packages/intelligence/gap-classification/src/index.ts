// ============================================================================
// @indago/gap-classification — public surface (Phase 5A-PR14)
//
// Deterministic / structured gap classification over certified PR1-PR13 output.
// ============================================================================

// ---- Public API ----
export { classifyGap } from './pipeline/classification.js';
export { buildClassificationSignals } from './pipeline/signals.js';
export type { DerivedClassificationFacts } from './pipeline/signals.js';
export { GapClassificationError, GapClassificationErrorCodes } from './pipeline/errors.js';
export type { GapClassificationErrorCode } from './pipeline/errors.js';

// ---- Input surface ----
export type { GapClassificationInput } from './contracts/classification-input.js';

// ---- Policy constants ----
export {
  CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION,
  MIN_SIGNIFICANCE,
  MIN_STRUCTURAL_SCORE,
  HIGH_SIGNIFICANCE,
  MEDIUM_SIGNIFICANCE,
  ALTERNATIVE_COVERAGE_NORM,
  SUGGESTED_ACTIONS,
  INSUFFICIENT_CONTEXT_SUGGESTED_ACTIONS,
} from './contracts/classification-policy.js';

// ---- Authoritative result types (frozen contract, re-exported for convenience) ----
export type {
  GapClassificationResult,
  GapClassificationType,
  GapClassificationStatus,
  GapClassificationReasonCode,
  GapClassificationFailureCode,
  GapClassificationSignals,
  GapClassificationReferences,
} from '@indago/contracts';
export {
  GapClassificationTypeSchema,
  GapClassificationStatusSchema,
  GapClassificationReasonCodeSchema,
  GapClassificationFailureCodeSchema,
  GapClassificationReferencesSchema,
  GapClassificationResultSchema,
  GapClassificationSignalsSchema,
  GapClassificationContextCompletenessSchema,
  GAP_CLASSIFICATION_POLICY_VERSION,
} from '@indago/contracts';