// ============================================================================
// LIVE — Run-Status → Canonical Investigation projection
//
// The platform's GET /investigations/:id currently exposes ONLY a run-status
// shape (InvestigationStatusResponse): state / currentStage / status / error /
// timestamps. It does NOT yet expose canonical Investigation metadata (title,
// description, priority, owner, linked entity/evidence/hypothesis/lead ids).
//
// InvestigationProvider.get() must still return a canonical Investigation
// (strict schema), so this module PROJECTS the run status into that shape.
// Rules:
//   - Fields the endpoint truthfully exposes → mapped verbatim.
//   - Fields the endpoint does not expose   → deterministic, NEUTRAL defaults,
//     explicitly marked PROJECTION below. They must never be read back as
//     factual metadata.
//   - The projection is pure & deterministic (same inputs → same output), and
//     validated against InvestigationSchema so callers always receive a
//     schema-valid canonical Investigation — or a thrown error, never a fake
//     fabricated one.
//
// When the platform later exposes canonical investigation metadata, REPLACE the
// projection body with a direct mapping. Do NOT change InvestigationProvider,
// the Investigation schema, or UI components.
// ============================================================================

import { InvestigationSchema, type Investigation, type InvestigationStatus } from "@indago/contracts";
import type { InvestigationStatusResponse } from "@/lib/api/types";

export interface RunStatusContext {
  /** Canonical investigation id the caller requested. */
  readonly investigationId: string;
  /** Canonical case id the caller resolved to (platform verified it matches). */
  readonly caseId: string;
}

// ---------------------------------------------------------------------------
// PROJECTION: run execution status → investigation lifecycle status
//
// The run status (QUEUED/INITIALIZING/RUNNING/PAUSED/COMPLETED/FAILED/
// CANCELLED) is execution runtime; the canonical Investigation.status
// (DRAFT/ACTIVE/PAUSED/CLOSED/ARCHIVED) is an entity lifecycle. The mapping
// below is a documented, deterministic bridge until the platform exposes
// investigation lifecycle status.
// ---------------------------------------------------------------------------
export const INVESTIGATION_STATUS_BY_RUN_STATUS: Record<string, InvestigationStatus> = {
  QUEUED: "ACTIVE",
  INITIALIZING: "ACTIVE",
  RUNNING: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "CLOSED",
  FAILED: "PAUSED",
  CANCELLED: "ARCHIVED",
};

// PROJECTION defaults for canonical fields the endpoint does not expose.
const PROJECTED_TITLE_PREFIX = "Investigation";
const PROJECTED_PRIORITY = "MEDIUM" as const;
const PROJECTED_OWNER = "platform";

export function projectRunStatusToInvestigation(
  context: RunStatusContext,
  run: InvestigationStatusResponse,
): Investigation {
  return InvestigationSchema.parse({
    // Truthful — mapped verbatim from the run-status endpoint. The canonical
    // Investigation timestamps are ObservedTime objects (exact), which is
    // precisely what the run record carries.
    id: run.investigationId,
    caseId: context.caseId,
    status: INVESTIGATION_STATUS_BY_RUN_STATUS[run.status] ?? "ACTIVE",
    createdAt: { value: run.createdAt, precision: "exact" },
    updatedAt: { value: run.updatedAt, precision: "exact" },
    // Truthful sub-label / error only — the most specific label the endpoint
    // exposes (stage description, or the failure message when present).
    description: run.currentStage ?? run.error ?? "",
    // PROJECTION (see header) — deterministic neutral defaults, not metadata.
    title: `${PROJECTED_TITLE_PREFIX} ${run.investigationId}`,
    priority: PROJECTED_PRIORITY,
    owner: PROJECTED_OWNER,
    entityIds: [],
    evidenceIds: [],
    hypothesisIds: [],
    leadIds: [],
  });
}