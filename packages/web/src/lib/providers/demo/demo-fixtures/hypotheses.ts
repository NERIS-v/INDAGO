// ============================================================================
// Operation Financial Shadow — Hypothesis fixtures (canonical shape)
// ============================================================================

import { HypothesisSchema } from "@indago/contracts";
import type { Hypothesis } from "@indago/contracts";
import {
  HYP_1,
  HYP_2,
  INVESTIGATION_ID,
  OBS_1,
  OBS_3,
  OBS_6,
  OBS_8,
  OBS_2,
  OBS_4,
  OBS_7,
  ENT_VICTOR,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  EVID_ACCOUNT_1,
  EVID_ACCOUNT_2,
  EVID_WIRE_1,
  EVID_WIRE_2,
  EVID_EMAIL_1,
  EVID_EMAIL_2,
  EVID_REGISTRY,
  SRC_BANK_RECORDS,
  SRC_COMMS,
  SRC_REGISTRY,
} from "./lookup";
import { obs } from "./times";

const h1: Hypothesis = {
  id: HYP_1,
  investigationId: INVESTIGATION_ID,
  title: "Shell-network money laundering",
  statement:
    "Funds are laundered through a ring of shell companies (Aldridge Holdings and Northbridge Capital) connected by intermediary account 0093.",
  status: "ACTIVE",
  confidence: 0.82,
  supportingObservationIds: [OBS_1, OBS_3, OBS_6, OBS_8],
  contradictingObservationIds: [],
  supportingEvidenceIds: [
    EVID_ACCOUNT_1,
    EVID_WIRE_1,
    EVID_EMAIL_1,
    EVID_REGISTRY,
  ],
  contradictingEvidenceIds: [],
  relatedEntityIds: [ENT_VICTOR, ENT_SHELL_ONE, ENT_SHELL_TWO, ENT_BANK],
  provenance: {
    entries: [
      {
        sourceId: SRC_BANK_RECORDS,
        extractor: "ledger.extractor.v1",
        derivedFrom: [OBS_1, OBS_3],
      },
      {
        sourceId: SRC_REGISTRY,
        extractor: "registry.extractor.v1",
        derivedFrom: [OBS_8],
      },
    ],
    createdAt: obs("2024-06-20"),
  },
  createdAt: obs("2024-06-20"),
  updatedAt: obs("2024-06-28"),
};

const h2: Hypothesis = {
  id: HYP_2,
  investigationId: INVESTIGATION_ID,
  title: "Intermediary account as lynchpin",
  statement:
    "Account 0093 is the connective lynchpin: signing authority (Maria) and rapid pass-through explain the fund flows between shells.",
  status: "DRAFT",
  confidence: 0.61,
  supportingObservationIds: [OBS_2, OBS_4, OBS_7],
  contradictingObservationIds: [],
  supportingEvidenceIds: [EVID_ACCOUNT_2, EVID_WIRE_2, EVID_EMAIL_2],
  contradictingEvidenceIds: [],
  relatedEntityIds: [ENT_MARIA, ENT_BANK, ENT_SHELL_ONE, ENT_SHELL_TWO],
  provenance: {
    entries: [
      {
        sourceId: SRC_COMMS,
        extractor: "mail.extractor.v1",
        derivedFrom: [OBS_7],
      },
    ],
    createdAt: obs("2024-06-28"),
  },
  createdAt: obs("2024-06-28"),
  updatedAt: obs("2024-06-28"),
};

/** Canonical parsed hypotheses. */
export const operationFinancialShadowHypotheses: Hypothesis[] = [
  HypothesisSchema.parse(h1),
  HypothesisSchema.parse(h2),
];
