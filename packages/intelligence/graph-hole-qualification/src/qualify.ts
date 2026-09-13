// ============================================================================
// Qualification gates (Phase 5A-PR5)
//
// PR5 enforces the frozen hard gates in GRAPH_HOLE_POLICY_V1.qualification
// (requiresAllHardGates === true) and maps each failed gate to a closed,
// deterministic failure reason. A candidate that passes ALL gates is
// qualified.
//
// Gate → reason mapping (V1):
//   GRAPH_VERSION_EXISTS / CASE_ISOLATION_VALID → MISSING_AUTHORITY
//   PROJECTION_NOT_TRUNCATED                  → REGION_TRUNCATED
//   REGION_SATURATED                          → REGION_NOT_SATURATED
//   MINIMUM_INDEPENDENT_SUPPORT_UNITS         → INSUFFICIENT_SUPPORT
//   MINIMUM_STRUCTURAL_SCORE                  → LOW_STRUCTURAL_SCORE
//   MINIMUM_SIGNIFICANCE                      → LOW_SIGNIFICANCE
//   CANDIDATE_NOT_RESOLVED                    → ALREADY_RESOLVED
//   CANDIDATE_NOT_DUPLICATE                   → DUPLICATE
//   TEMPORAL_CONTEXT_VALID                    → TEMPORAL_INCONSISTENCY
//   COMPUTATION_BOUNDS_SATISFIED              → satisfied by construction:
//          PR5 itself is a bounded, fail-closed computation. Detector-local
//          PR4 bounds are DESIGNED limits (emitted with accounting), and do
//          not mark a candidate incomplete for qualification purposes.
//
// CONTRASTS ARE NOT DISQUALIFYING (§19): contradictions lower some scores but
// never by themselves reject a candidate.
// ============================================================================

import {
  GRAPH_HOLE_POLICY_V1,
  type QualificationFailureReason,
} from '@indago/contracts';
import type {
  GraphEdge,
  RawGraphHoleCandidate,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { SupportUnitResolutionResult } from './support-units.js';
import { QUALIFICATION_FAILURE_REASONS } from '@indago/contracts';

const QUALIFICATION = GRAPH_HOLE_POLICY_V1.qualification;

export interface GateParams {
  readonly candidate: RawGraphHoleCandidate;
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly region: GraphHoleRegion;
  /** True when every supporting observation resolved a support unit (fail-closed). */
  readonly supportResolvable: boolean;
  readonly supportResult: SupportUnitResolutionResult;
  readonly structuralScore: number;
  readonly significance: number;
  readonly temporalValid: boolean;
  /** True when this candidateId was already seen in the deterministic pass. */
  readonly isDuplicate: boolean;
  /** True when a canonical edge now materializes the gap (authoritative edges). */
  readonly resolved: boolean;
}

/** Whether the closed world holds: candidate stays inside the region scope. */
export function candidateInRegionScope(
  candidate: RawGraphHoleCandidate,
  region: GraphHoleRegion,
): boolean {
  const nodeSet = new Set(region.nodeIds);
  const edgeSet = new Set(region.edgeIds);
  for (const nodeId of candidate.nodeIds) {
    if (!nodeSet.has(nodeId)) return false;
  }
  for (const edgeId of candidate.observedEdgeIds) {
    if (!edgeSet.has(edgeId)) return false;
  }
  return true;
}

/**
 * ALREADY_RESOLVED gate: the structural absence the candidate claims is now
 * materialized by an authoritative canonical edge in the supplied region
 * scope. MISSING_EDGE / MISSING_PATH / BROKEN_CHAIN / TEMPORAL_GAP /
 * COMMUNITY_BOUNDARY candidates are resolved when a NON-observed edge connects
 * any two of the candidate's nodeIds with a matching relation type. An
 * ISOLATED_NODE candidate has degree 0 by construction, so any incident
 * canonical edge on its singleton node resolves it. Expected-type-null
 * candidates are resolved by ANY direct connecting edge (the gap claim is
 * untyped).
 */
export function isResolvedCandidate(
  candidate: RawGraphHoleCandidate,
  edges: readonly GraphEdge[],
): boolean {
  const nodeSet = new Set(candidate.nodeIds);
  const observedEdgeIds = new Set(candidate.observedEdgeIds);
  for (const edge of edges) {
    if (observedEdgeIds.has(edge.id)) continue;
    const connectsCandidateNodes =
      nodeSet.has(edge.sourceNodeId) && nodeSet.has(edge.targetNodeId);
    if (!connectsCandidateNodes) continue;
    if (edge.status === 'ARCHIVED') continue;
    if (candidate.expectedRelationshipType === null) return true;
    if (edge.relationType === candidate.expectedRelationshipType) return true;
  }
  return false;
}

/**
 * Evaluate every hard gate and return the sorted, unique failure reasons plus
 * the qualification verdict. Reasons are sorted by the closed enum order so
 * the output array is byte-stable regardless of evaluation order.
 */
export function evaluateQualificationGates(
  params: GateParams,
): { reasons: readonly QualificationFailureReason[]; qualified: boolean } {
  const reasons = new Set<QualificationFailureReason>();

  // CASE_ISOLATION_VALID + GRAPH_VERSION_EXISTS (authority boundary).
  if (
    params.candidate.caseId !== params.caseId ||
    params.candidate.graphVersionId !== params.graphVersionId
  ) {
    reasons.add('MISSING_AUTHORITY');
  }

  // PROJECTION_NOT_TRUNCATED.
  if (params.region.truncated) reasons.add('REGION_TRUNCATED');

  // REGION_SATURATED.
  if (params.region.status !== QUALIFICATION.eligibleRegionStatus) {
    reasons.add('REGION_NOT_SATURATED');
  }

  // MINIMUM_INDEPENDENT_SUPPORT_UNITS.
  if (params.supportResolvable === false) {
    reasons.add('MISSING_AUTHORITY');
  }
  if (params.supportResult.keys.length < QUALIFICATION.minIndependentSupportUnits) {
    reasons.add('INSUFFICIENT_SUPPORT');
  }

  // MINIMUM_STRUCTURAL_SCORE.
  if (params.structuralScore < QUALIFICATION.minStructuralScore) {
    reasons.add('LOW_STRUCTURAL_SCORE');
  }

  // MINIMUM_SIGNIFICANCE.
  if (params.significance < QUALIFICATION.minSignificance) {
    reasons.add('LOW_SIGNIFICANCE');
  }

  // CANDIDATE_NOT_DUPLICATE.
  if (params.isDuplicate) reasons.add('DUPLICATE');

  // CANDIDATE_NOT_RESOLVED.
  if (params.resolved) reasons.add('ALREADY_RESOLVED');

  // TEMPORAL_CONTEXT_VALID.
  if (params.temporalValid === false) reasons.add('TEMPORAL_INCONSISTENCY');

  const sorted = QUALIFICATION_FAILURE_REASONS.filter((reason) => reasons.has(reason));
  return { reasons: sorted, qualified: sorted.length === 0 };
}