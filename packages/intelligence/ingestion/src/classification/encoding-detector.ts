// ============================================================================
// Encoding Detector
//
// Lightweight deterministic encoding detection for text formats.
// Binary formats (PDF, DOCX, images) should report BINARY.
//
// Detection order:
//   1. BOM (UTF-8, UTF-16 LE, UTF-16 BE)
//   2. UTF-8 heuristic (valid multi-byte sequences)
//   3. Fallback to BINARY or UNKNOWN
// ============================================================================

import type { EncodingType } from './types.js';

/**
 * Detect text encoding from content bytes.
 *
 * For binary formats (PDF, DOCX, images), the caller should
 * pass BINARY directly rather than calling this function.
 *
 * Deterministic: same bytes always produce the same encoding.
 */
export function detectEncoding(bytes: Uint8Array): EncodingType {
  if (bytes.byteLength === 0) return 'UNKNOWN';

  // Check BOM signatures (highest confidence)
  if (bytes.byteLength >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'UTF8_BOM';
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return 'UTF16_LE';
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return 'UTF16_BE';
  }

  // Check for null bytes — strong indicator of non-UTF-8 text encoding
  for (let i = 0; i < Math.min(bytes.byteLength, 512); i++) {
    if (bytes[i] === 0x00) {
      return 'BINARY';
    }
  }

  // UTF-8 heuristic: check if all bytes are valid UTF-8
  if (isValidUtf8(bytes)) {
    return 'UTF8';
  }

  return 'BINARY';
}

/**
 * Check if bytes are valid UTF-8.
 * Validates the first 512 bytes for performance.
 */
function isValidUtf8(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.byteLength, 512);
  let i = 0;

  while (i < limit) {
    const b = bytes[i]!;

    if (b <= 0x7F) {
      // ASCII
      i++;
    } else if ((b & 0xE0) === 0xC0) {
      // 2-byte sequence
      if (i + 1 >= limit) return false;
      if ((bytes[i + 1]! & 0xC0) !== 0x80) return false;
      i += 2;
    } else if ((b & 0xF0) === 0xE0) {
      // 3-byte sequence
      if (i + 2 >= limit) return false;
      if ((bytes[i + 1]! & 0xC0) !== 0x80) return false;
      if ((bytes[i + 2]! & 0xC0) !== 0x80) return false;
      i += 3;
    } else if ((b & 0xF8) === 0xF0) {
      // 4-byte sequence
      if (i + 3 >= limit) return false;
      if ((bytes[i + 1]! & 0xC0) !== 0x80) return false;
      if ((bytes[i + 2]! & 0xC0) !== 0x80) return false;
      if ((bytes[i + 3]! & 0xC0) !== 0x80) return false;
      i += 4;
    } else {
      // Invalid UTF-8 byte
      return false;
    }
  }

  return true;
}
