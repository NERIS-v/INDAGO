// ============================================================================
// Next-Best-Evidence Runtime — Candidate Deduplication (§15-Frozen, §26)
//
// Dedup identity = the FROZEN canonical evidence-request identity
// (canonicalizeNextBestEvidenceRequest over {gapId, evidenceType,
// discriminatesAmongIds, hypothesisIds}). The winner of each identity group is
// chosen by the frozen rank order; the collapse is never silent (the runtime
// reports how many equivalent candidates were absorbed).
//
// Determinism rule: the whole pool is ranked BEFORE the per-gap output cap is
// applied, so consuming N% of the rank order never changes which candidates
// win the K slots.
// ============================================================================

import {
  canonicalizeNextBestEvidenceRequest,
  EVIDENCE_UTILITY_RANK_ORDER,
} from '@indago/contracts';
import type { EvidenceType } from '@indago/contracts';
import type { ComputedEvidenceUtility } from './components.js';

/** One scored, not-yet-deduplicated candidate (internal runtime). */
export interface ScoredCandidate {
  readonly recommendationIndex: number;
  readonly evidenceType: EvidenceType;
  readonly rationale: string;
  readonly targetUuids: readonly string[];
  readonly utility: ComputedEvidenceUtility;
}

/**
 * The immutable ranked/selected candidate surface. Matches the frozen
 * NextBestEvidenceCandidateSchema shape EXACTLY (plus an extra internal
 * recommendationIndex that is stripped before serialization, since the frozen
 * schema is strict).
 */
export interface RankedEvidenceCandidate {
  readonly canonicalRequestKey: string;
  readonly gapId: string;
  readonly hypothesisIds: readonly string[];
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
  readonly utility: ComputedEvidenceUtility;
  readonly rationale: string;
  readonly recommendationIndex: number;
}

/** Deterministic 3-way comparison per the frozen rank order. */
export function compareRankedCandidates(
  a: RankedEvidenceCandidate,
  b: RankedEvidenceCandidate,
): number {
  for (const step of EVIDENCE_UTILITY_RANK_ORDER) {
    if (step === 'SCORE_DESC') {
      if (a.utility.score !== b.utility.score) return b.utility.score - a.utility.score;
    } else if (step === 'EXPECTED_INFORMATION_GAIN_DESC') {
      if (a.utility.eig !== b.utility.eig) return b.utility.eig - a.utility.eig;
    } else if (step === 'RELEVANCE_DESC') {
      if (a.utility.relevance !== b.utility.relevance) return b.utility.relevance - a.utility.relevance;
    } else if (step === 'FEASIBILITY_DESC') {
      if (a.utility.feasibility !== b.utility.feasibility) {
        return b.utility.feasibility - a.utility.feasibility;
      }
    } else {
      // CANONICAL_REQUEST_KEY_ASC
      if (a.canonicalRequestKey !== b.canonicalRequestKey) {
        return a.canonicalRequestKey < b.canonicalRequestKey ? -1 : 1;
      }
    }
  }
  // Identical canonical identity AND identical utility: the frozen rank steps
  // cannot distinguish the members. Break the tie on the rationale string so
  // the winner is independent of input order (byte-stable total order). When
  // the rationale is identical too, deduplicateAndRank resolves the survivor
  // by the smaller recommendationIndex (also input-order-independent). Only
  // members of the SAME identity group ever reach this point.
  if (a.rationale !== b.rationale) {
    return a.rationale < b.rationale ? -1 : 1;
  }
  return 0;
}

/** Deterministic canonical identity key of a candidate under a gap. */
export function canonicalIdentityKey(
  gapId: string,
  evidenceType: EvidenceType,
  targetUuids: readonly string[],
): string {
  return canonicalizeNextBestEvidenceRequest({
    gapId,
    evidenceType,
    discriminatesAmongIds: targetUuids,
    hypothesisIds: targetUuids,
  });
}

export interface DedupResult {
  /** Deduplicated, fully ranked candidates for the gap. */
  readonly ranked: readonly RankedEvidenceCandidate[];
  /** How many equivalent candidates were absorbed into winners. */
  readonly deduplicatedCount: number;
}

/**
 * Deduplicate scored candidates by the frozen canonical identity, select the
 * deterministic winner per identity group, and rank the winners by the frozen
 * rank order. Pure and order-of-input independent.
 */
export function deduplicateAndRank(
  gapId: string,
  scored: readonly ScoredCandidate[],
): DedupResult {
  const groups = new Map<string, ScoredCandidate[]>();

  for (const candidate of scored) {
    const key = canonicalIdentityKey(gapId, candidate.evidenceType, candidate.targetUuids);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [candidate]);
    } else {
      existing.push(candidate);
    }
  }

  let deduplicatedCount = 0;
  const winners: RankedEvidenceCandidate[] = [];

  for (const [key, members] of groups) {
    deduplicatedCount += members.length - 1;

    // Pick the deterministic winner purely by the frozen rank order.
    let winner: ScoredCandidate | undefined;
    for (const member of members) {
      if (winner === undefined) {
        winner = member;
        continue;
      }
      const compared = compareRankedCandidates(
        toRanked(key, gapId, winner),
        toRanked(key, gapId, member),
      );
      if (compared > 0) {
        winner = member;
      } else if (compared === 0) {
        // Fully identical under every frozen rank step AND the rationale
        // tiebreak. Prefer the member that appeared earlier in the (bounded)
        // PR7 recommendation stream so the survivor is byte-stable even under
        // input shuffling. recommendationIndex is an internal-only field that
        // is stripped before the frozen selection output, so this structural
        // tiebreak cannot affect the emitted selection.
        if (member.recommendationIndex < winner.recommendationIndex) {
          winner = member;
        }
      }
    }
    if (winner === undefined) continue;

    winners.push(toRanked(key, gapId, winner));
  }

  winners.sort(compareRankedCandidates);

  return { ranked: winners, deduplicatedCount };
}

function toRanked(key: string, gapId: string, candidate: ScoredCandidate): RankedEvidenceCandidate {
  return {
    canonicalRequestKey: key,
    gapId,
    hypothesisIds: [...candidate.targetUuids],
    evidenceType: candidate.evidenceType,
    discriminatesAmongIds: [...candidate.targetUuids],
    utility: candidate.utility,
    rationale: candidate.rationale,
    recommendationIndex: candidate.recommendationIndex,
  };
}