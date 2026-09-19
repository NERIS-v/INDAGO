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
import { EntityTypeSchema } from '../domain/entity-mention-candidate.js';

// ============================================================================
// IdentityRosterEntry — one row of the case-scoped identity census (PR-31)
//
// The identity roster is CURATED per-case identity data supplied by the
// evidence-submitting party (a real investigator, an approved dataset, or the
// golden corpus manifest): the named persons, organizations and account/ledger
// references that constitute the case's identity universe.
//
// Boundary (enforced by M-A07): the roster NEVER becomes an authoritative
// Entity row. completeMA07 maps every entry into the gazetteer, which emits
// GAZETTEER_MATCH candidates that still flow through the SAME
// pattern/contextual/heuristic rank, the same blocking, the same MA09
// resolution and the same materialization gates. A roster entry is a seed for
// recognition (recall), never a shortcut around non-fabrication.
//
// text        — exact surface phrase to recognize (case-folded phrase match)
// entityType  — canonical EntityType taxonomy only (EntityTypeSchema)
// ============================================================================

export const IdentityRosterEntrySchema = z.object({
  text: z.string().min(1).max(200)
    .describe('Exact surface phrase to recognize (case-insensitive whole-phrase match)'),
  entityType: EntityTypeSchema
    .describe('Canonical entity type applied to recognized phrase spans'),
}).strict();

export type IdentityRosterEntry = z.infer<typeof IdentityRosterEntrySchema>;

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
//   identityRoster     — case-scoped identity census (PR-31); recognized as
//                        GAZETTEER_MATCH candidates in M-A07 and nothing more
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

  // Case-scoped identity census (PR-31, M-A07 gazetteer seed)
  identityRoster: z.array(IdentityRosterEntrySchema).max(500).optional(),
}).strict();

export type IngestionJobPayload = z.infer<typeof IngestionJobPayloadSchema>;
