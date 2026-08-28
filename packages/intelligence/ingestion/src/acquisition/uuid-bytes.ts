// ============================================================================
// UUID v4-style Deterministic Identifier Builder
//
// Shared helper for deterministic identity derivation in the ingestion
// package. Converts a byte buffer into a UUID-shaped string with the
// standard version-4 and variant markers so the result satisfies the
// UUID schemas in @indago/contracts (ArtifactIdSchema, SourceIdSchema).
//
// Deterministic: same bytes always produce the same UUID.
// ============================================================================

/**
 * Build a UUID v4-shaped string from at least 16 bytes.
 *
 * The high nibble of byte 6 is coerced to version 4 (0100); the high
 * bits of byte 8 are coerced to the RFC 4122 variant (10xx).
 */
export function bytesToUuid4(bytes: readonly number[]): string {
  if (bytes.length < 16) {
    throw new Error('bytesToUuid4 requires at least 16 bytes');
  }

  const hex = (b: number) => b.toString(16).padStart(2, '0');

  return [
    bytes.slice(0, 4).map(hex).join(''),
    bytes.slice(4, 6).map(hex).join(''),
    ((bytes[6]! & 0x0f) | 0x40).toString(16).padStart(2, '0') + hex(bytes[7]!),
    ((bytes[8]! & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex(bytes[9]!),
    bytes.slice(10, 16).map(hex).join(''),
  ].join('-');
}