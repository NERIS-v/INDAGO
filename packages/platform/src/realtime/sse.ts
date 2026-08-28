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