// ============================================================================
// Evidence Submission Contracts
//
// I-PR2 boundary: UI → Platform → ArtifactReference → BullMQ
//
// These schemas define:
// 1. EvidenceSubmissionRequest — what the browser sends to the platform
// 2. UploadedFileReference — UploadThing upload result shape
//
// The browser NEVER generates:
//   artifactId, contentHash, sourceId, operationId, correlationId, idempotencyKey
//
// The platform constructs ArtifactReference from UploadedFileReference +
// system-generated IDs. The queue contract is IngestionJobPayloadSchema
// (from intelligence/ingestion-job-payload.ts) — the single canonical
// BullMQ job shape for all ingest-evidence jobs.
// ============================================================================

import { z } from 'zod';
import { InvestigationIdSchema } from '../common/ids.js';
import { EvidenceTypeSchema } from '../domain/evidence.js';
import { EventTimeSchema } from '../common/timestamps.js';

// ============================================================================
// UploadedFileReference
//
// What the browser receives after a successful UploadThing upload.
// Provider-supplied technical metadata — the user never types these.
// ============================================================================

export const UploadedFileReferenceSchema = z.object({
  fileKey: z.string().min(1).describe('UploadThing file key'),
  fileUrl: z.string().url().describe('UploadThing CDN URL'),
  fileName: z.string().min(1).max(500).describe('Original filename'),
  fileSize: z.number().int().nonnegative().describe('File size in bytes'),
  mimeType: z.string().max(200).optional().describe('MIME type if detected by provider'),
  sha256Hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional()
    .describe('Client-computed SHA-256 hex digest (optional, untrusted). Verified against fetched bytes on ingestion'),
});

export type UploadedFileReference = z.infer<typeof UploadedFileReferenceSchema>;

// ============================================================================
// EvidenceSubmissionRequest
//
// What the browser sends to POST /api/v1/investigations/:id/evidence.
// Contains:
//   - User-provided semantic metadata (source name, evidence type, etc.)
//   - Uploaded file references (from UploadThing)
//
// The platform converts this into ArtifactReference(s) + IngestionJobPayload(s).
//
// Fields map to existing canonical contracts:
//   sourceName        → SourceSchema.name
//   sourceDescription → SourceSchema.description
//   evidenceType      → EvidenceTypeSchema (from domain/evidence.ts)
//   evidenceTitle     → EvidenceSchema.title
//   evidenceDescription → EvidenceSchema.description
//   observedAt        → EvidenceSchema.observedAt (EventTimeSchema)
// ============================================================================

export const EvidenceSubmissionRequestSchema = z.object({
  investigationId: InvestigationIdSchema,

  // Source context (maps to SourceSchema fields)
  sourceName: z.string().min(1).max(200).describe('Human-readable source name'),
  sourceDescription: z.string().max(5000).optional().describe('Optional source description'),

  // Source catalog (M-A06)
  // Untrusted client-supplied dropdown value. The platform validates it
  // strictly against SourceCatalogSchema; an exact match is used, anything
  // else (wrong casing, stale frontend build, unknown value) falls back to
  // MANUAL and is logged — never a silently created catalog row.
  sourceCatalog: z.string().max(50).optional().describe('Source material catalog category (untrusted, validated server-side)'),

  // Evidence context (maps to EvidenceSchema fields)
  evidenceType: EvidenceTypeSchema.describe('Evidence classification'),
  evidenceTitle: z.string().min(1).max(500).describe('Title for this evidence package'),
  evidenceDescription: z.string().max(10000).optional().describe('Optional description'),
  observedAt: EventTimeSchema.optional().describe('When the evidence event occurred in the real world'),

  // Uploaded file references (provider-supplied, from UploadThing)
  files: z.array(UploadedFileReferenceSchema).min(1).max(50)
    .describe('Files uploaded via UploadThing'),

  // Optional investigator notes
  notes: z.string().max(5000).optional().describe('Free-text investigator notes'),
});

export type EvidenceSubmissionRequest = z.infer<typeof EvidenceSubmissionRequestSchema>;
