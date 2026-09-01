// ============================================================================
// Operation Financial Shadow — Observation Contradiction fixtures
//
// A first-class A/∼A pairing between two observations, derived deterministically
// from canonical fixture data. Contradictions are NEVER auto-resolved in the UI;
// they are presented as an unresolved analytical fact for the analyst to weigh.
// ============================================================================

import type { ObservationContradiction } from "../../types";
import {
  INVESTIGATION_ID,
  OBS_8,
  OBS_9,
  EVID_REGISTRY,
  EVID_REGISTRY_2,
  CONTRADICTION_1,
} from "./lookup";
import { obs } from "./times";

/** Canonical contradiction registry (single source of truth for the demo). */
export const operationFinancialShadowContradictions: ObservationContradiction[] = [
  {
    id: CONTRADICTION_1,
    investigationId: INVESTIGATION_ID,
    leftObservationId: OBS_8,
    rightObservationId: OBS_9,
    contradictionType: "DIRECT_REFUTATION",
    strength: 0.62,
    description:
      "OBS_8 derives a shared residential address (14 Rue de la Paix, Paris) that grounds the nominee-director ↔ Victor identity. OBS_9 (registry cross-check CC-882) records a DIFFERENT residential address for director V. Aldridge (8 Rue des Capucines, Lyon). Both addresses are present, so this is a genuine contradiction — not an absent-vs-present signal.",
    evidenceIds: [EVID_REGISTRY, EVID_REGISTRY_2],
    detectedAt: obs("2024-05-24"),
  },
];

/**
 * Every contradiction that references the given observation (either side).
 * Deterministic, read-only — callers never mutate this registry.
 */
export function contradictionsForObservation(
  observationId: string,
): ObservationContradiction[] {
  return operationFinancialShadowContradictions.filter(
    (c) =>
      c.leftObservationId === observationId ||
      c.rightObservationId === observationId,
  );
}