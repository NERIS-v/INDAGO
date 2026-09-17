// ============================================================================
// Deterministic collection helpers (Phase 5A-PR15)
//
// PURE. Input ordering must never matter: all collections are sorted+deduped
// before any signal derivation (policy §2 — determinism).
// ============================================================================

export function sortedUniqueString(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

export function sortedUnique<T>(items: readonly T[], key: (x: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    if (!byKey.has(k)) byKey.set(k, item);
  }
  return [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, v]) => v);
}