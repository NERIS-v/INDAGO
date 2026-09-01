// ============================================================================
// M-A10 Relation Resolution — deterministic hypothesis identity
//
// RelationHypothesisId is deterministic and CASE-SCOPED. It is derived from the
// same deterministic relation proposition that produced it, so a retry /
// re-run of the same entity pair + relation type under the same scoring model
// converges to the SAME logical hypothesis — no duplicates on retry.
//
// NEVER: randomUUID(), timestamps, worker execution id, attempt id, or
// Math.random(). Identity must not depend on time or execution context.
//
// Stable identity inputs:
//   sourceEntityId + targetEntityId + relationType + scoreModelVersion
//       → SHA-256 → stable UUID
//
// Canonical ordering: sourceEntityId < targetEntityId (lexicographic) ensures
// the same unordered pair converges to the same hypothesis regardless of
// which entity is "source" or "target" in the input.
// ============================================================================

import { computeContentHash, bytesToUuid4 } from '@indago/ingestion';
import { RELATION_SCORE_MODEL_VERSION } from './types.js';

export const RELATION_HYPOTHESIS_IDENTITY_NAMESPACE = 'indago:relation-hypothesis';
export const RELATION_HYPOTHESIS_IDENTITY_VERSION = 1;

export interface RelationHypothesisIdentityInput {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly scoreModelVersion?: string;
}

/**
 * Canonical ordering: lexicographically smaller entity ID is always "source".
 * This ensures the same unordered pair converges to the same identity key
 * regardless of input direction.
 *
 * ENTITY-ID BOUNDARY: both inputs MUST be canonical EntityIds (downstream of
 * the M-A09.5 materialization boundary). This module never accepts mention or
 * candidate-pair ids in place of an EntityId.
 */
function canonicalOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Build the versioned canonical identity representation. Exposed separately so
 * the durable store can persist the SAME key used to derive the id (single
 * source of canonical identity).
 */
export function buildRelationHypothesisIdentityKey(
  input: RelationHypothesisIdentityInput,
): string {
  const version = input.scoreModelVersion ?? RELATION_SCORE_MODEL_VERSION;
  const [canonicalSource, canonicalTarget] = canonicalOrder(
    input.sourceEntityId,
    input.targetEntityId,
  );
  return JSON.stringify([
    RELATION_HYPOTHESIS_IDENTITY_NAMESPACE,
    `v${RELATION_HYPOTHESIS_IDENTITY_VERSION}`,
    canonicalSource,
    canonicalTarget,
    input.relationType,
    version,
  ]);
}

/**
 * Derive a deterministic RelationHypothesisId (UUID v4-shaped, satisfies
 * RelationHypothesisIdSchema) from the canonical identity representation. Same
 * entity pair + same relation type + same scoring model → same id across
 * passes, retries, and workers.
 */
export async function deterministicRelationHypothesisId(
  input: RelationHypothesisIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildRelationHypothesisIdentityKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h: string) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}
