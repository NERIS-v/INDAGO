// ============================================================================
// PR18 — Candidate scoring (Phase 5A)
//
// Scores ONE PR17 candidate by REUSING PR10's frozen component derivation and
// utility composition — no re-implementation, no second EIG model, no invented
// relevance. Each component is derived from structured closed-world signals:
//
//   EIG        = computeExpectedInformationGain (target hypothesis UUIDs vs
//                all represented competing hypotheses + per-UUID signal counts)
//   relevance  = computeEvidenceRelevance (gap-expectation link, discrimination
//                breadth, observation grounding, per-target temporal fit)
//   feasibility= computeEvidenceFeasibility (evidence type + availability override)
//   cost       = computeEvidenceCost (evidence type + accessibility override)
//   score      = computeEvidenceUtility (FROZEN formula, typed validation)
//
// Existing-evidence exclusion is the SAME fail-closed rule PR10 owns.
// ============================================================================

import type { CandidateEvidenceRequest } from '@indago/evidence-request-generation';
import type { EvidenceType, TemporalInterval } from '@indago/contracts';
import { intervalsOverlap } from '@indago/graph-hole-qualification';
import {
  computeExpectedInformationGain,
  computeEvidenceRelevance,
  computeEvidenceFeasibility,
  computeEvidenceCost,
  computeEvidenceUtility,
} from '../components.js';
import { isCoveredByExistingEvidence } from '../coverage.js';
import type { ExistingEvidenceSummary } from '../types.js';
import type { DerivedCandidateContext } from './context.js';
import type { CandidateScoreInput, ScoredCandidateRequest } from './types.js';

/** Per-target temporal fit (mirrors PR10 normalize: neutral 0.5 when no scope claim). */
function perTargetTemporalFit(
  targetUuids: readonly string[],
  temporalScopeByUuid: ReadonlyMap<string, TemporalInterval | null>,
  gapTemporalScope: TemporalInterval | null | undefined,
): number[] {
  const fit: number[] = [];
  for (const uuid of targetUuids) {
    const atomicScope = temporalScopeByUuid.get(uuid);
    if (
      atomicScope === undefined ||
      atomicScope === null ||
      gapTemporalScope === undefined ||
      gapTemporalScope === null
    ) {
      fit.push(0.5);
      continue;
    }
    fit.push(intervalsOverlap(gapTemporalScope, atomicScope) ? 1 : 0);
  }
  return fit;
}

export interface ScoreCandidateDeps {
  readonly derived: DerivedCandidateContext;
  readonly gapTemporalScope: TemporalInterval | null | undefined;
  readonly existingEvidence?: readonly ExistingEvidenceSummary[];
  readonly sourceAvailabilityByType?: ReadonlyMap<EvidenceType, number>;
  readonly sourceAccessibilityByType?: ReadonlyMap<EvidenceType, number>;
}

/**
 * Score one PR17 candidate under the frozen PR10 utility policy. Pure and
 * deterministic. Returns the scored candidate plus a fail-closed coverage flag.
 */
export function scoreCandidate(
  candidate: CandidateEvidenceRequest,
  deps: ScoreCandidateDeps,
): { scored: ScoredCandidateRequest; covered: boolean } {
  const targetUuids = [...candidate.hypothesisIds];

  const totalCandidateObservationRefs = candidate.supportingObservationIds.length;
  let groundedObservationCount = 0;
  for (const ref of candidate.supportingObservationIds) {
    if (deps.derived.observationIdSet.has(ref)) groundedObservationCount += 1;
  }

  const temporalFit = perTargetTemporalFit(
    targetUuids,
    deps.derived.temporalScopeByUuid,
    deps.gapTemporalScope,
  );

  const eig = computeExpectedInformationGain({
    targetUuids,
    allCompetingUuids: deps.derived.allCompetingUuids,
    signalsByUuid: deps.derived.signalsByUuid,
  });
  const relevance = computeEvidenceRelevance({
    targetUuids,
    gapExpectationUuids: deps.derived.gapExpectationUuids,
    allCompetingUuids: deps.derived.allCompetingUuids,
    groundedObservationCount,
    totalCandidateObservationRefs,
    perTargetTemporalFit: temporalFit,
  });
  const feasibility = computeEvidenceFeasibility(candidate.evidenceType, deps.sourceAvailabilityByType);
  const cost = computeEvidenceCost(candidate.evidenceType, deps.sourceAccessibilityByType);
  const utility = computeEvidenceUtility({
    expectedInformationGain: eig,
    relevance,
    feasibility,
    cost,
  });

  const covered = isCoveredByExistingEvidence(
    candidate.evidenceType,
    targetUuids,
    deps.existingEvidence,
  ).covered;

  const scoreInput: CandidateScoreInput = {
    eig,
    relevance,
    feasibility,
    cost,
    utility,
    perTargetTemporalFit: temporalFit,
    groundedObservationCount,
    totalCandidateObservationRefs,
  };

  return { scored: { ...scoreInput, candidate }, covered };
}