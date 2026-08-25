import { z } from 'zod';

// ============================================================================
// Artifact Reference
//
// A small, queue-safe representation of an external artifact.
// Contains NO bytes — only metadata and a URL to fetch from.
//
// Designed to be carried in BullMQ jobs, message queues, and API payloads
// without accumulating file content in memory.
//
// The URL is treated as an opaque reference. The acquisition service
// fetches content via ArtifactFetcher — no provider SDK coupling.
// ============================================================================

export const ArtifactReferenceSchema = z.object({
  url: z.string().url()
    .describe('URL to fetch the artifact from'),
  originalFilename: z.string().max(500).optional()
    .describe('Original filename, if known'),
  declaredMimeType: z.string().max(200).optional()
    .describe('MIME type declared by the source (untrusted)'),
  declaredSizeBytes: z.number().int().nonnegative().optional()
    .describe('Declared size in bytes (untrusted)'),
  declaredContentHash: z.string().min(1).optional()
    .describe('Declared content hash for verification (untrusted)'),
  idempotencyKey: z.string().min(1).optional()
    .describe('Caller-provided idempotency key for retry safety'),
  sourceType: z.string().min(1).optional()
    .describe('Source type hint for routing'),
  providerMetadata: z.record(z.string(), z.unknown()).optional()
    .describe('Provider-specific metadata (e.g., UploadThing object info)'),
}).strict();

export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>;
