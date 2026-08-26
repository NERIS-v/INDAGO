// ============================================================================
// SSE Client
//
// Fetch-based SSE client using ReadableStream.
// Connects to the Next.js SSE proxy route (/api/sse/[investigationId]),
// NOT directly to the platform. The proxy handles authentication
// server-side with AUTH_TOKEN.
//
// The browser never handles auth tokens.
// ============================================================================

export interface SseEvent {
  readonly id?: string;
  readonly investigationId: string;
  readonly action?: string;
  readonly actor?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly description?: string;
  readonly timestamp?: string;
  readonly [key: string]: unknown;
}

export interface SseClientOptions {
  readonly investigationId: string;
  readonly onEvent: (event: SseEvent) => void;
  readonly onError?: (error: Error) => void;
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
  readonly maxReconnectDelay?: number;
}

export interface SseClient {
  readonly connect: () => void;
  readonly destroy: () => void;
  readonly isConnected: () => boolean;
}

function parseSseData(line: string): SseEvent | null {
  if (!line.startsWith("data: ")) return null;
  const jsonStr = line.slice(6).trim();
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr) as SseEvent;
  } catch {
    return null;
  }
}

export function createSseClient(options: SseClientOptions): SseClient {
  const {
    investigationId,
    onEvent,
    onError,
    onOpen,
    onClose,
    maxReconnectDelay = 30_000,
  } = options;

  let controller: AbortController | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let destroyed = false;
  let connected = false;

  async function connect(): Promise<void> {
    if (destroyed) return;

    controller = new AbortController();
    // Connect to Next.js SSE proxy — no auth token in browser
    const url = `/api/sse/${investigationId}`;

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      connected = true;
      reconnectDelay = 1000;
      onOpen?.();

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = parseSseData(line);
          if (event) onEvent(event);
        }
      }
    } catch (err) {
      if (destroyed) return;
      connected = false;
      const error =
        err instanceof Error ? err : new Error(String(err));
      if (error.name !== "AbortError") {
        onError?.(error);
        scheduleReconnect();
      }
    } finally {
      connected = false;
      onClose?.();
    }
  }

  function scheduleReconnect(): void {
    if (destroyed) return;
    reconnectTimeout = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
      connect();
    }, reconnectDelay);
  }

  function destroy(): void {
    destroyed = true;
    connected = false;
    controller?.abort();
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  }

  return {
    connect: () => {
      void connect();
    },
    destroy,
    isConnected: () => connected,
  };
}
