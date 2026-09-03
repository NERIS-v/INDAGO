// ============================================================================
// M-A09.5 Canonical Entity — deterministic identity
//
// Canonical EntityId is DETERMINISTIC and CASE-SCOPED. It is derived from the
// explicit accepted-identity decision's canonical representation, so a retry /
// re-materialization of the same accepted identity converges to the SAME
// canonical Entity — no duplicates, no cross-case collision.
//
// NEVER: randomUUID(), timestamps, worker execution id, attempt id,
// Math.random(). Identity must not depend on time or execution context.
//
// Stable identity inputs:
//   caseId
//   + canonicalName (best-known name, deterministic from the accepted
//       hypothesis's supporting candidates)
//   + entityType    (EntityTypeSchema value; may be undefined when untyped)
//
// The identity key format (namespace:v1:caseId:canonicalName:entityType) MUST
// match the platform EntityStore.materializeEntity boundary so the durable
// Entity row and the engine's derived EntityId converge on the same identity.
//
// ENTITY-ID BOUNDARY: a canonical EntityId is created ONLY through an explicit
// authority/decision path (an ACCEPTED EntityHypothesis). This module supplies
// the deterministic identity primitive for that decision — it NEVER fabricates
// an EntityId from a resolution score or candidate/pair id by itself.
// ============================================================================

import { computeContentHash, bytesToUuid4 } from '@indago/ingestion';

export const ENTITY_IDENTITY_NAMESPACE = 'indago:entity';
export const ENTITY_IDENTITY_VERSION = 1;

export interface CanonicalEntityIdentityInput {
  readonly caseId: string;
  readonly canonicalName: string;
  readonly entityType?: string;
}

/**
 * Build the versioned canonical identity representation. Exposed separately so
 * the durable store can persist the SAME key used to derive the id (single
 * source of canonical identity) — mirrors buildEntityMentionIdentityKey and
 * buildCandidatePairIdentityKey.
 */
export function buildEntityIdentityKey(
  input: CanonicalEntityIdentityInput,
): string {
  return JSON.stringify([
    ENTITY_IDENTITY_NAMESPACE,
    `v${ENTITY_IDENTITY_VERSION}`,
    input.caseId,
    input.canonicalName,
    input.entityType ?? null,
  ]);
}

/**
 * Derive a deterministic canonical EntityId (UUID v4-shaped, satisfies
 * EntityIdSchema) from the canonical identity representation. Same
 * case+name+type → same id across passes, retries, and workers.
 */
export async function deterministicEntityId(
  input: CanonicalEntityIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildEntityIdentityKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h: string) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}
