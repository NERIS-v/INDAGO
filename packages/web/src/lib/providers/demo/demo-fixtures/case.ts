// ============================================================================
// Operation Financial Shadow — Case fixture (canonical CaseShape)
// ============================================================================

import { CaseSchema } from "@indago/contracts";
import type { Case } from "@indago/contracts";
import {
  CASE_ID,
  INVESTIGATION_ID,
  SRC_BANK_RECORDS,
  SRC_COMMS,
  SRC_REGISTRY,
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
} from "./lookup";
import { obs } from "./times";

const caseData: Case = {
  id: CASE_ID,
  title: "Operation Financial Shadow",
  description:
    "Inquiry into a suspected shell-company money laundering network routing funds through intermediary bank accounts to obscure beneficial ownership.",
  status: "ACTIVE",
  assignedTo: "analyst.lead@indago.dev",
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-06-28"),
  incidentDateRange: {
    validFrom: { value: "2023-11-01T00:00:00.000Z", precision: "day" },
    validTo: { value: "2024-05-31T00:00:00.000Z", precision: "day" },
    precision: "range",
    semantics: "observed",
  },
  investigationIds: [INVESTIGATION_ID],
  sourceIds: [SRC_BANK_RECORDS, SRC_COMMS, SRC_REGISTRY],
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
  jurisdiction: "FR",
  labels: [{ key: "code", value: "FINANCIAL_CRIME" }],
  tags: [{ name: "money-laundering" }, { name: "shell-companies" }],
};

/** Canonical parsed case, guaranteed against the contract schema. */
export const operationFinancialShadowCase: Case =
  CaseSchema.parse(caseData);
