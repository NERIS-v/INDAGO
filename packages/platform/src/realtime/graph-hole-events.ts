import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  GraphHoleDetectedEventSchema,
} from "@indago/contracts";
import { realtimeEvents } from "./sse.js";

type GraphHoleDetectedEvent = z.infer<typeof GraphHoleDetectedEventSchema>;

export function emitGraphHoleDetected(input: {
  investigationId: string;
  caseId: string;
  graphVersionId: string;
  holeId: string;
  holeType: string;
  investigationGapId?: string;
  nodeIds: readonly string[];
  expectedEdgeType: string | null;
  significance: number;
  description: string;
  correlationId?: string;
  operationId?: string;
}): GraphHoleDetectedEvent {
  const event = GraphHoleDetectedEventSchema.parse({
    eventId: randomUUID(),
    version: 1,
    timestamp: {
      value: new Date().toISOString(),
      precision: "exact",
    },
    investigationId: input.investigationId,
    correlationId: input.correlationId ?? randomUUID(),
    operationId: input.operationId ?? randomUUID(),
    actor: "graph-hole-gap-runtime",
    eventType: "GRAPH_HOLE_DETECTED",
    payload: {
      holeId: input.holeId,
      caseId: input.caseId,
      graphVersionId: input.graphVersionId,
      holeType: input.holeType,
      ...(input.investigationGapId ? { investigationGapId: input.investigationGapId } : {}),
      nodeIds: [...input.nodeIds],
      expectedEdgeType: input.expectedEdgeType ?? undefined,
      significance: input.significance,
      description: input.description,
    },
  });

  // Emit directly to the internal bus so it gets picked up by SSE connections
  realtimeEvents.emit("progress", event);

  return event;
}