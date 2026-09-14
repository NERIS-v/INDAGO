// ============================================================================
// Temporal overlap discipline (Phase 5A-PR7)
//
// Small, PURE interval-overlap check used ONLY for the temporal-context
// completeness flag (does the candidate's claimed temporal scope overlap the
// region's declared temporal window?). No clock, no inference. "No overlap"
// is a deterministic OBSERVED relationship between two intervals — it never
// claims anything about the real world.
//
// Semantics used here (aligned with M-A12 TemporalInterval):
//   - An interval with no validTo is open-ended toward +∞ (still covering any
//     validFrom at or after the window's start).
//   - validFrom < validTo is the well-formed direction; a degenerate handled
//     case (equal bounds) is treated as an instantaneous point.
//   - A null interval is treated as "unbounded/unknown": it does NOT itself
//     prove coverage — coverage requires the declared window.
//
// NOTE: this is intentionally NOT exported as a general-purpose interval
// library. PR7 only uses it to derive a completeness METADATA flag; the
// authoritative interval semantics stay in @indago/contracts.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';

/** Precedence of an interval boundary (later = later in time). */
function instantValue(iso: string, milliOffset: number): number {
  const at = Date.parse(iso);
  // NaN-parsing is treated as unknown: fall far before/after so "unknown"
  // boundaries degenerate conservatively (documented, deterministic).
  if (Number.isNaN(at)) return -Infinity;
  return at + milliOffset;
}

/**
 * Whether two intervals can refer to overlapping real-world time. Deterministic
 * and conservative: an "unknown-precision" edge is treated by its string value.
 */
export function intervalsOverlap(a: TemporalInterval | null, b: TemporalInterval | null): boolean {
  if (a === null || b === null) return false;
  // [vaStart, vaEnd] ∩ [vbStart, vbEnd] is non-empty when
  //   vaStart <= vbEnd AND vbStart <= vaEnd  (closed intervals).
  const aStart = instantValue(a.validFrom.value, 0);
  const aEnd = a.validTo ? instantValue(a.validTo.value, 0) : Infinity;
  const bStart = instantValue(b.validFrom.value, 0);
  const bEnd = b.validTo ? instantValue(b.validTo.value, 0) : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}