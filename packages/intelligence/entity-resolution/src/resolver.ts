// ============================================================================
// M-A09 Candidate Resolution — pure comparison engine
//
// PURE: no Prisma, BullMQ, Redis, network clients, clock, or random. Fully
// deterministic given the same CandidatePair + candidate values + scoring
// model version.
//
// Flow:
//   CandidatePair
//     → candidate A / candidate B (EntityMentionCandidate)
//     → typed ComparisonEvidence[]
//     → deterministic scoring model v1 → ResolutionScore
//     → CandidateResolution (Q: candidatePairId, score, evidence,
//       supporting/contradicting observations, comparisonStatus, status,
//       scoreModelVersion)
//
// The engine NEVER:
//   - creates a canonical Entity
//   - performs merge/split
//   - creates relations/graph edges/leads
//   - resolves across case boundaries
//   - auto-accepts a hypothesis (score → PROPOSED at most)
//
// The platform persistence layer maps a CandidateResolution to a durable
// EntityHypothesis record.
// ============================================================================

import type {
  CandidatePair,
  CandidateResolution,
  ComparisonEvidence,
  EntityMentionCandidate,
} from '@indago/contracts';
import {
  compareName,
  compareStrongIdentifier,
  compareType,
} from './comparison-evidence.js';
import {
  deriveComparisonStatus,
  deriveHypothesisStatus,
  settleScore,
  hasHardContradiction,
  shouldProposeHypothesis,
} from './scoring.js';
import {
  RESOLUTION_BOUNDS,
  RESOLUTION_SCORE_MODEL_VERSION,
} from './types.js';

export interface CompareInput {
  readonly pair: CandidatePair;
  readonly leftCandidate: EntityMentionCandidate;
  readonly rightCandidate: EntityMentionCandidate;
}

export interface CompareResult {
  readonly candidateResolution: CandidateResolution;
  readonly proposed: boolean;
}

/**
 * Deterministic eligibility guard. Type-incompatible pairs are skipped with a
 * typed reason — they should not normally reach M-A09 (M-A08 gates them), but
 * defensive validation must exist and must NOT crash the worker.
 *
 * Same-observation pairs are excluded by M-A08 default; defensively, if a pair
 * with identical observationIds arrives it is treated as ineligible (no
 * self-corroboration).
 */
export function isEligiblePair(
  leftCandidate: EntityMentionCandidate,
  rightCandidate: EntityMentionCandidate,
): boolean {
  if (leftCandidate.observationId === rightCandidate.observationId) return false;
  const lType = leftCandidate.entityType;
  const rType = rightCandidate.entityType;
  // Same concrete type, or both untyped.
  if (lType !== undefined && rType !== undefined) return lType === rType;
  if (lType === undefined && rType === undefined) return true;
  return false;
}

/**
 * Derive the supporting and contradicting observation IDs from the evidence.
 *
 * SEMANTICS (Point 2 of the M-A09 semantic review):
 *   - support = genuine POSITIVE identity evidence. Only when the evidence
 *     contains an actual identity-favoring relation (EXACT_MATCH identifier,
 *     EXACT_MATCH name, INITIAL_MATCH) do we place BOTH candidate observations
 *     in the SUPPORTING set — they host the matching values.
 *   - contradiction = explicit MUTUALLY-EXCLUSIVE identity evidence. Only a
 *     DIFFERENT strong-identifier item (both sides present, different values)
 *     places both candidate observations in the CONTRADICTING set.
 *   - The two sets are NEVER overlapped by construction: a genuinely positive
 *     comparison (no DIFFERENT item) has an empty contradicting set and a
 *     populated supporting set; a hard contradiction has a populated
 *     contradicting set and an empty supporting set. We do NOT blindly label
 *     every observation of a pair as "supporting", and we never place the
 *     same observation ID in both sets.
 *
 * ABSENT ≠ DIFFERENT (Point 3-5 of the earlier review): ABSENT data
 * (LEFT_ABSENT / RIGHT_ABSENT / BOTH_ABSENT) is not positive and not
 * contradictory — it contributes to neither set.
 */
