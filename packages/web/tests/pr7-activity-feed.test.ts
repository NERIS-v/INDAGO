import { describe, it, expect } from "vitest";
import type { ProviderEvent } from "@/lib/providers/types";
import {
  createActivityFeedState,
  DEFAULT_ACTIVITY_FEED_LIMIT,
  eventKey,
  formatActivityTime,
  reduceActivityBatch,
  reduceActivityEvent,
} from "@/lib/context/activity-feed";

// PR-7 — Activity feed reducer, pure and deterministic.

const INVESTIGATION_ID = "b1e0c9a6-0000-4000-8000-000000000002";

function event(overrides: Partial<ProviderEvent>): ProviderEvent {
  return { investigationId: INVESTIGATION_ID, description: "demo event", ...overrides };
}

const withId = event({ id: "evt-1", action: "INGEST", targetId: "acct-1", timestamp: "2024-06-01T10:00:00Z" });
const compositeA = event({ action: "REVIEW", targetId: "doc-1", timestamp: "2024-06-01T10:05:00Z" });
const compositeB = event({ action: "REVIEW", targetId: "doc-2", timestamp: "2024-06-01T10:06:00Z" });
const sameCompositeDifferentObject = event({ action: "REVIEW", targetId: "doc-1", timestamp: "2024-06-01T10:05:00Z" });

describe("PR-7 activity event keys", () => {
  it("uses the explicit id when present", () => {
    expect(eventKey(withId)).toBe("evt-1");
  });

  it("derives a deterministic composite key without an id", () => {
    expect(eventKey(compositeA)).toBe(eventKey(sameCompositeDifferentObject));
  });

  it("distinguishes different composites", () => {
    expect(eventKey(compositeA)).not.toBe(eventKey(compositeB));
  });

  it("falls back to 'event' for an actionless, idless event", () => {
    expect(eventKey(event({ targetId: "leaf", timestamp: "2024-06-01T10:00:00Z" }))).toBe(
      "event|leaf|2024-06-01T10:00:00Z",
    );
  });
});

describe("PR-7 reduceActivityEvent", () => {
  it("starts empty", () => {
    const state = createActivityFeedState();
    expect(state.events).toEqual([]);
    expect(state.seen.size).toBe(0);
  });

  it("appends newest-first", () => {
    let state = createActivityFeedState();
    state = reduceActivityEvent(
      state,
      event({ action: "INGEST", targetId: "first", timestamp: "T1", description: "first" }),
    );
    state = reduceActivityEvent(
      state,
      event({ action: "INGEST", targetId: "second", timestamp: "T2", description: "second" }),
    );
    expect(state.events.map((e) => e.description)).toEqual(["second", "first"]);
  });

  it("de-duplicates by explicit id", () => {
    const state = reduceActivityEvent(createActivityFeedState(), withId);
    const next = reduceActivityEvent(state, { ...withId, description: "changed" });
    expect(next).toBe(state);
    expect(next.events).toHaveLength(1);
  });

  it("de-duplicates by composite key when no id exists", () => {
    const state = reduceActivityEvent(createActivityFeedState(), compositeA);
    const next = reduceActivityEvent(state, sameCompositeDifferentObject);
    expect(next).toBe(state);
    expect(next.events).toHaveLength(1);
  });

  it("keeps both events when a duplicate composite has a different explicit id", () => {
    let state = createActivityFeedState();
    state = reduceActivityEvent(state, compositeA);
    state = reduceActivityEvent(state, { ...sameCompositeDifferentObject, id: "evt-2" });
    expect(state.events).toHaveLength(2);
  });

  it("bounds the visible list to the newest N", () => {
    let state = createActivityFeedState();
    for (let i = 0; i < 5; i += 1) {
      state = reduceActivityEvent(state, event({ id: `bound-${i}`, description: `e${i}` }), 3);
    }
    expect(state.events).toHaveLength(3);
    expect(state.events.map((e) => e.description)).toEqual(["e4", "e3", "e2"]);
  });

  it("defaults the bound to 100 and drops the oldest beyond it", () => {
    expect(DEFAULT_ACTIVITY_FEED_LIMIT).toBe(100);
    let state = createActivityFeedState();
    for (let i = 0; i < 105; i += 1) {
      state = reduceActivityEvent(state, event({ id: `drop-${i}`, description: `e${i}` }));
    }
    expect(state.events).toHaveLength(100);
    expect(state.events[0]?.description).toBe("e104");
  });

  it("is immutable — the input state is never mutated", () => {
    const input = createActivityFeedState();
    reduceActivityEvent(input, withId);
    expect(input.events).toEqual([]);
    expect(input.seen.size).toBe(0);
    expect(reduceActivityEvent(input, withId)).not.toBe(input);
  });

  it("folds a batch in order without duplicates across folds", () => {
    const batch = [withId, compositeA];
    let state = reduceActivityBatch(createActivityFeedState(), batch);
    expect(state.events.map((e) => e.description)).toEqual([
      compositeA.description,
      withId.description,
    ]);
    const again = reduceActivityBatch(state, batch);
    expect(again).toBe(state);
  });
});

describe("PR-7 formatActivityTime", () => {
  it("renders a stable timestamp", () => {
    expect(formatActivityTime("2024-06-15T10:30:00Z")).toBe("2024-06-15 10:30:00");
  });

  it("renders '--' for a missing timestamp", () => {
    expect(formatActivityTime(undefined)).toBe("--");
  });

  it("renders '--' for an invalid timestamp", () => {
    expect(formatActivityTime("not-a-date")).toBe("--");
  });
});