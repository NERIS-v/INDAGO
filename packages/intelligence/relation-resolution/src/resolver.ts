// ============================================================================
// M-A10 Relation Resolution — pure relation engine
//
// PURE: no Prisma, BullMQ, Redis, network clients, clock, or random. Fully
// deterministic given the same durable canonical Entities + Observations.
//
// Flow:
//   canonical Entity (M-A09.5) + Observation.entityIds (M-A06)
//     → entity co-occurrence detection (evidence-originated)
//     → relation candidate pairs
//     → deterministic relation type classification
//     → deterministic scoring model v1 → RelationSupport
//     → RelationResolution (source/target/type/evidence/support/scoreModelVersion)
//
// The engine NEVER:
//   - fabricates a canonical EntityId
//   - reinterprets EntityMentionCandidateId / CandidatePairId as EntityId
//   - performs acceptance/merge
//   - infers a relation from graph proximity alone
//   - resolves across case boundaries
//   - auto-accepts a hypothesis (score → PROPOSED at most)
//   - manufactures provenance from graph structure
//
// SOURCE-GROUNDING INVARIANT: a relation MUST be grounded in Observation
// co-occurrence with explicit source support. A relation based solely on graph
// proximity MUST NOT be created.
//
// The platform persistence layer maps a RelationResolution to a durable
// RelationHypothesis record.
// ============================================================================

import type { EntityId, Observation, RelationType } from '@indago/contracts';
import {
  RELATION_RESOLUTION_BOUNDS,
  RELATION_SCORE_MODEL_VERSION,
  type EntityEvidence,
  type RelationCandidatePair,
  type RelationResolution,
  type RelationResolutionInput,
} from './types.js';
import { pickRelationType } from './classify.js';
import {
  scoreRelationPair,
  deriveRelationHypothesisStatus,
  shouldProposeRelationHypothesis,
} from './scoring.js';
import { resolveRelationDirected } from './types.js';

/**
 * Index an observation by id (bounded to the case observation cap for
 * deterministic memory behavior on huge cases).
 */
export function indexObservations(
  observations: readonly Observation[],
): Map<string, Observation> {
  const map = new Map<string, Observation>();
  for (const o of observations) {
    if (map.size >= RELATION_RESOLUTION_BOUNDS.maxObservationsPerCase) break;
    map.set(o.id, o);
  }
  return map;
}

/**
 * Index observations by their directly classified relation type. Used by the
 * scorer to award the `typeSignal` feature when a co-occurrence observation is
 * a member of the relation's type set. PURE.
 */
export function buildObservationsByType(
  observations: readonly Observation[],
): Map<RelationType, Set<string>> {
  const map = new Map<RelationType, Set<string>>();
  for (const o of observations) {
    const t = pickRelationType([o]);
    let set = map.get(t);
    if (set === undefined) {
      set = new Set<string>();
      map.set(t, set);
    }
    set.add(o.id);
  }
  return map;
}

const pairKey = (a: EntityId, b: EntityId): string =>
  a < b ? `${a}::${b}` : `${b}::${a}`;

const canonicalOrder = (a: EntityId, b: EntityId): [EntityId, EntityId] =>
  a < b ? [a, b] : [b, a];

/**
 * Detect relation candidate pairs purely from source-grounded observation
 * co-occurrence of canonical entities.
 *
 * A relation candidate is only formed when two canonically-resolved entities
 * co-occur within the SAME source-grounded observation — NEVER from graph
 * proximity, NEVER from mention ids.
 *
 * Returns deterministic, sorted candidate pairs with their supporting
 * observation and source IDs.
 */
