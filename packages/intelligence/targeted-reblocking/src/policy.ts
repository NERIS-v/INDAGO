// ============================================================================
// Targeted Reblocking — versioned policy (Phase 5A-PR11)
//
// The V1 policy is FROZEN: bounds come from the contracts package constants,
// never from configuration. A config override is only permitted in tests
// (bounded extremes) so the core is exercised across cap edges.
// ============================================================================

import {
  TARGETED_REBLOCK_MAX_CANDIDATES,
  TARGETED_REBLOCK_MAX_PAIRS,
  TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS,
} from '@indago/contracts';
import type { TargetedReblockPolicy } from './types.js';

export const TARGETED_REBLOCK_POLICY: TargetedReblockPolicy = {
  version: 'v1',
  maxRegionObservations: TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS,
  maxCandidates: TARGETED_REBLOCK_MAX_CANDIDATES,
  maxPairs: TARGETED_REBLOCK_MAX_PAIRS,
};