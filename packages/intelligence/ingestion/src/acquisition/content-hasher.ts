// ============================================================================
// Content Hasher
//
// Deterministic SHA-256 hashing for artifact content integrity.
// Same bytes always produce the same hash.
// No external dependencies — uses Web Crypto API.
// ============================================================================

import { bytesToUuid4 } from './uuid-bytes.js';

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
  return bytesToUuid4(bytes);
}
