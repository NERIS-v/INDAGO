// ============================================================================
// M-PR2 Artifact Classification
//
// Deterministic classification of verified artifacts for parser routing.
//
// This module does NOT:
//   - Parse documents
//   - Extract observations or entities
//   - Perform OCR
//   - Refetch artifacts
// ============================================================================

export type {
  ArtifactFormat,
  ArtifactFamily,
  EncodingType,
  ClassificationMethod,
  ClassificationConfidence,
  ArtifactClassification,
} from './types.js';

export {
  ARTIFACT_FORMATS,
  ARTIFACT_FAMILIES,
  ENCODING_TYPES,
  mimeToFormat,
  formatToFamily,
  extractExtension,
  extensionToFormat,
} from './types.js';

export { detectEncoding } from './encoding-detector.js';

export { classifyArtifact } from './artifact-classifier.js';
