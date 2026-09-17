// ============================================================================
// Identity Evidence (Phase 5A-PR16, policy §6/§9.5/§12)
//
// Per-pair identity dimension over the M-A08 blocking passes + the highest
// scoring M-A09 hypothesis on the pair (never re-invented). Produces the
// positive/contextual shared-signal codes, the canonical-entity linkage of
// each mention, and the frozen identitySupportScore (policy §12):
//
//   identitySupportScore = clamp01( d·0.55 + c·0.25 + n·0.10 + h − b )
//
//   d = direct   = blockingStrongIdentifier ∨ (comparedMatch ∧ scoreStrong)
//   c = blockingCanonicalValue,  n = blockingNameInitial
//   h = min(0.25, 0.30·score)
//   b = min(0.35, 0.10·|contradictions|) + nonMatch·0.25 + INCOMPATIBLE·0.20
//
// M-A09 `ABSENT ≠ DIFFERENT` is honored: absence never adds to b.
// ============================================================================

import type { CandidatePair, EntityHypothesis, SharedSignalCode, TemporalCompatibility } from '@indago/contracts';

import {
  IDENTITY_HYPOTHESIS_MAX_CONTRIBUTION,
  IDENTITY_HYPOTHESIS_SCORE_WEIGHT,
  IDENTITY_CONTRADICTION_UNIT_BURDEN,
  IDENTITY_CONTRADICTION_BURDEN_CAP,
  IDENTITY_NON_MATCH_BURDEN,
  IDENTITY_TEMPORAL_INCOMPATIBLE_BURDEN,
  IDENTITY_WEIGHT_CANONICAL_VALUE,
  IDENTITY_WEIGHT_NAME_BLOCK,
  IDENTITY_WEIGHT_STRONG_IDENTIFIER,
  RESOLUTION_MATCH_SCORE_THRESHOLD_BOUND,
} from '../contracts/er-split-policy.js';
import type { ErSplitBoundContext } from './boundary.js';
import { sortedUniqueString } from './sorted.js';

/** Pure frozen identity-score computation (policy §12). */
export function computeIdentitySupportScore(input: {
  readonly direct: boolean;
  readonly blockingCanonicalValue: boolean;
  readonly blockingNameInitial: boolean;
  /** 0 when no hypothesis on the pair. */
  readonly hypothesisScore: number;
  readonly contradictionCount: number;
  readonly hypothesisNonMatch: boolean;
  readonly temporalCompatibility: TemporalCompatibility;
}): number {
  const d = input.direct ? 1 : 0;
  const c = input.blockingCanonicalValue ? 1 : 0;
  const n = input.blockingNameInitial ? 1 : 0;
  const h = Math.min(
    IDENTITY_HYPOTHESIS_MAX_CONTRIBUTION,
    IDENTITY_HYPOTHESIS_SCORE_WEIGHT * input.hypothesisScore,
  );
  const contradictionBurden = Math.min(
    IDENTITY_CONTRADICTION_BURDEN_CAP,
    IDENTITY_CONTRADICTION_UNIT_BURDEN * input.contradictionCount,
  );
  const b =
    contradictionBurden +
    (input.hypothesisNonMatch ? IDENTITY_NON_MATCH_BURDEN : 0) +
    (input.temporalCompatibility === 'INCOMPATIBLE' ? IDENTITY_TEMPORAL_INCOMPATIBLE_BURDEN : 0);
  return Math.min(1, Math.max(0, d * IDENTITY_WEIGHT_STRONG_IDENTIFIER + c * IDENTITY_WEIGHT_CANONICAL_VALUE + n * IDENTITY_WEIGHT_NAME_BLOCK + h - b));
}

/** The single, highest-scoring hypothesis on the pair (M-A09 reuse, §6). */
export function highestScoringHypothesis(
  bound: ErSplitBoundContext,
  pair: CandidatePair,
): EntityHypothesis | undefined {
  const hypotheses = bound.hypothesesByPair.get(pair.id) ?? [];
  if (hypotheses.length === 0) return undefined;
  let best: EntityHypothesis | undefined;
  for (const h of hypotheses) {
    if (best === undefined || h.score > best.score) best = h;
  }
  return best;
}

/** Whether ANY hypothesis on the pair has been accepted (authoritative exclusion, §9.5). */
export function hasAcceptedHypothesis(bound: ErSplitBoundContext, pair: CandidatePair): boolean {
  const hypotheses = bound.hypothesesByPair.get(pair.id) ?? [];
  return hypotheses.some((h) => h.status === 'ACCEPTED');
}

/** Canonical entity a mention is currently linked to: the observation's unique entity, else null (§6). */
function canonicalEntityFor(bound: ErSplitBoundContext, candidateId: string): string | null {
  const candidate = bound.universeById.get(candidateId);
  if (candidate === undefined) return null;
  const observation = bound.observationsById.get(candidate.observationId);
  if (observation === undefined) return null;
  return observation.entityIds.length === 1 ? observation.entityIds[0]! : null;
}

