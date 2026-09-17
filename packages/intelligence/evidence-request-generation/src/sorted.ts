// Deterministic sorted-unique helper (mirrors PR15/PR16 conventions).

export function sortedUniqueString(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}