function deriveObservations(
  leftCandidate: EntityMentionCandidate,
  rightCandidate: EntityMentionCandidate,
  evidence: readonly ComparisonEvidence[],
): {
  supportingObservationIds: string[];
  contradictingObservationIds: string[];
} {
  const supporting = new Set<string>();
  const contradicting = new Set<string>();

  let hasHardContradictionEvidence = false;
  let hasPositiveEvidence = false;

  for (const item of evidence) {
    if (item.feature === 'TYPE') continue; // type is eligibility, not evidence
    if (item.relation === 'DIFFERENT' && item.weight < 0) {
      hasHardContradictionEvidence = true;
    } else if (item.relation === 'EXACT_MATCH' || item.relation === 'INITIAL_MATCH') {
      hasPositiveEvidence = true;
    }
  }

  if (hasHardContradictionEvidence) {
    // Explicitly mutually exclusive → contradicting (not supporting).
    contradicting.add(leftCandidate.observationId);
    contradicting.add(rightCandidate.observationId);
  } else if (hasPositiveEvidence) {
    // Genuine positive identity evidence → supporting.
    supporting.add(leftCandidate.observationId);
    supporting.add(rightCandidate.observationId);
  }
  // No positive and no contradictory evidence → both sets empty.

  return {
    supportingObservationIds: [...supporting].slice(0, RESOLUTION_BOUNDS.maxSupportingObservationIds),
    contradictingObservationIds: [...contradicting].slice(0, RESOLUTION_BOUNDS.maxContradictingObservationIds),
  };
}

/**
 * Deterministically compare a single CandidatePair into a CandidateResolution.
 * Pure. Returns the resolution plus whether a PROPOSED hypothesis should be
 * generated.
 */
export async function compareCandidates(
  input: CompareInput,
  scoreModelVersion: string = RESOLUTION_SCORE_MODEL_VERSION,
): Promise<CompareResult> {
  const { pair, leftCandidate, rightCandidate } = input;

  const eligible = isEligiblePair(leftCandidate, rightCandidate);
  const typeEvidence = compareType(leftCandidate, rightCandidate);

  if (!eligible) {
    // Type-incompatible / same-observation pair: represent a low-score,
    // non-proposed resolution (defensive, typed deterministic reason).
    const evidence = [typeEvidence];
    const score = settleScore(evidence);
    const contradicts = hasHardContradiction(evidence);
    const { supportingObservationIds, contradictingObservationIds } =
      deriveObservations(leftCandidate, rightCandidate, evidence);
    const candidateResolution: CandidateResolution = {
      candidatePairId: pair.id,
      leftCandidateId: pair.leftCandidateId,
      rightCandidateId: pair.rightCandidateId,
      score,
      comparisonEvidence: evidence,
      supportingObservationIds,
      contradictingObservationIds,
      comparisonStatus: deriveComparisonStatus(score, contradicts),
      status: deriveHypothesisStatus(score, contradicts),
      scoreModelVersion,
    };
    return { candidateResolution, proposed: shouldProposeHypothesis(score, contradicts) };
  }

  // Build the evidence set deterministically.
  const evidence: ComparisonEvidence[] = [];
  const idEvidence = compareStrongIdentifier(leftCandidate, rightCandidate);
  if (idEvidence !== undefined) evidence.push(idEvidence);
  evidence.push(...compareName(leftCandidate, rightCandidate));
  // Type compatibility is always present for eligible pairs.
  evidence.push(typeEvidence);

  const score = settleScore(evidence);
  const contradicts = hasHardContradiction(evidence);
  const { supportingObservationIds, contradictingObservationIds } =
    deriveObservations(leftCandidate, rightCandidate, evidence);

  const candidateResolution: CandidateResolution = {
    candidatePairId: pair.id,
    leftCandidateId: pair.leftCandidateId,
    rightCandidateId: pair.rightCandidateId,
    score,
    comparisonEvidence: evidence.slice(0, RESOLUTION_BOUNDS.maxComparisonEvidence),
    supportingObservationIds,
    contradictingObservationIds,
    comparisonStatus: deriveComparisonStatus(score, contradicts),
    status: deriveHypothesisStatus(score, contradicts),
    scoreModelVersion,
  };

  return {
    candidateResolution,
    proposed: shouldProposeHypothesis(score, contradicts),
  };
}
