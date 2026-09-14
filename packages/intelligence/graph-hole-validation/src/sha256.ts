// ============================================================================
// SHA-256 content hashing (Phase 5A-PR8)
//
// Same pattern as PR7/PR1/PR3: lowercase hex digest over UTF-8.
// PURE — no clock, no entropy. Same bytes in → same digest out.
// ============================================================================

import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
