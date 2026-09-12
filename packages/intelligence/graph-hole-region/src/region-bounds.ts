// ============================================================================
// Region hard bounds (Phase 5A-PR1)
//
// Deterministic budget application. Candidates MUST already be in deterministic
// order (ascending strings); the kept prefix is the first `budget - current`
// elements in that order, so identical inputs always keep the identical subset.
//
// The bound VALUES are the frozen V1 constants in @indago/contracts
// (MAX_REGION_NODES, MAX_REGION_EDGES, MAX_CONTEXT_OBSERVATIONS,
// MAX_SEMANTIC_RESULTS_PER_ROUND, MAX_TOTAL_SEMANTIC_RESULTS) — this module
// never re-declares thresholds.
// ============================================================================

export interface BoundedSelection<T> {
  /** Elements kept within the budget (deterministic prefix of `candidates`). */
  readonly kept: readonly T[];
  /** Elements that did not fit within the budget. */
  readonly dropped: readonly T[];
  /** true when at least one candidate could not be admitted. */
  readonly boundReached: boolean;
}

/**
 * Admit at most `budget - currentCount` of `candidates` (assumed pre-sorted).
 * A candidate list that already meets/exceeds the budget admits nothing and is
 * reported as a reached bound.
 */
export function applyBudget<T>(
  candidates: readonly T[],
  currentCount: number,
  budget: number,
): BoundedSelection<T> {
  const remaining = budget - currentCount;
  if (remaining <= 0) {
    return { kept: [], dropped: [...candidates], boundReached: true };
  }
  const kept = candidates.slice(0, remaining);
  const dropped = candidates.slice(remaining);
  return { kept, dropped, boundReached: dropped.length > 0 };
}