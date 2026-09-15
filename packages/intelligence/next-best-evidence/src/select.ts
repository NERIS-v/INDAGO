// ============================================================================
// Next-Best-Evidence Runtime — Per-Gap Selection Core (Phase 5A-PR10)
//
// The pure, deterministic heart of PR10. Given ONE gap's closed-world input,
// produces the ranked selection snapshot for that gap.
//
// Pipeline (all deterministic, no LLM, no I/O):
//   1. Build closed-world lookups (atomics, signals, competing explanations).
//   2. Iterate PR7 recommended evidence, bounded by
//      maxCandidateRequestsConsideredPerGap (truncation surfaced, never silent).
//      Each recommendation:
//        a. resolve + validate its discrimination target (fail-closed drop on
//           any unresolvable reference — a partially-validated claim is not
//           accepted);
//        b. exclude when already-represented evidence fully covers it;
//        c. derive utility components and compose the frozen score;
//   3. Deduplicate by the frozen canonical identity (deterministic winner).
//   4. Rank by the frozen rank order; bound output to
//      maxEvidenceRequestsPerGap (truncation surfaced).
//
// Nothing here writes, persists, authorizes, or acquires.
// ============================================================================

import {
  MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP,
  MAX_EVIDENCE_REQUESTS_PER_GAP,
} from '@indago/contracts';
import type { NextBestEvidenceGapInput, GapSelectionAccounting } from './types.js';
import {
  buildAtomicLookup,
  buildUuidSignalMap,
  buildUuidToAtomicMap,
} from './references.js';
import {
  extractCompetingExplanations,
  resolveDiscriminationTarget,
} from './discrimination.js';
import { buildCandidateDraft } from './normalize.js';
import { isCoveredByExistingEvidence } from './coverage.js';
import {
  computeExpectedInformationGain,
  computeEvidenceRelevance,
  computeEvidenceFeasibility,
  computeEvidenceCost,
  computeEvidenceUtility,
} from './components.js';
import {
  deduplicateAndRank,
  type RankedEvidenceCandidate,
  type ScoredCandidate,
} from './dedup.js';

export interface GapSelectionCoreResult {
  readonly gapId: string;
  readonly rankedRequests: readonly RankedEvidenceCandidate[];
  readonly accounting: GapSelectionAccounting;
}

/**
 * Run the deterministic selection pipeline for ONE gap. Pure: same input ⇒
 * byte-equivalent output. Callers must have already passed the PR8/PR9/PR5
 * gate (assertSelectionGate) — this function assumes the gate holds.
 */
export function selectForGap(input: NextBestEvidenceGapInput): GapSelectionCoreResult {
  const atomicLookup = buildAtomicLookup(input.hypothesisContext);
  const uuidToAtomic = buildUuidToAtomicMap(input.hypothesisContext);
  const signalsByUuid = buildUuidSignalMap(input.hypothesisContext);
  const observationIdSet = new Set(input.observations.map((o) => o.id));

  const competing = extractCompetingExplanations(input.analysis, atomicLookup);
  const competingSet = new Set(competing.allCompetingUuids);

  const recommendations = input.analysis.recommendedEvidence;
  const candidateTemporalScope = input.candidate.rawCandidate.temporalScope;

  const scored: ScoredCandidate[] = [];
  let recommendationsSeen = 0;
  let unresolvedReferenceDrops = 0;
  let existingEvidenceExclusions = 0;
  let candidatePoolTruncated = false;

  const loopBound = Math.min(recommendations.length, MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP);

  for (let i = 0; i < loopBound; i += 1) {
    const recommendation = recommendations[i];
    if (recommendation === undefined) break;

    recommendationsSeen += 1;

    const target = resolveDiscriminationTarget(
      recommendation.discriminatesAmongIds ?? [],
      atomicLookup,
      competingSet,
    );

    if (target.unresolvableTargets > 0) {
      unresolvedReferenceDrops += 1;
      continue;
    }

    const draft = buildCandidateDraft(
      { uuidToAtomic, observationIdSet, candidateTemporalScope },
      recommendation,
      i,
      target.targetUuids,
    );

    const coverage = isCoveredByExistingEvidence(
      draft.evidenceType,
      draft.targetUuids,
      input.existingEvidence,
    );
    if (coverage.covered) {
      existingEvidenceExclusions += 1;
      continue;
    }

    const eig = computeExpectedInformationGain({
      targetUuids: draft.targetUuids,
      allCompetingUuids: competing.allCompetingUuids,
      signalsByUuid,
    });
    const relevance = computeEvidenceRelevance({
      targetUuids: draft.targetUuids,
      gapExpectationUuids: competing.gapExpectationUuids,
      allCompetingUuids: competing.allCompetingUuids,
      groundedObservationCount: draft.groundedObservationCount,
      totalCandidateObservationRefs: draft.totalCandidateObservationRefs,
      perTargetTemporalFit: draft.perTargetTemporalFit,
    });
    const feasibility = computeEvidenceFeasibility(draft.evidenceType, input.sourceAvailabilityByType);
    const cost = computeEvidenceCost(draft.evidenceType, input.sourceAccessibilityByType);
    const utility = computeEvidenceUtility({
      expectedInformationGain: eig,
      relevance,
      feasibility,
      cost,
    });

    scored.push({
      recommendationIndex: i,
      evidenceType: draft.evidenceType,
      rationale: draft.rationale,
      targetUuids: draft.targetUuids,
      utility,
    });
  }

  if (recommendations.length > MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP) {
    candidatePoolTruncated = true;
  }

  const dedup = deduplicateAndRank(input.gapId, scored);

  let ranked = [...dedup.ranked];
  const rankedLimitHit = ranked.length > MAX_EVIDENCE_REQUESTS_PER_GAP;
  if (rankedLimitHit) {
    ranked = ranked.slice(0, MAX_EVIDENCE_REQUESTS_PER_GAP);
  }

  const accounting: GapSelectionAccounting = {
    gapId: input.gapId,
    recommendationsSeen,
    unresolvedReferenceDrops,
    existingEvidenceExclusions,
    deduplicatedCandidates: dedup.deduplicatedCount,
    distinctCandidates: dedup.ranked.length,
    candidatesConsidered: dedup.ranked.length,
    candidatesRanked: ranked.length,
    truncated: candidatePoolTruncated || rankedLimitHit,
  };

  return { gapId: input.gapId, rankedRequests: ranked, accounting };
}