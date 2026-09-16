// ============================================================================
// Temporal overlap discipline (Phase 5A-PR14)
//
// Small, PURE interval-overlap check used ONLY for the temporal-context
// completeness flag (policy §8): does the candidate's claimed temporal scope
// overlap the region's declared temporal window? No clock, no inference.
// Aligned with M-A12 TemporalInterval semantics; authoritative interval
// semantics stay in @indago/contracts. Same algorithm as the PR7 analyst.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';

function instantValue(iso: string, milliOffset: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return -Infinity;
  return at + milliOffset;
}

/** Whether two intervals can refer to overlapping real-world time. Deterministic + conservative. */
export function intervalsOverlap(a: TemporalInterval | null, b: TemporalInterval | null): boolean {
  if (a === null || b === null) return false;
  const aStart = instantValue(a.validFrom.value, 0);
  const aEnd = a.validTo ? instantValue(a.validTo.value, 0) : Infinity;
  const bStart = instantValue(b.validFrom.value, 0);
  const bEnd = b.validTo ? instantValue(b.validTo.value, 0) : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}