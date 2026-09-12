// ============================================================================
// Content + query hashing (Phase 5A-PR1.5)
//
// SHA-256 is the ONLY content-addressing primitive for semantic text. The
// content hash anchors the embedding identity to the canonical text, and the
// query hash anchors a retrieval result to {caseId, canonical query, temporal
// context} — both are fully deterministic and free of timestamps / randomness /
// machine state.
// ============================================================================

import { createHash } from 'node:crypto';

import { canonicalizeDeterministic } from '@indago/contracts';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Empties are already rejected by canonicalization, so this never hashes "". */
export function contentHashOf(canonicalText: string): string {
  return sha256Hex(canonicalText);
}

/** Deterministic query identity — the provenance anchor of a retrieval result. */
export function queryHashOf(scope: {
  readonly caseId: string;
  readonly canonicalQuery: string;
  readonly temporalContext: unknown;
}): string {
  return sha256Hex(canonicalizeDeterministic(scope));
}