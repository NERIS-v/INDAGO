// ============================================================================
// SHA-256 content hashing (Phase 5A-PR1)
//
// regionId = SHA-256(canonicalizeRegionIdentity(identity)) — lowercase hex.
// PURE: no clock, no entropy, no environment state. Same bytes in → same
// digest every time. Node's built-in crypto is used; no external dependency.
// ============================================================================

import { createHash } from 'node:crypto';

/** SHA-256 of a UTF-8 string, lowercase hex (64 characters). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}