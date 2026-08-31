// ============================================================================
// M-A09 Candidate Resolution — deterministic hypothesis identity
//
// EntityHypothesisId is deterministic and CASE-SCOPED. It is derived from the
// same deterministic identity proposition that produced it, so a retry /
// re-run of the same CandidatePair under the same scoring model converges to
// the SAME logical hypothesis — no duplicates on retry.
//
// NEVER: randomUUID(), timestamps, worker execution id, attempt id, or
// Math.random(). Identity must not depend on time or execution context.
//
// Stable identity inputs:
//   candidatePairId   (already case-scoped deterministic pair id)
//   + scoreModelVersion (so a future scoring-model change yields a NEW
//                        hypothesis version rather than silently overwriting)
//
// NOTE: candidatePairId uniquely identifies the identity proposition within a
// case. The scoring-model version is embedded so that re-resolving under a new
// model produces a distinct (newer) hypothesis version rather than mutating the
// historical one. This is the documented "no silent re-scoring" invariant.
// ============================================================================

import { computeContentHash, bytesToUuid4 } from '@indago/ingestion';
import { RESOLUTION_SCORE_MODEL_VERSION } from './types.js';

export const ENTITY_HYPOTHESIS_IDENTITY_NAMESPACE = 'indago:entity-hypothesis';
export const ENTITY_HYPOTHESIS_IDENTITY_VERSION = 1;

export interface EntityHypothesisIdentityInput {
  readonly candidatePairId: string;
  readonly scoreModelVersion?: string;
}

/**
 * Build the versioned canonical identity representation. Exposed separately so
 * the durable store can persist the SAME key used to derive the id (single
 * source of canonical identity) — mirrors buildEntityMentionIdentityKey and
 * buildCandidatePairIdentityKey.
 */
export function buildEntityHypothesisIdentityKey(
  input: EntityHypothesisIdentityInput,
): string {
  const version = input.scoreModelVersion ?? RESOLUTION_SCORE_MODEL_VERSION;
  return JSON.stringify([
    ENTITY_HYPOTHESIS_IDENTITY_NAMESPACE,
    `v${ENTITY_HYPOTHESIS_IDENTITY_VERSION}`,
    input.candidatePairId,
    version,
  ]);
}

/**
 * Derive a deterministic EntityHypothesisId (UUID v4-shaped, satisfies
 * EntityHypothesisIdSchema) from the canonical identity representation. Same
 * candidate pair + same scoring model → same id across passes, retries, and
 * workers. Different scoring model → different id (a new hypothesis version).
 */
export async function deterministicEntityHypothesisId(
  input: EntityHypothesisIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildEntityHypothesisIdentityKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h: string) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}
