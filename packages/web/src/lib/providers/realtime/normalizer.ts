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

// ---------------------------------------------------------------------------
// Platform payload → canonical event vocabulary
//
// The platform SSE stream emits heterogeneous frames:
//   - canonical-shaped events (audit records, demo events) that ALREADY carry
//     `action` / `description` — passed through unchanged;
//   - control frames: { type: "CONNECTED" | "EVIDENCE_SUBMITTED", ... };
//   - run-progress frames: { state, message, ... } (ProgressPayload);
//   - typed frames: { type: "OBSERVATION_EXTRACTED" | "ANALYSIS_PROGRESS", ... }.
//
// The Activity Feed renders `action` (the main line) and `description` (the
// sub-line), so live frames without those fields are mapped here at the
// provider boundary — UI components do NOT branch on payload shape or mode.
//
// ANALYSIS_PROGRESS frames (P4-PR3) carry a `phase` (ANALYSIS_STARTED /
// CANDIDATES_DETECTED / LEAD_CREATED / ANALYSIS_COMPLETED) and a `message`;
// they are surfaced with the deterministic action "ANALYSIS_PROGRESS_<PHASE>".
// OBSERVATION_EXTRACTED frames (M-A06 metadata-only) surface the observation
// count against the originating evidenceId.
// ============================================================================

/**
 * Deterministic canonical action for a platform run-progress state
 * (CREATED / INGESTING / NORMALIZING / ANALYZING / …).
 */
export function runStateAction(state: string): string {
  return `RUN_PHASE_${state}`;
}

/** Deterministic description for the platform EVIDENCE_SUBMITTED frame. */
export function evidenceSubmittedDescription(raw: SseEvent): string {
  const title = typeof raw.evidenceTitle === "string" ? raw.evidenceTitle : "";
  const count = typeof raw.fileCount === "number" ? raw.fileCount : 0;
  return `Evidence submitted: ${title} (${count} file(s))`;
}

/**
 * Normalize a raw transport event to a canonical ProviderEvent.
 *
 * Events that already carry `action` are canonical and pass through (only the
 * investigationId is backfilled). Platform control / progress frames without
 * `action` are mapped into the canonical vocabulary:
 *   { type: "CONNECTED" }           → action "STREAM_CONNECTED",
 *                                      description = message
 *   { type: "EVIDENCE_SUBMITTED" }  → action "EVIDENCE_SUBMITTED",
 *                                      description from evidenceTitle/fileCount,
 *                                      targetType "EVIDENCE", targetId = operationId
 *   { state, message }              → action "RUN_PHASE_<STATE>",
 *                                      description = message
 *   { type: "OBSERVATION_EXTRACTED" } → action "OBSERVATION_EXTRACTED",
 *                                      description = observation count vs the
 *                                      originating evidence, targetId = evidenceId
 *   { type: "ANALYSIS_PROGRESS" }   → action "ANALYSIS_PROGRESS_<PHASE>",
 *                                      description = message
 */
export function normalizeEvent(
  raw: SseEvent,
  investigationId?: string,
): ProviderEvent {
  const id = raw.investigationId || investigationId || "";
  const base: ProviderEvent = { ...raw, investigationId: id };

  // Canonical-shaped events already carry an action — pass through unchanged.
  if (raw.action) return base;

  const isType = (t: string) => raw.type === t;
  const isProgress = !isType("CONNECTED") && !isType("EVIDENCE_SUBMITTED")
    && typeof raw.state === "string" && raw.state !== "";

  let action: string | undefined;
  let description: string | undefined;
  if (isType("CONNECTED")) {
    action = "STREAM_CONNECTED";
    description = typeof raw.message === "string" ? raw.message : "Stream connected";
  } else if (isType("EVIDENCE_SUBMITTED")) {
    action = "EVIDENCE_SUBMITTED";
    description = evidenceSubmittedDescription(raw);
  } else if (isType("OBSERVATION_EXTRACTED")) {
    action = "OBSERVATION_EXTRACTED";
    const count =
      typeof raw.observationCount === "number" ? raw.observationCount : 0;
    description = `${count} observation${count === 1 ? "" : "s"} extracted`;
  } else if (isType("ANALYSIS_PROGRESS")) {
    const phase = typeof raw.phase === "string" ? raw.phase : "UNKNOWN";
    action = `ANALYSIS_PROGRESS_${phase}`;
    description = typeof raw.message === "string" ? raw.message : "";
  } else if (isProgress) {
    const state = raw.state as string;
    action = runStateAction(state);
    description = typeof raw.message === "string" ? raw.message : "";
  }

  if (!action) return base;

  return {
    ...base,
    action,
    description,
    targetType: isType("EVIDENCE_SUBMITTED")
      ? "EVIDENCE"
      : isType("OBSERVATION_EXTRACTED")
        ? "OBSERVATION"
        : base.targetType,
    targetId: isType("EVIDENCE_SUBMITTED")
      ? (typeof raw.operationId === "string" ? raw.operationId : id)
      : isType("OBSERVATION_EXTRACTED") && typeof raw.evidenceId === "string"
        ? raw.evidenceId
        : base.targetId,
  };
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
