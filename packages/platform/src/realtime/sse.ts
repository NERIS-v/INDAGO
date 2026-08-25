import type { Request, Response } from "express";
import { EventEmitter } from "events";

// Global event emitter for the platform
export const realtimeEvents = new EventEmitter();

// Express handler for Server-Sent Events (SSE)
export function streamEventsHandler(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const investigationId = req.params.investigationId;

  // The listener that pushes data to the client
  const listener = (eventData: any) => {
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