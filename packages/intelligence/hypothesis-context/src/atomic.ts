// ============================================================================
// Atomic normalization (Phase 5A-PR3)
//
// Derives AtomicRelationshipHypothesis records from the EXISTING authoritative
// sources. Pure read-only projection:
//   - RelationHypothesis -> subject=sourceEntityId, predicate=relationType,
//     object=targetEntityId (all canonical entities already present).
//   - EntityHypothesis   -> predicate 'same-entity' (the identity/co-reference
//     claim is FAITHFULLY projected, not invented). Canonical refs are used
//     when ALREADY available (entityId/resolvedEntityId/candidateEntities);
//     otherwise the v1 Candidate<->Candidate supportingCandidateIds are kept as
//     `candidate` refs (never canonical, never overlap-capable).
//
// Missing vs. invented: an empty supporting/contradicting observation list is
// an ABSENT set (never treated as contradiction); an absent temporal scope or
// graph version is `null`, never guessed.
// ============================================================================

import type {
  EntityHypothesis,
  RelationHypothesis,
} from '@indago/contracts';
import type {
  AtomicNodeReference,
  AtomicRelationshipHypothesis,
} from './types.js';

export function fromRelation(
  rel: RelationHypothesis,
  graphVersion: string | null,
): AtomicRelationshipHypothesis {
  return {
    derivedId: `atomic:RELATION_HYPOTHESIS:${rel.id}`,
    hypothesisType: 'RELATION_HYPOTHESIS',
    subject: { kind: 'canonical_entity', id: rel.sourceEntityId },
    predicate: rel.relationType,
    object: { kind: 'canonical_entity', id: rel.targetEntityId },
    referencedCanonicalEntityIds: uniqueSorted([rel.sourceEntityId, rel.targetEntityId]),
    supportingObservations: uniqueSorted(rel.evidenceBasis),
    contradictingObservations: uniqueSorted(rel.contradictions ?? []),
    contradictingHypothesisIds: [],
    evidenceSupport: rel.support,
    structuralRelevance: rel.strength ?? 0,
    provenance: rel.provenance,
    temporalScope: rel.temporalInterval ?? null,
    graphVersion,
  };
}

export function fromEntity(
  ent: EntityHypothesis,
  graphVersion: string | null,
): AtomicRelationshipHypothesis {
  // Canonical refs ALREADY present on the source (future Entity<->Entity flow).
  const canonicalRefs = uniqueByIdStable([
    ...(ent.entityId !== undefined ? [{ kind: 'canonical_entity' as const, id: ent.entityId }] : []),
    ...(ent.resolvedEntityId !== undefined
      ? [{ kind: 'canonical_entity' as const, id: ent.resolvedEntityId }]
      : []),
    ...(ent.candidateEntities ?? []).map((c) => ({ kind: 'canonical_entity' as const, id: c.entityId })),
  ]);

  // v1 flow refs (Candidate<->Candidate); never canonical, never overlap-capable.
  const candidateRefs = uniqueByIdStable(
    (ent.supportingCandidateIds ?? []).map((id) => ({ kind: 'candidate' as const, id })),
  );

  const refs: AtomicNodeReference[] = canonicalRefs.length > 0 ? canonicalRefs : candidateRefs;
  const subject: AtomicNodeReference = refs[0] ?? { kind: 'unknown' };
  const object: AtomicNodeReference = refs[1] ?? { kind: 'unknown' };

  // Genuine positive-identity evidence: supportingObservationIds plus any
  // candidateEntities[].evidence (M-A09 v1 and future flows both preserved).
  const support = new Set<string>(ent.supportingObservationIds ?? []);
  for (const candidate of ent.candidateEntities ?? []) {
    for (const observationId of candidate.evidence ?? []) {
      support.add(observationId);
    }
  }

  return {
    derivedId: `atomic:ENTITY_HYPOTHESIS:${ent.id}`,
    hypothesisType: 'ENTITY_HYPOTHESIS',
    subject,
    predicate: 'same-entity',
    object,
    referencedCanonicalEntityIds: canonicalRefs.map((ref) => ref.id).sort(),
    supportingObservations: [...support].sort(),
    contradictingObservations: uniqueSorted(ent.contradictingObservationIds ?? []),
    contradictingHypothesisIds: uniqueSorted(ent.contradictions ?? []),
    evidenceSupport: ent.score,
    structuralRelevance: 0,
    provenance: ent.provenance,
    temporalScope: null,
    graphVersion,
  };
}

function uniqueSorted(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

function uniqueByIdStable<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}