import { z } from 'zod';
import {
  SourceIdSchema,
  CaseIdSchema,
  EvidenceIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, IngestionTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Source
//
// An external or internal data source feeding evidence into INDAGO.
// Source is distinct from Evidence — a Source is the origin system/container,
// Evidence is what INDAGO ingests from it.
// ============================================================================

export const SourceTypeSchema = z.enum([
  'FILE_UPLOAD',
  'API_IMPORT',
  'DATABASE_SYNC',
  'MANUAL_ENTRY',
  'STREAMING',
  'EXTERNAL_SYSTEM',
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceStatusSchema = z.enum([
  'REGISTERED',
  'INGESTING',
  'ACTIVE',
  'PAUSED',
  'ERROR',
  'ARCHIVED',
]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

// ============================================================================
// Source Catalog (M-A06)
//
// A fixed catalog of investigative SOURCE MATERIAL CATEGORIES. This is a
// distinct semantic from SourceTypeSchema (which describes how a source is
// INTEGRATED: FILE_UPLOAD / API_IMPORT / ...). The catalog describes WHAT KIND
// of material the source holds.
//
// The catalog lives here as the SINGLE SOURCE OF TRUTH. The web dropdown is
// generated from this enum (never hand-typed in a second location), and the
// platform validates any client-supplied catalog string against it before it
// reaches persistence.
//
// Source type does NOT automatically determine Observation strength.
// ============================================================================

export const SourceCatalogSchema = z.enum([
  'FIR',
  'CDR',
  'FINANCIAL',
  'SURVEILLANCE',
  'SOCIAL',
  'INTEL',
  'MANUAL',
]);
export type SourceCatalog = z.infer<typeof SourceCatalogSchema>;

export const DEFAULT_SOURCE_CATALOG: SourceCatalog = 'MANUAL';

export const SourceSchema = z.object({
  id: SourceIdSchema,
  caseId: CaseIdSchema,
  name: z.string().min(1).max(200),
  type: SourceTypeSchema,
  status: SourceStatusSchema,
  systemOrigin: z.string().min(1)
    .describe('Originating system identifier'),
  evidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence produced by this source'),
  ingestionStartedAt: IngestionTimeSchema.optional(),
  ingestionCompletedAt: IngestionTimeSchema.optional(),
  recordCount: z.number().int().optional()
    .describe('Total records in this source'),
  description: z.string().max(5000).optional(),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Source = z.infer<typeof SourceSchema>;
