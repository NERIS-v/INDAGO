import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSseClient, type SseEvent } from "@/lib/realtime/sse-client";

function createMockResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("SSE Client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should parse SSE data lines correctly", async () => {
    const events: SseEvent[] = [];
    const event: SseEvent = {
      investigationId: "test-id",
      action: "EVIDENCE_UPLOADED",
      description: "Test event",
    };

    global.fetch = vi.fn().mockResolvedValue(
      createMockResponse([`data: ${JSON.stringify(event)}`]),
    );

    const client = createSseClient({
      investigationId: "test-id",
      onEvent: (e) => events.push(e),
    });

    client.connect();

    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });

    expect(events[0]?.action).toBe("EVIDENCE_UPLOADED");
    expect(events[0]?.investigationId).toBe("test-id");

    client.destroy();
  });

  it("should connect to /api/sse/[investigationId] proxy, not platform directly", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse([`data: ${JSON.stringify({ investigationId: "inv-123" })}`]),
    );

    global.fetch = mockFetch;

    const client = createSseClient({
      investigationId: "inv-123",
      onEvent: () => {},
    });

    client.connect();

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const url = mockFetch.mock.calls[0]?.[0] as string;
    expect(url).toBe("/api/sse/inv-123");

    client.destroy();
  });

  it("should ignore non-data lines", async () => {
    const events: SseEvent[] = [];
    const event: SseEvent = {
      investigationId: "test-id",
      action: "TEST",
    };

    global.fetch = vi.fn().mockResolvedValue(
      createMockResponse([
        ": this is a comment",
        "",
        `data: ${JSON.stringify(event)}`,
      ]),
    );

    const client = createSseClient({
      investigationId: "test-id",
      onEvent: (e) => events.push(e),
    });

    client.connect();

    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });

    client.destroy();
  });

  it("should call onOpen when connected", async () => {
    const onOpen = vi.fn();

    global.fetch = vi.fn().mockResolvedValue(
      createMockResponse([`data: ${JSON.stringify({ investigationId: "id" })}`]),
    );

    const client = createSseClient({
      investigationId: "id",
      onEvent: () => {},
      onOpen,
    });

    client.connect();

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalled();
    });

    client.destroy();
  });

  it("should clean up on destroy", async () => {
    const events: SseEvent[] = [];

    global.fetch = vi.fn().mockResolvedValue(
      createMockResponse([`data: ${JSON.stringify({ investigationId: "id" })}`]),
    );

    const client = createSseClient({
      investigationId: "id",
      onEvent: (e) => events.push(e),
    });

    client.connect();

    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });

    client.destroy();
    expect(client.isConnected()).toBe(false);
  });

  it("should report connection status", async () => {
    const onOpen = vi.fn();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    });

    global.fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const client = createSseClient({
      investigationId: "id",
      onEvent: () => {},
      onOpen,
    });

    expect(client.isConnected()).toBe(false);

    client.connect();

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalled();
    });

    expect(client.isConnected()).toBe(true);

    streamController?.close();
    client.destroy();
  });

  it("should never send auth tokens in fetch request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse([`data: ${JSON.stringify({ investigationId: "id" })}`]),
    );

    global.fetch = mockFetch;

    const client = createSseClient({
      investigationId: "id",
      onEvent: () => {},
    });

    client.connect();

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const init = mockFetch.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(init).toBeDefined();
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBeUndefined();

    client.destroy();
  });
});
