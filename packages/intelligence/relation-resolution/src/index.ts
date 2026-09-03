// ============================================================================
// M-A10 Relation Resolution — public surface
// ============================================================================

export {
  detectRelationCandidates,
  resolveRelationPair,
  resolveRelationsForCase,
  indexObservations,
  buildObservationsByType,
} from './resolver.js';
export type { RelationResolutionMetrics } from './resolver.js';
export type{
  RelationCandidatePair,
  RelationResolutionInput,
  RelationResolution,
  EntityEvidence,
} from './types.js';

export {
  deterministicRelationHypothesisId,
  buildRelationHypothesisIdentityKey,
  RELATION_HYPOTHESIS_IDENTITY_NAMESPACE,
  RELATION_HYPOTHESIS_IDENTITY_VERSION,
} from './identity.js';
export type { RelationHypothesisIdentityInput } from './identity.js';

export {
  settleRelationScore,
  deriveRelationHypothesisStatus,
  shouldProposeRelationHypothesis,
  hasHardRelationContradiction,
  scoreRelationPair,
  computeEvidenceStrength,
  computeSourceCoverage,
  computeTemporalCoverage,
  hasTemporalRelationProximity,
} from './scoring.js';

export {
  classifyObservationRelationType,
  pickRelationType,
} from './classify.js';

export {
  RELATION_RESOLUTION_BOUNDS,
  RELATION_SCORE_MODEL_VERSION,
  RELATION_PROPOSAL_THRESHOLD,
  RELATION_SCORING_V1,
  RELATION_TYPE_SIGNAL_TYPES,
  RELATION_DIRECTION,
  isRelationDirected,
  resolveRelationDirected,
} from './types.js';
