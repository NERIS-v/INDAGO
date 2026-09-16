// ============================================================================
// SHA-256 content hashing (Phase 5A-PR14)
//
// Mirrors the repository's sha256 pattern (graph-hole-region / hypothesis-
// context / graph-hole-analysis): lowercase hex digest over UTF-8. PURE — no
// clock, no entropy. Same bytes in -> same digest out.
// ============================================================================

import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}