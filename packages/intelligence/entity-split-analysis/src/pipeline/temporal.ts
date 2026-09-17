// ============================================================================
// Temporal compatibility (Phase 5A-PR16, policy §16)
//
// Derived ONLY from M-A12 domain validity (`validityInterval`) with `eventTime`
// as a point anchor — NEVER createdAt/updatedAt/system time.
//
//   both intervals present, overlapping                     -> COMPATIBLE
//   both intervals present, disjoint                        -> INCOMPATIBLE
//   exactly one interval present, other has an eventTime    -> PARTIALLY_COMPATIBLE
//   neither observation carries a usable temporal fact      -> INSUFFICIENT
//
// No content-semantic inference, no clock, no manufacture of intervals. Reuses
// the PR15/PR14 interval-overlap algorithm (aligned with M-A12 TemporalInterval
// semantics; same algorithm as the PR7 analyst).
// ============================================================================

import type { Observation, TemporalCompatibility, TemporalInterval } from '@indago/contracts';

function instantValue(iso: string): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? -Infinity : at;
}

/** Whether two intervals can refer to overlapping real-world time. Deterministic + conservative. */
export function intervalsOverlap(a: TemporalInterval, b: TemporalInterval): boolean {
  const aStart = instantValue(a.validFrom.value);
  const aEnd = a.validTo ? instantValue(a.validTo.value) : Infinity;
  const bStart = instantValue(b.validFrom.value);
  const bEnd = b.validTo ? instantValue(b.validTo.value) : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Deterministic temporal compatibility between two mentions' observations
 * (policy §16). Absence of temporal facts is uninformative (`ABSENT ≠
 * DIFFERENT`), never a negative.
 */
export function temporalCompatibilityFor(a: Observation, b: Observation): TemporalCompatibility {
  const intervalA = a.validityInterval;
  const intervalB = b.validityInterval;
  if (intervalA !== undefined && intervalB !== undefined) {
    return intervalsOverlap(intervalA, intervalB) ? 'COMPATIBLE' : 'INCOMPATIBLE';
  }
  if (intervalA !== undefined || intervalB !== undefined) {
    const other = intervalA !== undefined ? b : a;
    if (other.eventTime !== undefined || other.observedAt !== undefined) {
      return 'PARTIALLY_COMPATIBLE';
    }
    return 'INSUFFICIENT';
  }
  return 'INSUFFICIENT';
}