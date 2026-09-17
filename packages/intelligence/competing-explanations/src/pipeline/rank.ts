// ============================================================================
// Competing Explanation Ranking (Phase 5A-PR15, policy §14)
//
// Pure deterministic rank key (fixed-width, ascending lexicographic == rank):
//   [ support-flip, familyPriority, coverage-flip, diversity-flip, explanationId ]
//
// DESC fields are FLIPPED (max - value) so ascending lexical order equals rank:
//   1. support level DESC (SUPPORTED > PLAUSIBLE > WEAKLY_SUPPORTED > CONTRADICTED)
//   2. family priority ASC in the FROZEN order (primary, then the four
//      alternatives in ALTERNATIVE_FAMILY_ORDER)
//   3. evidence diversity DESC (distinct sourceId values among supporting obs)
//   4. structural coverage DESC (supporting observation + hypothesis count)
//   5. explanationId ASC (content-addressed hex tie-break)
//
// Numeric fields are zero-padded STRINGS (not JSON numbers): a negated numeric
// tuple serialized to JSON sorts lexically ("-4" < "-5"), which silently broke
// the frozen order — fixed-width flipped digits keep the encoding exact.
// ============================================================================

import type { CompetingExplanationSupportLevel, CompetingExplanationType } from '@indago/contracts';

import {
  ALTERNATIVE_FAMILY_ORDER,
  SUPPORT_LEVEL_PRIORITY,
} from '../contracts/competing-explanation-policy.js';

export interface RankingInput {
  readonly explanationType: CompetingExplanationType;
  readonly supportLevel: CompetingExplanationSupportLevel;
  readonly supportingObservationIds: readonly string[];
  readonly supportingHypothesisIds: readonly string[];
  readonly explanationId: string;
}

const MAX_SUPPORT_PRIORITY = Math.max(...Object.values(SUPPORT_LEVEL_PRIORITY));
// Flip bound for DESC count fields (well above any realistic context size).
const MAX_COVERAGE_FLIP = 999;

function distinctSourceCount(
  observationIds: readonly string[],
  sourceByObservation: ReadonlyMap<string, string>,
): number {
  const sources = new Set<string>();
  for (const id of observationIds) {
    const sourceId = sourceByObservation.get(id);
    if (sourceId) sources.add(sourceId);
  }
  return sources.size;
}

/** Deterministic canonical ranking key (policy §14). Rank 1 = smallest key. */
export function rankingKeyFor(
  input: RankingInput,
  primaryType: CompetingExplanationType,
  sourceByObservation: ReadonlyMap<string, string>,
): string {
  const supportPriority = SUPPORT_LEVEL_PRIORITY[input.supportLevel];
  const familyPriority =
    input.explanationType === primaryType
      ? 0
      : ALTERNATIVE_FAMILY_ORDER.indexOf(input.explanationType) + 1;
  const evidenceDiversity = distinctSourceCount(input.supportingObservationIds, sourceByObservation);
  const structuralCoverage =
    input.supportingObservationIds.length + input.supportingHypothesisIds.length;
  // DESC fields are flipped; fields are zero-padded so lexicographic == numeric.
  const supportRank = (MAX_SUPPORT_PRIORITY - supportPriority).toString().padStart(2, '0');
  const familyRank = familyPriority.toString().padStart(2, '0');
  const coverageRank = Math.max(0, MAX_COVERAGE_FLIP - structuralCoverage).toString().padStart(4, '0');
  const diversityRank = Math.max(0, MAX_COVERAGE_FLIP - evidenceDiversity).toString().padStart(4, '0');
  return `${supportRank}.${familyRank}.${coverageRank}.${diversityRank}.${input.explanationId}`;
}

/** Ascending lexical comparer over rankingKey (rank 1 = smallest key). */
export function sortByRankingKey<T extends { readonly rankingKey: string }>(a: T, b: T): number {
  return a.rankingKey < b.rankingKey ? -1 : a.rankingKey > b.rankingKey ? 1 : 0;
}