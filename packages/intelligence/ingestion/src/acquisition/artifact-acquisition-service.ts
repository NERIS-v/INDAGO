import type {
  ArtifactReference,
  IngestionError,
} from '@indago/contracts';
import type { ArtifactStorage } from '../storage/artifact-storage.js';
import type {
  ArtifactAcquisitionConfig,
  ArtifactAcquisitionResult,
  AcquisitionContext,
} from './types.js';
import type { ArtifactFetcher } from './artifact-fetcher.js';
import {
  FetchFailedError,
  FetchTimeoutError,
  ArtifactTooLargeError,
  InvalidReferenceError,
} from './artifact-fetcher.js';
import { computeContentHash, deterministicArtifactId } from './content-hasher.js';
import { detectMimeType } from './mime-detector.js';

// ============================================================================
// Artifact Acquisition Service
//
// Deterministic artifact acquisition core.
// Fetches bytes from a remote URL, verifies integrity, and stores
// the artifact via the existing ArtifactStorage abstraction.
//
// M-PR1 boundary:
//   Input:  ArtifactReference (URL + metadata, NO bytes)
//   Output: VerifiedArtifact (verified, stored, ready for M-PR2)
//
// This service is transport-independent. It can be called:
//   - Directly from an API handler
//   - From a BullMQ worker
//   - From any future execution layer
//
// The service implementation does NOT change between these modes.
// ============================================================================

export interface ArtifactAcquisitionServiceConfig {
  readonly fetcher: ArtifactFetcher;
  readonly storage: ArtifactStorage;
  readonly acquisitionConfig: ArtifactAcquisitionConfig;
}

export class ArtifactAcquisitionService {
  private readonly fetcher: ArtifactFetcher;
  private readonly storage: ArtifactStorage;
  private readonly config: ArtifactAcquisitionConfig;

  constructor(config: ArtifactAcquisitionServiceConfig) {
    this.fetcher = config.fetcher;
    this.storage = config.storage;
    this.config = config.acquisitionConfig;
  }

