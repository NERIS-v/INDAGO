// ============================================================================
// ER-Split Explanation Ranking (Phase 5A-PR16, policy §14)
//
// Deterministic canonical ranking key; ascending lexicographic == rank order:
//   [ statusFlips, structuralFlips, identityFlips, diversityFlips,
//     candidateAId, candidateBId, explanationId ]
//
// DESC numeric fields are FLIPPED and zero-padded (PR15-6 lesson: negated JSON
// numbers sort lexically backwards, so fixed-width flipped strings are used).
// Scores are scaled by 1e4 to integers (frozen V1 weights carry ≤ 4 decimals).
// ============================================================================

import type { ErSplitExplanationStatus } from '@indago/contracts';

import { STATUS_PRIORITY } from '../contracts/er-split-policy.js';

export interface RankingInput {
  readonly explanationStatus: ErSplitExplanationStatus;
  readonly structuralFitScore: number;
  readonly identitySupportScore: number;
  readonly supportingObservationIds: readonly string[];
  readonly candidateAId: string;
  readonly candidateBId: string;
  readonly explanationId: string;
}

const MAX_STATUS_PRIORITY = Math.max(...Object.values(STATUS_PRIORITY));
// Flip bound for DESC counts (distinct sources ≤ 30 by contract).
const MAX_EVIDENCE_COUNT = 999;
// Score scale: 0.0000..1.0000 -> 0..10000.
const SCORE_SCALE = 10000;

/** Deterministic canonical ranking key (policy §14). Rank 1 = smallest key. */
export function rankingKeyFor(
  input: RankingInput,
  sourceByObservation: ReadonlyMap<string, string>,
): string {
  const sources = new Set<string>();
  for (const id of input.supportingObservationIds) {
    const sourceId = sourceByObservation.get(id);
    if (sourceId) sources.add(sourceId);
  }
  const statusFlip = (MAX_STATUS_PRIORITY - STATUS_PRIORITY[input.explanationStatus]).toString().padStart(2, '0');
  const structuralFlip = Math.max(0, SCORE_SCALE - Math.round(input.structuralFitScore * SCORE_SCALE)).toString().padStart(5, '0');
  const identityFlip = Math.max(0, SCORE_SCALE - Math.round(input.identitySupportScore * SCORE_SCALE)).toString().padStart(5, '0');
  const diversityFlip = Math.max(0, MAX_EVIDENCE_COUNT - sources.size).toString().padStart(3, '0');
  return `${statusFlip}.${structuralFlip}.${identityFlip}.${diversityFlip}.${input.candidateAId}.${input.candidateBId}.${input.explanationId}`;
}

/** Ascending lexical comparer over rankingKey (rank 1 = smallest key). */
export function sortByRankingKey<T extends { readonly rankingKey: string }>(a: T, b: T): number {
  return a.rankingKey < b.rankingKey ? -1 : a.rankingKey > b.rankingKey ? 1 : 0;
}