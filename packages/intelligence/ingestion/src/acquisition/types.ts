import type { IngestionError } from '@indago/contracts';

// ============================================================================
// Acquisition Types
//
// Types for the artifact acquisition pipeline.
// VerifiedArtifact is the output of successful acquisition.
// ArtifactAcquisitionResult is the discriminated union result.
//
// AcquisitionContext is intentionally narrower than IngestionContext.
// It contains only the fields relevant to the acquisition service:
// source identity and investigation scope. Adapter-specific fields
// (adapterId, adapterVersion, caseId) belong to SourceAdapter.
// ============================================================================

/**
 * Context for artifact acquisition operations.
 *
 * This is intentionally NOT IngestionContext. The acquisition service
 * does not need adapter-specific fields (adapterId, adapterVersion, caseId).
 * Keeping this type narrow enforces the ownership boundary between
 * MAYUR (acquisition) and GURASHISH (adapter/API infrastructure).
 */
export interface AcquisitionContext {
  readonly sourceId: string;
  readonly investigationId?: string;
  readonly operationId: string;
}

export interface ArtifactAcquisitionConfig {
  readonly maxArtifactSizeBytes: number;
  readonly fetchTimeoutMs: number;
  readonly allowedContentTypes?: readonly string[];
  readonly requireContentHash?: boolean;
}

/**
 * Verified artifact — output of successful artifact acquisition.
 *
 * This is NOT an IngestionEnvelope. It is an intermediate type
 * consumed by M-PR2 parser/classification, which then produces
 * the IngestionEnvelope for downstream intelligence processing.
 */
export interface VerifiedArtifact {
  readonly artifactId: string;
  readonly storagePath: string;
  readonly contentHash: string;
  readonly contentSizeBytes: number;
  readonly detectedMimeType: string;
  readonly declaredMimeType: string | undefined;
  readonly originalFilename: string | undefined;
  readonly hashVerified: boolean;
  readonly mimeVerified: boolean;
  readonly ingestionTime: string;
  readonly providerMetadata: Record<string, unknown> | undefined;
}

export type ArtifactAcquisitionResult =
  | { readonly ok: true; readonly artifact: VerifiedArtifact }
  | { readonly ok: false; readonly error: IngestionError };
