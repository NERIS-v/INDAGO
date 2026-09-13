// ============================================================================
// Determinism helpers (Phase 5A-PR4)
//
// Every emitted id collection in PR4 output is sorted-unique ascending.
// No map/object iteration order, no randomness, no clock values are ever used.
// ============================================================================

/** Sorted ascending, deduplicated copy of a string array. */
export function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Deterministic ascending comparator. */
export function byAscendingId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Unordered pair key for structural dedupe/pair evaluation: `lo|hi`. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}