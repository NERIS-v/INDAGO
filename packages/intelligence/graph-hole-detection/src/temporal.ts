// ============================================================================
// Temporal interval reasoning (Phase 5A-PR4)
//
// V1 works at DAY granularity and only ever compares authoritative
// TemporalInterval endpoints (validFrom/validTo). ISO-8601 values in the same
// resolution compare lexicographically. Open-ended or missing endpoints mean
// UNKNOWN (NULL semantics) — we never guess at an unseen boundary, so an
// indeterminate interval can never produce a gap.
//
// This mirrors the closed-interval overlap / open-NULL semantics established
// in M-A13 (graph-hole-region intervalOverlaps), degraded conservatively.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';

export interface ClosedDayWindow {
  readonly dayFrom: string; // yyyy-mm-dd
  readonly dayTo: string; // yyyy-mm-dd
  readonly valueFrom: string; // original endpoint value
  readonly valueTo: string; // original endpoint value
}

/**
 * Extract a closed, day-granular window from an interval. Returns null when
 * the interval is open-ended or missing an endpoint (UNKNOWN, never guessed).
 */
export function closedDayWindow(interval: TemporalInterval): ClosedDayWindow | null {
  if (interval.validFrom === undefined) return null;
  if (interval.validTo === undefined) return null;
  const from = interval.validFrom.value;
  const to = interval.validTo.value;
  if (from.length === 0 || to.length === 0) return null;
  return {
    dayFrom: from.slice(0, 10),
    dayTo: to.slice(0, 10),
    valueFrom: from,
    valueTo: to,
  };
}

/**
 * A strict temporal discontinuity between two closed windows:
 * end(A) < start(B) with at least one whole day between them.
 * Returns the gap window (as an authoritative TemporalInterval) or null when
 * the windows overlap, touch, or either is indeterminate.
 */
export function gapBetween(
  a: TemporalInterval,
  b: TemporalInterval,
): TemporalInterval | null {
  const wa = closedDayWindow(a);
  const wb = closedDayWindow(b);
  if (wa === null || wb === null) return null;
  if (!(wa.dayTo < wb.dayFrom)) return null;
  return {
    validFrom: { value: wa.valueTo, precision: 'day' },
    validTo: { value: wb.valueFrom, precision: 'day' },
    precision: 'day',
    semantics: 'inferred',
  };
}