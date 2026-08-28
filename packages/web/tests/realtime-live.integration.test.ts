// ============================================================================
// REALTIME LIVE — INTEGRATION TEST
//
// Honest labeling: this is an INTEGRATION test (not a full real E2E).
//   - REAL:     LiveRealtimeProvider, normalizeEvent/EventDeduplicator,
//               createSseClient, the platform's actual SSE frame shapes
//               (CONNECTED / ProgressPayload / EVIDENCE_SUBMITTED).
//   - MOCKED:   only the fetch transport boundary (the Next.js SSE proxy →
//               platform hop is replaced with a stubbed Response), because
//               there is no running platform/Redis/Postgres here.
// A full real E2E requires the platform + Postgres + Redis running and is
// documented (not executed) in the Prompt 2/3 report.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { createLiveRealtimeProvider } from "@/lib/providers/live/realtime";
import type { ProviderEvent } from "@/lib/providers/types";

const ENCODER = new TextEncoder();

function createMockResponse(lines: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(ENCODER.encode(line + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const INVESTIGATION_ID = "550e8400-e29b-41d4-a716-446655440020";

function collect(realtime: ReturnType<typeof createLiveRealtimeProvider>) {
  const events: ProviderEvent[] = [];
  const unsubscribe = realtime.subscribe((event) => events.push(event));
  return {
    events,
    unsubscribe,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiveRealtimeProvider (integration)", () => {
  it("normalizes platform CONNECTED / progress / EVIDENCE_SUBMITTED frames into the canonical activity vocabulary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createMockResponse([
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, type: "CONNECTED", message: "Stream initialized" })}`,
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, state: "INGESTING", message: "extracting financial records", timestamp: "2026-01-01T00:00:00.000Z" })}`,
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, state: "NORMALIZING", message: "resolving entities", timestamp: "2026-01-01T00:00:01.000Z" })}`,
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, type: "EVIDENCE_SUBMITTED", evidenceTitle: "Wire transfer docs", fileCount: 2, operationId: "op-99" })}`,
        ]),
      ),
    );

    const realtime = createLiveRealtimeProvider();
    const { events, unsubscribe } = collect(realtime);
    realtime.connect(INVESTIGATION_ID);

    await vi.waitFor(() => expect(events).toHaveLength(4));
    unsubscribe();
    realtime.disconnect();

    const [connected, ingesting, normalizing, submitted] = events;

    expect(connected.action).toBe("STREAM_CONNECTED");
    expect(connected.description).toBe("Stream initialized");

    expect(ingesting.action).toBe("RUN_PHASE_INGESTING");
    expect(ingesting.description).toBe("extracting financial records");
    expect(normalizing.action).toBe("RUN_PHASE_NORMALIZING");
    expect(normalizing.description).toBe("resolving entities");

    expect(submitted.action).toBe("EVIDENCE_SUBMITTED");
    expect(submitted.description).toBe("Evidence submitted: Wire transfer docs (2 file(s))");
    expect(submitted.targetType).toBe("EVIDENCE");
    expect(submitted.targetId).toBe("op-99");

    for (const event of events) {
      expect(event.investigationId).toBe(INVESTIGATION_ID);
      expect(event.action).toBeTruthy();
      expect(event.description).toBeTruthy();
    }
  });

  it("de-duplicates identical platform progress frames within one stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createMockResponse([
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, state: "INGESTING", message: "extracting financial records", timestamp: "2026-01-01T00:00:00.000Z" })}`,
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, state: "INGESTING", message: "extracting financial records", timestamp: "2026-01-01T00:00:00.000Z" })}`,
        ]),
      ),
    );

    const realtime = createLiveRealtimeProvider();
    const { events, unsubscribe } = collect(realtime);
    realtime.connect(INVESTIGATION_ID);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    unsubscribe();
    realtime.disconnect();

    expect(events[0]?.action).toBe("RUN_PHASE_INGESTING");
  });

  it("passes canonical-shaped audit frames through unchanged (action preserved)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createMockResponse([
          `data: ${JSON.stringify({ investigationId: INVESTIGATION_ID, action: "EVIDENCE_INGESTED", actor: "sync.platform", targetType: "EVIDENCE", targetId: "ev-1", description: "Ingested ledger", timestamp: "2026-01-01T00:00:00.000Z" })}`,
        ]),
      ),
    );

    const realtime = createLiveRealtimeProvider();
    const { events, unsubscribe } = collect(realtime);
    realtime.connect(INVESTIGATION_ID);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    unsubscribe();
    realtime.disconnect();

    expect(events[0]?.action).toBe("EVIDENCE_INGESTED");
    expect(events[0]?.targetId).toBe("ev-1");
    expect(events[0]?.description).toBe("Ingested ledger");
  });
});