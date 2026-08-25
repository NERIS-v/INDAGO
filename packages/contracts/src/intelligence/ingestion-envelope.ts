import { z } from 'zod';
import {
  ArtifactIdSchema,
  CaseIdSchema,
  InvestigationIdSchema,
  SourceIdSchema,
} from '../common/ids.js';
import { IngestionTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Ingestion Envelope
//
// The canonical output of the ingestion boundary (MA01).
// Wraps everything produced during source adapter execution:
//   - artifact metadata (using existing ArtifactSchema fields)
//   - source context (which source, which case/investigation)
//   - provenance chain
//   - integrity metadata
//   - adapter information
//
// The envelope is what gets passed to MA05 Normalizer.
// It does NOT contain entities, relations, hypotheses, observations,
// graph edges, or investigative inferences.
// ============================================================================

/**
 * Integrity metadata computed during ingestion.
 * NOT invented — derived from actual content.
 */
export const IngestionIntegritySchema = z.object({
  contentHash: z.string().min(1)
    .describe('Deterministic hash of the raw content (SHA-256 or equivalent)'),
  contentSizeBytes: z.number().int().nonnegative()
    .describe('Size of the raw content in bytes'),
  mimeType: z.string().min(1).max(200)
    .describe('MIME type of the raw content'),
  originalFilename: z.string().max(500).optional()
    .describe('Original filename when applicable'),
}).strict();
export type IngestionIntegrity = z.infer<typeof IngestionIntegritySchema>;

/**
 * Source context propagated through ingestion.
 * Links the ingestion result back to the originating source and case scope.
 */
export const IngestionSourceContextSchema = z.object({
  sourceId: SourceIdSchema,
  caseId: CaseIdSchema,
  investigationId: InvestigationIdSchema.optional(),
  systemOrigin: z.string().min(1)
    .describe('Originating system identifier'),
  adapterId: z.string().min(1)
    .describe('Identifier of the adapter that produced this envelope'),
  adapterVersion: z.string().min(1)
    .describe('Version of the adapter'),
}).strict();
export type IngestionSourceContext = z.infer<typeof IngestionSourceContextSchema>;

/**
 * Complete ingestion envelope — the output of MA01.
 *
 * Passed to MA05 Normalizer.
 * Contains only ingestion-time information; no downstream intelligence.
 */
export const IngestionEnvelopeSchema = z.object({
  artifactId: ArtifactIdSchema
    .describe('ID of the artifact produced by ingestion'),
  sourceContext: IngestionSourceContextSchema
    .describe('Source and adapter context'),
  integrity: IngestionIntegritySchema
    .describe('Content integrity metadata'),
  storagePath: z.string().min(1)
    .describe('Path/reference to the stored raw artifact'),
  artifactType: z.string().min(1)
    .describe('Artifact type classification from the adapter'),
  ingestionTime: IngestionTimeSchema
    .describe('When this data entered the INDAGO system'),
  metadata: MetadataSchema.optional()
    .describe('Adapter-specific metadata carried through ingestion'),
}).strict();
export type IngestionEnvelope = z.infer<typeof IngestionEnvelopeSchema>;
