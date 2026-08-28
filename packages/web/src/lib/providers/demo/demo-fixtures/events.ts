// ============================================================================
// Operation Financial Shadow — Deterministic Event Stream
//
// A fixed, ordered sequence of normalized SseEvents that the
// DemoRealtimeProvider replays with deterministic timing. These mirror the
// canonical event vocabulary (EVIDENCE_INGESTED, ENTITY_CREATED, GAP_IDENTIFIED,
// etc.) but are expressed in the transport SseEvent shape that the realtime
// seam normalizes to.
// ============================================================================

import type { SseEvent } from "@/lib/realtime/sse-client";
import {
  INVESTIGATION_ID,
  EVID_ACCOUNT_1,
  EVID_WIRE_1,
  EVID_EMAIL_1,
  ENT_VICTOR,
  GAP_1,
  LEAD_1,
  OBS_1,
} from "./lookup";

export interface DemoStreamEvent extends SseEvent {
  /** Zero-based delay (ms, before timing scale) applied before emitting. */
  readonly delayMs: number;
}

/** Deterministic sequence replayed by the demo realtime provider. */
export const operationFinancialShadowEvents: DemoStreamEvent[] = [
  {
    id: "evt-0001",
    investigationId: INVESTIGATION_ID,
    action: "EVIDENCE_INGESTED",
    actor: "sync.platform",
    targetType: "EVIDENCE",
    targetId: EVID_ACCOUNT_1,
    description: "Ingested Account 0092 ledger (5 observations, 2 entities).",
    timestamp: "2024-05-21T08:01:00.000Z",
    delayMs: 0,
  },
  {
    id: "evt-0002",
    investigationId: INVESTIGATION_ID,
    action: "ENTITY_CREATED",
    actor: "extractor.graph",
    targetType: "ENTITY",
    targetId: ENT_VICTOR,
    description: "Resolved entity 'Victor Aldridge' from registry + comms.",
    timestamp: "2024-05-21T08:03:00.000Z",
    delayMs: 300,
  },
  {
    id: "evt-0003",
    investigationId: INVESTIGATION_ID,
    action: "OBSERVATION_EXTRACTED",
    actor: "extractor.finance",
    targetType: "OBSERVATION",
    targetId: OBS_1,
    description: "Extracted financial observation: cumulative 1.4M pass-through.",
    timestamp: "2024-05-21T08:04:00.000Z",
    delayMs: 600,
  },
  {
    id: "evt-0004",
    investigationId: INVESTIGATION_ID,
    action: "EVIDENCE_PROCESSED",
    actor: "sync.platform",
    targetType: "EVIDENCE",
    targetId: EVID_WIRE_1,
    description: "Wire 2045 processed and corroborated against account 0093.",
    timestamp: "2024-05-21T08:05:00.000Z",
    delayMs: 900,
  },
  {
    id: "evt-0005",
    investigationId: INVESTIGATION_ID,
    action: "LEAD_CREATED",
    actor: "analyst.lead",
    targetType: "LEAD",
    targetId: LEAD_1,
    description: "Created lead: Follow intermediary account 0093 counterparties.",
    timestamp: "2024-06-10T10:00:00.000Z",
    delayMs: 1200,
  },
  {
    id: "evt-0006",
    investigationId: INVESTIGATION_ID,
    action: "GAP_IDENTIFIED",
    actor: "analyst.gap",
    targetType: "GAP",
    targetId: GAP_1,
    description: "Identified gap: unknown counterparties on account 0093.",
    timestamp: "2024-06-08T09:00:00.000Z",
    delayMs: 1500,
  },
  {
    id: "evt-0007",
    investigationId: INVESTIGATION_ID,
    action: "EVIDENCE_REVIEWED",
    actor: "analyst.review",
    targetType: "EVIDENCE",
    targetId: EVID_EMAIL_1,
    description: "Reviewed email thread 118; approved as corroborating lead.",
    timestamp: "2024-06-22T15:30:00.000Z",
    delayMs: 1800,
  },
];
