// ============================================================================
// Region identity + hashing (Phase 5A-PR1)
//
// The identity-frozen contract lives in @indago/contracts
// (RegionIdentityV1Schema / canonicalizeRegionIdentity / RegionStatusSchema).
// This module builds a RegionIdentityV1 from build inputs and computes the
// deterministic regionId:
//
//   regionId = sha256Hex(canonicalizeRegionIdentity(identity))
//
// Canonicalization rules (delegated to the contract):
//   - all ID arrays are sorted as sets before serialization
//   - object keys serialize in sorted order
//   - NO timestamps of now, NO random ids, NO environment state, NO execution
//     bookkeeping enters the identity (traceability lives in build-region
//     metadata, NEVER in the regionId)
//
// A different case / graph version / temporal context / seed set / policy
// version / node set / edge set MUST produce a different regionId.
// ============================================================================

import {
  GRAPH_HOLE_POLICY_VERSION,
  SEMANTIC_RETRIEVAL_POLICY_VERSION,
  canonicalizeRegionIdentity,
} from '@indago/contracts';
import type {
  RegionIdentityV1,
  TemporalInterval,
} from '@indago/contracts';
import { sha256Hex } from './sha256.js';

export interface RegionIdentityInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly temporalContext?: TemporalInterval | null;
  readonly seedObservationIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}

/**
 * Deterministic ascending-unique ordering used for every ID array that leaves
 * this package. Region identity and region output rely on it so that input
 * insertion order never changes the result.
 */
export function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/**
 * Build the frozen V1 region identity for a finished region. The identity is
 * stable and content-addressed: it contains ONLY the inputs that define "what
 * context was analyzed".
 */
export function buildRegionIdentity(input: RegionIdentityInput): RegionIdentityV1 {
  return {
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    temporalContext: input.temporalContext ?? undefined,
    seedObservationIds: sortedUnique(input.seedObservationIds),
    nodeIds: sortedUnique(input.nodeIds),
    edgeIds: sortedUnique(input.edgeIds),
    regionPolicyVersion: GRAPH_HOLE_POLICY_VERSION,
    semanticRetrievalPolicyVersion: SEMANTIC_RETRIEVAL_POLICY_VERSION,
  };
}

/**
 * Deterministic region identifier: SHA-256 over the canonical identity string,
 * lowercase hex (64 chars). Same logical region under the same graph/policy →
 * same regionId. Reordered input sets collapse to the same identity.
 */
export function hashRegionIdentity(identity: RegionIdentityV1): string {
  return sha256Hex(canonicalizeRegionIdentity(identity));
}

/**
 * Convenience: build the identity from finished region parts and hash it in
 * one step (used by the orchestrator).
 */
export function computeRegionId(input: RegionIdentityInput): {
  readonly identity: RegionIdentityV1;
  readonly regionId: string;
} {
  const identity = buildRegionIdentity(input);
  return { identity, regionId: hashRegionIdentity(identity) };
}