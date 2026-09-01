// ============================================================================
// Operation Financial Shadow — Entity fixtures (canonical shape)
// ============================================================================

import { EntitySchema } from "@indago/contracts";
import type { Entity } from "@indago/contracts";
import {
  ENT_VICTOR,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  ENT_WITNESS,
  CASE_ID,
  INVESTIGATION_ID,
  OBS_1,
  OBS_2,
  OBS_3,
  OBS_4,
  OBS_5,
  OBS_6,
  OBS_7,
  OBS_8,
  OBS_9,
  EVID_ACCOUNT_1,
  EVID_ACCOUNT_2,
  EVID_WIRE_1,
  EVID_WIRE_2,
  EVID_WIRE_3,
  EVID_EMAIL_1,
  EVID_EMAIL_2,
  EVID_REGISTRY,
  EVID_REGISTRY_2,
} from "./lookup";
import { obs } from "./times";

const victor: Entity = {
  id: ENT_VICTOR,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  canonicalName: "Victor Aldridge",
  status: "ACTIVE",
  observationIds: [OBS_6, OBS_8, OBS_9],
  evidenceIds: [EVID_EMAIL_1, EVID_REGISTRY, EVID_REGISTRY_2],
  hypothesisIds: [],
  roleHypothesisIds: [],
  sourceIdentifiers: [{ sourceId: "b1e0c9a6-0000-4000-8000-000000000012", identifier: "nominee-director-118" }],
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-28"),
};

const maria: Entity = {
  id: ENT_MARIA,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  canonicalName: "Maria Castellan",
  status: "ACTIVE",
  observationIds: [OBS_6, OBS_7],
  evidenceIds: [EVID_EMAIL_1, EVID_EMAIL_2],
  hypothesisIds: [],
  roleHypothesisIds: [],
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-28"),
};

const shellOne: Entity = {
  id: ENT_SHELL_ONE,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  canonicalName: "Aldridge Holdings S.A.",
  status: "ACTIVE",
  observationIds: [OBS_1, OBS_3, OBS_8],
  evidenceIds: [EVID_ACCOUNT_1, EVID_WIRE_1, EVID_REGISTRY],
  hypothesisIds: [],
  roleHypothesisIds: [],
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-28"),
};

const shellTwo: Entity = {
  id: ENT_SHELL_TWO,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  canonicalName: "Northbridge Capital Ltd.",
  status: "ACTIVE",
  observationIds: [OBS_1, OBS_4, OBS_5],
  evidenceIds: [EVID_ACCOUNT_1, EVID_WIRE_2, EVID_WIRE_3],
  hypothesisIds: [],
  roleHypothesisIds: [],
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-28"),
};

const bank: Entity = {
  id: ENT_BANK,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  canonicalName: "Intermediary Account 0093",
  status: "ACTIVE",
  observationIds: [OBS_2, OBS_3, OBS_4, OBS_7],
  evidenceIds: [EVID_ACCOUNT_2, EVID_WIRE_1, EVID_WIRE_2, EVID_EMAIL_2],
  hypothesisIds: [],
  roleHypothesisIds: [],
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-28"),
};

const witness: Entity = {
  id: ENT_WITNESS,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  canonicalName: "Unidentified Witness",
  status: "CANDIDATE",
  observationIds: [],
  evidenceIds: [],
  hypothesisIds: [],
  roleHypothesisIds: [],
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-20"),
};

/** Canonical parsed entities. */
export const operationFinancialShadowEntities: Entity[] = [
  EntitySchema.parse(victor),
  EntitySchema.parse(maria),
  EntitySchema.parse(shellOne),
  EntitySchema.parse(shellTwo),
  EntitySchema.parse(bank),
  EntitySchema.parse(witness),
];
