// ============================================================================
// @indago/graph-hole-reassessment — public surface (PR12 pure core)
//
// Deterministic incremental graph-hole reassessment primitives. No DB, no clock,
// no random, no AI. The platform orchestrator drives these primitives.
// ============================================================================

export { buildReassessmentChangeId } from './change-id.js';

export {
  resolveAffectedSet,
  isGraphEffectingTrigger,
} from './affected-set.js';
export type {
  ReassessmentHypothesisRef,
  ReassessmentGroupRef,
  ReassessmentRegionRef,
  ReassessmentHoleRef,
  ReassessmentChangeReference,
  ResolveAffectedSetInput,
} from './affected-set.js';

export { buildReassessmentPlan } from './plan.js';
export type { BuildReassessmentPlanOptions } from './plan.js';

export {
  deriveReassessmentOutcome,
  satisfiesExpectedCondition,
  nbeRecomputeRequired,
} from './outcome.js';
export type {
  AuthoritativeRelationRef,
  PriorHoleSnapshot,
  CurrentCandidateAssessment,
  DeriveOutcomeInput,
  NbeRecomputeInput,
} from './outcome.js';

export { sha256Hex } from './sha256.js';