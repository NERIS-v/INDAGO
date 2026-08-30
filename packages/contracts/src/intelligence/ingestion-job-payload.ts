import { z } from 'zod';
import {
  InvestigationIdSchema,
  CaseIdSchema,
  OperationIdSchema,
  CorrelationIdSchema,
} from '../common/ids.js';
import { EvidenceTypeSchema } from '../domain/evidence.js';
import { SourceCatalogSchema } from '../domain/source.js';
import { EventTimeSchema } from '../common/timestamps.js';
import { ArtifactReferenceSchema } from './artifact-reference.js';

// ============================================================================
// IngestionJobPayload
//
// The canonical BullMQ "ingest-evidence" job payload.
// ONE schema for ALL ingest-evidence jobs. ONE producer: routes.ts.
//
// Required fields (always provided by the single producer):
//   investigationId   — which investigation this artifact belongs to
//   caseId            — case boundary for authorization + record creation
//   artifactReference — queue-safe URL + metadata (no bytes)
//   idempotencyKey    — deduplication key
//   correlationId     — groups related jobs
//   operationId       — groups all files in a single submission batch
//   sourceName        — human-readable source label (maps to SourceSchema.name)
//   evidenceType      — evidence classification (EvidenceTypeSchema enum)
//   evidenceTitle     — evidence package title (maps to EvidenceSchema.title)
//
// Optional fields:
//   sourceDescription  — richer source context
//   evidenceDescription — richer evidence context
//   observedAt         — real-world observation time
//
// .strict() — rejects unknown keys at validation time.
// ============================================================================

export const IngestionJobPayloadSchema = z.object({
  // Execution context
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  artifactReference: ArtifactReferenceSchema,
  idempotencyKey: z.string().min(1),
  correlationId: CorrelationIdSchema,
  operationId: OperationIdSchema,

  // Source semantic metadata (maps to SourceSchema)
  sourceName: z.string().min(1).max(200),
  sourceDescription: z.string().max(5000).optional(),

  // Source catalog (M-A06)
  // sourceCatalog is the platform-VALIDATED catalog value (one of the fixed
  // SourceCatalogSchema values, after the untrusted client string passed the
  // strict server-side check). declaredSourceCatalog preserves the original
  // declaration verbatim so any fallback-to-MANUAL is auditable.
  sourceCatalog: SourceCatalogSchema,
  declaredSourceCatalog: z.string().max(50).optional(),

  // Evidence semantic metadata (maps to EvidenceSchema)
  evidenceType: EvidenceTypeSchema,
  evidenceTitle: z.string().min(1).max(500),
  evidenceDescription: z.string().max(10000).optional(),
  observedAt: EventTimeSchema.optional(),
}).strict();

export type IngestionJobPayload = z.infer<typeof IngestionJobPayloadSchema>;
