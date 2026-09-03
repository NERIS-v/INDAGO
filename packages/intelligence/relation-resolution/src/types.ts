// ============================================================================
// M-A10 Relation Resolution — shared types and scoring model config
//
// M-A10 answers:
//   "How strongly does the available evidence support a relationship between
//    these two canonical entities, and what reversible hypothesis should be
//    recorded?"
//
// This module is PURE. It has NO IO dependencies: no Prisma, BullMQ, Redis,
// network clients, or web framework. It is deterministic and explainable.
//
// CANONICAL-ENTITY PRECONDITION (identity boundary):
//   M-A10 operates DOWNSTREAM of canonical-entity materialization (the
//   M-A09.5 decision boundary). The engine consumes canonical Entity rows +
//   Observation.entityIds. It NEVER fabricates an EntityId, NEVER reinterprets
//   EntityMentionCandidateId / CandidatePairId as EntityId, and NEVER builds a
//   relation from a raw mention.
//
// RelationSupport is a support signal for the existence/type of a relationship.
// It is NOT a probability unless calibrated on held-out labeled data.
//
// ============================================================================
// SCORING MODEL v1 — indago:relation-score:v1
//
// Weighted-additive evidence accumulation with contradiction handling.
// Scores are clamped to [0, 1]. Not a probability.
//
// | Evidence                                             | Effect  | Why                          |
// |------------------------------------------------------|---------|------------------------------|
// | Direct co-occurrence in same observation             | +0.20   | Two canonical entities linked in the same source-grounded observation is baseline relation evidence. |
// | Multiple independent co-occurrences                  | +0.15   | Repeated co-occurrence across observations strengthens the relationship claim. |
// | Source diversity (multiple sources)                  | +0.10   | Independent sources corroborating a co-occurrence is stronger than repeated mentions in one source. |
// | Temporal proximity                                  | +0.10   | Entities appearing together in a narrow time window is a signal of active relationship. |
// | Relation type signal from observation content        | +0.15   | Observation type/content directly classifying the relationship (e.g. COMMUNICATION → communication, FINANCIAL → financial). |
// | Structural signal (graph proximity)                 | +0.00   | Graph proximity alone is NOT relation evidence (absolute invariant). |
// | Hard contradiction (explicit disassociation)        | -0.25   | Evidence explicitly contradicting the relationship. |
// | ABSENT data                                         |  0.00   | Missing data is NOT contradictory. |
//
// SCORE SETTLEMENT: final = clamp(0 + Σ positive weights − Σ contradiction
// weights, 0, 1).
//
// FLOW:
//   canonical Entity + Observation.entityIds
//             → entity co-occurrence detection (evidence-originated)
//             → relation type classification
//             → evidence accumulation
//   → deterministic scoring model v1 → RelationSupport
//   → RelationHypothesis: PROPOSED (never auto-ACCEPTED)
// ============================================================================

import type {
  Observation,
  RelationType,
  EntityId,
  RelationSupport,
} from '@indago/contracts';

/**
 * Bounds that keep relation resolution strictly bounded and deterministic.
 */
