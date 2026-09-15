import { createHash } from 'node:crypto';

// ============================================================================
// Deterministic SHA-256 hex digest
//
// Pure, stateless, input-order deterministic. The ONLY consumer is identity /
// context digest computation. `createHash.update(input)` is intentionally
// excluded from the "no clock / no I/O / no mutation" doctrine (it is a
// read-only pure function of its input).
// ============================================================================

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}