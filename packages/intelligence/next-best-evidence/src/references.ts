// ============================================================================
// Next-Best-Evidence Runtime — Reference Resolution (Phase 5A-PR10)
//
// Maps PR7 advisory IDs (atomic-hypothesis derivedIds) to canonical
// hypothesis UUIDs deterministically and validates all candidate references
// against the supplied closed-world context. This is the ONLY mechanism PR10
// uses to bridge PR7 advisory surfaces to canonical selection surfaces:
//   - derivedIds follow the deterministic PR3 prefix format
//     (`atomic:RELATION_HYPOTHESIS:<uuid>` / `atomic:ENTITY_HYPOTHESIS:<uuid>`)
//   - the UUID tail is the canonical hypothesis id
//   - membership in the supplied hypothesis context is validated (closed-world)
//   - invented/unresolvable derivedIds are rejected (fail-closed)
//
// This module does NOT perform string similarity or fuzzy matching.
// ============================================================================

import type { Pr10AtomicHypothesis } from './types.js';

/**
 * PR3 frozen derivedId format: `atomic:<TYPE>:<canonicalUuid>`.
 * The prefix is deterministic and owned by PR3 atomic.ts (fromRelation/fromEntity).
 */
const ATOMIC_DERIVED_ID_PREFIX = /^atomic:(?:RELATION_HYPOTHESIS|ENTITY_HYPOTHESIS):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/**
 * Extract the canonical hypothesis UUID from a PR3 atomic-hypothesis derivedId.
 * Returns `null` when the derivedId does not match the frozen PR3 format or the
 * UUID tail is malformed — treated as invalid and the reference is rejected.
 */
export function canonicalHypothesisIdFromDerivedId(derivedId: string): string | null {
  const match = derivedId.match(ATOMIC_DERIVED_ID_PREFIX);
  if (match === null) return null;
  const uuid = match[1];
  if (uuid === undefined) return null;
  // Normalize to lowercase UUID
  return uuid.toLowerCase();
}

/**
 * Build a Map from derivedId → atomic hypothesis for O(1) closed-world
 * membership testing. Iteration is bounded by context size.
 */
export function buildAtomicLookup(context: readonly Pr10AtomicHypothesis[]): ReadonlyMap<string, Pr10AtomicHypothesis> {
  const byDerivedId = new Map<string, Pr10AtomicHypothesis>();
  for (const atomic of context) {
    byDerivedId.set(atomic.derivedId, atomic);
  }
  return byDerivedId;
}

/**
 * Resolve a list of derivedIds to canonical UUIDs, validating each
 * against the supplied closed-world atomic context.
 *
 * Returns the resolved UUIDs (sorted unique) and the number of
 * unresolvable references (for accounting).
 */
export function resolveDerivedIdsToUuids(
  derivedIds: readonly string[],
  atomicLookup: ReadonlyMap<string, Pr10AtomicHypothesis>,
): { resolved: string[]; unresolvableCount: number } {
  const resolvedUuids = new Set<string>();
  let unresolvable = 0;

  for (const ref of derivedIds) {
    const atomic = atomicLookup.get(ref);
    if (atomic === undefined) {
      unresolvable += 1;
      continue;
    }
    const uuid = canonicalHypothesisIdFromDerivedId(ref);
    if (uuid === null) {
      unresolvable += 1;
      continue;
    }
    resolvedUuids.add(uuid);
  }

  return {
    resolved: [...resolvedUuids].sort(),
    unresolvableCount: unresolvable,
  };
}

/**
 * Build a map from canonical hypothesis UUID → supporting/contradicting
 * counts for EIG derivation. Populated from the atomic context.
 */
export function buildUuidSignalMap(context: readonly Pr10AtomicHypothesis[]): ReadonlyMap<string, { readonly supporting: number; readonly contradicting: number }> {
  const map = new Map<string, { supporting: number; contradicting: number }>();
  for (const atomic of context) {
    const uuid = canonicalHypothesisIdFromDerivedId(atomic.derivedId);
    if (uuid === null) continue;
    map.set(uuid, {
      supporting: atomic.supportingObservationIds.length,
      contradicting: atomic.contradictingObservationIds.length,
    });
  }
  return map;
}

/**
 * Build a set of canonical hypothesis UUIDs for O(1) membership testing
 * (used for validating discrimination targets against the competing set).
 */
export function buildUuidSet(uuids: readonly string[]): ReadonlySet<string> {
  return new Set(uuids);
}

/**
 * Build a map from canonical hypothesis UUID → its bounded atomic hypothesis
 * (used for per-target temporal-fit signals during relevance derivation).
 */
export function buildUuidToAtomicMap(
  context: readonly Pr10AtomicHypothesis[],
): ReadonlyMap<string, Pr10AtomicHypothesis> {
  const map = new Map<string, Pr10AtomicHypothesis>();
  for (const atomic of context) {
    const uuid = canonicalHypothesisIdFromDerivedId(atomic.derivedId);
    if (uuid === null) continue;
    map.set(uuid, atomic);
  }
  return map;
}