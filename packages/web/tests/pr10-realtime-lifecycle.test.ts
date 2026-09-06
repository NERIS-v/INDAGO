// ============================================================================
// PR-10 §47 — Realtime seam lifecycle discipline
//
// The demo realtime provider is the deterministic stand-in for the SSE stream:
//   - connect() is IDEMPOTENT for the same investigation — a duplicate connect
//     must never wipe the memory bank (a subscriber that mounts later depends
//     on the catch-up replay);
//   - subscribe() replays the whole memory bank immediately (catch-up);
//   - unsubscribe() stops delivery — queued sequences PAUSE instead of
//     delivering to nobody, and later re-subscribers catch up on the bank;
//   - disconnect() clears the bank and returns to "disconnected"; reconnect
//     restarts the stream cleanly.
//
// The normalization layer (F-PR2 seam) is asserted pure and deterministic so
// UI components never branch on transport shape.
// ============================================================================

import { describe, it, expect } from "vitest";
import { waitFor } from "@testing-library/react";
import type { SseEvent } from "@/lib/realtime/sse-client";
import type { ProviderEvent, RealtimeProvider } from "@/lib/providers/types";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import {
  normalizeEvent,
  eventIdentity,
  runStateAction,
  evidenceSubmittedDescription,
  EventDeduplicator,
  consolidateStatus,
} from "@/lib/providers/realtime/normalizer";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config = getDataModeConfig(fastEnv);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function freshRealtime(): RealtimeProvider {
  const providers = createWorkspaceDemoProviders(
    { workspaceId: `pr10-realtime:${INVESTIGATION_ID}`, caseId: CASE_ID, investigationId: INVESTIGATION_ID },
    config,
  );
  return providers.realtime;
}

// ---------------------------------------------------------------------------
// Pure normalization / deduplication (deterministic)
// ---------------------------------------------------------------------------

describe("PR-10 §47 — normalizeEvent maps transport shape → canonical vocabulary", () => {
  const inv = INVESTIGATION_ID;

  it("passes canonical events through unchanged (only backfills investigationId)", () => {
    const raw: SseEvent = {
      id: "evt-1",
      investigationId: inv,
      action: "ENTITY_CREATED",
      description: "Resolved entity.",
      timestamp: "2024-06-01T00:00:00.000Z",
    };
    const normalized = normalizeEvent(raw);
    expect(normalized.action).toBe("ENTITY_CREATED");
    expect(normalized.description).toBe("Resolved entity.");
    expect(normalized.id).toBe("evt-1");
  });

  it("backfills investigationId from the connect context when absent", () => {
    const raw: SseEvent = { action: "ENTITY_CREATED" } as SseEvent;
    expect(normalizeEvent(raw, inv).investigationId).toBe(inv);
  });

  it("maps a CONNECTED control frame to STREAM_CONNECTED with its message", () => {
    const raw: SseEvent = { investigationId: inv, type: "CONNECTED", message: "hello" };
    const normalized = normalizeEvent(raw);
    expect(normalized.action).toBe("STREAM_CONNECTED");
    expect(normalized.description).toBe("hello");
  });

  it("maps an EVIDENCE_SUBMITTED frame with a deterministic description + identity", () => {
    const raw: SseEvent = {
      investigationId: inv,
      type: "EVIDENCE_SUBMITTED",
      evidenceTitle: "bank-ledger.xlsx",
      fileCount: 3,
      operationId: "op-17",
    };
    const normalized = normalizeEvent(raw);
    expect(normalized.action).toBe("EVIDENCE_SUBMITTED");
    expect(normalized.description).toBe(
      "Evidence submitted: bank-ledger.xlsx (3 file(s))",
    );
    expect(normalized.targetType).toBe("EVIDENCE");
    expect(normalized.targetId).toBe("op-17");
    expect(evidenceSubmittedDescription({ evidenceTitle: "a", fileCount: 2 } as SseEvent)).toBe(
      "Evidence submitted: a (2 file(s))",
    );
  });

  it("maps a run-progress frame to RUN_PHASE_<STATE> with its message", () => {
    const raw: SseEvent = { investigationId: inv, state: "ANALYZING", message: "running" };
    const normalized = normalizeEvent(raw);
    expect(normalized.action).toBe("RUN_PHASE_ANALYZING");
    expect(normalized.description).toBe("running");
    expect(runStateAction("INGESTING")).toBe("RUN_PHASE_INGESTING");
  });

  it("leaves unknown frames untouched — no invented vocabulary", () => {
    const raw: SseEvent = { investigationId: inv, type: "PING", actor: "keep" };
    const normalized = normalizeEvent(raw);
    expect(normalized.action).toBeUndefined();
    expect(normalized.actor).toBe("keep");
  });
});

