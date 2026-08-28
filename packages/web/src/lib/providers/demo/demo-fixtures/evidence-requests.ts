// ============================================================================
// Operation Financial Shadow — Evidence Request fixtures (canonical shape)
// ============================================================================

import { EvidenceRequestSchema } from "@indago/contracts";
import type { EvidenceRequest } from "@indago/contracts";
import {
  ER_1,
  ER_2,
  GAP_1,
  GAP_2,
  HYP_1,
  HYP_2,
  EVID_WIRE_1,
} from "./lookup";
import { obs } from "./times";

const er1: EvidenceRequest = {
  id: ER_1,
  gapId: GAP_1,
  hypothesisIds: [HYP_1],
  evidenceType: "FINANCIAL",
  description:
    "Request full counterparty detail for intermediary account 0093 covering Nov 2023 to May 2024.",
  utility: {
    expectedInformationGain: 0.66,
    eig: 0.66,
    relevance: 0.8,
    feasibility: 0.7,
    cost: 0.3,
    score: 0.72,
  },
  rationale:
    "Full counterparties will corroborate or refute the shell-network laundering hypothesis.",
  status: "IN_PROGRESS",
  authorizedBy: "analyst.lead@indago.dev",
  resultingEvidenceIds: [EVID_WIRE_1],
  createdBy: "analyst.lead@indago.dev",
  createdAt: obs("2024-06-12"),
  updatedAt: obs("2024-06-18"),
};

const er2: EvidenceRequest = {
  id: ER_2,
  gapId: GAP_2,
  hypothesisIds: [HYP_2],
  evidenceType: "TESTIMONY",
  description:
    "Interview request to clarify the reporting and authority structure around account 0093.",
  utility: {
    expectedInformationGain: 0.5,
    eig: 0.5,
    relevance: 0.62,
    feasibility: 0.55,
    cost: 0.45,
    score: 0.55,
  },
  rationale: "Establish principal behind the signing authority relationship.",
  status: "SUBMITTED",
  resultingEvidenceIds: [],
  createdBy: "analyst.entity@indago.dev",
  createdAt: obs("2024-06-14"),
  updatedAt: obs("2024-06-14"),
};

/** Canonical parsed evidence requests. */
export const operationFinancialShadowEvidenceRequests: EvidenceRequest[] = [
  EvidenceRequestSchema.parse(er1),
  EvidenceRequestSchema.parse(er2),
];
