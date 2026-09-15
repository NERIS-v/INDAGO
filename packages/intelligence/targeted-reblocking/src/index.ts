// ============================================================================
// @indago/targeted-reblocking — public surface (Phase 5A-PR11)
// ============================================================================

export {
  blockTargetedRegion,
  runTargetedReblock,
  type BlockTargetedRegionInput,
  type RunTargetedReblockInput,
} from './orchestrate.js';

export {
  observationOverlapsTemporalContext,
  resolveRegionMemberObservations,
  type RegionMemberObservationResolution,
  type ResolveRegionMemberObservationsInput,
} from './member-observations.js';

export {
  selectCandidatesForRegion,
  type RegionCandidateSelection,
} from './region-selector.js';

export {
  boundCandidates,
  boundPairDrafts,
  type CandidateBoundary,
  type PairBoundary,
} from './bounds.js';

export {
  TARGETED_REBLOCK_IDENTITY_NAMESPACE,
  TARGETED_REBLOCK_IDENTITY_VERSION,
  TARGETED_REBLOCK_POLICY_VERSION,
  buildTargetedReblockIdentityKey,
  targetedReblockRunId,
  type TargetedReblockIdentityInput,
} from './identity.js';

export {
  TARGETED_REBLOCK_POLICY,
} from './policy.js';

export {
  parseRegionReference,
  assertRegionReferenceInScope,
} from './region-reference.js';

export {
  TargetedReblockError,
  type TargetedReblockErrorCode,
} from './errors.js';

export type {
  RegionObservation,
  TargetedReblockCoreOutput,
  TargetedReblockPolicy,
} from './types.js';
export type {
  BlockingCandidate,
  CandidatePairDraft,
  TargetedReblockRegionReference,
} from './types.js';