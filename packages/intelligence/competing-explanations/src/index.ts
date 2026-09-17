// ============================================================================
// @indago/competing-explanations — public surface (Phase 5A-PR15)
//
// Deterministic / structured competing explanations over certified
// PR1-PR14 outputs. Pure function over the supplied closed-world package.
// ============================================================================

// ---- Public API ----
export { generateCompetingExplanations } from './pipeline/generate.js';
export { buildCandidateDrafts } from './pipeline/generate.js';
export { buildExplanationSignals } from './pipeline/signals.js';
export type { DerivedExplanationSignals } from './pipeline/signals.js';
export { CompetingExplanationError, CompetingExplanationErrorCodes } from './pipeline/errors.js';
export type { CompetingExplanationErrorCode } from './pipeline/errors.js';
export { explanationIdentityFor, computeExplanationId } from './pipeline/dedupe.js';
export type { ExplanationSetContext } from './pipeline/dedupe.js';

// ---- Input surface ----
export type { CompetingExplanationInput } from './contracts/competing-explanation-input.js';

// ---- Policy constants ----
export {
  CONSUMED_COMPETING_EXPLANATION_POLICY_VERSION,
  MAX_COMPETING_EXPLANATIONS_BOUND,
  SUPPORT_LEVEL_PRIORITY,
  PRIMARY_EXPLANATION_TYPE,
  ALTERNATIVE_FAMILY_ORDER,
  uncertaintyHeuristic,
} from './contracts/competing-explanation-policy.js';

// ---- Authoritative result types (frozen contract, re-exported for convenience) ----
export type {
  CompetingExplanation,
  CompetingExplanationSet,
  CompetingExplanationType,
  CompetingExplanationBasis,
  CompetingExplanationSupportLevel,
  CompetingExplanationFailureCode,
  CompetingExplanationIdentityV1,
  CompetingExplanationPolicyVersion,
} from '@indago/contracts';
export {
  CompetingExplanationTypeSchema,
  CompetingExplanationBasisSchema,
  CompetingExplanationSupportLevelSchema,
  CompetingExplanationFailureCodeSchema,
  CompetingExplanationIdentityV1Schema,
  CompetingExplanationSchema,
  CompetingExplanationSetSchema,
  CompetingExplanationHoleSchema,
  MAX_COMPETING_EXPLANATIONS,
  COMPETING_EXPLANATION_POLICY_VERSION,
} from '@indago/contracts';