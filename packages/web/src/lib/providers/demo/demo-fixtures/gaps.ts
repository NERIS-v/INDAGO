// ============================================================================
// Operation Financial Shadow — Investigative Gap fixtures (canonical shape)
// ============================================================================

import { InvestigativeGapSchema } from "@indago/contracts";
import type { InvestigativeGap } from "@indago/contracts";
import {
  GAP_1,
  GAP_2,
  GAP_3,
  INVESTIGATION_ID,
  CASE_ID,
  ENT_BANK,
  ENT_MARIA,
  ENT_VICTOR,
  ER_1,
  ER_2,
  HYP_1,
  HYP_2,
} from "./lookup";
import { obs } from "./times";

const g1: InvestigativeGap = {
  id: GAP_1,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  type: "MISSING_EVIDENCE",
  title: "Unknown counterparties on account 0093",
  description:
    "The ledger export covers only the two known shell counterparties; the full counterparty set is unknown.",
  status: "UNDER_REVIEW",
  priority: "HIGH",
  impact: 0.74,
  expectedInformationValue: 0.66,
  relatedEntityIds: [ENT_BANK],
  relatedHypothesisIds: [HYP_1],
  evidenceRequestIds: [ER_1],
  createdAt: obs("2024-06-08"),
  updatedAt: obs("2024-06-18"),
};

const g2: InvestigativeGap = {
  id: GAP_2,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  type: "UNRESOLVED_IDENTITY",
  title: "Principal behind signing authority",
  description:
    "Whether Maria exercises signing authority independently or under Victor's direction is unresolved.",
  status: "UNDER_REVIEW",
  priority: "MEDIUM",
  impact: 0.58,
  expectedInformationValue: 0.5,
  relatedEntityIds: [ENT_MARIA, ENT_VICTOR],
  relatedHypothesisIds: [HYP_2],
  evidenceRequestIds: [ER_2],
  createdAt: obs("2024-06-09"),
  updatedAt: obs("2024-06-09"),
};

const g3: InvestigativeGap = {
  id: GAP_3,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  type: "TEMPORAL_GAP",
  title: "Timing of laundering operations",
  description:
    "Exact timeframe during which funds moved between shells is only broadly bounded by ledger and email evidence.",
  status: "IDENTIFIED",
  priority: "LOW",
  impact: 0.42,
  expectedInformationValue: 0.35,
  relatedEntityIds: [],
  relatedHypothesisIds: [HYP_1],
  createdAt: obs("2024-06-10"),
  updatedAt: obs("2024-06-10"),
};

/** Canonical parsed gaps. */
export const operationFinancialShadowGaps: InvestigativeGap[] = [
  InvestigativeGapSchema.parse(g1),
  InvestigativeGapSchema.parse(g2),
  InvestigativeGapSchema.parse(g3),
];