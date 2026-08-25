// ============================================================================
// Classification Types
//
// Deterministic artifact classification for parser routing.
// M-PR2 establishes the boundary between verified artifact and parser route.
//
// This module does NOT:
//   - Parse documents
//   - Extract observations or entities
//   - Perform OCR
//   - Refetch artifacts
// ============================================================================

/**
 * Artifact format — the specific file format identified by classification.
 * Maps to a single parser capability.
 */
export const ARTIFACT_FORMATS = [
  'PDF',
  'DOCX',
  'XLSX',
  'PPTX',
  'CSV',
  'TXT',
  'JSON',
  'XML',
  'IMAGE',
  'UNKNOWN',
] as const;
export type ArtifactFormat = (typeof ARTIFACT_FORMATS)[number];

/**
 * Artifact family — the broader category a format belongs to.
 * Used for fallback matching when an exact format parser is not available.
 */
export const ARTIFACT_FAMILIES = [
  'DOCUMENT',
  'SPREADSHEET',
  'PRESENTATION',
  'TEXT',
  'STRUCTURED_DATA',
  'IMAGE',
  'UNKNOWN',
] as const;
export type ArtifactFamily = (typeof ARTIFACT_FAMILIES)[number];

/**
 * Text encoding detected in the artifact content.
 * Binary formats should report BINARY, not a text encoding.
 */
export const ENCODING_TYPES = [
  'UTF8',
  'UTF8_BOM',
  'UTF16_LE',
  'UTF16_BE',
  'BINARY',
  'UNKNOWN',
] as const;
export type EncodingType = (typeof ENCODING_TYPES)[number];

/**
 * How the format was determined.
 * Higher-trust methods produce higher-confidence classifications.
 */
export type ClassificationMethod =
  | 'magic-bytes'
  | 'mime-detection'
  | 'content-sniffing'
  | 'extension-fallback'
  | 'unknown';

/**
 * Confidence in the classification result.
 */
export type ClassificationConfidence = 'definite' | 'heuristic' | 'fallback';

/**
 * Deterministic classification of a verified artifact.
 *
 * Contains everything needed for deterministic parser routing.
 * Same verified artifact → same classification (pure function of content + metadata).
 */
export interface ArtifactClassification {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly detectedMimeType: string;
  readonly format: ArtifactFormat;
  readonly family: ArtifactFamily;
  readonly encoding: EncodingType;
  readonly confidence: ClassificationConfidence;
  readonly detectionMethod: ClassificationMethod;
  readonly originalFilename: string | undefined;
}

// ============================================================================
// Format/Family mapping
//
// Canonical mapping from MIME type to format and family.
// This is the single source of truth for format classification.
// ============================================================================

/**
 * Map a MIME type to an ArtifactFormat.
 * Returns undefined if the MIME type is not recognized.
 */
export function mimeToFormat(mimeType: string): ArtifactFormat | undefined {
  const lower = mimeType.toLowerCase();
  if (lower === 'application/pdf') return 'PDF';
  if (lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
  if (lower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'XLSX';
  if (lower === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'PPTX';
  if (lower === 'text/csv' || lower === 'application/csv') return 'CSV';
  if (lower === 'application/json' || lower === 'text/json') return 'JSON';
  if (lower === 'application/xml' || lower === 'text/xml') return 'XML';
  if (lower === 'text/plain') return 'TXT';
  if (lower.startsWith('image/')) return 'IMAGE';
  return undefined;
}

/**
 * Map an ArtifactFormat to its ArtifactFamily.
 */
export function formatToFamily(format: ArtifactFormat): ArtifactFamily {
  switch (format) {
    case 'PDF':
    case 'DOCX':
      return 'DOCUMENT';
    case 'XLSX':
      return 'SPREADSHEET';
    case 'PPTX':
      return 'PRESENTATION';
    case 'CSV':
    case 'JSON':
    case 'XML':
      return 'STRUCTURED_DATA';
    case 'TXT':
      return 'TEXT';
    case 'IMAGE':
      return 'IMAGE';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

/**
 * Extract file extension from a filename.
 * Returns undefined if no extension found.
 */
export function extractExtension(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) return undefined;
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Map a file extension to an ArtifactFormat.
 * Used as a low-trust fallback when MIME detection is unavailable.
 */
export function extensionToFormat(ext: string): ArtifactFormat | undefined {
  switch (ext) {
    case 'pdf': return 'PDF';
    case 'docx': return 'DOCX';
    case 'xlsx': return 'XLSX';
    case 'pptx': return 'PPTX';
    case 'csv': return 'CSV';
    case 'txt': return 'TXT';
    case 'json': return 'JSON';
    case 'xml': return 'XML';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'bmp':
      return 'IMAGE';
    default: return undefined;
  }
}
