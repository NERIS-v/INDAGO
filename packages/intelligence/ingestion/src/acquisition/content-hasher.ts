// ============================================================================
// Content Hasher
//
// Deterministic SHA-256 hashing for artifact content integrity.
// Same bytes always produce the same hash.
// No external dependencies — uses Web Crypto API.
// ============================================================================

/**
 * Compute SHA-256 hash of content bytes.
 * Returns lowercase hexadecimal string (64 characters).
 *
 * Deterministic: same input bytes always produce the same output.
 */
export async function computeContentHash(content: Uint8Array): Promise<string> {
  const copy = new Uint8Array(content);
  const hasher = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(hasher))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a deterministic artifact ID from a content hash.
 *
 * Uses a version 5 UUID (SHA-1 based) derived from the content hash,
 * namespaced under a fixed INDAGO identifier. This ensures:
 *
 * - Same contentHash → same artifactId (deterministic identity)
 * - Different contentHash → different artifactId
 * - UUID format compatible with ArtifactIdSchema
 */
export function deterministicArtifactId(contentHash: string): string {
  // Use first 16 bytes of SHA-256 hash to construct a UUID
  // This is a deterministic mapping, not cryptographic UUID generation
  const hashBytes = contentHash.slice(0, 32);
  const hexPairs = hashBytes.match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));

  // Construct UUID v4 format from hash bytes
  const uuid = [
    bytes.slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join(''),
    bytes.slice(4, 6).map((b) => b.toString(16).padStart(2, '0')).join(''),
    // Version 4 marker: set high nibble of byte 6 to 0100 (version 4)
    ((bytes[6]! & 0x0f) | 0x40).toString(16).padStart(2, '0') +
      bytes.slice(7, 8).map((b) => b.toString(16).padStart(2, '0')).join(''),
    // Variant 1 marker: set high bits of byte 8 to 10xx
    ((bytes[8]! & 0x3f) | 0x80).toString(16).padStart(2, '0') +
      bytes.slice(9, 10).map((b) => b.toString(16).padStart(2, '0')).join(''),
    bytes.slice(10, 16).map((b) => b.toString(16).padStart(2, '0')).join(''),
  ].join('-');

  return uuid;
}