export function detectRelationCandidates(params: {
  readonly observations: readonly Observation[];
  readonly entities: readonly EntityEvidence[];
}): RelationCandidatePair[] {
  const { observations, entities } = params;

  // Map observationId → canonical entity IDs referenced in that observation.
  const entitiesByObservation = new Map<string, Set<EntityId>>();
  for (const entity of entities) {
    for (const obsId of entity.observationIds) {
      let set = entitiesByObservation.get(obsId);
      if (set === undefined) {
        set = new Set<EntityId>();
        entitiesByObservation.set(obsId, set);
      }
      set.add(entity.id);
    }
  }

  // Accumulate co-occurrence evidence per unordered entity pair.
  const evidenceByPair = new Map<
    string,
    { source: EntityId; target: EntityId; observationIds: Set<string>; sourceIds: Set<string> }
  >();

  for (const observation of observations) {
    const ids = entitiesByObservation.get(observation.id);
    if (ids === undefined || ids.size < 2) continue;
    const entityIds = [...ids].slice(0, RELATION_RESOLUTION_BOUNDS.maxEntitiesPerObservation);
    let pairCount = 0;
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        if (pairCount >= RELATION_RESOLUTION_BOUNDS.maxEntityPairsPerObservation) break;
        pairCount++;
        const [source, target] = canonicalOrder(entityIds[i]!, entityIds[j]!);
        const key = pairKey(source, target);
        let entry = evidenceByPair.get(key);
        if (entry === undefined) {
          entry = {
            source,
            target,
            observationIds: new Set<string>(),
            sourceIds: new Set<string>(),
          };
          evidenceByPair.set(key, entry);
        }
        entry.observationIds.add(observation.id);
        entry.sourceIds.add(observation.sourceId);
      }
    }
  }

  const result: RelationCandidatePair[] = [];
  for (const entry of evidenceByPair.values()) {
    result.push({
      sourceEntityId: entry.source,
      targetEntityId: entry.target,
      observationIds: [...entry.observationIds]
        .sort()
        .slice(0, RELATION_RESOLUTION_BOUNDS.maxEvidenceBasis),
      sourceIds: [...entry.sourceIds].sort(),
      suggestedType: 'other',
    });
  }

  // Deterministic ordering: by source entity, then target entity.
  return result.sort((a, b) => {
    if (a.sourceEntityId !== b.sourceEntityId) {
      return a.sourceEntityId < b.sourceEntityId ? -1 : 1;
    }
    if (a.targetEntityId !== b.targetEntityId) {
      return a.targetEntityId < b.targetEntityId ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Resolve a single relation candidate into a RelationResolution.
 *
 * Grounds the relationship in the duplicate observations, classifies the type
 * deterministically, and settles the full scoring model v1. PURE.
 */
export function resolveRelationPair(params: {
  candidate: RelationCandidatePair;
  observationsByType?: ReadonlyMap<RelationType, Set<string>>;
  allObservations: readonly Observation[];
  explicitContradictions?: ReadonlySet<string>;
  temporalWindowMs: number;
  scoreModelVersion?: string;
}): {
  resolution: RelationResolution;
  proposed: boolean;
} {
  const {
    candidate,
    observationsByType,
    allObservations,
    explicitContradictions,
    temporalWindowMs,
    scoreModelVersion = RELATION_SCORE_MODEL_VERSION,
  } = params;

  // Grounding: the exact observations where both entities co-occur.
  const obsIndex = indexObservations(allObservations);
  const coOccurrenceObservations: Observation[] = [];
  for (const obsId of candidate.observationIds) {
    const o = obsIndex.get(obsId);
    if (o) coOccurrenceObservations.push(o);
  }

  // Deterministic type classification from the actual co-occurrence evidence.
  const relationType = pickRelationType(coOccurrenceObservations);

  // Explicit contradiction evidence (never mere absence). Precision matters:
  // only an observation that BOTH supports the pair AND is marked as an
  // explicit contradiction is recorded as a contradiction — never the whole
  // evidence basis, never an observation that merely co-occurs.
  const contradictionObservations: string[] = [];
  if (explicitContradictions && explicitContradictions.size > 0) {
    for (const obsId of candidate.observationIds) {
      if (explicitContradictions.has(obsId)) {
        contradictionObservations.push(obsId);
      }
    }
  }
  const explicitContradiction = contradictionObservations.length > 0;

  const settled = scoreRelationPair({
    coOccurrenceObservations,
    allObservations,
    relationType,
    observationsByType,
    explicitContradiction,
    temporalWindowMs,
  });

  const status = deriveRelationHypothesisStatus(
    settled.score,
    settled.hasHardContradiction,
  );
  const proposed = shouldProposeRelationHypothesis(
    settled.score,
    settled.hasHardContradiction,
  );

  const resolution: RelationResolution = {
    sourceEntityId: candidate.sourceEntityId,
    targetEntityId: candidate.targetEntityId,
    relationType,
    directed: resolveRelationDirected(relationType),
    support: settled.score,
    evidenceBasis: candidate.observationIds,
    contradictions: contradictionObservations,
    evidenceCount: candidate.observationIds.length,
    evidenceStrength: settled.evidenceStrength,
    sourceCoverage: settled.sourceCoverage,
    temporalCoverage: settled.temporalCoverage,
    scoreModelVersion,
  };

  return { resolution, proposed: proposed && status === 'PROPOSED' };
}

/**
 * Metrics for a multi-pair resolution pass (case-level).
 */
export interface RelationResolutionMetrics {
  pairsConsidered: number;
  hypothesesProposed: number;
  hypothesesRejected: number;
  lowEvidenceCount: number;
}

/**
 * Deterministically resolve EVERY candidate pair in a case.
 *
 * Evidence-originated: only pairs grounded in canonical-entity co-occurrence
 * are considered — never a blind all-pairs sweep. Each candidate is resolved
 * independently (per-relation partial-failure semantics survive into the
 * persistence layer — there is no whole-batch gate).
 */
export function resolveRelationsForCase(
  input: RelationResolutionInput,
  scoreModelVersion: string = RELATION_SCORE_MODEL_VERSION,
): {
  resolutions: RelationResolution[];
  metrics: RelationResolutionMetrics;
} {
  const { observations, entities, explicitContradictions } = input;

  const candidates = detectRelationCandidates({ observations, entities });
  const allObservations = observations.slice(
    0,
    RELATION_RESOLUTION_BOUNDS.maxObservationsPerCase,
  );
  const observationsByType = buildObservationsByType(allObservations);
  const temporalWindowMs = RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs;

  const resolutions: RelationResolution[] = [];
  let hypothesesProposed = 0;
  let hypothesesRejected = 0;
  let lowEvidenceCount = 0;

  for (const candidate of candidates) {
    const { resolution, proposed } = resolveRelationPair({
      candidate,
      observationsByType,
      allObservations,
      explicitContradictions,
      temporalWindowMs,
      scoreModelVersion,
    });
    resolutions.push(resolution);
    if (proposed) {
      hypothesesProposed += 1;
    } else if (resolution.evidenceCount === 0) {
      lowEvidenceCount += 1;
    } else {
      hypothesesRejected += 1;
    }
  }

  return {
    resolutions,
    metrics: {
      pairsConsidered: candidates.length,
      hypothesesProposed,
      hypothesesRejected,
      lowEvidenceCount,
    },
  };
}

/**
 * Observable-presence summary for one canonical entity (PR-31, FIX 3/4).
 *
 * PURE, derived, READ-ONLY: resolves each canonical entity's recorded
 * observationIds against the real observation universe and reports how many
 * distinct observations/sources the entity is actually observable in. This is
 * the observability signal the audit was missing — a relation can only ever be
 * grounded in observations where BOTH endpoints are observable, so a low
 * presence number (e.g. an under-typed person absent from the account
 * document) is the diagnostic cause, distinct from a resolver defect.
 *
 * No mutation of Entity / Observation, no schema change. Deterministic.
 */
export interface ObservablePresence {
  readonly entityId: string;
  /** Observation ids that resolve to a real observation (bounded, sorted). */
  readonly observableObservationIds: readonly string[];
  readonly distinctObservationCount: number;
  readonly distinctSourceIds: readonly string[];
}

export function computeObservablePresence(params: {
  readonly entities: readonly EntityEvidence[];
  readonly observations: readonly Observation[];
}): Map<string, ObservablePresence> {
  const { entities, observations } = params;
  const obsIndex = indexObservations(observations);
  const out = new Map<string, ObservablePresence>();
  for (const entity of entities) {
    const observable = new Set<string>();
    const sources = new Set<string>();
    for (const obsId of entity.observationIds) {
      const o = obsIndex.get(obsId);
      if (o === undefined) continue; // dangling reference — NOT observable
      observable.add(obsId);
      sources.add(o.sourceId);
    }
    const sorted = [...observable].sort();
    out.set(entity.id, {
      entityId: entity.id,
      observableObservationIds: sorted.slice(
        0,
        RELATION_RESOLUTION_BOUNDS.maxEvidenceBasis,
      ),
      distinctObservationCount: sorted.length,
      distinctSourceIds: [...sources].sort(),
    });
  }
  return out;
}
