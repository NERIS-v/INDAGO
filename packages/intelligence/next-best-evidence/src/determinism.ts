// ============================================================================
// Determinism helpers (Phase 5A-PR10)
//
// PR10 must be byte-reproducible. Every emitted score is produced at full
// IEEE-754 precision and then normalized with `normalizeScore`
// (clamp01 THEN round6) — mirroring the PR5 discipline. Rank comparisons
// therefore never flip on a 0.69999999-vs-0.70000001 representation artifact.
//
// These helpers are PR10-OWNED (tiny, pure, frozen-in-runtime). The frozen
// PR10 utility COMPOSITION lives in @indago/contracts
// (EVIDENCE_UTILITY_POLICY_V1); this module only provides the numeric
// formatting discipline.
// ============================================================================

/** Bound a finite value to [0,1]; non-finite input maps to 0 (fail-closed). */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Round to the deterministic 6-decimal representation (frozen PR5/PR10 precision). */
export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** clamp01 + round6 in one step (the output transform for every emitted score). */
export function normalizeScore(value: number): number {
  return round6(clamp01(value));
}

/** Arithmetic mean over a sorted, bounded input; empty => 0. Deterministic. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}