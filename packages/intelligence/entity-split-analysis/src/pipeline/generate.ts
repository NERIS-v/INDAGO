// ============================================================================
// ER-Split Explanation Generator (Phase 5A-PR16, policy §9/§10/§18/§19/§31)
//
// Pure deterministic function over the supplied closed-world package:
//   1. validate + bind (buildBoundContext — policy §5/§7),
//   2. per-pair: identity evidence, structural fit, temporal compatibility
//      (policy §6/§12/§13/§16), unified/accepted exclusion (§9.5),
//   3. emission rule (§9b): emit only when identity AND structural scores > 0,
//   4. status ceilings (§10.2), discriminating gaps (§18), uncertainty (§19),
//      handoff (§27), frozen statement (§10.1),
//   5. identity + dedupe (§8/§15), rank (§14), bound to 5 (§14),
//   6. contract-validate the emitted set (drift -> INVALID_INPUT).
//
// No clock, no randomness, no mutation, no retrieval. computedAt is echoed
// from the caller. A non-throwing empty set is an epistemic RESULT (§31);
// boundary violations are typed ErSplitExplanationErrors (§7).
// ============================================================================

import {
  ErSplitExplanationSetSchema,
  ErSplitExplanationSchema,
  type ErSplitExplanationSet,
  type ErSplitExplanation,
} from '@indago/contracts';

import type { ErSplitExplanationInput } from '../contracts/er-split-input.js';
import {
  MAX_ER_SPLIT_EXPLANATIONS_BOUND,
  EMIT_REQUIRES_IDENTITY_SCORE_GT,
  EMIT_REQUIRES_STRUCTURAL_SCORE_GT,
  STATUS_THRESHOLD_PLAUSIBLE_IDENTITY,
  STATUS_THRESHOLD_SUPPORTED_IDENTITY,
  erSplitUncertaintyHeuristic,
} from '../contracts/er-split-policy.js';
import { buildBoundContext, type ErSplitBoundContext } from './boundary.js';
import { computeExplanationId, dedupeByExplanationId, explanationIdentityFor } from './dedupe.js';
import { ErSplitExplanationError, ErSplitExplanationErrorCodes } from './errors.js';
import { buildIdentityEvidence } from './identity-evidence.js';
import { rankingKeyFor, sortByRankingKey } from './rank.js';
import { buildStructuralFit } from './structural-fit.js';
import { temporalCompatibilityFor } from './temporal.js';

function missingDiscriminatingSignals(input: {
  readonly blockingStrongIdentifier: boolean;
  readonly blockingCanonicalValue: boolean;
  readonly temporalCompatibility: ErSplitExplanation['temporalCompatibility'];
  readonly contradictionCount: number;
  readonly hypothesisNonMatch: boolean;
  readonly canonicalEntityAId: string | null;
  readonly canonicalEntityBId: string | null;
  readonly bound: ErSplitBoundContext;
}): ErSplitExplanation['missingDiscriminatingSignals'] {
  const codes: ErSplitExplanation['missingDiscriminatingSignals'] = [];
  if (!input.blockingStrongIdentifier) codes.push('STRONG_IDENTIFIER_ABSENT');
  if (!input.blockingCanonicalValue) codes.push('CANONICAL_VALUE_ABSENT');
  if (input.temporalCompatibility === 'INSUFFICIENT') codes.push('TEMPORAL_EVIDENCE_ABSENT');
  if (input.contradictionCount > 0 || input.hypothesisNonMatch) {
    codes.push('CONTRADICTION_FREE_EVIDENCE_ABSENT');
  }
  if (input.canonicalEntityAId === null || input.canonicalEntityBId === null) {
    codes.push('OBSERVATION_OVERLAP_ABSENT');
  } else {
    const overlap = input.bound.context.observations.some(
      (o) =>
        o.entityIds.includes(input.canonicalEntityAId as string) &&
        o.entityIds.includes(input.canonicalEntityBId as string),
    );
    if (!overlap) codes.push('OBSERVATION_OVERLAP_ABSENT');
  }
  return codes.sort();
}

function statementFor(
  candidateAId: string,
  candidateBId: string,
  sharedSignals: readonly string[],
  direct: boolean,
): string {
  const signals = sharedSignals.join(', ');
  if (direct) {
    return (
      `The expected relationship may be missing because the same actor is represented by two distinct ` +
      `canonical entities within the bounded context: ${candidateAId} and ${candidateBId} share identity ` +
      `evidence (${signals}) but have not been unified, and the hole boundary separates their evidence. ` +
      `This is split-compatible and is NOT an assertion that a split occurred or that either entity is the actor.`
    );
  }
  return (
    `Fragmentation is one structurally compatible possibility: mentions ${candidateAId} and ${candidateBId} ` +
    `carry partial identity evidence (${signals}) and their distinct representations straddle the hole boundary. ` +
    `This formulation does not assert that the representations are actually the same actor.`
  );
}

