// ============================================================================
// M-A08 Candidate Pair — public surface
// ============================================================================

export {
  blockCandidates,
} from './blocking-engine.js';

export {
  finalizeCandidatePair,
} from './blocking-finalize.js';

export {
  CANDIDATE_PAIR_IDENTITY_NAMESPACE,
  CANDIDATE_PAIR_IDENTITY_VERSION,
  buildCandidatePairIdentityKey,
  canonicalizePairIds,
  deterministicCandidatePairId,
} from './blocking-identity.js';
export type { CandidatePairIdentityInput } from './blocking-identity.js';

export {
  areTypesCompatible,
  deriveSurnameInitial,
} from './blocking-passes.js';

export {
  CANDIDATE_PAIR_BOUNDS,
} from './types.js';
export type {
  BlockingCandidate,
  BlockingConfig,
  BlockingMetrics,
  BlockingResult,
  CandidatePairDraft,
} from './types.js';
