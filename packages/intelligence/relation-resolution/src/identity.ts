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
//   sourceEntityId + targetEntityId + relationType + directed + scoreModelVersion
//       → SHA-256 → stable UUID
//
// DIRECTIONALITY-AWARE CANONICAL ORDERING:
//   - UNDIRECTED relation types: sourceEntityId < targetEntityId (lexicographic)
//     canonicalization collapses A↔B and B↔A to the same identity.
//   - DIRECTED relation types: source/target are preserved VERBATIM — A→B and
//     B→A yield DISTINCT identities. Directedness is authoritative (see
//     RELATION_DIRECTION in types.ts); it is never inferred from metadata.
// ============================================================================

import { computeContentHash, bytesToUuid4 } from '@indago/ingestion';
import { RELATION_SCORE_MODEL_VERSION } from './types.js';
import { isRelationDirected } from './types.js';

export const RELATION_HYPOTHESIS_IDENTITY_NAMESPACE = 'indago:relation-hypothesis';
export const RELATION_HYPOTHESIS_IDENTITY_VERSION = 1;

export interface RelationHypothesisIdentityInput {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  /** Effective directedness of the relation type. For directed types this is
   *  taken from the authoritative RELATION_DIRECTION map. */
  readonly directed?: boolean;
  readonly scoreModelVersion?: string;
}

/**
 * Resolve the effective directedness for identity purposes:
 *  - an explicit `directed` value is honored (worker threads it through);
 *  - otherwise it is derived from the authoritative RELATION_DIRECTION map.
 */
function effectiveDirected(
  relationType: string,
  directed: boolean | undefined,
): boolean {
  if (directed !== undefined) return directed;
  // Only relation types in RELATION_DIRECTION are resolved authoritatively;
  // unknown types default to directed (safe: distinct directions stay distinct).
  try {
    return isRelationDirected(relationType as Parameters<typeof isRelationDirected>[0]);
  } catch {
    return true;
  }
}

/**
 * Canonical ordering is DIRECTIONALITY-AWARE. For an UNDIRECTED relation the
 * lexicographically smaller entity ID is always "source" (so A↔B == B↔A). For a
 * DIRECTED relation source/target are preserved verbatim (so A→B ≠ B→A).
 *
 * ENTITY-ID BOUNDARY: both inputs MUST be canonical EntityIds (downstream of
 * the M-A09.5 materialization boundary). This module never accepts mention or
 * candidate-pair ids in place of an EntityId.
 */
function canonicalOrder(
  a: string,
  b: string,
  directed: boolean,
): [string, string] {
  if (directed) return [a, b];
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
  const directed = effectiveDirected(input.relationType, input.directed);
  const [canonicalSource, canonicalTarget] = canonicalOrder(
    input.sourceEntityId,
    input.targetEntityId,
    directed,
  );
  return JSON.stringify([
    RELATION_HYPOTHESIS_IDENTITY_NAMESPACE,
    `v${RELATION_HYPOTHESIS_IDENTITY_VERSION}`,
    canonicalSource,
    canonicalTarget,
    input.relationType,
    directed ? 'directed' : 'undirected',
    version,
  ]);
}

/**
 * Derive a deterministic RelationHypothesisId (UUID v4-shaped, satisfies
 * RelationHypothesisIdSchema) from the canonical identity representation. Same
 * entity pair + same relation type + same directedness + same scoring model →
 * same id across passes, retries, and workers.
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
