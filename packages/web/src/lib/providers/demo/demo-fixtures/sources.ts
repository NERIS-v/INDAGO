// ============================================================================
// Operation Financial Shadow — Source fixtures (canonical shape)
// ============================================================================

import { SourceSchema } from "@indago/contracts";
import type { Source } from "@indago/contracts";
import {
  CASE_ID,
  SRC_BANK_RECORDS,
  SRC_COMMS,
  SRC_REGISTRY,
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

const bank: Source = {
  id: SRC_BANK_RECORDS,
  caseId: CASE_ID,
  name: "Bank Transaction Records",
  type: "DATABASE_SYNC",
  status: "ACTIVE",
  systemOrigin: "ledger.sync.v1",
  evidenceIds: [EVID_ACCOUNT_1, EVID_ACCOUNT_2, EVID_WIRE_1, EVID_WIRE_2, EVID_WIRE_3],
  ingestionStartedAt: { value: "2024-05-21T08:00:00.000Z", precision: "exact" },
  ingestionCompletedAt: { value: "2024-05-21T08:04:00.000Z", precision: "exact" },
  recordCount: 342,
  description: "Monthly ledger export across all suspect accounts.",
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-21"),
};

const comms: Source = {
  id: SRC_COMMS,
  caseId: CASE_ID,
  name: "Corporate Email Archive",
  type: "API_IMPORT",
  status: "ACTIVE",
  systemOrigin: "mail.archive.v1",
  evidenceIds: [EVID_EMAIL_1, EVID_EMAIL_2],
  ingestionStartedAt: { value: "2024-05-22T09:00:00.000Z", precision: "exact" },
  ingestionCompletedAt: { value: "2024-05-22T09:12:00.000Z", precision: "exact" },
  recordCount: 87,
  description: "Imported correspondence for named principals.",
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-22"),
};

const registry: Source = {
  id: SRC_REGISTRY,
  caseId: CASE_ID,
  name: "Company Registry Filings",
  type: "EXTERNAL_SYSTEM",
  status: "ACTIVE",
  systemOrigin: "registry.gov.v2",
  evidenceIds: [EVID_REGISTRY],
  ingestionStartedAt: { value: "2024-05-23T10:00:00.000Z", precision: "exact" },
  ingestionCompletedAt: { value: "2024-05-23T10:01:00.000Z", precision: "exact" },
  recordCount: 12,
  description: "Beneficial-ownership and incorporation filings.",
  createdAt: obs("2024-05-20"),
  updatedAt: obs("2024-05-23"),
};

/** Canonical parsed sources. */
export const operationFinancialShadowSources: Source[] = [
  SourceSchema.parse(bank),
  SourceSchema.parse(comms),
  SourceSchema.parse(registry),
];
