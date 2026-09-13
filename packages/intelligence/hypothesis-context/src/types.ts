// ============================================================================
// @indago/hypothesis-context — public types (Phase 5A-PR3)
//
// PR3 derives an ATOMIC / GROUPED hypothesis context from the EXISTING
// authoritative hypothesis sources (EntityHypothesis + RelationHypothesis).
// It is a PURE, READ-ONLY, DERIVED representation:
//   - It NEVER creates a second hypothesis lifecycle, store, status, or
//     approval flow. Source hypotheses remain authoritative.
//   - It NEVER fabricates an EntityId, candidate, observation id, score,
//     temporal scope, or provenance. Missing/unknown fields are represented
//     as `null` / `unknown`, never invented values.
//   - It preserves contradictions through every transformation
//     (source -> atomic -> overlap -> grouped); PR3 does NOT resolve them.
//
// Determinism (V1): every output is byte-stable — same input in any array
// order produces identical atomic ordering, overlap graph, components,
// groups, ids, and serialization. All emitted id collections are sorted;
// no map/object iteration order, randomness, or clock values are ever used.
// ============================================================================

import type {
  EntityHypothesis,
  Provenance,
  RelationHypothesis,
  TemporalInterval,
} from '@indago/contracts';

/** Version of this derived context contract. */
export const ATOMIC_CONTEXT_POLICY_VERSION = 'v1' as const;
export type AtomicContextPolicyVersion = typeof ATOMIC_CONTEXT_POLICY_VERSION;

/** Which authoritative source kind an atomic hypothesis was derived from. */
export type AtomicHypothesisType = 'RELATION_HYPOTHESIS' | 'ENTITY_HYPOTHESIS';

/**
 * A node reference of an atomic hypothesis.
 *
 * Explicit missing/unknown vs. invented values:
 *   - `canonical_entity` — a canonical EntityId that was ALREADY present on the
 *     source hypothesis (no fabrication).
 *   - `candidate`        — an EntityMentionCandidate id from the v1
 *     Candidate<->Candidate flow (NOT a canonical node; never participates in
 *     overlap grouping).
 *   - `unknown`          — the source hypothesis carried no reference for this
 *     slot (never guessed).
 */
export type AtomicNodeReference =
  | { readonly kind: 'canonical_entity'; readonly id: string }
  | { readonly kind: 'candidate'; readonly id: string }
  | { readonly kind: 'unknown' };

/**
 * The derived atomic relationship hypothesis.
 *
 * `derivedId` is the byte-stable identity of the derived record:
 * `atomic:<HYPOTHESIS_TYPE>:<sourceHypothesisId>`. It is content-derived from
 * the authoritative source id, never random.
 *
 * `evidenceSupport` and `structuralRelevance` are the canonical total-order
 * keys used by the frozen §19 split ordering:
 *   - evidenceSupport   = RelationHypothesis.support | EntityHypothesis.score [0,1]
 *   - structuralRelevance = RelationHypothesis.strength ?? 0; for identity
 *     hypotheses the structural signal is NOT APPLICABLE and is ordered as 0
 *     for byte-stable comparison only (never treated as evidence).
 */
export interface AtomicRelationshipHypothesis {
  readonly derivedId: string;
  readonly hypothesisType: AtomicHypothesisType;
  readonly subject: AtomicNodeReference;
  readonly predicate: string;
  readonly object: AtomicNodeReference;
  /**
   * ALL canonical entity ids referenced by this atomic hypothesis (subject and
   * object PLUS any additional canonical refs already present on the source,
   * e.g. candidateEntities[].entityId / resolvedEntityId). Sorted unique. This
   * is the ONLY basis for overlap edges and MAX_GROUP_NODES accounting.
   */
  readonly referencedCanonicalEntityIds: readonly string[];
  readonly supportingObservations: readonly string[];
  readonly contradictingObservations: readonly string[];
  readonly contradictingHypothesisIds: readonly string[];
  readonly evidenceSupport: number;
  readonly structuralRelevance: number;
  readonly provenance: Provenance;
  readonly temporalScope: TemporalInterval | null;
  readonly graphVersion: string | null;
}

/**
 * Pure input for the derived context. All supported authoritative sources are
 * optional so an empty context is a valid input. `graphVersionId` is stamped
 * verbatim onto every derived atomic hypothesis for preservation only — it is
 * never fabricated when absent.
 */
export interface HypothesisContextInput {
  readonly caseId: string;
  readonly graphVersionId?: string;
  readonly relationHypotheses?: readonly RelationHypothesis[];
  readonly entityHypotheses?: readonly EntityHypothesis[];
}

/**
 * A bounded hypothesis group produced by the frozen §18/§19 grouping policy:
 * weakly connected components of the canonical-node overlap graph, split
 * deterministically when a component exceeds MAX_ATOMIC_HYPOTHESES_PER_GROUP
 * (25) or MAX_GROUP_NODES (50).
 */
export interface HypothesisGroup {
  /** SHA-256 of the sorted member derivedIds (content-addressed, byte-stable). */
  readonly groupId: string;
  /** SHA-256 of the sorted member derivedIds of the originating component. */
  readonly componentId: string;
  readonly atomicHypotheses: readonly AtomicRelationshipHypothesis[];
  /** Canonical graph-node keys in the group's shared-context subgraph, sorted unique. */
  readonly sharedNodeIds: readonly string[];
  /** Number of distinct canonical entities in `sharedNodeIds`. */
  readonly canonicalEntityCount: number;
  /** true when the originating component exceeded a bound and was split. */
  readonly truncated: boolean;
  /** The V1 split ordering dimension whose cap forced the split, when truncated. */
  readonly truncatedReason: 'ATOMIC_HYPOTHESES_CAP' | 'GROUP_NODES_CAP' | null;
  readonly componentTotals: {
    readonly atomicHypotheses: number;
  };
}

/** Deterministic accounting; every input hypothesis is accounted exactly once. */
export interface HypothesisContextAccounting {
  readonly inputRelationHypotheses: number;
  readonly inputEntityHypotheses: number;
  /** Derived atomic hypotheses AFTER deterministic dedupe by derivedId. */
  readonly atomicHypotheses: number;
  /** Weakly connected components over the overlap graph. */
  readonly components: number;
  readonly groups: number;
  /** Groups whose originating component had to be split by a cap. */
  readonly truncatedGroups: number;
  /** Atomic hypotheses carrying NO canonical entity ref (cannot ever overlap). */
  readonly isolatedAtomics: number;
  /** Sum of `canonicalEntityCount` across all groups. */
  readonly totalCanonicalNodesAcrossGroups: number;
}

/** The complete derived, grouped hypothesis context. */
export interface HypothesisContext {
  readonly policyVersion: AtomicContextPolicyVersion;
  readonly caseId: string;
  readonly graphVersionId: string | null;
  /** The documented V1 total order used for atomic comparison and splitting. */
  readonly atomicOrder: {
    readonly evidenceSupport: 'desc';
    readonly structuralRelevance: 'desc';
    readonly derivedHypothesisId: 'asc';
  };
  /** All derived atomic hypotheses in canonical order (sorted, deduped). */
  readonly atomic: readonly AtomicRelationshipHypothesis[];
  /** Deterministically ordered groups (component order, then split order). */
  readonly groups: readonly HypothesisGroup[];
  readonly accounting: HypothesisContextAccounting;
}