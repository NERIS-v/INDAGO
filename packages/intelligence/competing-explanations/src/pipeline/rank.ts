// ============================================================================
// Competing Explanation Ranking (Phase 5A-PR15, policy §14)
//
// Pure deterministic rank key (canonicalized, lexicographically ascending):
//   [ -supportPriority, familyPriority, -evidenceDiversity, -structuralCoverage, explanationId ]
//
// DESC fields are negated so ascending lexical order equals rank priority:
//   1. support level DESC (SUPPORTED > PLAUSIBLE > WEAKLY_SUPPORTED > CONTRADICTED)
//   2. family priority ASC in the FROZEN order (primary, then the four
//      alternatives in ALTERNATIVE_FAMILY_ORDER)
//   3. evidence diversity DESC (distinct sourceId values among supporting obs)
//   4. structural coverage DESC (supporting observation + hypothesis count)
//   5. explanationId ASC (content-addressed hex tie-break)
// ============================================================================

import type { CompetingExplanationSupportLevel, CompetingExplanationType } from '@indago/contracts';
import { canonicalizeDeterministic } from '@indago/contracts';

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

/** Deterministic canonical ranking key (policy §14). */
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
  // Mixed-type array: canonicalizeDeterministic preserves element order (only
  // all-string arrays are sorted), so the priority ordering above is exact.
  return canonicalizeDeterministic([
    -supportPriority,
    familyPriority,
    -evidenceDiversity,
    -structuralCoverage,
    input.explanationId,
  ]);
}

/** Ascending lexical comparer over rankingKey (rank 1 = smallest key). */
export function sortByRankingKey<T extends { readonly rankingKey: string }>(a: T, b: T): number {
  return a.rankingKey < b.rankingKey ? -1 : a.rankingKey > b.rankingKey ? 1 : 0;
}