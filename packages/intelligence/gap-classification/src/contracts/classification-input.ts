// ============================================================================
// Gap Classification Input (Phase 5A-PR14)
//
// The caller assembles EXACTLY ONE case's qualified candidate + its already
// bounded context (region, PR3 hypothesis context, in-scope graph nodes/edges
// and observations) and hands it to the classifier. PR14 NEVER reaches beyond
// this data: no database-wide retrieval, no semantic search, no graph
// traversal, no tool calls, no LLP — the classification is a pure function
// over this package.
//
// Object shapes are the repository's authoritative types (never re-created):
//   - qualifiedCandidate: QualifiedGraphHoleCandidate (@indago/contracts, PR5)
//   - region: GraphHoleRegion (@indago/graph-hole-region, PR1)
//   - hypothesisContext: HypothesisContext (@indago/hypothesis-context, PR3)
//   - nodes/edges/observations: GraphNode/GraphEdge/Observation (@indago/contracts)
//
// `computedAt` is a CALLER-SUPPLIED timestamp (policy §4): the classifier
// contains NO clock, NO random ids, NO environment state. Identity/determinism
// guarantees hold for the same logical package regardless of caller.
// ============================================================================

import type {
  GraphEdge,
  GraphNode,
  Observation,
  ObservedTime,
  QualifiedGraphHoleCandidate,
  GapClassificationPolicyVersion,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { HypothesisContext } from '@indago/hypothesis-context';

/**
 * The authoritative, closed-world input to the gap classifier. All ids belong
 * to the same (caseId, graphVersionId); region/candidate agreement is enforced
 * by the classifier (authority boundary, policy §4/§6).
 */
export interface GapClassificationInput {
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
  /** Classification policy version consumed ('v1'); anything else -> UNSUPPORTED_POLICY. */
  readonly classificationPolicyVersion: GapClassificationPolicyVersion;
  /** Caller-supplied system time. NOT used as domain evidence (M-A12). */
  readonly computedAt: ObservedTime;
}