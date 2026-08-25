// ============================================================================
// Artifact Classifier
//
// Deterministic classifier that answers: "What is this artifact?"
//
// Trust order:
//   1. M-PR1's detectedMimeType (from magic bytes) — highest trust
//   2. Content sniffing (JSON/XML structure) — when content bytes provided
//   3. File extension from originalFilename — hint only
//   4. declaredMimeType from source — lowest trust, never overrides
//
// This classifier does NOT refetch artifacts. It classifies based on
// the VerifiedArtifact's known characteristics and optional content bytes.
// ============================================================================

import type { VerifiedArtifact } from '../acquisition/types.js';
import type {
  ArtifactClassification,
  ArtifactFormat,
  ClassificationConfidence,
  ClassificationMethod,
  EncodingType,
} from './types.js';
import { mimeToFormat, formatToFamily, extractExtension, extensionToFormat } from './types.js';
import { detectEncoding } from './encoding-detector.js';

// Binary MIME types that should not undergo text content sniffing
const BINARY_MIME_PREFIXES = [
  'application/pdf',
  'application/vnd.openxmlformats',
  'image/',
  'audio/',
  'video/',
];

/**
 * Determine if a MIME type represents a binary format.
 */
function isBinaryMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return BINARY_MIME_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Sniff content bytes to detect JSON or XML structure.
 * Returns the detected format, or undefined if no structure found.
 */
function sniffContentStructure(bytes: Uint8Array): ArtifactFormat | undefined {
  if (bytes.byteLength === 0) return undefined;

  // Find first non-whitespace byte
  let start = 0;
  while (start < bytes.byteLength && start < 128) {
    const b = bytes[start]!;
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
      start++;
    } else {
      break;
    }
  }

  if (start >= bytes.byteLength) return undefined;

  const firstByte = bytes[start]!;

  // JSON: starts with { or [
  if (firstByte === 0x7B || firstByte === 0x5B) {
    return 'JSON';
  }

  // XML: starts with < or <?xml
  if (firstByte === 0x3C) {
    return 'XML';
  }

  return undefined;
}

/**
 * Sniff content bytes to detect CSV structure.
 * Heuristic: multiple lines with consistent delimiter usage.
 */
function sniffCsv(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 10) return false;

  // Decode first 1024 bytes as UTF-8 for analysis
  const sample = bytes.byteLength > 1024 ? bytes.slice(0, 1024) : bytes;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);

  if (lines.length < 2) return false;

  // Count delimiters in first few lines
  const delimiterCandidates = [',', '\t', ';'];
  for (const delimiter of delimiterCandidates) {
    const counts = lines.slice(0, 5).map((line) => {
      let count = 0;
      let pos = 0;
      while (pos < line.length) {
        if (line[pos] === delimiter) count++;
        pos++;
      }
      return count;
    });

    // All lines must have the same delimiter count, and at least 1
    const firstCount = counts[0];
    if (firstCount !== undefined && firstCount >= 1) {
      const consistent = counts.every((c) => c === firstCount);
      if (consistent) return true;
    }
  }

  return false;
}

/**
 * Classify a verified artifact deterministically.
 *
 * @param artifact - The verified artifact from M-PR1 acquisition
 * @param content - Optional content bytes for deeper inspection.
 *                  If not provided, classification is based on MIME + filename only.
 *                  The classifier never refetches content.
 */
export function classifyArtifact(
  artifact: VerifiedArtifact,
  content?: Uint8Array,
): ArtifactClassification {
  const mimeType = artifact.detectedMimeType;
  let format: ArtifactFormat | undefined;
  let confidence: ClassificationConfidence = 'definite';
  let detectionMethod: ClassificationMethod = 'mime-detection';

  // Step 1: Try MIME-based format detection (highest trust)
  format = mimeToFormat(mimeType);

  // Step 2: Content sniffing when MIME is ambiguous (text/plain or unknown)
  if (format === undefined || (format === 'TXT' && content !== undefined)) {
    if (content !== undefined && !isBinaryMime(mimeType)) {
      const sniffed = sniffContentStructure(content);
      if (sniffed !== undefined) {
        // Content sniffing overrides TXT when it finds JSON/XML structure
        if (format === undefined || format === 'TXT') {
          format = sniffed;
          confidence = 'heuristic';
          detectionMethod = 'content-sniffing';
        }
      } else if (sniffCsv(content)) {
        // CSV sniffing overrides TXT or fills undefined
        if (format === undefined || format === 'TXT') {
          format = 'CSV';
          confidence = 'heuristic';
          detectionMethod = 'content-sniffing';
        }
      }
    }
  }

  // Step 3: Extension fallback (low trust)
  if (format === undefined) {
    const ext = extractExtension(artifact.originalFilename);
    if (ext !== undefined) {
      format = extensionToFormat(ext);
      if (format !== undefined) {
        confidence = 'heuristic';
        detectionMethod = 'extension-fallback';
      }
    }
  }

  // Step 4: Final fallback
  if (format === undefined) {
    format = 'UNKNOWN';
    confidence = 'fallback';
    detectionMethod = 'unknown';
  }

  // Determine encoding
  let encoding: EncodingType;
  if (format === 'UNKNOWN' || isBinaryMime(mimeType)) {
    encoding = 'BINARY';
  } else if (content !== undefined) {
    encoding = detectEncoding(content);
  } else {
    encoding = 'UNKNOWN';
  }

  return {
    artifactId: artifact.artifactId,
    contentHash: artifact.contentHash,
    detectedMimeType: mimeType,
    format,
    family: formatToFamily(format),
    encoding,
    confidence,
    detectionMethod,
    originalFilename: artifact.originalFilename,
  };
}
