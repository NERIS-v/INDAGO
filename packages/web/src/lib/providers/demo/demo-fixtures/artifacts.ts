// ============================================================================
// Operation Financial Shadow — Artifact fixtures (canonical shape)
// ============================================================================

import { ArtifactSchema } from "@indago/contracts";
import type { Artifact } from "@indago/contracts";
import {
  ART_1,
  ART_2,
  EVID_ACCOUNT_1,
  EVID_EMAIL_1,
  SRC_BANK_RECORDS,
  SRC_COMMS,
} from "./lookup";
import { obs } from "./times";

const art1: Artifact = {
  id: ART_1,
  evidenceId: EVID_ACCOUNT_1,
  sourceId: SRC_BANK_RECORDS,
  type: "STRUCTURED_DATA",
  filename: "acct-0092-ledger.csv",
  mimeType: "text/csv",
  sizeBytes: 84512,
  hash: "sha256:0f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
  storagePath: "ingest/bank/0092-ledger.csv",
  extractedText: "Account 0092 ledger, Nov 2023 to May 2024.",
  createdAt: { value: "2024-05-21T08:01:00.000Z", precision: "exact" },
  updatedAt: obs("2024-05-21"),
};

const art2: Artifact = {
  id: ART_2,
  evidenceId: EVID_EMAIL_1,
  sourceId: SRC_COMMS,
  type: "EMAIL",
  filename: "thread-118.eml",
  mimeType: "message/rfc822",
  sizeBytes: 12530,
  hash: "sha256:9f8e7d6c5b4a39281726354a5b6c7d8e9f",
  storagePath: "ingest/comms/thread-118.eml",
  extractedText: "Email thread discussing invoice routing.",
  createdAt: { value: "2024-05-22T09:05:00.000Z", precision: "exact" },
  updatedAt: obs("2024-05-22"),
};

/** Canonical parsed artifacts. */
export const operationFinancialShadowArtifacts: Artifact[] = [
  ArtifactSchema.parse(art1),
  ArtifactSchema.parse(art2),
];
