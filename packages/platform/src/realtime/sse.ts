import type { Request, Response } from "express";
import { EventEmitter } from "events";
import { randomUUID } from "node:crypto";
import { buildProgressPayload, type ProgressDetail } from "./payload.js";

// Global event emitter for the platform
export const realtimeEvents = new EventEmitter();

// Express handler for Server-Sent Events (SSE)
export function streamEventsHandler(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const investigationId = req.params.investigationId;

  // Send an initial connection-success event. A fresh `id` + `timestamp` per
  // connection give the frame a unique identity, so frontend deduplicators
  // surface every (re)connect — the UI uses it to re-fetch the authoritative
  // InvestigationRun state after a dropped stream (Prompt 3 §19/§20).
  res.write(
    `data: ${JSON.stringify({
      id: randomUUID(),
      investigationId,
      type: "CONNECTED",
      message: "Stream initialized",
      timestamp: new Date().toISOString(),
    })}\n\n`,
  );

  // The listener that pushes data to the client
  const listener = (eventData: { investigationId?: string }) => {
    // Only send events relevant to the requested investigation
    if (eventData.investigationId === investigationId) {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    }
  };

  // Subscribe to the global 'progress' event
  realtimeEvents.on("progress", listener);

  // Clean up when the client disconnects
  req.on("close", () => {
    realtimeEvents.removeListener("progress", listener);
    res.end();
  });
}

// Helper function to easily broadcast updates from BullMQ workers
export function emitProgressEvent(
  investigationId: string,
  state: string,
  message: string,
  detail?: ProgressDetail,
) {
  realtimeEvents.emit(
    "progress",
    buildProgressPayload(investigationId, state, message, detail),
  );
}

// ============================================================================
// M-A06 typed OBSERVATION_EXTRACTED frame
//
// Metadata-ONLY (edit #4): never broadcasts observation content. The payload
// carries identity + count so the UI can refresh its observation list from the
// authoritative GET endpoint. observationIds is bounded by the extractor cap
// (maxObservations). Rides the existing per-investigation 'progress' channel
// so streamEventsHandler forwards it unchanged to the right SSE subscriber.
// ============================================================================
export interface ObservationExtractedFrame {
  readonly investigationId: string;
  readonly type: "OBSERVATION_EXTRACTED";
  readonly caseId: string;
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly observationCount: number;
  readonly observationIds: readonly string[];
  readonly timestamp: string;
}

export function emitObservationExtracted(params: {
  investigationId: string;
  caseId: string;
  evidenceId: string;
  sourceId: string;
  observationIds: readonly string[];
}): void {
  const frame: ObservationExtractedFrame = {
    investigationId: params.investigationId,
    type: "OBSERVATION_EXTRACTED",
    caseId: params.caseId,
    evidenceId: params.evidenceId,
    sourceId: params.sourceId,
    observationCount: params.observationIds.length,
    observationIds: params.observationIds,
    timestamp: new Date().toISOString(),
  };
  realtimeEvents.emit("progress", frame);
}

// P4-PR3 typed ANALYSIS_PROGRESS frame
export type AnalysisProgressPhase =
  | "ANALYSIS_STARTED"
  | "CANDIDATES_DETECTED"
  | "LEAD_CREATED"
  | "ANALYSIS_COMPLETED";

export interface AnalysisProgressFrame {
  readonly investigationId: string;
  readonly type: "ANALYSIS_PROGRESS";
  readonly caseId: string;
  readonly phase: AnalysisProgressPhase;
  readonly message: string;
  readonly detail?: Record<string, number | string>;
  readonly timestamp: string;
}

export function emitAnalysisProgress(params: {
  investigationId: string;
  caseId: string;
  phase: AnalysisProgressPhase;
  message: string;
  detail?: Record<string, number | string>;
}): void {
  const frame: AnalysisProgressFrame = {
    investigationId: params.investigationId,
    type: "ANALYSIS_PROGRESS",
    caseId: params.caseId,
    phase: params.phase,
    message: params.message,
    detail: params.detail,
    timestamp: new Date().toISOString(),
  };
  realtimeEvents.emit("progress", frame);
}