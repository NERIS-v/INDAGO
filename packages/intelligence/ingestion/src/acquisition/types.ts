import type { IngestionError } from '@indago/contracts';
import type { IngestionContext } from '../adapters/source-adapter.js';

// ============================================================================
// Acquisition Types
//
// Types for the artifact acquisition pipeline.
// VerifiedArtifact is the output of successful acquisition.
// ArtifactAcquisitionResult is the discriminated union result.
// ============================================================================

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

export type AcquisitionContext = IngestionContext;
