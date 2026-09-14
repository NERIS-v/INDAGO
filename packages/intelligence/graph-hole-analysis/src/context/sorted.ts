// ============================================================================
// Deterministic sorting + deduplication helpers (Phase 5A-PR7)
//
// Every id collection in the analysis package is sorted ascending and
// deduplicated. Stable, byte-deterministic; never relies on insertion order.
// ============================================================================

export function sortedUniqueString(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function sortedUnique<T>(
  values: Iterable<T>,
  key: (value: T) => string,
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const k = key(value);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(value);
  }
  return unique.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Alias whose name makes the intent explicit for maps (dedupe by key). */
export function dedupeByKey<T>(values: readonly T[], key: (value: T) => string): T[] {
  return sortedUnique(values, key);
}