describe("PR-10 §47 — EventDeduplicator is a bounded FIFO", () => {
  it("priority: explicit id wins; otherwise the action|targetId|timestamp composite", () => {
    const withId: ProviderEvent = { investigationId: INVESTIGATION_ID, id: "a", action: "edit", timestamp: "t" };
    const composite: ProviderEvent = { investigationId: INVESTIGATION_ID, action: "edit", targetId: "x", timestamp: "t" };
    expect(eventIdentity(withId)).toBe("id:a");
    expect(eventIdentity(composite)).toBe("sig:edit|x|t");
  });

  it("rejects duplicates and stays bounded — evicted keys become acceptable again", () => {
    const dedupe = new EventDeduplicator(3);
    const mk = (i: number): ProviderEvent => ({ investigationId: INVESTIGATION_ID, id: `evt-${i}` });
    expect(dedupe.accept(mk(1))).toBe(true);
    expect(dedupe.accept(mk(1))).toBe(false);
    expect(dedupe.accept(mk(2))).toBe(true);
    expect(dedupe.accept(mk(3))).toBe(true);
    expect(dedupe.accept(mk(4))).toBe(true); // evicts evt-1
    expect(dedupe.accept(mk(1))).toBe(true); // evicted → acceptable again
    expect(dedupe.size).toBe(3);
  });

  it("reset() clears all remembered identities", () => {
    const dedupe = new EventDeduplicator(200);
    const first: ProviderEvent = { investigationId: INVESTIGATION_ID, id: "evt-9" };
    expect(dedupe.accept(first)).toBe(true);
    dedupe.reset();
    expect(dedupe.accept(first)).toBe(true);
  });
});

describe("PR-10 §47 — consolidateStatus stays honest", () => {
  it("error wins over any open state", () => {
    expect(consolidateStatus(true, true)).toBe("error");
    expect(consolidateStatus(false, true)).toBe("error");
  });
  it("open means connected, closed means disconnected", () => {
    expect(consolidateStatus(true, false)).toBe("connected");
    expect(consolidateStatus(false, false)).toBe("disconnected");
  });
});

// ---------------------------------------------------------------------------
// Provider behavior (observable lifecycle via the fast demo seam)
// ---------------------------------------------------------------------------

describe("PR-10 §47 — connect is idempotent and never wipes the memory bank", () => {
  it("duplicate connect on the same investigation preserves bank + stream", async () => {
    const rt = freshRealtime();
    rt.connect(INVESTIGATION_ID);
    rt.connect(INVESTIGATION_ID); // guard: same-investigation → no reset
    await waitFor(() => expect(rt.getStatus()).toBe("connected"));

    const heard: ProviderEvent[] = [];
    rt.subscribe((e) => heard.push(e));
    await waitFor(() => expect(heard.some((e) => e.action === "EVIDENCE_INGESTED")).toBe(true));

    const liveCount = heard.length;
    rt.connect(INVESTIGATION_ID); // still idempotent → bank NOT reset
    await waitFor(() => expect(rt.getStatus()).toBe("connected"));

    const catchUp: ProviderEvent[] = [];
    rt.subscribe((e) => catchUp.push(e));
    await waitFor(() => expect(catchUp.length).toBeGreaterThan(0));
    expect(catchUp.some((e) => e.action === "EVIDENCE_INGESTED")).toBe(true);
    expect(catchUp.length).toBeGreaterThanOrEqual(liveCount);
  });
});

describe("PR-10 §47 — subscribe replays the bank; unsubscribe stops delivery", () => {
  it("catch-up delivers events that streamed before the tab existed", async () => {
    const rt = freshRealtime();
    rt.connect(INVESTIGATION_ID);
    await waitFor(() => expect(rt.getStatus()).toBe("connected"));
    // The shadow stream runs even with no listener (it feeds the bank).
    await sleep(5);

    const heard: ProviderEvent[] = [];
    rt.subscribe((e) => heard.push(e)); // immediate catch-up replay
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.some((e) => e.action === "GAP_IDENTIFIED")).toBe(true);
  });

  it("unsubscribed listeners receive nothing; a queued sequence pauses (no ghost delivery)", async () => {
    const rt = freshRealtime();
    rt.connect(INVESTIGATION_ID);
    await waitFor(() => expect(rt.getStatus()).toBe("connected"));

    const heard: ProviderEvent[] = [];
    const unsub = rt.subscribe((e) => heard.push(e));
    const baseline = heard.length;
    unsub();
    rt.triggerSequence("upload"); // no listener → drain MUST pause, not deliver

    await sleep(40);
    expect(heard.length).toBe(baseline);

    // Re-attach: the still-queued upload drains to the NEW subscriber.
    const replay: ProviderEvent[] = [];
    rt.subscribe((e) => replay.push(e));
    await waitFor(() =>
      expect(replay.some((e) => e.action === "ENTITY_CREATED" && e.targetType === "ENTITY")).toBe(true),
    );
  });
});

describe("PR-10 §47 — disconnect clears the bank and reconnect restarts the stream", () => {
  it("disconnect returns to disconnected and empty-banks new subscribers", async () => {
    const rt = freshRealtime();
    rt.connect(INVESTIGATION_ID);
    await waitFor(() => expect(rt.getStatus()).toBe("connected"));
    const heard: ProviderEvent[] = [];
    rt.subscribe((e) => heard.push(e));
    await waitFor(() => expect(heard.some((e) => e.action === "EVIDENCE_INGESTED")).toBe(true));
    rt.disconnect();

    expect(rt.getStatus()).toBe("disconnected");
    const afterDisconnect: ProviderEvent[] = [];
    rt.subscribe((e) => afterDisconnect.push(e));
    await sleep(40);
    expect(afterDisconnect.length).toBe(0); // memory bank cleared

    rt.connect(INVESTIGATION_ID);
    await waitFor(() => expect(rt.getStatus()).toBe("connected"));
    const replayed: ProviderEvent[] = [];
    rt.subscribe((e) => replayed.push(e));
    await waitFor(() => expect(replayed.some((e) => e.action === "EVIDENCE_INGESTED")).toBe(true));
  });
});