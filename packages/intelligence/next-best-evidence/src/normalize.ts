// ============================================================================
// Next-Best-Evidence Runtime — Candidate Normalization (Phase 5A-PR10)
//
// Converts ONE PR7 `recommendedEvidence` (LLM-proposed, advisory) into a
// deterministic candidate DRAFT carrying only structured, authoritative
// signals:
//   - resolved discrimination target (validated canonical UUIDs)
//   - grounded observation counts (present in the supplied observations)
//   - per-target temporal fit (deterministic interval overlap, never invented)
//
// The recommendation's `rationale` is preserved as the PROPOSED rationale
// only. Nothing from free text enters the utility derivation.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';
import type { RecommendedEvidence } from '@indago/graph-hole-analysis';
import { intervalsOverlap } from '@indago/graph-hole-qualification';
import type { Pr10AtomicHypothesis } from './types.js';

export interface CandidateDraftDeps {
  readonly uuidToAtomic: ReadonlyMap<string, Pr10AtomicHypothesis>;
  /** Canonical ids of the supplied observations (closed-world grounding). */
  readonly observationIdSet: ReadonlySet<string>;
  /** The gap candidate's claimed temporal scope (may be absent). */
  readonly candidateTemporalScope: TemporalInterval | null | undefined;
}

export interface CandidateDraft {
  readonly recommendationIndex: number;
  readonly evidenceType: RecommendedEvidence['evidenceType'];
  readonly rationale: string;
  /** Validated, canonical UUID discrimination target (may be empty => EIG 0). */
  readonly targetUuids: readonly string[];
  /** Total PR7 advisory observation refs on this recommendation. */
  readonly totalCandidateObservationRefs: number;
  /** How many of those refs resolve to authoritative supplied observations. */
  readonly groundedObservationCount: number;
  /** Per-target temporal fit [0,1] (0.5 = neutral when no scope claim exists). */
  readonly perTargetTemporalFit: readonly number[];
}

/**
 * Normalize one PR7 recommendation into a candidate draft. The caller passes
 * the ALREADY resolved, validated discrimination target (canonical UUIDs);
 * this module never re-reads raw derivedIds from the recommendation. The
 * `targetUuids` here is the fully validated set.
 */
export function buildCandidateDraft(
  deps: CandidateDraftDeps,
  recommendation: RecommendedEvidence,
  recommendationIndex: number,
  targetUuids: readonly string[],
): CandidateDraft {
  const observationRefs = recommendation.supportingObservationIds;

  let groundedObservationCount = 0;
  for (const ref of observationRefs) {
    if (deps.observationIdSet.has(ref)) groundedObservationCount += 1;
  }

  const perTargetTemporalFit: number[] = [];
  for (const uuid of targetUuids) {
    const atomic = deps.uuidToAtomic.get(uuid);
    const atomicScope = atomic?.temporalScope;
    if (atomicScope === undefined || atomicScope === null || deps.candidateTemporalScope === undefined || deps.candidateTemporalScope === null) {
      perTargetTemporalFit.push(0.5);
      continue;
    }
    perTargetTemporalFit.push(intervalsOverlap(deps.candidateTemporalScope, atomicScope) ? 1 : 0);
  }

  return {
    recommendationIndex,
    evidenceType: recommendation.evidenceType,
    rationale: recommendation.rationale,
    targetUuids: [...targetUuids],
    totalCandidateObservationRefs: observationRefs.length,
    groundedObservationCount,
    perTargetTemporalFit,
  };
}