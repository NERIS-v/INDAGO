// ============================================================================
// M-A09 Candidate Resolution — public surface
// ============================================================================

export {
  compareCandidates,
  isEligiblePair,
} from './resolver.js';
export type {
  CompareInput,
  CompareResult,
} from './resolver.js';

export {
  deterministicEntityHypothesisId,
  buildEntityHypothesisIdentityKey,
  ENTITY_HYPOTHESIS_IDENTITY_NAMESPACE,
  ENTITY_HYPOTHESIS_IDENTITY_VERSION,
} from './identity.js';
export type { EntityHypothesisIdentityInput } from './identity.js';

export {
  settleScore,
  deriveComparisonStatus,
  deriveHypothesisStatus,
  shouldProposeHypothesis,
  hasHardContradiction,
} from './scoring.js';

export {
  compareStrongIdentifier,
  compareName,
  compareType,
} from './comparison-evidence.js';

export {
  RESOLUTION_BOUNDS,
  RESOLUTION_SCORE_MODEL_VERSION,
  RESOLUTION_PROPOSAL_THRESHOLD,
  SCORING_V1,
} from './types.js';
export type {
  ResolutionCandidate,
  ResolutionResolutionInput,
  ResolutionMetrics,
  MultiPairResolutionInput,
  MultiPairResolutionMetrics,
} from './types.js';
