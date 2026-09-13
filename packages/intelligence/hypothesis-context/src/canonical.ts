// ============================================================================
// Canonical overlap + total order (Phase 5A-PR3)
//
// §18: an overlap edge connects two atomic hypotheses only when they SHARE at
// least one canonical graph node / entity. Candidate refs (v1 EntityHypothesis
// flow) are never canonical and never create overlap edges. Unknown refs carry
// no node at all. The canonical node set of an atomic hypothesis is
// `referencedCanonicalEntityIds` — every canonical entity already present on
// the source (subject/object plus candidateEntities/resolved refs).
//
// The V1 total order (frozen §19 split ordering encoded for comparison):
//   1. EVIDENCE_SUPPORT_DESC      -> evidenceSupport descending
//   2. STRUCTURAL_RELEVANCE_DESC  -> structuralRelevance descending
//   3. HYPOTHESIS_ID_ASC          -> derivedId ascending (final tie-break)
// This is the ONLY ordering used for the derived atomic list, component
// splitting, and group membership, so the output is byte-stable regardless of
// input array order.
// ============================================================================

import type { AtomicRelationshipHypothesis } from './types.js';

/**
 * Canonical entity ids referenced by an atomic hypothesis, in canonical key
 * form (`entity:<EntityId>`). Sorted unique. This is the ONLY basis for
 * overlap grouping — no semantic, string, or embedding similarity.
 */
export function overlapNodeKeys(atomic: AtomicRelationshipHypothesis): string[] {
  return canonicalEntityIdsOf(atomic)
    .map((id) => `entity:${id}`)
    .sort();
}

/** Distinct canonical entity ids referenced by the atomic hypothesis (sorted unique). */
export function canonicalEntityIdsOf(atomic: AtomicRelationshipHypothesis): string[] {
  return [...atomic.referencedCanonicalEntityIds];
}

/** Byte-stable comparator implementing the documented V1 total order. */
export function compareAtomicOrder(
  a: AtomicRelationshipHypothesis,
  b: AtomicRelationshipHypothesis,
): number {
  const supportDelta = b.evidenceSupport - a.evidenceSupport;
  if (supportDelta !== 0) return supportDelta;
  const relevanceDelta = b.structuralRelevance - a.structuralRelevance;
  if (relevanceDelta !== 0) return relevanceDelta;
  if (a.derivedId < b.derivedId) return -1;
  if (a.derivedId > b.derivedId) return 1;
  return 0;
}

/** Sort a derived atomic list into canonical order (does not mutate input). */
export function sortAtomic(atoms: readonly AtomicRelationshipHypothesis[]): AtomicRelationshipHypothesis[] {
  return [...atoms].sort(compareAtomicOrder);
}