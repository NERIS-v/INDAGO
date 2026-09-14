// ============================================================================
// Graph-Hole Analysis Input (Phase 5A-PR7)
//
// The caller assembles EXACTLY ONE case's qualified candidate + its already
// bounded context (region, PR3 hypothesis context, in-scope graph nodes/edges
// and observations) and hands it to the analyst. PR7 NEVER reaches beyond this
// data: no database-wide retrieval, no semantic search, no graph traversal,
// no tool calls — the model reasons only over the package built from this
// input.
//
// Object shapes are the repository's authoritative types (never re-created):
//   - qualifiedCandidate: QualifiedGraphHoleCandidate (@indago/contracts, PR5)
//   - region: GraphHoleRegion (@indago/graph-hole-region, PR1)
//   - hypothesisContext: HypothesisContext (@indago/hypothesis-context, PR3)
//   - nodes/edges/observations: GraphNode/GraphEdge/Observation (@indago/contracts)
// ============================================================================

import type {
  GraphEdge,
  GraphNode,
  Observation,
  QualifiedGraphHoleCandidate,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { HypothesisContext } from '@indago/hypothesis-context';

import type { GraphHoleAnalysisBounds } from './analysis-policy.js';

/** Deterministic communities (nodeId → communityId) from M-A13 projection. Optional structural signal. */
export type CommunityMembershipInput = ReadonlyMap<string, string>;

/**
 * The authoritative, closed-world input to the GraphHole analyst. All ids
 * belong to the same (caseId, graphVersionId); region/candidate agreement is
 * enforced by the context builder (authority boundary).
 */
export interface GraphHoleAnalysisInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  /** The already-qualified candidate (PR5 output). MUST have qualified === true. */
  readonly qualifiedCandidate: QualifiedGraphHoleCandidate;
  /** The bounded analysis region that produced the candidate (PR1 output). */
  readonly region: GraphHoleRegion;
  /** In-scope canonical graph nodes (region nodes; authority for node references). */
  readonly nodes: readonly GraphNode[];
  /** In-scope canonical graph edges (region edges; authority for edge references). */
  readonly edges: readonly GraphEdge[];
  /** In-scope observations carrying provenance + temporal validity (bounded by region context). */
  readonly observations: readonly Observation[];
  /** Prebuilt PR3 grouped hypothesis context (must cover every supportingHypothesisId on the candidate). */
  readonly hypothesisContext: HypothesisContext;
  /** Deterministic community membership nodeId → communityId (M-A13). Optional. */
  readonly communities?: CommunityMembershipInput;
  /** Optional caller-specified bounds (may only NARROW the frozen defaults). */
  readonly bounds?: Partial<GraphHoleAnalysisBounds>;
}