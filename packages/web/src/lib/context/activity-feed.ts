// ============================================================================
// PR-7 — Activity feed (pure reducer)
//
// The ACTIVITY tab consumes the existing realtime seam (connect + subscribe)
// and folds every ProviderEvent into an immutable, bounded, de-duplicated
// feed. Pure so tests can exercise determinism without timers/streams.
// ============================================================================

import type { ProviderEvent } from "@/lib/providers/types";

export interface ActivityFeedState {
  readonly events: readonly ProviderEvent[];
  readonly seen: ReadonlySet<string>;
}

export const DEFAULT_ACTIVITY_FEED_LIMIT = 100;

export function createActivityFeedState(): ActivityFeedState {
  return { events: [], seen: new Set() };
}

/** De-duplication key mirrors the realtime normalizer: an explicit event id
 *  wins; otherwise a deterministic action|targetId|timestamp composite. */
export function eventKey(event: ProviderEvent): string {
  return (
    event.id ??
    `${event.action ?? "event"}|${event.targetId ?? ""}|${event.timestamp ?? ""}`
  );
}

export function reduceActivityEvent(
  state: ActivityFeedState,
  event: ProviderEvent,
  limit: number = DEFAULT_ACTIVITY_FEED_LIMIT,
): ActivityFeedState {
  const key = eventKey(event);
  if (state.seen.has(key)) return state;
  const seen = new Set(state.seen);
  seen.add(key);
  const events = [event, ...state.events];
  return { seen, events: events.length > limit ? events.slice(0, limit) : events };
}

/** Fold an ordered batch (e.g. the realtime memory-bank replay on subscribe). */
export function reduceActivityBatch(
  state: ActivityFeedState,
  events: readonly ProviderEvent[],
  limit: number = DEFAULT_ACTIVITY_FEED_LIMIT,
): ActivityFeedState {
  let next = state;
  for (const event of events) next = reduceActivityEvent(next, event, limit);
  return next;
}

export function formatActivityTime(timestamp?: string): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toISOString().slice(0, 19).replace("T", " ");
}