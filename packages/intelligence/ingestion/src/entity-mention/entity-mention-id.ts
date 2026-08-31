// ============================================================================
// M-A07 Entity Mention Candidate — deterministic identity
//
// EntityMentionCandidateId is deterministic and observation-scoped.
// NEVER: randomUUID(), observationId-only identity, or extraction-method-only
// identity.
//
// Stable identity inputs (locked design):
//   observationId
//   + start (inclusive offset)
//   + end   (exclusive offset)
//   + entityType (may be undefined when untyped)
//   + canonicalMatchValue (may be undefined)
//
// Same (observation, span, type, value) MUST yield the same id. Distinct
// mentions within one observation therefore get distinct ids; the same textual
// name in two different observations yields two separate candidates (M-A07
// does NOT resolve/merge — that is future entity resolution).
// ============================================================================

import { computeContentHash } from '../acquisition/content-hasher.js';
import { bytesToUuid4 } from '../acquisition/uuid-bytes.js';

export const ENTITY_MENTION_IDENTITY_NAMESPACE =
  'indago:entity-mention-candidate';
export const ENTITY_MENTION_IDENTITY_VERSION = 1;

export interface EntityMentionIdentityInput {
  readonly observationId: string;
  readonly start: number;
  readonly end: number;
  /** Required in identity; `'OTHER'` is never smuggled across the identity. */
  readonly entityType?: string;
  readonly canonicalMatchValue?: string;
}

/**
 * Build the versioned canonical identity representation. Exposed separately so
 * the durable store can persist the SAME key used to derive the id (single
 * source of canonical identity) — mirrors buildObservationIdentityKey.
 */
export function buildEntityMentionIdentityKey(
  input: EntityMentionIdentityInput,
): string {
  return JSON.stringify([
    ENTITY_MENTION_IDENTITY_NAMESPACE,
    `v${ENTITY_MENTION_IDENTITY_VERSION}`,
    input.observationId,
    input.start,
    input.end,
    input.entityType ?? null,
    input.canonicalMatchValue ?? null,
  ]);
}

/**
 * Derive a deterministic EntityMentionCandidateId (UUID v4-shaped, satisfies
 * EntityMentionCandidateIdSchema) from the canonical identity representation.
 * Same inputs → same id. Deterministic across machines, retries, and workers.
 */
export async function deterministicEntityMentionId(
  input: EntityMentionIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildEntityMentionIdentityKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}
