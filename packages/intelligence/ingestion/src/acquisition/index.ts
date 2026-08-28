// ============================================================================
// M-PR1 Artifact Acquisition
//
// Deterministic artifact acquisition core for INDAGO V7.
// Fetches bytes from remote URLs, verifies integrity, stores artifacts.
//
// This module does NOT:
//   - Parse documents
//   - Perform OCR
//   - Normalize data
//   - Extract observations or entities
//   - Build graphs
//   - Implement BullMQ/Redis/queue infrastructure
// ============================================================================

export {
  HttpArtifactFetcher,
  HttpError,
  FetchFailedError,
  FetchTimeoutError,
  ArtifactTooLargeError,
  InvalidReferenceError,
} from './artifact-fetcher.js';
export type {
  ArtifactFetcher,
  ArtifactFetchPolicy,
  FetchOptions,
  FetchedArtifact,
} from './artifact-fetcher.js';

export { computeContentHash, deterministicArtifactId } from './content-hasher.js';

export { deterministicSourceId } from './source-id.js';

export { bytesToUuid4 } from './uuid-bytes.js';

export { detectMimeType } from './mime-detector.js';
export type { MimeTypeResult } from './mime-detector.js';

export { ArtifactAcquisitionService } from './artifact-acquisition-service.js';
export type { ArtifactAcquisitionServiceConfig } from './artifact-acquisition-service.js';

export type {
  ArtifactAcquisitionConfig,
  VerifiedArtifact,
  ArtifactAcquisitionResult,
  AcquisitionContext,
} from './types.js';
