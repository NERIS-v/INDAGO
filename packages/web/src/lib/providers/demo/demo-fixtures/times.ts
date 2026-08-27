// ============================================================================
// Time helpers for deterministic demo fixtures.
//
// ObservedTime/IngestionTime require precision: "exact" (literal).
// EventTime allows any TimestampPrecision.
// ============================================================================

import type {
  ObservedTime,
  EventTime,
  TimestampPrecision,
} from "@indago/contracts";

/** ISO 8601 base used for all fixture times (deterministic). */
const BASE = "2024-06-01T09:00:00.000Z";

/** Build an ObservedTime (precision literal "exact") from a YYYY-MM-DD date. */
export function obs(date: string, time = "12:00:00"): ObservedTime {
  return { value: `${date}T${time}.000Z`, precision: "exact" };
}

/** Build an EventTime with an explicit precision. */
export function evt(
  date: string,
  precision: TimestampPrecision = "exact",
  time = "12:00:00",
): EventTime {
  return { value: `${date}T${time}.000Z`, precision };
}

/** Canonical deterministic "now" for fixtures (fixed, not Date.now()). */
export function createdNow(): ObservedTime {
  return obs("2024-07-01");
}

/** Global static anchor used for derived timestamps (kept constant). */
export const TIME_ANCHOR = BASE;