export const RELATION_RESOLUTION_BOUNDS = {
  /** Hard cap on evidence basis observation IDs recorded on a hypothesis. */
  maxEvidenceBasis: 200,
  /** Hard cap on contradicting observation IDs recorded on a hypothesis. */
  maxContradictions: 200,
  /** Maximum entities to consider per observation (avoids combinatorial blowup). */
  maxEntitiesPerObservation: 100,
  /** Maximum entity pairs per observation. */
  maxEntityPairsPerObservation: 500,
  /** Maximum observations read per case during detection. */
  maxObservationsPerCase: 50_000,
  /** Maximum temporal window (ms) treated as "temporally proximate". */
  temporalProximityWindowMs: 90 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Versioned identity of the deterministic scoring model.
 * Changing future scoring rules MUST bump this so historical hypotheses
 * remain interpretable against the model that produced them.
 */
export const RELATION_SCORE_MODEL_VERSION = 'indago:relation-score:v1';

/**
 * Deterministic scoring weights for model v1. See the header table for the
 * one-sentence justification of each weight.
 */
export const RELATION_SCORING_V1 = {
  /** Floor applied to ANY comparison. */
  baseline: 0,
  /** Positive weight for direct co-occurrence in the same observation. */
  coOccurrence: 0.20,
  /** Additional weight for repeated co-occurrences across observations. */
  repeatedCoOccurrence: 0.15,
  /** Positive weight for source diversity. */
  sourceDiversity: 0.10,
  /** Positive weight for temporal proximity. */
  temporalProximity: 0.10,
  /** Positive weight for relation type signal from observation content. */
  typeSignal: 0.15,
  /** Fixed negative weight for explicit contradiction. */
  hardContradiction: -0.25,
  /** Hard score floor. */
  minScore: 0,
  /** Hard score ceiling. */
  maxScore: 1,
} as const;

/**
 * Minimum support score below which a relation hypothesis is NOT proposed.
 * If the evidence cannot clear this floor, the resolver does NOT manufacture
 * a positive relation hypothesis.
 */
export const RELATION_PROPOSAL_THRESHOLD = 0.25;

/**
 * Observation types whose semantics directly classify a relation type.
 * Used by the deterministic type classifier. Any observation type not listed
 * here yields NO direct type signal (generic co-occurrence → `other`).
 */
export const RELATION_TYPE_SIGNAL_TYPES: Readonly<Record<string, RelationType>> = {
  COMMUNICATION: 'communication',
  FINANCIAL: 'financial',
  SPATIAL: 'co-location',
} as const;

/**
 * AUTHORITATIVE DIRECTIONALITY of each RelationTypeSchema value.
 *
 * This is the single source of truth for whether a relation identity MUST
 * preserve source→target ordering. It is derived from the domain semantics of
 * each relation predicate (documented in §6 of the M-A10 doc):
 *
 *   DIRECTED relation types encode an ASYMMETRIC predicate, i.e. the evidence
 *   distinguishes a clear source and target (e.g. ownership: "A owns B" ≠
 *   "B owns A"). Their identity MUST NOT collapse A→B with B→A.
 *
 *   UNDIRECTED relation types encode a SYMMETRIC predicate (e.g. co-location:
 *   "A and B were co-located" has no direction). Their identity MAY collapse
 *   A↔B with B↔A.
 *
 * Directed:
 *   ownership      — "A owns B" ≠ "B owns A" (asymmetric).
 *   organizational — "A reports to B" ≠ "B reports to A" (asymmetric).
 *   transport      — "A transported by B" / "shipment from A to B" (asymmetric).
 *   vehicle        — "A registered to vehicle B" (A → vehicle B) (asymmetric).
 *   family         — a specific kinship role infers a direction (father-of) even
 *                    though some kinship relations are naturally reflexive.
 *
 * Undirected:
 *   communication  — "A communicates with B" is symmetric.
 *   financial      — "A and B are financially linked" is symmetric.
 *   co-location    — "A and B were co-located" is symmetric.
 *   association    — "A is associated with B" is symmetric (co-membership).
 *   case-link      — "A and B are co-defendants" is symmetric.
 *   other          — generic co-occurrence has no direction.
 */
export const RELATION_DIRECTION: Readonly<Record<RelationType, 'directed' | 'undirected'>> = {
  communication: 'undirected',
  financial: 'undirected',
  ownership: 'directed',
  'co-location': 'undirected',
  association: 'undirected',
  organizational: 'directed',
  transport: 'directed',
  family: 'directed',
  vehicle: 'directed',
  'case-link': 'undirected',
  other: 'undirected',
} as const;

/** True when the given relation type carries asymmetric source→target semantics. */
export function isRelationDirected(relationType: RelationType): boolean {
  return RELATION_DIRECTION[relationType] === 'directed';
}

/** Resolve the effective `directed` flag for a relation type (never overridden to false). */
export function resolveRelationDirected(
  relationType: RelationType,
): boolean {
  return isRelationDirected(relationType);
}

/**
 * Evidence input for resolving relations over a case.
 *
 * The engine consumes canonical Entities alongside the observations that
 * reference them (Observation.entityIds). Each entity carries the observations
 * it participates in so the engine can compute temporal/source coverage.
 */
export interface RelationResolutionInput {
  readonly caseId: string;
  readonly investigationId?: string;
  readonly observations: readonly Observation[];
  readonly entities: readonly EntityEvidence[];
  /**
   * Explicit contradiction observation IDs for the case. An observation in this
   * set that supports a candidate pair applies the −0.25 hardContradiction
   * weight and suppresses the hypothesis (NEVER mere absence). When omitted it
   * is treated as empty — the engine never manufactures a contradiction.
   */
  readonly explicitContradictions?: ReadonlySet<string>;
}

/**
 * Canonical entity as consumed by the relation engine — the durable Entity
 * plus the observation IDs that reference it (its links). The engine derives
 * every signal from these; it never fabricates identity.
 */
export interface EntityEvidence {
  readonly id: EntityId;
  readonly observationIds: readonly string[];
}

/**
 * Candidate entity pair detected from canonical-entity co-occurrence within
 * the same source-grounded observation.
 */
export interface RelationCandidatePair {
  readonly sourceEntityId: EntityId;
  readonly targetEntityId: EntityId;
  readonly observationIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly suggestedType: RelationType;
}

/**
 * The pure engine output — a RelationResolution before persistence mapping.
 */
export interface RelationResolution {
  readonly sourceEntityId: EntityId;
  readonly targetEntityId: EntityId;
  readonly relationType: RelationType;
  readonly directed: boolean;
  readonly support: RelationSupport;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly evidenceCount: number;
  readonly evidenceStrength: number;
  readonly sourceCoverage: number;
  readonly temporalCoverage: number;
  readonly scoreModelVersion: string;
}
