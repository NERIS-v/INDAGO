// ============================================================================
// MIME Detector
//
// Deliberately small magic-byte MIME type detection.
// NOT a full document parser — just enough for acquisition routing.
//
// Definite detection for common formats via magic bytes.
// Filename used as hint only when magic bytes are ambiguous.
// ============================================================================

export interface MimeTypeResult {
  readonly detected: string;
  readonly confidence: 'definite' | 'heuristic' | 'fallback';
}

/**
 * Detect MIME type from content bytes and optional filename.
 *
 * Magic bytes are authoritative. Filename is used only as a hint
 * for ambiguous cases (e.g., ZIP container → DOCX vs XLSX).
 */
export function detectMimeType(
  bytes: Uint8Array,
  filename?: string,
): MimeTypeResult {
  if (bytes.byteLength === 0) {
    return { detected: 'application/octet-stream', confidence: 'fallback' };
  }

  // Definite magic-byte detection
  if (matchesMagic(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { detected: 'application/pdf', confidence: 'definite' };
  }

  if (matchesMagic(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { detected: 'image/png', confidence: 'definite' };
  }

  if (matchesMagic(bytes, [0xff, 0xd8, 0xff])) {
    return { detected: 'image/jpeg', confidence: 'definite' };
  }

  if (matchesMagic(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { detected: 'image/gif', confidence: 'definite' };
  }

  if (matchesMagic(bytes, [0x42, 0x4d])) {
    return { detected: 'image/bmp', confidence: 'definite' };
  }

  // ZIP container — use filename hint for common Office formats
  if (matchesMagic(bytes, [0x50, 0x4b])) {
    const ext = extractExtension(filename);
    if (ext === 'docx') {
      return { detected: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', confidence: 'definite' };
    }
    if (ext === 'xlsx') {
      return { detected: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', confidence: 'definite' };
    }
    if (ext === 'pptx') {
      return { detected: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', confidence: 'definite' };
    }
    return { detected: 'application/zip', confidence: 'definite' };
  }

  // Text heuristic — check if bytes are valid UTF-8 text
  if (isLikelyText(bytes)) {
    return { detected: 'text/plain', confidence: 'heuristic' };
  }

  // Unknown binary
  return { detected: 'application/octet-stream', confidence: 'fallback' };
}

function matchesMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

function extractExtension(filename?: string): string | undefined {
  if (!filename) return undefined;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return undefined;
  return filename.slice(lastDot + 1).toLowerCase();
}

function isLikelyText(bytes: Uint8Array): boolean {
  // Sample first 512 bytes for performance
  const sample = bytes.byteLength > 512 ? bytes.slice(0, 512) : bytes;
  let nonTextBytes = 0;

  for (let i = 0; i < sample.byteLength; i++) {
    const b = sample[i]!;
    // Allow common whitespace: tab, newline, carriage return
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    // Allow printable ASCII range
    if (b >= 0x20 && b <= 0x7e) continue;
    nonTextBytes++;
  }

  // If less than 10% non-text bytes, consider it text
  return nonTextBytes / sample.byteLength < 0.1;
}