export interface IdentityEvidence {
  readonly blockingStrongIdentifier: boolean;
  readonly blockingCanonicalValue: boolean;
  readonly blockingNameInitial: boolean;
  readonly hypothesis: EntityHypothesis | undefined;
  readonly hypothesisComparedMatch: boolean;
  readonly hypothesisScoreStrong: boolean;
  readonly hypothesisNonMatch: boolean;
  /** Validated, sorted-unique counter-evidence ids (preserved, never resolved — §17). */
  readonly hypothesisContradictions: readonly string[];
  /** Validated, sorted-unique genuine positive identity evidence ids (policy §6). */
  readonly supportingObservationIds: readonly string[];
  readonly direct: boolean;
  readonly identitySupportScore: number;
  readonly sharedSignals: readonly SharedSignalCode[];
  readonly canonicalEntityAId: string | null;
  readonly canonicalEntityBId: string | null;
  /** Both mentions already linked to the SAME canonical entity → excluded before scoring (§9.5). */
  readonly unifiedPair: boolean;
  /** An ACCEPTED hypothesis on the pair → already-resolved, never an open split (§9.5). */
  readonly acceptedPair: boolean;
  readonly contradictionCount: number;
}

/**
 * Deterministic identity evidence for one pair (policy §6/§12). PURE — no
 * clock, no mutation, no retrieval beyond the bound indexes.
 */
export function buildIdentityEvidence(
  bound: ErSplitBoundContext,
  pair: CandidatePair,
  temporalCompatibility: TemporalCompatibility,
): IdentityEvidence {
  const blockingStrongIdentifier = pair.blockingPasses.includes('EXACT_STRONG_IDENTIFIER');
  const blockingCanonicalValue = pair.blockingPasses.includes('EXACT_CANONICAL_VALUE');
  const blockingNameInitial = pair.blockingPasses.includes('NAME_INITIAL_BLOCK');
  const hypothesis = highestScoringHypothesis(bound, pair);
  const hypothesisComparedMatch = hypothesis?.comparisonStatus === 'RESOLVED_MATCH';
  const hypothesisScoreStrong = hypothesis !== undefined && hypothesis.score >= RESOLUTION_MATCH_SCORE_THRESHOLD_BOUND;
  const hypothesisNonMatch = hypothesis?.comparisonStatus === 'RESOLVED_NON_MATCH';
  const contradictions = sortedUniqueString(hypothesis?.contradictingObservationIds ?? []);
  const supportingObservationIds = sortedUniqueString(hypothesis?.supportingObservationIds ?? []);
  const direct = blockingStrongIdentifier || (hypothesisComparedMatch && hypothesisScoreStrong);

  const signals: SharedSignalCode[] = [];
  if (blockingStrongIdentifier) signals.push('EXACT_STRONG_IDENTIFIER_SHARED');
  if (blockingCanonicalValue) signals.push('EXACT_CANONICAL_VALUE_SHARED');
  if (blockingNameInitial) signals.push('NAME_INITIAL_BLOCK_SHARED');
  if (hypothesisComparedMatch) signals.push('HYPOTHESIS_COMPARED_MATCH');
  if (hypothesisScoreStrong) signals.push('HYPOTHESIS_SCORE_STRONG');
  if (supportingObservationIds.length > 0) signals.push('SUPPORTING_OBSERVATION');
  if (contradictions.length > 0) signals.push('CONTRADICTING_OBSERVATION');
  if (hypothesisNonMatch) signals.push('HYPOTHESIS_NON_MATCH');
  if (hypothesis?.status === 'REJECTED') signals.push('HYPOTHESIS_REJECTED');
  if (hypothesis?.status === 'REVERSED') signals.push('HYPOTHESIS_REVERSED');

  const canonicalEntityAId = canonicalEntityFor(bound, pair.leftCandidateId);
  const canonicalEntityBId = canonicalEntityFor(bound, pair.rightCandidateId);

  return {
    blockingStrongIdentifier,
    blockingCanonicalValue,
    blockingNameInitial,
    hypothesis,
    hypothesisComparedMatch,
    hypothesisScoreStrong,
    hypothesisNonMatch,
    hypothesisContradictions: contradictions,
    supportingObservationIds,
    direct,
    identitySupportScore: computeIdentitySupportScore({
      direct,
      blockingCanonicalValue,
      blockingNameInitial,
      hypothesisScore: hypothesis?.score ?? 0,
      contradictionCount: contradictions.length,
      hypothesisNonMatch,
      temporalCompatibility,
    }),
    sharedSignals: sortedUniqueString(signals) as readonly SharedSignalCode[],
    canonicalEntityAId,
    canonicalEntityBId,
    unifiedPair:
      canonicalEntityAId !== null && canonicalEntityBId !== null && canonicalEntityAId === canonicalEntityBId,
    acceptedPair: hasAcceptedHypothesis(bound, pair),
    contradictionCount: contradictions.length,
  };
}