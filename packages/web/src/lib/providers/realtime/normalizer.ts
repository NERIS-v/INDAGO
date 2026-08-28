// ============================================================================
// F-PR2 Realtime Normalization & Deduplication
//
// The RealtimeProvider seam sits on top of the existing SSE transport
// (createSseClient). Raw transport events carry heterogeneous verb fields; this
// module:
//   1. normalizes raw SseEvent into a canonical ProviderEvent shape, and
//   2. de-duplicates events by a stable identity (eventId, or
//      action+targetId+timestamp fallback).
//
// Dedupe is bounded (LRU-like FIFO) so memory doesn't grow unboundedly across
// long-lived connections.
// ============================================================================

import type { SseEvent } from "@/lib/realtime/sse-client";
import type { ProviderEvent, RealtimeStatus } from "../types";

/** Identity used to de-duplicate events. */
export function eventIdentity(event: ProviderEvent): string {
  if (event.id) return `id:${event.id}`;
  const a = event.action ?? "";
  const t = event.targetId ?? "";
  const ts = event.timestamp ?? "";
  return `sig:${a}|${t}|${ts}`;
}

/** Normalize a raw transport event to a canonical ProviderEvent. */
export function normalizeEvent(
  raw: SseEvent,
  investigationId?: string,
): ProviderEvent {
  const mapped: ProviderEvent = {
    ...raw,
    // An empty-string or missing investigation id is not canonical; fill it
    // from the provided context when available.
    investigationId: raw.investigationId || investigationId || "",
  };
  // Drop any private/undefined identity fields the transport may leave empty.
  return mapped;
}

/**
 * A bounded FIFO de-duplicator keyed by event identity. `accept` returns true
 * for events not seen in the bounded window.
 */
export class EventDeduplicator {
  private readonly seen: Set<string> = new Set();
  private readonly order: string[] = [];

  constructor(private readonly maxSize = 200) {}

  accept(event: ProviderEvent): boolean {
    const key = eventIdentity(event);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.order.push(key);
    if (this.order.length > this.maxSize) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    return true;
  }

  /** Clear all state (e.g. on reconnect). */
  reset(): void {
    this.seen.clear();
    this.order.length = 0;
  }

  get size(): number {
    return this.seen.size;
  }
}

/**
 * State machine helper that consolidates onOpen/onClose/onError from the SSE
 * transport into a single RealtimeStatus.
 */
export function consolidateStatus(
  open: boolean,
  error: boolean,
): RealtimeStatus {
  if (error) return "error";
  return open ? "connected" : "disconnected";
}