function deriveStatus(input: {
  readonly identitySupportScore: number;
  readonly structuralFitScore: number;
  readonly direct: boolean;
  readonly borderBridging: boolean;
  readonly blockingCanonicalValue: boolean;
  readonly contradictionCount: number;
  readonly hypothesisNonMatch: boolean;
  readonly temporalCompatibility: ErSplitExplanation['temporalCompatibility'];
}): ErSplitExplanation['explanationStatus'] {
  if (
    input.contradictionCount > 0 ||
    input.hypothesisNonMatch ||
    input.temporalCompatibility === 'INCOMPATIBLE'
  ) {
    return 'CONTRADICTED';
  }
  if (
    input.direct &&
    input.borderBridging &&
    input.identitySupportScore >= STATUS_THRESHOLD_SUPPORTED_IDENTITY
  ) {
    return 'SUPPORTED';
  }
  if (
    input.identitySupportScore >= STATUS_THRESHOLD_PLAUSIBLE_IDENTITY &&
    (input.borderBridging || input.blockingCanonicalValue)
  ) {
    return 'PLAUSIBLE';
  }
  if (
    input.identitySupportScore > EMIT_REQUIRES_IDENTITY_SCORE_GT &&
    input.structuralFitScore > EMIT_REQUIRES_STRUCTURAL_SCORE_GT
  ) {
    return 'WEAKLY_SUPPORTED';
  }
  // Unreachable for emitted rows (emission guarantees both scores > 0).
  return 'WEAKLY_SUPPORTED';
}

/**
 * Deterministic generation of the bounded ER-split explanation set (policy §9).
 * Throws ErSplitExplanationError for §7 boundary violations; returns a valid
 * (possibly empty) ErSplitExplanationSet otherwise.
 */
