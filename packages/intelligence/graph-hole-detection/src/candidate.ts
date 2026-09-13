// ============================================================================
// Candidate identity + materialization (Phase 5A-PR4)
//
// The raw candidate identity uses the FROZEN PR0 contract
// (GraphHoleCandidateIdentityV1) exactly:
//   candidateId = SHA-256(canonicalizeGraphHoleCandidateIdentity(identity))
//
// Rules:
//   - canonicalNodeIds sorted-unique (identity canonicalization re-sorts, but
//     we also emit sorted node/edge/probe arrays).
//   - expectedRelationshipType is SET ONLY when the detector can state one
//     (never an invented "unknown" string).
//   - temporalScope is SET for TEMPORAL_GAP candidates (content-derived).
//   - provenance is built from supporting observations' authoritative sources;
//     a candidate without a resolvable source is refused (never fabricated).
// ============================================================================

import {
  DETECTION_POLICY_VERSION,
  RawGraphHoleCandidateSchema,
  canonicalizeGraphHoleCandidateIdentity,
  type GraphHoleCandidateIdentityV1,
  type GraphHoleDetectorMetadata,
  type RawGraphHoleCandidate,
} from '@indago/contracts';
import { sortedUnique } from './determinism.js';
import { sha256Hex } from './sha256.js';
import type {
  GraphHoleDetectionContext,
  DetectorCandidate,
} from './types.js';

/** Provenance extractor label for PR4 raw candidates. */
export const GRAPH_HOLE_DETECTION_EXTRACTOR = 'graph-hole-detection.v1' as const;

/** Assembly of the frozen PR0 candidate identity. */
export function makeCandidateIdentity(
  context: GraphHoleDetectionContext,
  candidate: DetectorCandidate,
): GraphHoleCandidateIdentityV1 {
  const identity: GraphHoleCandidateIdentityV1 = {
    caseId: context.caseId,
    graphVersionId: context.graphVersionId,
    holeType: candidate.detectorType,
    canonicalNodeIds: sortedUnique(candidate.nodeIds),
    detectionPolicyVersion: DETECTION_POLICY_VERSION,
  };
  if (candidate.expectedRelationshipType !== null) {
    identity.expectedRelationshipType = candidate.expectedRelationshipType;
  }
  if (candidate.temporalScope !== null) {
    identity.temporalScope = candidate.temporalScope;
  }
  return identity;
}

/** Deterministic candidate id: SHA-256 of the canonical candidate identity. */
export function computeCandidateId(
  context: GraphHoleDetectionContext,
  candidate: DetectorCandidate,
): string {
  return sha256Hex(canonicalizeGraphHoleCandidateIdentity(makeCandidateIdentity(context, candidate)));
}

/**
 * Materialize a DetectorCandidate into a RawGraphHoleCandidate.
 *
 * Throws GraphHoleDetectionError when the candidate has no resolvable
 * supporting observation source — PR4 never fabricates a source id.
 */
export function materializeCandidate(
  context: GraphHoleDetectionContext,
  candidate: DetectorCandidate,
  detectorMetadata: GraphHoleDetectorMetadata,
): RawGraphHoleCandidate {
  const supportingObservationIds = sortedUnique(candidate.supportingObservationIds);
  if (supportingObservationIds.length === 0) {
    throw new Error(
      `PR4 candidate requires at least one supporting observation with a resolvable source (${candidate.detectorType})`,
    );
  }
  const sources = sortedUnique(
    supportingObservationIds
      .map((id) => context.sourceByObservationId.get(id) ?? '')
      .filter((sourceId) => sourceId.length > 0),
  );
  if (sources.length === 0) {
    throw new Error(
      `PR4 candidate references observations without a resolvable source (${candidate.detectorType})`,
    );
  }

  // Deterministic single provenance entry: the lexicographically smallest
  // source among the supporting observations. The FULL supporting observation
  // id list is preserved on the candidate itself.
  const sourceId = sources[0];
  const derivedFrom = supportingObservationIds.filter(
    (id) => context.sourceByObservationId.get(id) === sourceId,
  );

  const temporalScope =
    candidate.temporalScope === null ? undefined : candidate.temporalScope;

  return RawGraphHoleCandidateSchema.parse({
    candidateId: computeCandidateId(context, candidate),
    caseId: context.caseId,
    graphVersionId: context.graphVersionId,
    regionId: context.region.regionId,
    detectionPolicyVersion: DETECTION_POLICY_VERSION,
    detectorType: candidate.detectorType,
    nodeIds: sortedUnique(candidate.nodeIds),
    observedEdgeIds: sortedUnique(candidate.observedEdgeIds),
    expectedRelationshipType: candidate.expectedRelationshipType,
    ...(temporalScope === undefined ? {} : { temporalScope }),
    supportingHypothesisIds: sortedUnique(candidate.supportingHypothesisIds),
    supportingObservationIds,
    contradictingObservationIds: sortedUnique(candidate.contradictingObservationIds),
    structuralBasis: candidate.structuralBasis,
    detectorMetadata,
    provenance: {
      sourceId,
      extractor: GRAPH_HOLE_DETECTION_EXTRACTOR,
      ...(derivedFrom.length === 0 ? {} : { derivedFrom }),
    },
  });
}