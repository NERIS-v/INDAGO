// ============================================================================
// PR5 orchestrator (Phase 5A-PR5)
//
// Pipeline: bounded region + PR3 hypothesis context + PR4 raw candidates
//   → resolve support units → derive scores → evaluate hard gates → dedupe
//   → rank → accounting.
//
// PURE, DETERMINISTIC, READ-ONLY and BOUNDED:
//   - operates ONLY on the supplied region/context/candidates/observations
//   - no global case scan, no semantic retrieval, no LLM, no embeddings
//   - identical PR4 output + context ⇒ byte-identical PR5 result regardless
//     of candidate/hypothesis/observation input order or invocation count
//   - every input candidate maps to EXACTLY ONE output record
//     (qualifiedCount + rejectedCount === totalInputCandidates)
// ============================================================================

import type {
  GraphHoleQualificationResult,
  QualificationFailureReason,
  QualificationAccounting,
  QualifiedGraphHoleCandidate,
  StructuralScoreProfile,
} from '@indago/contracts';
import {
  QUALIFICATION_FAILURE_REASONS,
  DETECTION_POLICY_VERSION,
  GRAPH_HOLE_SCORING_POLICY_VERSION,
} from '@indago/contracts';
import type {
  GraphEdge,
  GraphHoleType,
  RawGraphHoleCandidate,
} from '@indago/contracts';
import type { QualificationInput } from './types.js';
import { resolveIndependentSupportUnits } from './support-units.js';
import {
  deriveStructuralComponents,
  deriveEvidenceSupportScore,
  deriveExpectedInformationValue,
  deriveSignificance,
  type StructuralComponents,
  type ScoringContext,
} from './scoring.js';
import {
  candidateInRegionScope,
  evaluateQualificationGates,
  isResolvedCandidate,
} from './qualify.js';
import { temporalGateIsValid } from './temporal.js';
import { buildRankingKey, byRankingKey } from './ranking.js';

/** Frozen detector evaluation order (mirrors PR4; used only for boundary A checks). */
export const DETECTOR_ORDER: readonly GraphHoleType[] = [
  'MISSING_EDGE',
  'MISSING_PATH',
  'ISOLATED_NODE',
  'BROKEN_CHAIN',
  'TEMPORAL_GAP',
  'COMMUNITY_BOUNDARY',
];

/** All six detector types (region scope). */
function enabledSet(input: QualificationInput): ReadonlySet<GraphHoleType> {
  return new Set(input.enabledDetectors ?? DETECTOR_ORDER);
}

