// ============================================================================
// M-A08 Candidate Pair — deterministic identity
//
// CandidatePairId is deterministic and CASE-SCOPED. Explicitly retaining the
// case in the identity serialization makes case isolation an invariant of the
// pair itself — even though candidate ids are already observation-scoped and
// case-grounded.
//
// NEVER: randomUUID(), timestamps, worker execution id, or attempt id.
//
// Stable identity inputs (locked design):
//   caseId
//   + canonicalLeftCandidateId  (lexically smaller of the two candidate ids)
//   + canonicalRightCandidateId (lexically larger of the two candidate ids)
//
// Because the pair is UNORDERED, left/right are normalized to min/max lexical
// order BEFORE identity derivation, so A↔B and B↔A converge to the same id.
// ============================================================================

import { computeContentHash } from '../acquisition/content-hasher.js';
import { bytesToUuid4 } from '../acquisition/uuid-bytes.js';

export const CANDIDATE_PAIR_IDENTITY_NAMESPACE = 'indago:candidate-pair';
export const CANDIDATE_PAIR_IDENTITY_VERSION = 1;

export interface CandidatePairIdentityInput {
  readonly caseId: string;
  readonly leftCandidateId: string;
  readonly rightCandidateId: string;
}

/**
 * Canonicalize an unordered pair into (smaller, larger) lexical order.
 * Exposed so both identity derivation and store persistence use the SAME
 * canonical ordering — a single source of truth for unordered pair identity.
 */
export function canonicalizePairIds(
  a: string,
  b: string,
): { left: string; right: string } {
  return a < b ? { left: a, right: b } : { left: b, right: a };
}

/**
 * Build the versioned canonical identity representation. Exposed separately so
 * the durable store can persist the SAME key used to derive the id (single
 * source of canonical identity) — mirrors buildEntityMentionIdentityKey.
 */
export function buildCandidatePairIdentityKey(
  input: CandidatePairIdentityInput,
): string {
  const { left, right } = canonicalizePairIds(
    input.leftCandidateId,
    input.rightCandidateId,
  );
  return JSON.stringify([
    CANDIDATE_PAIR_IDENTITY_NAMESPACE,
    `v${CANDIDATE_PAIR_IDENTITY_VERSION}`,
    input.caseId,
    left,
    right,
  ]);
}

/**
 * Derive a deterministic CandidatePairId (UUID v4-shaped, satisfies
 * CandidatePairIdSchema) from the canonical identity representation. Same
 * unordered pair, same case → same id across passes, retries, and workers.
 */
export async function deterministicCandidatePairId(
  input: CandidatePairIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildCandidatePairIdentityKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}
