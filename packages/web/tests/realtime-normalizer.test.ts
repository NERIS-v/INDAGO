import { describe, it, expect } from "vitest";
import {
  eventIdentity,
  normalizeEvent,
  EventDeduplicator,
  consolidateStatus,
} from "@/lib/providers/realtime/normalizer";
import type { SseEvent } from "@/lib/realtime/sse-client";
import { INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

describe("realtime event normalization", () => {
  it("normalizes a known event, preserving canonical fields", () => {
    const raw: SseEvent = {
      id: "evt-1",
      investigationId: "",
      action: "EVIDENCE_INGESTED",
      targetType: "EVIDENCE",
      targetId: "ev-1",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const out = normalizeEvent(raw, INVESTIGATION_ID);
    expect(out.id).toBe("evt-1");
    expect(out.action).toBe("EVIDENCE_INGESTED");
    expect(out.targetId).toBe("ev-1");
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("fills a missing investigation id from the provided context", () => {
    const raw: SseEvent = { id: "evt-2", investigationId: "" };
    const out = normalizeEvent(raw, INVESTIGATION_ID);
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("derives a deterministic identity from action+target+timestamp when id is absent", () => {
    const base: SseEvent = {
      investigationId: INVESTIGATION_ID,
      action: "ENTITY_CREATED",
      targetId: "ent-1",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const a = eventIdentity(base);
    const b = eventIdentity({ ...base, targetId: "ent-9" });
    expect(a).not.toBe(b);
    // Stable across calls (deterministic, not Date.now()).
    expect(a).toBe(eventIdentity(base));
  });
});

describe("realtime event dedupe", () => {
  it("accepts unique events and rejects duplicates", () => {
    const dedupe = new EventDeduplicator();
    const ev: SseEvent = { id: "evt-1", investigationId: INVESTIGATION_ID, action: "X" };
    expect(dedupe.accept(ev)).toBe(true);
    expect(dedupe.accept({ ...ev })).toBe(false);
  });

  it("dedupes by signature when no canonical id is present", () => {
    const dedupe = new EventDeduplicator();
    const a: SseEvent = { investigationId: INVESTIGATION_ID, action: "X", targetId: "t", timestamp: "2024-01-01" };
    expect(dedupe.accept(a)).toBe(true);
    expect(dedupe.accept({ ...a })).toBe(false);
  });

  it("respects the bounded window and can be reset", () => {
    const dedupe = new EventDeduplicator(3);
    const events: SseEvent[] = [1, 2, 3, 4].map((n) => ({
      id: `evt-${n}`,
      investigationId: INVESTIGATION_ID,
    }));
    events.forEach((e) => expect(dedupe.accept(e)).toBe(true));
    // evt-1 evicted (window 3), so it is accepted again.
    expect(dedupe.accept({ id: "evt-1", investigationId: INVESTIGATION_ID })).toBe(true);
    dedupe.reset();
    expect(dedupe.size).toBe(0);
  });
});

describe("realtime status consolidation", () => {
  it("maps transport states to a single status", () => {
    expect(consolidateStatus(false, false)).toBe("disconnected");
    expect(consolidateStatus(true, false)).toBe("connected");
    expect(consolidateStatus(true, true)).toBe("error");
    expect(consolidateStatus(false, true)).toBe("error");
  });
});
