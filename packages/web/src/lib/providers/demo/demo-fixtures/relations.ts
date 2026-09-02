// ============================================================================
// Operation Financial Shadow — Relation fixtures (canonical shape)
// ============================================================================

import { RelationHypothesisSchema } from "@indago/contracts";
import type { RelationHypothesis } from "@indago/contracts";
import {
  REL_1,
  REL_2,
  REL_3,
  REL_4,
  REL_5,
  REL_6,
  ENT_VICTOR,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  OBS_3,
  OBS_4,
  OBS_6,
  OBS_7,
  OBS_8,
  OBS_1,
  OBS_2,
  SRC_BANK_RECORDS,
  SRC_COMMS,
  SRC_REGISTRY,
} from "./lookup";
import { obs } from "./times";

const r1: RelationHypothesis = {
  id: REL_1,
  sourceEntityId: ENT_VICTOR,
  targetEntityId: ENT_SHELL_ONE,
  relationType: "ownership",
  support: 0.78,
  evidenceBasis: [OBS_8],
  directed: true,
  strength: 0.72,
  status: "ACCEPTED",
  provenance: { sourceId: SRC_REGISTRY, extractor: "registry.extractor.v1" },
  createdAt: obs("2024-06-02"),
  updatedAt: obs("2024-06-02"),
};

const r2: RelationHypothesis = {
  id: REL_2,
  sourceEntityId: ENT_MARIA,
  targetEntityId: ENT_BANK,
  relationType: "financial",
  support: 0.66,
  evidenceBasis: [OBS_7],
  directed: true,
  strength: 0.6,
  status: "ACCEPTED",
  provenance: { sourceId: SRC_COMMS, extractor: "mail.extractor.v1" },
  createdAt: obs("2024-06-02"),
  updatedAt: obs("2024-06-02"),
};

const r3: RelationHypothesis = {
  id: REL_3,
  sourceEntityId: ENT_SHELL_ONE,
  targetEntityId: ENT_BANK,
  relationType: "financial",
  support: 0.74,
  evidenceBasis: [OBS_2, OBS_3],
  directed: true,
  strength: 0.68,
  temporalInterval: {
    validFrom: { value: "2024-02-05T12:00:00.000Z", precision: "exact" },
    validTo: { value: "2024-02-05T12:00:00.000Z", precision: "exact" },
    precision: "exact",
    semantics: "observed",
  },
  status: "ACCEPTED",
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "wire.extractor.v1" },
  createdAt: obs("2024-06-02"),
  updatedAt: obs("2024-06-02"),
};

const r4: RelationHypothesis = {
  id: REL_4,
  sourceEntityId: ENT_BANK,
  targetEntityId: ENT_SHELL_TWO,
  relationType: "financial",
  support: 0.72,
  evidenceBasis: [OBS_1, OBS_4],
  directed: true,
  strength: 0.66,
  status: "ACCEPTED",
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "wire.extractor.v1" },
  createdAt: obs("2024-06-02"),
  updatedAt: obs("2024-06-02"),
};

const r5: RelationHypothesis = {
  id: REL_5,
  sourceEntityId: ENT_SHELL_ONE,
  targetEntityId: ENT_SHELL_TWO,
  relationType: "financial",
  support: 0.7,
  evidenceBasis: [OBS_1, OBS_6],
  directed: true,
  strength: 0.64,
  status: "PROPOSED",
  provenance: { sourceId: SRC_BANK_RECORDS, extractor: "ledger.extractor.v1" },
  createdAt: obs("2024-06-03"),
  updatedAt: obs("2024-06-03"),
};

const r6: RelationHypothesis = {
  id: REL_6,
  sourceEntityId: ENT_VICTOR,
  targetEntityId: ENT_SHELL_TWO,
  relationType: "ownership",
  support: 0.58,
  evidenceBasis: [OBS_6],
  directed: true,
  strength: 0.5,
  status: "PROPOSED",
  provenance: { sourceId: SRC_COMMS, extractor: "mail.extractor.v1" },
  createdAt: obs("2024-06-03"),
  updatedAt: obs("2024-06-03"),
};

/** Canonical parsed relation hypotheses. */
export const operationFinancialShadowRelations: RelationHypothesis[] = [
  RelationHypothesisSchema.parse(r1),
  RelationHypothesisSchema.parse(r2),
  RelationHypothesisSchema.parse(r3),
  RelationHypothesisSchema.parse(r4),
  RelationHypothesisSchema.parse(r5),
  RelationHypothesisSchema.parse(r6),
];
