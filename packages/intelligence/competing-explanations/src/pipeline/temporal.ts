// ============================================================================
// Temporal overlap discipline (Phase 5A-PR15, policy §13)
//
// Same PURE interval-overlap check PR14 uses (aligned with M-A12
// TemporalInterval semantics; same algorithm as the PR7 analyst). Used ONLY
// to decide the TEMPORAL_EXPLANATION grounded signal — never content-semantic
// inference. No clock.
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