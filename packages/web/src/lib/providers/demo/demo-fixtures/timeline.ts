// ============================================================================
// Operation Financial Shadow — Timeline fixture
//
// NOTE: There is no canonical Timeline/Spanning schema in @indago/contracts
// (verified — zero matches for "Timeline"/"Spanning"). This is a documented
// frontend-local assumption (TimelineBand/TimelineItem/InvestigationTimeline),
// derived deterministically from the canonical observation/evidence fixtures.
// ============================================================================

import type { InvestigationTimeline } from "../../types";
import { INVESTIGATION_ID } from "./lookup";
import { operationFinancialShadowObservations } from "./observations";
import { operationFinancialShadowEvidence } from "./evidence";

const BAND_OBSERVATIONS = "observations";
const BAND_EVIDENCE = "evidence";
const BAND_MILESTONES = "milestones";

function bandItem(
  bandId: string,
  id: string,
  time: string,
  label: string,
  opts: { observationId?: string; evidenceId?: string; entityIds?: string[] } = {},
) {
  return {
    id,
    time,
    precision: "day" as const,
    label,
    bandId,
    ...opts,
  };
}

/** Deterministic timeline synthesized from the canonical fixtures. */
export const operationFinancialShadowTimeline: InvestigationTimeline = {
  investigationId: INVESTIGATION_ID,
  bands: [
    { id: BAND_OBSERVATIONS, label: "Observations", kind: "observation" },
    { id: BAND_EVIDENCE, label: "Evidence", kind: "evidence" },
    { id: BAND_MILESTONES, label: "Milestones", kind: "milestone" },
  ],
  items: [
    // Observations (ascending by observedAt date)
    bandItem(BAND_OBSERVATIONS, "tl-ob-8", "2023-11-05T12:00:00.000Z", "Registry lists nominee director for Shell One", {
      observationId: operationFinancialShadowObservations[7]?.id,
      entityIds: operationFinancialShadowObservations[7]?.entityIds,
    }),
    bandItem(BAND_OBSERVATIONS, "tl-ob-6", "2023-12-20T12:00:00.000Z", "Invoice routing authorized in email thread", {
      observationId: operationFinancialShadowObservations[5]?.id,
      entityIds: operationFinancialShadowObservations[5]?.entityIds,
    }),
    bandItem(BAND_OBSERVATIONS, "tl-ob-3", "2024-02-05T12:00:00.000Z", "Wire 2045: Shell One -> Account 0093", {
      observationId: operationFinancialShadowObservations[2]?.id,
      entityIds: operationFinancialShadowObservations[2]?.entityIds,
    }),
    bandItem(BAND_OBSERVATIONS, "tl-ob-4", "2024-02-06T12:00:00.000Z", "Wire 2046: Account 0093 -> Shell Two", {
      observationId: operationFinancialShadowObservations[3]?.id,
      entityIds: operationFinancialShadowObservations[3]?.entityIds,
    }),
    // Evidence (ascending)
    bandItem(BAND_EVIDENCE, "tl-ev-8", "2023-11-05T12:00:00.000Z", "Registry filing — Shell One incorporation", {
      evidenceId: operationFinancialShadowEvidence[7]?.id,
    }),
    bandItem(BAND_EVIDENCE, "tl-ev-3", "2024-02-05T12:00:00.000Z", "Wire Transfer 2045", {
      evidenceId: operationFinancialShadowEvidence[2]?.id,
    }),
    bandItem(BAND_EVIDENCE, "tl-ev-1", "2024-02-15T12:00:00.000Z", "Account 0092 ledger", {
      evidenceId: operationFinancialShadowEvidence[0]?.id,
    }),
    // Milestones
    bandItem(BAND_MILESTONES, "tl-ms-1", "2024-05-20T12:00:00.000Z", "Investigation opened", {}),
    bandItem(BAND_MILESTONES, "tl-ms-2", "2024-06-10T12:00:00.000Z", "Lead created: counterparties", {}),
  ],
};
