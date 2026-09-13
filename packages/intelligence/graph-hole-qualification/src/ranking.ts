// ============================================================================
// Deterministic ranking (Phase 5A-PR5)
//
// Qualified candidates are ranked by (frozen order):
//   1. significance DESC
//   2. structuralScore DESC
//   3. evidenceSupportScore DESC
//   4. expectedInformationValue DESC
//   5. candidateId ASC
//
// Implementation: every emitted candidate carries a byte-stable `rankingKey`
// that embeds the (1 - roundedScore).toFixed(6) tokens in ranking order
// followed by candidateId. Ascending lexicographic order of the key == the
// frozen ranking order, so a single string sort is sufficient and there is
// NO floating-point comparator (0.7 vs 0.7000000000000001 cannot flip an
// ordering: scores are already round6'd, so distinct score values differ by
// >= 1e-6 and tokenize distinctly).
//
// No timestamps, randomness, map-iteration order, or model output is ever
// used. A given candidate set always produces the same ordering.
// ============================================================================

import type { QualifiedGraphHoleCandidate } from '@indago/contracts';
import { scoreRankToken } from './determinism.js';

/** Byte-stable composite ranking key (the final ordering token). */
export function buildRankingKey(input: {
  readonly significance: number;
  readonly structuralScore: number;
  readonly evidenceSupportScore: number;
  readonly expectedInformationValue: number;
  readonly candidateId: string;
}): string {
  return [
    scoreRankToken(input.significance),
    scoreRankToken(input.structuralScore),
    scoreRankToken(input.evidenceSupportScore),
    scoreRankToken(input.expectedInformationValue),
    input.candidateId,
  ].join('|');
}

/** Ascending rankingKey comparator. Equal keys fall back to candidateId ASC. */
export function byRankingKey(
  a: QualifiedGraphHoleCandidate,
  b: QualifiedGraphHoleCandidate,
): number {
  if (a.rankingKey < b.rankingKey) return -1;
  if (a.rankingKey > b.rankingKey) return 1;
  const aId = a.rawCandidate.candidateId;
  const bId = b.rawCandidate.candidateId;
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}