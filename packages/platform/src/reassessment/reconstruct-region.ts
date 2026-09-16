// ============================================================================
// Region reconstruction — persisted analysis record → GraphHoleRegion (PR12)
//
// The region store persists only the bounded FACT set (identity, seeds, node/
// edge memberships, status, truncation, summary) — never the graph payload.
// Detection/qualification consume the full `GraphHoleRegion` shape, so the
// runtime reconstructs it deterministically from the durable facts. Fields the
// store deliberately does not persist (expansion round records, per-node
// resolution details, semantic trace) are rebuilt as their deterministic
// neutral values; the CONTENT-ADDRESSED identity (which is what detection and
// qualification enforce) is reconstructed byte-exact and VERIFIED against the
// persisted regionId — a mismatch fails closed.
// ============================================================================

import {
  MAX_CONTEXT_OBSERVATIONS,
  MAX_REGION_EDGES,
  MAX_REGION_EXPANSION_ROUNDS,
  MAX_REGION_NODES,
  GRAPH_HOLE_POLICY_VERSION,
  SEMANTIC_RETRIEVAL_POLICY_VERSION,
  canonicalizeRegionIdentity,
  type RegionIdentityV1,
  type RegionStatus,
} from '@indago/contracts';
import type { GraphHoleRegion, RegionLimitationCode } from '@indago/graph-hole-region';
import { hashRegionIdentity } from '@indago/graph-hole-region';
import type { RegionAnalysisRecord } from '../persistence/graph-hole-region-analysis-store.js';
import { GraphHoleStoreError } from '../persistence/graph-hole-errors.js';

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function limitationCodes(record: RegionAnalysisRecord): readonly RegionLimitationCode[] {
  const fromSummary = record.summary?.limitationCodes ?? [];
  if (fromSummary.length > 0) return [...fromSummary] as readonly RegionLimitationCode[];
  return [];
}

/** Rebuild the byte-exact `GraphHoleRegion` from a persisted analysis record. */
export function reconstructRegionFromRecord(record: RegionAnalysisRecord): GraphHoleRegion {
  const nodeIds = sortedUnique(record.nodeIds);
  const edgeIds = sortedUnique(record.edgeIds);
  const seedObservationIds = sortedUnique(record.seedObservationIds);

  const identity: RegionIdentityV1 = {
    caseId: record.caseId,
    graphVersionId: record.graphVersionId,
    ...(record.temporalContext !== null && record.temporalContext !== undefined
      ? { temporalContext: record.temporalContext as RegionIdentityV1['temporalContext'] }
      : {}),
    seedObservationIds,
    nodeIds,
    edgeIds,
    regionPolicyVersion: GRAPH_HOLE_POLICY_VERSION,
    semanticRetrievalPolicyVersion: SEMANTIC_RETRIEVAL_POLICY_VERSION,
  };

  const recomputedRegionId = hashRegionIdentity(identity);
  if (recomputedRegionId !== record.regionId) {
    throw new GraphHoleStoreError(
      'INVALID_IDENTITY',
      `Region reconstruction failed for ${record.regionId}: persisted identity hashes to ${recomputedRegionId}`,
    );
  }

  const limited = limitationCodes(record);
  const status: RegionStatus = record.status as RegionStatus;

  return {
    regionId: record.regionId,
    identity,
    status,
    truncated: record.truncated,
    limitations: limited,
    maxExpansionRounds: MAX_REGION_EXPANSION_ROUNDS,
    maxRegionNodes: MAX_REGION_NODES,
    maxRegionEdges: MAX_REGION_EDGES,
    maxContextObservations: MAX_CONTEXT_OBSERVATIONS,
    expansionRounds: record.summary?.expansionRounds ?? 0,
    seedObservationIds,
    resolvedSeedNodeIds: [],
    unresolvedSeedEntityIds: [],
    seedEdgeIds: [],
    nodeIds,
    edgeIds,
    roundRecords: [],
    semanticExpansion: {
      status: 'DISABLED',
      rounds: [],
      totalSemanticResults: 0,
      totalMappedNodes: 0,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated: false,
    },
  };
}

/** Verify a freshly built region's identity (fail closed on internal mismatch). */
export function verifyRegionConstruction(region: GraphHoleRegion): void {
  const key = canonicalizeRegionIdentity(region.identity);
  if (hashRegionIdentity(region.identity) !== region.regionId) {
    throw new GraphHoleStoreError(
      'INVALID_IDENTITY',
      `Region revisit failed: ${region.regionId} does not hash from its identity (${key})`,
    );
  }
}