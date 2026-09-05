// ============================================================================
// PR-1 T3 — Investigative Gap → Graph Gap display adapter
//
// Maps a canonical InvestigativeGap (from GapProvider.listByInvestigation)
// into the GapMock display shape the GraphPanel's GapsList renders. This is
// the SMALLEST adapter at the provider/application boundary: the Graph panel
// (and any future consumer) stays provider-driven and never imports fixture
// gap data directly.
//
// The canonical terminology and the display terminology are intentionally
// distinct and are deliberately NOT conflated:
//   - hole type:   MISSING_EVIDENCE / UNRESOLVED_IDENTITY / TEMPORAL_GAP
//                  → ISOLATED_NODE / MISSING_COMPARISON / INFRASTRUCTURE_GAP
//   - impact:      priority HIGH / MEDIUM / LOW → HIGH / MODERATE / LOW
//   - status:      WORKING / ACKNOWLEDGED / IDENTIFIED
//                  → OPEN / EVIDENCE_REQUESTED / OPEN
// ============================================================================

import type { InvestigativeGap } from "@indago/contracts";
import type { GapMock } from "@/components/intel/gaps-list";

function toHoleType(type: InvestigativeGap["type"]): GapMock["holeType"] {
  switch (type) {
    case "MISSING_EVIDENCE":
      return "MISSING_COMPARISON";
    case "UNRESOLVED_IDENTITY":
    case "UNRESOLVED_RELATION":
      return "ISOLATED_NODE";
    case "TEMPORAL_GAP":
    case "GEOGRAPHIC_GAP":
    case "FINANCIAL_GAP":
    case "COMMUNICATION_GAP":
      return "INFRASTRUCTURE_GAP";
    default:
      return "ISOLATED_NODE";
  }
}

function toImpact(priority: InvestigativeGap["priority"]): GapMock["impact"] {
  switch (priority) {
    case "HIGH":
    case "CRITICAL":
      return "HIGH";
    case "MEDIUM":
      return "MODERATE";
    default:
      return "LOW";
  }
}

function toStatus(status: InvestigativeGap["status"]): GapMock["status"] {
  switch (status) {
    case "ACKNOWLEDGED":
    case "PARTIALLY_ADDRESSED":
      return "EVIDENCE_REQUESTED";
    case "ADDRESSED":
    case "WONFIX":
      return "RESOLVED";
    default:
      return "OPEN";
  }
}

/** Resolve a related-entity id to a display label (called with the graph node
 *  label map when available; otherwise the id itself is shown). */
export type GapEntityLabelResolver = (entityId: string) => string | undefined;

export function mapInvestigativeGapToGapMock(
  gap: InvestigativeGap,
  resolveLabel?: GapEntityLabelResolver,
): GapMock {
  const affectedEntities = (gap.relatedEntityIds ?? [])
    .map((id) => resolveLabel?.(id) ?? id)
    .filter(Boolean);

  return {
    id: gap.id,
    holeType: toHoleType(gap.type),
    missingRelationship: gap.description || gap.title,
    affectedEntities,
    impact: toImpact(gap.priority),
    status: toStatus(gap.status),
  };
}