import { z } from 'zod';
import { SourceIdSchema } from '../common/ids.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Ingestion Errors
//
// Typed error contracts for ingestion failures.
// Distinct from execution errors — these describe adapter/input problems.
// ============================================================================

export const IngestionErrorCategorySchema = z.enum([
  'UNSUPPORTED_SOURCE',
  'UNSUPPORTED_INPUT',
  'INVALID_INPUT',
  'MALFORMED_SOURCE',
  'INTEGRITY_FAILURE',
  'ADAPTER_FAILURE',
  'STORAGE_FAILURE',
  'PROVENANCE_FAILURE',
  'TIMEOUT',
  'UNKNOWN',
]);
export type IngestionErrorCategory = z.infer<typeof IngestionErrorCategorySchema>;

export const IngestionErrorSchema = z.object({
  category: IngestionErrorCategorySchema,
  code: z.string().min(1)
    .describe('Machine-readable error code'),
  message: z.string().min(1)
    .describe('Human-readable error message'),
  sourceId: SourceIdSchema.optional()
    .describe('Source that caused the error, if identifiable'),
  details: z.record(z.string(), z.unknown()).optional()
    .describe('Structured error context'),
  retryable: z.boolean().default(false),
  timestamp: z.string().describe('ISO 8601 timestamp'),
  metadata: MetadataSchema.optional(),
}).strict();
export type IngestionError = z.infer<typeof IngestionErrorSchema>;