  async acquire(
    reference: ArtifactReference,
    context: AcquisitionContext,
  ): Promise<ArtifactAcquisitionResult> {
    // 1. Validate reference
    const urlValid = isValidUrl(reference.url);
    if (!urlValid) {
      return {
        ok: false,
        error: makeError('INVALID_REFERENCE', `Invalid URL: ${reference.url}`, context, {
          retryable: false,
        }),
      };
    }

    // Fast reject: declared size exceeds limit
    if (
      reference.declaredSizeBytes !== undefined &&
      reference.declaredSizeBytes > this.config.maxArtifactSizeBytes
    ) {
      return {
        ok: false,
        error: makeError(
          'ARTIFACT_TOO_LARGE',
          `Declared size ${reference.declaredSizeBytes} exceeds maximum ${this.config.maxArtifactSizeBytes}`,
          context,
          { retryable: false },
        ),
      };
    }

    // 2. Fetch bytes
    let fetched;
    try {
      fetched = await this.fetcher.fetch(reference, {
        timeoutMs: this.config.fetchTimeoutMs,
        maxBytes: this.config.maxArtifactSizeBytes,
      });
    } catch (err) {
      if (err instanceof ArtifactTooLargeError) {
        return {
          ok: false,
          error: makeError(
            'ARTIFACT_TOO_LARGE',
            err.message,
            context,
            { retryable: false },
          ),
        };
      }
      if (err instanceof FetchTimeoutError) {
        return {
          ok: false,
          error: makeError('FETCH_TIMEOUT', err.message, context, {
            retryable: true,
          }),
        };
      }
      if (err instanceof FetchFailedError) {
        return {
          ok: false,
          error: makeError('FETCH_FAILED', err.message, context, {
            retryable: true,
          }),
        };
      }
      if (err instanceof InvalidReferenceError) {
        return {
          ok: false,
          error: makeError('INVALID_REFERENCE', err.message, context, {
            retryable: false,
          }),
        };
      }
      return {
        ok: false,
        error: makeError(
          'FETCH_FAILED',
          err instanceof Error ? err.message : 'Unknown fetch error',
          context,
          { retryable: true },
        ),
      };
    }

    // 3. Validate HTTP status
    if (fetched.status < 200 || fetched.status >= 300) {
      return {
        ok: false,
        error: makeError(
          'HTTP_ERROR',
          `HTTP ${fetched.status} fetching ${reference.url}`,
          context,
          {
            retryable: fetched.status === 429 || fetched.status >= 500,
            details: { status: fetched.status, url: reference.url },
          },
        ),
      };
    }

    // 4. Reject zero-byte body
    if (fetched.body.byteLength === 0) {
      return {
        ok: false,
        error: makeError('EMPTY_ARTIFACT', 'Artifact body is empty (0 bytes)', context, {
          retryable: false,
        }),
      };
    }

    // 5. Compute SHA-256
    const contentHash = await computeContentHash(fetched.body);

    // 6. Verify declared hash
    if (reference.declaredContentHash !== undefined) {
      if (contentHash !== reference.declaredContentHash) {
        return {
          ok: false,
          error: makeError(
            'HASH_MISMATCH',
            `Computed hash ${contentHash} does not match declared hash ${reference.declaredContentHash}`,
            context,
            {
              retryable: false,
              details: {
                computedHash: contentHash,
                declaredHash: reference.declaredContentHash,
              },
            },
          ),
        };
      }
    }

    // 7. Detect MIME type
    const mimeResult = detectMimeType(fetched.body, reference.originalFilename);

    // 8. Verify declared MIME when detection is definite
    if (
      reference.declaredMimeType !== undefined &&
      mimeResult.confidence === 'definite'
    ) {
      if (mimeResult.detected !== reference.declaredMimeType) {
        return {
          ok: false,
          error: makeError(
            'CONTENT_TYPE_MISMATCH',
            `Detected MIME ${mimeResult.detected} does not match declared ${reference.declaredMimeType}`,
            context,
            {
              retryable: false,
              details: {
                detectedMime: mimeResult.detected,
                declaredMime: reference.declaredMimeType,
              },
            },
          ),
        };
      }
    }

    // 9. Enforce allowed content types
    if (this.config.allowedContentTypes !== undefined) {
      if (!this.config.allowedContentTypes.includes(mimeResult.detected)) {
        return {
          ok: false,
          error: makeError(
            'UNSUPPORTED_REFERENCE',
            `Content type ${mimeResult.detected} is not in allowed types`,
            context,
            {
              retryable: false,
              details: {
                detectedMime: mimeResult.detected,
                allowedTypes: [...this.config.allowedContentTypes],
              },
            },
          ),
        };
      }
    }

    // 10. Store artifact
    let storageResult;
    try {
      storageResult = await this.storage.write({
        content: fetched.body,
        mimeType: mimeResult.detected,
        hash: contentHash,
        filename: reference.originalFilename,
      });
    } catch (err) {
      return {
        ok: false,
        error: makeError(
          'STORAGE_FAILURE',
          err instanceof Error ? err.message : 'Storage write failed',
          context,
          { retryable: true },
        ),
      };
    }

    // 11. Build VerifiedArtifact
    const hashVerified =
      reference.declaredContentHash !== undefined
        ? contentHash === reference.declaredContentHash
        : false;

    const mimeVerified =
      reference.declaredMimeType !== undefined &&
      mimeResult.confidence === 'definite'
        ? mimeResult.detected === reference.declaredMimeType
        : false;

    const artifact = {
      artifactId: deterministicArtifactId(contentHash),
      storagePath: storageResult.storagePath,
      contentHash,
      contentSizeBytes: fetched.body.byteLength,
      detectedMimeType: mimeResult.detected,
      declaredMimeType: reference.declaredMimeType,
      originalFilename: reference.originalFilename,
      hashVerified,
      mimeVerified,
      ingestionTime: new Date().toISOString(),
      providerMetadata: reference.providerMetadata,
    };

    return { ok: true, artifact };
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function makeError(
  category: IngestionError['category'],
  message: string,
  context: AcquisitionContext,
  opts?: { retryable?: boolean; details?: Record<string, unknown> },
): IngestionError {
  return {
    category,
    code: `ACQUISITION_${category}`,
    message,
    sourceId: context.sourceId,
    details: opts?.details,
    retryable: opts?.retryable ?? false,
    timestamp: new Date().toISOString(),
  };
}
