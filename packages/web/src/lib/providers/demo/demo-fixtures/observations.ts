// ============================================================================
// Operation Financial Shadow — Observation fixtures (canonical shape)
// ============================================================================

import { ObservationSchema } from "@indago/contracts";
import type { Observation } from "@indago/contracts";
import {
  OBS_1,
  OBS_2,
  OBS_3,
  OBS_4,
  OBS_5,
  OBS_6,
  OBS_7,
  OBS_8,
  EVID_ACCOUNT_1,
  EVID_ACCOUNT_2,
  EVID_WIRE_1,
  EVID_WIRE_2,
  EVID_WIRE_3,
  EVID_EMAIL_1,
  EVID_EMAIL_2,
  EVID_REGISTRY,
  SRC_BANK_RECORDS,
  SRC_COMMS,
  SRC_REGISTRY,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  ENT_VICTOR,
  ENT_MARIA,
} from "./lookup";
import { obs, evt } from "./times";

const o1: Observation = {
  id: OBS_1,
  evidenceId: EVID_ACCOUNT_1,
  sourceId: SRC_BANK_RECORDS,
  type: "FINANCIAL",
  content:
    "Account 0092 received a cumulative 1.4M from Shell Two and disbursed recurring payments to intermediaries.",
  entityIds: [ENT_SHELL_ONE, ENT_SHELL_TWO],
  strength: 0.78,
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "ledger.extractor.v1" },
  observedAt: evt("2024-02-15", "day"),
  createdAt: obs("2024-05-21"),
  updatedAt: obs("2024-05-21"),
};

const o2: Observation = {
  id: OBS_2,
  evidenceId: EVID_ACCOUNT_2,
  sourceId: SRC_BANK_RECORDS,
  type: "FINANCIAL",
  content:
    "Intermediary account 0093 received funds from Shell One and passed them to Shell Two within 48 hours.",
  entityIds: [ENT_BANK],
  strength: 0.74,
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "ledger.extractor.v1" },
  observedAt: evt("2024-02-20", "day"),
  createdAt: obs("2024-05-21"),
  updatedAt: obs("2024-05-21"),
};

const o3: Observation = {
  id: OBS_3,
  evidenceId: EVID_WIRE_1,
  sourceId: SRC_BANK_RECORDS,
  type: "FINANCIAL",
  content: "Wire 2045: Shell One transferred 250,000 to intermediary account 0093.",
  entityIds: [ENT_SHELL_ONE, ENT_BANK],
  strength: 0.68,
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "wire.extractor.v1" },
  observedAt: evt("2024-02-05", "day"),
  createdAt: obs("2024-05-21"),
  updatedAt: obs("2024-05-21"),
};

const o4: Observation = {
  id: OBS_4,
  evidenceId: EVID_WIRE_2,
  sourceId: SRC_BANK_RECORDS,
  type: "FINANCIAL",
  content: "Wire 2046: intermediary account 0093 transferred 245,000 to Shell Two.",
  entityIds: [ENT_BANK, ENT_SHELL_TWO],
  strength: 0.66,
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "wire.extractor.v1" },
  observedAt: evt("2024-02-06", "day"),
  createdAt: obs("2024-05-21"),
  updatedAt: obs("2024-05-21"),
};

const o5: Observation = {
  id: OBS_5,
  evidenceId: EVID_WIRE_3,
  sourceId: SRC_BANK_RECORDS,
  type: "FINANCIAL",
  content: "Wire 2077: Shell Two disbursed 180,000 to an unvetted third-party vendor.",
  entityIds: [ENT_SHELL_TWO],
  strength: 0.55,
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "wire.extractor.v1" },
  observedAt: evt("2024-03-18", "day"),
  createdAt: obs("2024-05-21"),
  updatedAt: obs("2024-05-21"),
};

const o6: Observation = {
  id: OBS_6,
  evidenceId: EVID_EMAIL_1,
  sourceId: SRC_COMMS,
  type: "COMMUNICATION",
  content:
    "Correspondence authorizes routing invoices between Shell One and Shell Two, referencing account 0093.",
  entityIds: [ENT_VICTOR, ENT_MARIA],
  strength: 0.6,
  provenance: { sourceId: SRC_COMMS, extractor: "mail.extractor.v1" },
  observedAt: evt("2023-12-20", "day"),
  createdAt: obs("2024-05-22"),
  updatedAt: obs("2024-05-22"),
};

const o7: Observation = {
  id: OBS_7,
  evidenceId: EVID_EMAIL_2,
  sourceId: SRC_COMMS,
  type: "COMMUNICATION",
  content: "Message confirms Maria holds signing authority for intermediary account 0093.",
  entityIds: [ENT_MARIA, ENT_BANK],
  strength: 0.58,
  provenance: { sourceId: SRC_COMMS, extractor: "mail.extractor.v1" },
  observedAt: evt("2024-01-22", "day"),
  createdAt: obs("2024-05-22"),
  updatedAt: obs("2024-05-22"),
};

const o8: Observation = {
  id: OBS_8,
  evidenceId: EVID_REGISTRY,
  sourceId: SRC_REGISTRY,
  type: "RELATIONAL",
  content:
    "Registry lists a nominee director for Shell One with residential address shared with Victor.",
  entityIds: [ENT_SHELL_ONE, ENT_VICTOR],
  strength: 0.8,
  provenance: { sourceId: SRC_REGISTRY, extractor: "registry.extractor.v1" },
  observedAt: evt("2023-11-05", "day"),
  createdAt: obs("2024-05-23"),
  updatedAt: obs("2024-05-23"),
};

/** Canonical parsed observations. */
export const operationFinancialShadowObservations: Observation[] = [
  ObservationSchema.parse(o1),
  ObservationSchema.parse(o2),
  ObservationSchema.parse(o3),
  ObservationSchema.parse(o4),
  ObservationSchema.parse(o5),
  ObservationSchema.parse(o6),
  ObservationSchema.parse(o7),
  ObservationSchema.parse(o8),
];
