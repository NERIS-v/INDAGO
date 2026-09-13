// ============================================================================
// @indago/graph-hole-qualification — public types (Phase 5A-PR5)
//
// PR5 converts PR4 RAW raw GraphHoleCandidates into qualified, scored,
// deterministically ranked candidates. PR5 is PURE, DETERMINISTIC and
// READ-ONLY:
//   - It never mutates the graph, creates canonical entities/relations,
//     persists anything, invokes an LLM, or uses embeddings/semantic
//     similarity.
//   - Every output is byte-stable: same input (in ANY array order) produces
//     identical scores, failure reasons, ranking, and accounting.
//
// Input is the bounded PR4 candidate set + its region + PR3 hypothesis
// context + the observations that carry support-unit provenance. PR5 does
// NOT scan the whole case, does NOT call semantic retrieval, and does NOT
// recursively expand regions.
// ============================================================================

import type {
  GraphEdge,
  GraphNode,
  GraphHoleType,
  RawGraphHoleCandidate,
  TemporalInterval,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { HypothesisContext } from '@indago/hypothesis-context';

/** Region-scope provenance signals required for V1 support-unit resolution. */
export interface QualificationObservation {
  readonly id: string;
  readonly sourceId: string;
  /** V1 support-unit priority slot 1. */
  readonly sourceContextId?: string;
  /** V1 support-unit priority slot 2/3 (artifact-level binding). */
  readonly artifactId?: string;
  /** V1 support-unit priority slot 2/3 (content-based binding). */
  readonly contentHash?: string;
  /** Evidence strength [0,1] (contributes to contextual support). */
  readonly strength: number;
  /** Closed [validFrom, validTo] interval for temporal-gate checks. */
  readonly validityInterval?: TemporalInterval | null;
}

/**
 * Pure, closed-world qualification input. The caller supplies EXACTLY one
 * case's bounded region + scope + raw candidate set. Pr5 never reaches
 * beyond this data.
 */
export interface QualificationInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  /** The bounded analysis region that produced the candidates. */
  readonly region: GraphHoleRegion;
  /** Canonical nodes in scope (region nodes). */
  readonly nodes: readonly GraphNode[];
  /** Canonical edges in scope (region edges; authority for the resolved gate). */
  readonly edges: readonly GraphEdge[];
  /** Prebuilt PR3 hypothesis context (must cover every supportingHypothesisId). */
  readonly hypothesisContext: HypothesisContext;
  /** PR4 raw candidates to qualify (may be in any order). */
  readonly candidates: readonly RawGraphHoleCandidate[];
  /** Observation records carrying support-unit provenance + validity intervals. */
  readonly observations: readonly QualificationObservation[];
  /** Deterministic community membership nodeId → communityId (M-A13). Optional. */
  readonly communities?: ReadonlyMap<string, string>;
  /** Detectors that are considered enabled (for boundary checks); default all six. */
  readonly enabledDetectors?: readonly GraphHoleType[];
}