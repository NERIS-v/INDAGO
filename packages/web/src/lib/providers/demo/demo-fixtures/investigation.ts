// ============================================================================
// Operation Financial Shadow — Investigation fixture (canonical shape)
// ============================================================================

import { InvestigationSchema } from "@indago/contracts";
import type { Investigation } from "@indago/contracts";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_VICTOR,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  ENT_WITNESS,
  EVID_ACCOUNT_1,
  EVID_ACCOUNT_2,
  EVID_WIRE_1,
  EVID_WIRE_2,
  EVID_WIRE_3,
  EVID_EMAIL_1,
  EVID_EMAIL_2,
  EVID_REGISTRY,
  HYP_1,
  HYP_2,
  LEAD_1,
  LEAD_2,
  LEAD_3,
} from "./lookup";
import { obs } from "./times";

const investigationData: Investigation = {
  id: INVESTIGATION_ID,
  caseId: CASE_ID,
  title: "Financial Shadow — Shell Network",
  description:
    "Tracing the movement of funds through a ring of shell companies and intermediary accounts to identify the orchestrator.",
  status: "ACTIVE",
  priority: "HIGH",
  owner: "analyst.lead@indago.dev",
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-06-28"),
  entityIds: [ENT_VICTOR, ENT_MARIA, ENT_SHELL_ONE, ENT_SHELL_TWO, ENT_BANK, ENT_WITNESS],
  evidenceIds: [
    EVID_ACCOUNT_1,
    EVID_ACCOUNT_2,
    EVID_WIRE_1,
    EVID_WIRE_2,
    EVID_WIRE_3,
    EVID_EMAIL_1,
    EVID_EMAIL_2,
    EVID_REGISTRY,
  ],
  hypothesisIds: [HYP_1, HYP_2],
  leadIds: [LEAD_1, LEAD_2, LEAD_3],
  confidence: 0.82,
  temporalScope: {
    validFrom: { value: "2023-11-01T00:00:00.000Z", precision: "day" },
    validTo: { value: "2024-05-31T00:00:00.000Z", precision: "day" },
    precision: "range",
    semantics: "observed",
  },
};

/** Canonical parsed investigation. */
export const operationFinancialShadowInvestigation: Investigation =
  InvestigationSchema.parse(investigationData);
