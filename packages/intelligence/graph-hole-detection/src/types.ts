// ============================================================================
// @indago/graph-hole-detection — public types (Phase 5A-PR4)
//
// PR4 turns a bounded GraphHoleRegion + its grouped hypothesis context (PR3)
// into DETERMINISTIC, RAW GraphHoleCandidates. Detection is PURE and
// READ-ONLY: it never mutates the graph, creates canonical entities or
// relations, persists anything, or invokes an LLM. Qualification/scoring and
// update of graph-hole records are later PRs.
//
// Every output is byte-stable: same input (in any array order) produces the
// same candidate set, ids, ordering, and accounting.
// ============================================================================

import type {
  EntityHypothesis,
  GraphEdge,
  GraphHoleType,
  GraphNode,
  RelationHypothesis,
  RelationType,
  TemporalInterval,
  RawGraphHoleCandidate,
  DetectorBoundKind,
  StructuralBasis,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { HypothesisContext } from '@indago/hypothesis-context';

/** Minimal observation record required for provenance tracing (id → source). */
export interface DetectionObservation {
  readonly id: string;
  readonly sourceId: string;
}

/**
 * Authoritative, closed-world detection input. The caller supplies EXACTLY
 * one case's bounded region + scope (nodes/edges membership is enforced
 * against `region.nodeIds` / `region.edgeIds`). `observations` must cover
 * every observation id referenced by the hypothesis context — PR4 refuses to
 * fabricate a source id.
 */
export interface DetectionInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  /** Analysis window. PR4 detectors prefer authoritative per-node/edge intervals. */
  readonly temporalContext: TemporalInterval;
  readonly region: GraphHoleRegion;
  /** Canonical nodes in scope (region nodes). */
  readonly nodes: readonly GraphNode[];
  /** Canonical edges in scope (region edges). */
  readonly edges: readonly GraphEdge[];
  /** Prebuilt PR3 hypothesis context. When absent it is built from the hypotheses below. */
  readonly hypothesisContext?: HypothesisContext;
  readonly relationHypotheses?: readonly RelationHypothesis[];
  readonly entityHypotheses?: readonly EntityHypothesis[];
  /** Observation records (id must be a uuid; sourceId must be a uuid). */
  readonly observations: readonly DetectionObservation[];
  /** Deterministic community membership nodeId → communityId (M-A13 detectCommunities). Optional. */
  readonly communities?: ReadonlyMap<string, string>;
  /** Detectors to run; defaults to all six in frozen order. */
  readonly enabledDetectors?: readonly GraphHoleType[];
}

/** The normalized, closed detection context consumed by every detector. */
export interface GraphHoleDetectionContext {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly temporalContext: TemporalInterval | null;
  readonly region: GraphHoleRegion;
  /** Canonical nodes in scope, sorted by id. */
  readonly nodes: readonly GraphNode[];
  /** Canonical edges in scope, sorted by id. */
  readonly edges: readonly GraphEdge[];
  readonly nodeById: ReadonlyMap<string, GraphNode>;
  readonly edgeById: ReadonlyMap<string, GraphEdge>;
  /** nodeId → sorted ids of region edges incident to the node. */
  readonly edgesByNode: ReadonlyMap<string, readonly string[]>;
  /** nodeId → sorted neighbor node ids (region scope, both directions, deduped). */
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
  /** PR3 atomic + grouped hypothesis context consumed by the detectors. */
  readonly hypothesisContext: HypothesisContext;
  /** Observations sorted by id. */
  readonly observations: readonly DetectionObservation[];
  readonly sourceByObservationId: ReadonlyMap<string, string>;
  /** nodeId → communityId, or null when no community membership was supplied. */
  readonly communities: ReadonlyMap<string, string> | null;
  readonly enabledDetectors: readonly GraphHoleType[];
}

/** A raw detector-emitted gap, before identity hashing and materialization. */
export interface DetectorCandidate {
  readonly detectorType: GraphHoleType;
  readonly nodeIds: readonly string[];
  readonly observedEdgeIds: readonly string[];
  readonly expectedRelationshipType: RelationType | null;
  readonly temporalScope: TemporalInterval | null;
  readonly supportingHypothesisIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly structuralBasis: StructuralBasis;
}

/** Per-detector run accounting (rolled up at the result level). */
export interface DetectorRunSummary {
  readonly detectorType: GraphHoleType;
  readonly candidates: number;
  readonly pairEvaluations: number;
  readonly boundReached: boolean;
  readonly boundKind?: DetectorBoundKind;
}

export interface GraphHoleDetectionSummary {
  readonly hypothesisContext: {
    readonly atomicHypotheses: number;
    readonly groups: number;
    readonly components: number;
  };
  readonly detectors: readonly DetectorRunSummary[];
  /** Candidates suppressed as duplicates by identity (deterministic first-wins). */
  readonly duplicateSuppressions: number;
  /** The producing region reported a truncated build (region.truncated). */
  readonly regionTruncated: boolean;
  /** Whether the region candidate cap (DETECTOR_BOUNDS.maxRegionCandidates) dropped candidates. */
  readonly regionCandidateCapReached: boolean;
  /** Candidates dropped by the region cap (deterministic: highest candidateIds). */
  readonly droppedCandidateCount: number;
  readonly candidateCap: number;
}

export interface GraphHoleDetectionResult {
  readonly candidates: readonly RawGraphHoleCandidate[];
  readonly region: GraphHoleRegion;
  readonly summary: GraphHoleDetectionSummary;
}

/** Deterministic, typed failure for invalid detection inputs. */
export class GraphHoleDetectionError extends Error {
  constructor(
    readonly code:
      | 'AUTHORITY_MISMATCH'
      | 'MISSING_OBSERVATION_SOURCE'
      | 'INVALID_CASE_SCOPE',
    message: string,
  ) {
    super(message);
    this.name = 'GraphHoleDetectionError';
  }
}