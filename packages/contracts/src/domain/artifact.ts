import { z } from 'zod';
import {
  ArtifactIdSchema,
  EvidenceIdSchema,
  SourceIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, IngestionTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Artifact
//
// A discrete file, document, image, or structured record ingested
// as part of an Evidence package.
// ============================================================================

export const ArtifactTypeSchema = z.enum([
  'DOCUMENT',
  'IMAGE',
  'AUDIO',
  'VIDEO',
  'STRUCTURED_DATA',
  'EMAIL',
  'CHAT_LOG',
  'OTHER',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const ArtifactSchema = z.object({
  id: ArtifactIdSchema,
  evidenceId: EvidenceIdSchema,
  sourceId: SourceIdSchema,
  type: ArtifactTypeSchema,
  filename: z.string().min(1).max(500),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().nonnegative(),
  hash: z.string().min(1).describe('Content hash for deduplication'),
  storagePath: z.string().min(1).describe('Internal storage location'),
  extractedText: z.string().optional()
    .describe('Extracted text content, if applicable'),
  metadata: MetadataSchema.optional(),
  createdAt: IngestionTimeSchema,
  updatedAt: ObservedTimeSchema,
}).strict();
export type Artifact = z.infer<typeof ArtifactSchema>;