export function generateErSplitExplanations(input: ErSplitExplanationInput): ErSplitExplanationSet {
  const bound = buildBoundContext(input);

  // Deterministic per-pair iteration (pairs already sorted by id in bound).
  const unranked: ErSplitExplanation[] = [];
  let unifiedCount = 0;
  let nonSplitCount = 0;

  for (const pair of bound.pairs) {
    const left = bound.universeById.get(pair.leftCandidateId)!;
    const right = bound.universeById.get(pair.rightCandidateId)!;
    const observationA = bound.observationsById.get(left.observationId)!;
    const observationB = bound.observationsById.get(right.observationId)!;

    const temporal = temporalCompatibilityFor(observationA, observationB);
    const identity = buildIdentityEvidence(bound, pair, temporal);
    const structural = buildStructuralFit(bound, pair);

    if (identity.unifiedPair || identity.acceptedPair) {
      // Policy §9.5: already-resolved pairs are excluded before scoring; the
      // hypothesis status is authoritative and never overridden.
      unifiedCount += 1;
      continue;
    }

    if (
      identity.identitySupportScore <= EMIT_REQUIRES_IDENTITY_SCORE_GT ||
      structural.structuralFitScore <= EMIT_REQUIRES_STRUCTURAL_SCORE_GT
    ) {
      // Policy §9b: no forced positives. No forced positives means the pair
      // qualifies only when BOTH evidence layers are positive.
      nonSplitCount += 1;
      continue;
    }

    const status = deriveStatus({
      identitySupportScore: identity.identitySupportScore,
      structuralFitScore: structural.structuralFitScore,
      direct: identity.direct,
      borderBridging: structural.structuralFit.borderBridging,
      blockingCanonicalValue: identity.blockingCanonicalValue,
      contradictionCount: identity.contradictionCount,
      hypothesisNonMatch: identity.hypothesisNonMatch,
      temporalCompatibility: temporal,
    });

    const requiresAuthorityDecision = status !== 'CONTRADICTED';
    const requiresTargetedReblocking = status === 'SUPPORTED';
    const candidateAId = pair.leftCandidateId;
    const candidateBId = pair.rightCandidateId;

    const explanationId = computeExplanationId(
      explanationIdentityFor(pair, {
        caseId: bound.caseId,
        graphVersionId: bound.graphVersionId,
        graphHoleId: bound.graphHoleId,
      }),
    );

    const rankingKey = rankingKeyFor(
      {
        explanationStatus: status,
        structuralFitScore: structural.structuralFitScore,
        identitySupportScore: identity.identitySupportScore,
        supportingObservationIds: identity.supportingObservationIds,
        candidateAId,
        candidateBId,
        explanationId,
      },
      bound.sourceByObservation,
    );

    const row: ErSplitExplanation = {
      explanationId,
      graphHoleId: bound.graphHoleId,
      candidatePairId: pair.id,
      candidateAId,
      candidateBId,
      canonicalEntityAId: identity.canonicalEntityAId,
      canonicalEntityBId: identity.canonicalEntityBId,
      sharedSignals: [...identity.sharedSignals],
      hypothesisId: identity.hypothesis?.id ?? null,
      hypothesisComparisonStatus: identity.hypothesis?.comparisonStatus ?? null,
      hypothesisScore: identity.hypothesis?.score ?? null,
      supportingObservationIds: [...identity.supportingObservationIds],
      contradictingObservationIds: [...identity.hypothesisContradictions],
      structuralFit: structural.structuralFit,
      structuralFitScore: structural.structuralFitScore,
      identitySupportScore: identity.identitySupportScore,
      temporalCompatibility: temporal,
      explanationStatus: status,
      uncertainty: erSplitUncertaintyHeuristic(
        identity.identitySupportScore,
        structural.structuralFitScore,
        temporal,
        identity.direct,
      ),
      requiresAuthorityDecision,
      requiresTargetedReblocking,
      targetedReblockingHandoff: requiresTargetedReblocking
        ? {
            targetCandidateIds: [candidateAId, candidateBId],
            targetRegionId: bound.context.region.regionId,
            reason: 'ENTITY_FRAGMENTATION_POSSIBILITY',
          }
        : undefined,
      missingDiscriminatingSignals: missingDiscriminatingSignals({
        blockingStrongIdentifier: identity.blockingStrongIdentifier,
        blockingCanonicalValue: identity.blockingCanonicalValue,
        temporalCompatibility: temporal,
        contradictionCount: identity.contradictionCount,
        hypothesisNonMatch: identity.hypothesisNonMatch,
        canonicalEntityAId: identity.canonicalEntityAId,
        canonicalEntityBId: identity.canonicalEntityBId,
        bound,
      }),
      statement: statementFor(candidateAId, candidateBId, identity.sharedSignals, identity.direct),
      assumptions: [
        'A shared blocking pass plus hypothesis score is identity evidence only in the A1≈A2 direction; it does not prove the actor relationship.',
        'Distinct canonical entities on the two sides of a boundary make fragmentation a structural possibility, not a fact.',
        'Temporal comparison uses domain validity only; absence of temporal facts is uninformative (ABSENT ≠ DIFFERENT).',
      ],
      rankingKey,
      contextSha256: bound.contextSha256,
      policyVersion: 'v1',
    };

    // Contract-level validation, row by row (drift -> INVALID_INPUT, §7).
    const parsed = ErSplitExplanationSchema.safeParse(row);
    if (!parsed.success) {
      throw new ErSplitExplanationError(
        ErSplitExplanationErrorCodes.INVALID_INPUT,
        `emitted explanation failed the frozen contract schema: ${parsed.error.message}`,
      );
    }
    unranked.push(parsed.data);
  }

  // Identity + dedupe, then rank.
  const deduped = dedupeByExplanationId(unranked);
  const ranked = deduped.slice().sort(sortByRankingKey);
  const truncated = ranked.length > MAX_ER_SPLIT_EXPLANATIONS_BOUND;
  const explanations = truncated ? ranked.slice(0, MAX_ER_SPLIT_EXPLANATIONS_BOUND) : ranked;

  const set: ErSplitExplanationSet = {
    caseId: bound.caseId,
    graphVersionId: bound.graphVersionId,
    graphHoleId: bound.graphHoleId,
    policyVersion: 'v1',
    classification: {
      type: bound.classification.type ?? null,
      status: bound.classification.status,
      classificationPolicyVersion: 'v1',
    },
    contextSha256: bound.contextSha256,
    competingExplanationSetContextSha256: bound.competingExplanationSetContextSha256,
    explanations,
    explanationCount: explanations.length,
    truncated,
    excludedPairCounts: {
      unified: unifiedCount,
      nonSplit: nonSplitCount,
    },
    generatedAt: bound.computedAt,
  };

  const result = ErSplitExplanationSetSchema.safeParse(set);
  if (!result.success) {
    throw new ErSplitExplanationError(
      ErSplitExplanationErrorCodes.INVALID_INPUT,
      `generated set failed the frozen contract schema: ${result.error.message}`,
    );
  }
  return result.data;
}