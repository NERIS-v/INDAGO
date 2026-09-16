// ============================================================================
// Region recompute — detection → qualification (Phase 5A-PR12)
//
// Drives the frozen PR4 (detection) + PR5 (qualification) pure stages over a
// bounded region context. PURE-INPUT/READ-ONLY: nothing is persisted here.
// Output is the full qualification result keyed by candidateId — deterministic
// and byte-stable for identical inputs.
// ============================================================================

import type {
  GraphHoleQualificationResult,
  QualifiedGraphHoleCandidate,
  RawGraphHoleCandidate,
} from '@indago/contracts';
import { detectGraphHoleCandidates } from '@indago/graph-hole-detection';
import type { DetectionInput } from '@indago/graph-hole-detection';
import { qualifyAndRankGraphHoleCandidates } from '@indago/graph-hole-qualification';
import type { RegionRecomputeContext } from './region-context.js';

export interface RegionRecomputeOutput {
  readonly detectionSummary: unknown;
  readonly qualification: GraphHoleQualificationResult;
  readonly qualifiedByCandidateId: ReadonlyMap<string, QualifiedGraphHoleCandidate>;
  readonly rawCandidates: readonly RawGraphHoleCandidate[];
}

export function recomputeRegion(ctx: RegionRecomputeContext): RegionRecomputeOutput {
  const temporalContext = ctx.region.identity.temporalContext ?? null;
  const detectionInput: DetectionInput = {
    caseId: ctx.scope.caseId,
    graphVersionId: ctx.scope.graphVersionId,
    temporalContext: temporalContext as DetectionInput['temporalContext'],
    region: ctx.region,
    nodes: ctx.nodes as readonly import('@indago/contracts').GraphNode[],
    edges: ctx.edges as readonly import('@indago/contracts').GraphEdge[],
    hypothesisContext: ctx.hypothesisContext,
    observations: ctx.observations.map((o) => ({ id: o.id, sourceId: o.sourceId })),
    communities: undefined,
  };

  const detection = detectGraphHoleCandidates(detectionInput);

  const qualification = qualifyAndRankGraphHoleCandidates({
    caseId: ctx.scope.caseId,
    graphVersionId: ctx.scope.graphVersionId,
    region: ctx.region,
    nodes: detectionInput.nodes,
    edges: detectionInput.edges,
    hypothesisContext: ctx.hypothesisContext,
    candidates: detection.candidates,
    observations: ctx.qualificationObservations,
    communities: undefined,
  });

  const qualifiedByCandidateId = new Map<string, QualifiedGraphHoleCandidate>();
  for (const candidate of qualification.qualifiedCandidates) {
    qualifiedByCandidateId.set(candidate.rawCandidate.candidateId, candidate);
  }
  // Preserve rejected candidates too so downstream mapping sees the full set.
  for (const candidate of qualification.candidates) {
    if (!qualifiedByCandidateId.has(candidate.rawCandidate.candidateId)) {
      qualifiedByCandidateId.set(candidate.rawCandidate.candidateId, candidate);
    }
  }

  return {
    detectionSummary: detection.summary,
    qualification,
    qualifiedByCandidateId,
    rawCandidates: detection.candidates,
  };
}