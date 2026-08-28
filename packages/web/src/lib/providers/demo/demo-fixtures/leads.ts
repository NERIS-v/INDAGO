// ============================================================================
// Operation Financial Shadow — Lead fixtures (canonical shape)
// ============================================================================

import { LeadSchema } from "@indago/contracts";
import type { Lead } from "@indago/contracts";
import {
  LEAD_1,
  LEAD_2,
  LEAD_3,
  INVESTIGATION_ID,
  CASE_ID,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  ENT_MARIA,
  ENT_VICTOR,
  OBS_3,
  OBS_4,
  OBS_7,
  OBS_8,
  OBS_6,
  EVID_WIRE_1,
  EVID_WIRE_2,
  EVID_EMAIL_2,
  EVID_REGISTRY,
  EVID_EMAIL_1,
  GAP_1,
  GAP_2,
  GAP_3,
  SRC_BANK_RECORDS,
  SRC_COMMS,
  SRC_REGISTRY,
} from "./lookup";
import { obs } from "./times";

const l1: Lead = {
  id: LEAD_1,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  title: "Follow intermediary account 0093 counterparties",
  description:
    "Identify the full set of counterparties transacting through account 0093 beyond the two known shells.",
  status: "ACTIVE",
  priority: "HIGH",
  confidence: 0.74,
  posture: "T2_CORROBORATED_LEAD",
  relatedEntityIds: [ENT_BANK, ENT_SHELL_ONE, ENT_SHELL_TWO],
  supportingObservationIds: [OBS_3, OBS_4],
  relatedEvidenceIds: [EVID_WIRE_1, EVID_WIRE_2],
  gapIds: [GAP_1],
  assignedTo: "analyst.lead@indago.dev",
  provenance: {
    entries: [
      {
        sourceId: SRC_BANK_RECORDS,
        extractor: "wire.extractor.v1",
        derivedFrom: [OBS_3, OBS_4],
      },
    ],
    createdAt: obs("2024-06-10"),
  },
  createdAt: obs("2024-06-10"),
  updatedAt: obs("2024-06-22"),
};

const l2: Lead = {
  id: LEAD_2,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  title: "Attribute signing authority for account 0093",
  description:
    "Confirm whether Maria acts under Victor's direction when exercising signing authority over the intermediary account.",
  status: "UNDER_REVIEW",
  priority: "MEDIUM",
  confidence: 0.61,
  posture: "T1_INVESTIGATIVE_LEAD",
  relatedEntityIds: [ENT_MARIA, ENT_BANK, ENT_VICTOR],
  supportingObservationIds: [OBS_7, OBS_6],
  relatedEvidenceIds: [EVID_EMAIL_2, EVID_EMAIL_1],
  gapIds: [GAP_2],
  assignedTo: "analyst.entity@indago.dev",
  provenance: {
    entries: [
      {
        sourceId: SRC_COMMS,
        extractor: "mail.extractor.v1",
        derivedFrom: [OBS_7],
      },
    ],
    createdAt: obs("2024-06-12"),
  },
  createdAt: obs("2024-06-12"),
  updatedAt: obs("2024-06-25"),
};

const l3: Lead = {
  id: LEAD_3,
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  title: "Resolve nominee director beneficial ownership",
  description:
    "Map the nominee director on the Shell One filing to establish true beneficial ownership by Victor.",
  status: "NEW",
  priority: "HIGH",
  confidence: 0.8,
  posture: "T3_EVIDENCE_PACKAGE_CANDIDATE",
  relatedEntityIds: [ENT_SHELL_ONE, ENT_VICTOR],
  supportingObservationIds: [OBS_8],
  relatedEvidenceIds: [EVID_REGISTRY],
  gapIds: [GAP_3],
  provenance: {
    entries: [
      {
        sourceId: SRC_REGISTRY,
        extractor: "registry.extractor.v1",
        derivedFrom: [OBS_8],
      },
    ],
    createdAt: obs("2024-06-15"),
  },
  createdAt: obs("2024-06-15"),
  updatedAt: obs("2024-06-15"),
};

/** Canonical parsed leads. */
export const operationFinancialShadowLeads: Lead[] = [
  LeadSchema.parse(l1),
  LeadSchema.parse(l2),
  LeadSchema.parse(l3),
];
