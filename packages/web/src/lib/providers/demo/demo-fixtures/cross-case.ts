// ============================================================================
// Operation Financial Shadow — Cross-Case fixtures (canonical shape)
// ============================================================================

import { CrossCaseMatchSchema } from "@indago/contracts";
import type { CrossCaseMatch } from "@indago/contracts";
import { CASE_ID, CROSS_CASE_ID, CROSS_ENTITY_ID, INVESTIGATION_ID, ENT_VICTOR } from "./lookup";
import { obs } from "./times";

const match: CrossCaseMatch = {
  sourceCaseId: CASE_ID,
  targetCaseId: CROSS_CASE_ID,
  sourceEntityId: ENT_VICTOR,
  targetEntityId: CROSS_ENTITY_ID,
  matchScore: 0.87,
  sharedEvidenceTypes: ["FINANCIAL", "COMMUNICATION"],
  sharedEntityCount: 1,
  investigationIds: [INVESTIGATION_ID],
  confidence: 0.84,
  computedAt: obs("2024-06-25"),
};

/** Canonical parsed cross-case matches. */
export const operationFinancialShadowCrossCase: CrossCaseMatch[] = [
  CrossCaseMatchSchema.parse(match),
];
