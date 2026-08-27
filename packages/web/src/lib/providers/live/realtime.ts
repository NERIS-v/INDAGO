// ============================================================================
// F-PR2 Live Realtime Provider
//
// Wraps the EXISTING SSE transport (createSseClient) behind the RealtimeProvider
// interface, applying normalization + de-duplication via the realtime seam.
// Reuses the platform's authenticated SSE proxy — no second client, no
// WebSockets, no auth tokens in the browser.
// ============================================================================

import type { RealtimeProvider, RealtimeStatus, ProviderEvent } from "../types";
import { createSseClient, type SseClient } from "@/lib/realtime/sse-client";
import { normalizeEvent, EventDeduplicator } from "../realtime/normalizer";

export class LiveRealtimeProvider implements RealtimeProvider {
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private readonly deduper = new EventDeduplicator();
  private client: SseClient | null = null;
  private status: RealtimeStatus = "disconnected";
  private currentInvestigationId: string | null = null;

  connect(investigationId: string): void {
    if (this.client && this.currentInvestigationId === investigationId) {
      return;
    }
    this.disconnect();
    this.currentInvestigationId = investigationId;
    this.status = "connecting";

    this.client = createSseClient({
      investigationId,
      onEvent: (raw) => {
        const event = normalizeEvent(raw, investigationId);
        if (this.deduper.accept(event)) {
          for (const listener of this.listeners) {
            try {
              listener(event);
            } catch {
              // A single listener must not break the stream.
            }
          }
        }
      },
      onOpen: () => {
        this.status = "connected";
      },
      onClose: () => {
        this.status = "disconnected";
      },
      onError: () => {
        this.status = "error";
      },
    });
    this.client.connect();
  }

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect(): void {
    this.client?.destroy();
    this.client = null;
    this.currentInvestigationId = null;
    this.deduper.reset();
    this.status = "disconnected";
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }
}

/** Build a LiveRealtimeProvider instance. */
export function createLiveRealtimeProvider(): RealtimeProvider {
  return new LiveRealtimeProvider();
}
