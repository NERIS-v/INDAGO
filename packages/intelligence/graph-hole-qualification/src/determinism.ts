// ============================================================================
// Determinism helpers (Phase 5A-PR5)
//
// Scores are COMPUTED at full IEEE-754 precision then ROUNDED to 6 decimal
// places before being serialized, compared, or ranked. Rounding to 6dp makes
// distinct rounded score values differ by >= 1e-6, so ordinal comparisons can
// never flip because of a 0.69999999 vs 0.70000001 representation artifact.
//
// Documented numeric representation:
//   - every emitted score is `round6(clamp01(x))` where clamp01 = max(0,min(1,x)).
//   - rankingKeys embed `(1 - roundedScore).toFixed(6)` so ascending string
//     order == descending rounded-score order, with candidateId as the final
//     ascending tie-break.
// ============================================================================

/** Bound a value to [0,1]. */
export function clamp01(value: number): number {
  if (Number.isFinite(value) === false) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Round to a deterministic 6-decimal representation (the frozen PR5 precision). */
export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** clamp01 + round6 in one step (the frozen output transform for every score). */
export function normalizeScore(value: number): number {
  return round6(clamp01(value));
}

/** Average of values (empty => 0). Input length is bounded; deterministic. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Fixed-width 6dp string embedding the DESC order of a rounded score. */
export function scoreRankToken(roundedScore: number): string {
  return (1 - roundedScore).toFixed(6);
}