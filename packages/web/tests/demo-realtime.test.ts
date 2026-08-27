import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDemoRealtimeProvider } from "@/lib/providers/demo/realtime";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import { operationFinancialShadowEvents } from "@/lib/providers/demo/demo-fixtures/events";
import { INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import type { DataModeConfig, ProviderEvent } from "@/lib/providers/types";

const config: DataModeConfig = {
  mode: "demo",
  demoCaseId: INVESTIGATION_ID,
  demoTimingScale: 1,
  isDevelopment: true,
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("demo realtime provider", () => {
  it("replays the event sequence in deterministic order, then stops", () => {
    const state = createDemoWorkspaceState("workspace:x");
    const stream = createDemoRealtimeProvider(state, config);
    const got: ProviderEvent[] = [];
    const unsub = stream.subscribe((e) => got.push(e));

    stream.connect(INVESTIGATION_ID);
    expect(stream.getStatus()).toBe("connecting");

    // Advance past the connect latency + the full event stream. Event delays
    // are 0..1800ms; the strongest delay before the first is the connect gap.
    vi.advanceTimersByTime(10_000);

    expect(got.length).toBe(operationFinancialShadowEvents.length);
    got.forEach((ev, i) => {
      expect(ev.id).toBe(operationFinancialShadowEvents[i].id);
    });
    // Sequence is exact and ordered.
    expect(got.map((e) => e.action)).toEqual(
      operationFinancialShadowEvents.map((e) => e.action),
    );

    // No further events after the sequence completes.
    const before = got.length;
    vi.advanceTimersByTime(10_000);
    expect(got.length).toBe(before);
    unsub();
    stream.disconnect();
  });

  it("status reaches connected after connect latency", () => {
    const state = createDemoWorkspaceState("workspace:x");
    const stream = createDemoRealtimeProvider(state, config);
    stream.connect(INVESTIGATION_ID);
    expect(stream.getStatus()).toBe("connecting");
    vi.advanceTimersByTime(200);
    expect(stream.getStatus()).toBe("connected");
    stream.disconnect();
  });

  it("disconnect stops emission and clears state", () => {
    const state = createDemoWorkspaceState("workspace:x");
    const stream = createDemoRealtimeProvider(state, config);
    const got: ProviderEvent[] = [];
    stream.subscribe((e) => got.push(e));
    stream.connect(INVESTIGATION_ID);
    vi.advanceTimersByTime(2000);
    const mid = got.length;
    expect(mid).toBeGreaterThan(0);
    stream.disconnect();
    const after = got.length;
    vi.advanceTimersByTime(10_000);
    expect(got.length).toBe(after);
  });

  it("subscribe returns an unsubscribe that stops delivery", () => {
    const state = createDemoWorkspaceState("workspace:x");
    const stream = createDemoRealtimeProvider(state, config);
    const got: ProviderEvent[] = [];
    const unsub = stream.subscribe((e) => got.push(e));
    stream.connect(INVESTIGATION_ID);
    vi.advanceTimersByTime(2000);
    unsub();
    const before = got.length;
    vi.advanceTimersByTime(10_000);
    expect(got.length).toBe(before);
    stream.disconnect();
  });
});
