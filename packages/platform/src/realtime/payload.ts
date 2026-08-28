// ============================================================================
// Realtime Payload Boundary
//
// Single shape-builder for "progress" events pushed over SSE.
//
// These are INTERNAL UI-facing forms — they are intentionally NOT canonical
// EventTypes (RUN_STARTED / RUN_FAILED / EVIDENCE_INGESTED live in
// @indago/contracts). Canonical investigation events will replace this layer
// once the run lifecycle is the authoritative source of truth; until then,
// every progress event is enriched with operationId / correlationId / runId
// and carries `state` mirroring InvestigationRun.state.
//
// Frontend consumers (Demo/Live providers) are unaffected: the base fields
// (investigationId, state, message, timestamp) are unchanged.
// ============================================================================

export interface ProgressDetail {
  readonly operationId?: string;
  readonly correlationId?: string;
  readonly runId?: string;
  readonly state?: string;
  readonly artifactId?: string;
}

export interface ProgressPayload {
  readonly investigationId: string;
  readonly state: string;
  readonly message: string;
  readonly timestamp: string;
  readonly operationId?: string;
  readonly correlationId?: string;
  readonly runId?: string;
  readonly artifactId?: string;
}

export function buildProgressPayload(
  investigationId: string,
  state: string,
  message: string,
  detail?: ProgressDetail,
): ProgressPayload {
  return {
    investigationId,
    state,
    message,
    timestamp: new Date().toISOString(),
    ...(detail ?? {}),
  };
}