/** Build region-scope neighbor-degree map from the supplied authoritative edges. */
function neighborDegreesOf(
  regionNodeIds: readonly string[],
  edges: readonly GraphEdge[],
): ReadonlyMap<string, number> {
  const nodeSet = new Set(regionNodeIds);
  const adjacency = new Map<string, Set<string>>();
  for (const nodeId of regionNodeIds) adjacency.set(nodeId, new Set());
  for (const edge of edges) {
    if (!nodeSet.has(edge.sourceNodeId) || !nodeSet.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  }
  const degrees = new Map<string, number>();
  for (const [nodeId, neighbors] of adjacency) {
    degrees.set(nodeId, neighbors.size);
  }
  return degrees;
}

function structuralComponentsToProfile(components: StructuralComponents): StructuralScoreProfile {
  const profile: StructuralScoreProfile = { patternStrength: components.patternStrength };
  profile.connectivitySupport = components.connectivitySupport;
  profile.contextualSupport = components.contextualSupport;
  if (components.temporalSupport !== null) profile.temporalSupport = components.temporalSupport;
  if (components.communitySupport !== null) profile.communitySupport = components.communitySupport;
  return profile;
}

interface ProcessedCandidate {
  readonly record: QualifiedGraphHoleCandidate;
  readonly reasons: readonly QualificationFailureReason[];
  readonly qualified: boolean;
}

/**
 * Deterministic processing order: candidateId ASC, then input index ASC. This
 * makes first-wins deduplication independent of input array order.
 */
function deterministicProcessOrder(candidates: readonly RawGraphHoleCandidate[]): number[] {
  const indices = candidates.map((_, i) => i);
  indices.sort((a, b) => {
    const ca = candidates[a]!;
    const cb = candidates[b]!;
    if (ca.candidateId < cb.candidateId) return -1;
    if (ca.candidateId > cb.candidateId) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return indices;
}

/**
 * PR5 entry point: qualify, score, dedupe and rank the raw candidate set.
 */
export function qualifyAndRankGraphHoleCandidates(
  input: QualificationInput,
): GraphHoleQualificationResult {
  const enabledDetectors = enabledSet(input);
  const scoringContext: ScoringContext = {
    region: input.region,
    hypothesisContext: input.hypothesisContext,
    observations: input.observations,
    neighborDegrees: neighborDegreesOf(input.region.nodeIds, input.edges),
    communities: input.communities ?? null,
  };

  const processed: ProcessedCandidate[] = [];
  const seenCandidateIds = new Set<string>();

  for (const index of deterministicProcessOrder(input.candidates)) {
    const candidate = input.candidates[index]!;
    const regionScopeValid = candidateInRegionScope(candidate, input.region);
    const detectorEnabled = enabledDetectors.has(candidate.detectorType);

    const support = resolveIndependentSupportUnits(candidate, input.observations);
    const supportResolvable =
      regionScopeValid && detectorEnabled && support.missingObservationIds.length === 0;

    const structural = deriveStructuralComponents(candidate, scoringContext);
    const evidence = deriveEvidenceSupportScore(candidate, { result: support });
    const information = deriveExpectedInformationValue(candidate, { result: support });
    const significance = deriveSignificance(
      structural.structuralScore,
      evidence.score,
      information.score,
    );

    const temporalValid = temporalGateIsValid({
      candidate,
      region: input.region,
      observations: input.observations,
      hypothesisContext: input.hypothesisContext,
    });
    const resolved = isResolvedCandidate(candidate, input.edges);
    const isDuplicate = seenCandidateIds.has(candidate.candidateId);
    seenCandidateIds.add(candidate.candidateId);

    const gates = evaluateQualificationGates({
      candidate,
      caseId: input.caseId,
      graphVersionId: input.graphVersionId,
      region: input.region,
      supportResolvable,
      supportResult: support,
      structuralScore: structural.structuralScore,
      significance,
      temporalValid,
      isDuplicate,
      resolved,
    });

    const rankingKey = buildRankingKey({
      significance,
      structuralScore: structural.structuralScore,
      evidenceSupportScore: evidence.score,
      expectedInformationValue: information.score,
      candidateId: candidate.candidateId,
    });

    const record: QualifiedGraphHoleCandidate = {
      rawCandidate: candidate,
      qualified: gates.qualified,
      failureReasons: [...gates.reasons],
      structuralScore: structural.structuralScore,
      evidenceSupportScore: evidence.score,
      expectedInformationValue: information.score,
      significance,
      independentSupportUnitIds: [...support.keys],
      structuralComponents: structuralComponentsToProfile(structural.components),
      scoreComponents: {
        evidenceSupport: evidence.components,
        expectedInformationValue: information.components,
      },
      rankingKey,
      regionStatus: input.region.status,
      scoringPolicyVersion: GRAPH_HOLE_SCORING_POLICY_VERSION,
    };

    processed.push({ record, reasons: gates.reasons, qualified: gates.qualified });
  }

  // Deterministic partition + ordering.
  const candidates = processed.map((p) => p.record).sort(byRankingKey);
  const qualifiedCandidates = processed
    .filter((p) => p.qualified)
    .map((p) => p.record)
    .sort(byRankingKey);
  const rejectedCandidates = candidates.filter((c) => !c.qualified);

  const accounting = buildAccounting(processed);

  return {
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    candidates,
    qualifiedCandidates,
    rejectedCandidates,
    accounting,
    detectionPolicyVersion: DETECTION_POLICY_VERSION,
    scoringPolicyVersion: GRAPH_HOLE_SCORING_POLICY_VERSION,
  };
}

function buildAccounting(processed: readonly ProcessedCandidate[]): QualificationAccounting {
  const qualifiedCount = processed.filter((p) => p.qualified).length;
  const rejectedCount = processed.length - qualifiedCount;

  const reasonCounts = new Map<QualificationFailureReason, number>();
  for (const reason of QUALIFICATION_FAILURE_REASONS) reasonCounts.set(reason, 0);
  for (const p of processed) {
    for (const reason of p.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const failureReasonCounts = QUALIFICATION_FAILURE_REASONS
    .filter((reason) => (reasonCounts.get(reason) ?? 0) > 0)
    .map((reason) => ({ reason, count: reasonCounts.get(reason) ?? 0 }));

  const truncationRejections = processed.filter((p) => p.reasons.includes('REGION_TRUNCATED')).length;
  const deduplicationRejections = processed.filter((p) => p.reasons.includes('DUPLICATE')).length;

  return {
    totalInputCandidates: processed.length,
    qualifiedCount,
    rejectedCount,
    failureReasonCounts,
    truncationRejections,
    deduplicationRejections,
  };
}