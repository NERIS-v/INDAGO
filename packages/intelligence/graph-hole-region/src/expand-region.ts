// ============================================================================
// Graph expansion primitives (Phase 5A-PR1)
//
// Deterministic, READ-ONLY one-hop frontier expansion over a Graphology
// projection produced by @indago/graphology-projection's buildGraph (M-A13).
// The Graphology Graph is the authoritative projected graph runtime; this
// module only QUERIES it (adjacency), never mutates it and never reads any
// other graph store. No second graph authority is introduced.
//
// Determinism: members are processed in ascending id order; candidate sets are
// deduplicated and returned sorted.
//
// Temporal semantics (M-A12): when a temporalContext window is supplied, edges
// whose temporalRange does NOT overlap the window are excluded from expansion
// and from incident-edge collection. Edges without a temporalRange are treated
// as spanning the window (we never fabricate a range). Seed nodes themselves
// arrive from observation linkage and are retained regardless — expansion only
// travels THROUGH in-window edges.
// ============================================================================

import { Graph } from '@indago/graphology-projection';
import type { TemporalInterval } from '@indago/contracts';

interface TemporalIntervalLike {
  readonly validFrom?: { readonly value?: string };
  readonly validTo?: { readonly value?: string };
}

/**
 * True when a projected edge's temporalRange overlaps the analysis window.
 * A missing range is treated as open; a missing window retains everything.
 * Closed-interval overlap: NOT (aFrom > bTo) and NOT (bFrom > aTo), treating a
 * missing endpoint as unbounded. ISO-8601 UTC timestamps compare lexicographically.
 */
export function intervalOverlapsContext(
  edgeTemporalRange: unknown,
  context: TemporalInterval | null,
): boolean {
  if (context === null || context === undefined) return true;
  if (edgeTemporalRange === undefined || edgeTemporalRange === null) return true;
  const range = edgeTemporalRange as TemporalIntervalLike;
  const aFrom = range.validFrom?.value;
  if (aFrom === undefined) return true; // unparseable/untyped range → retain
  const bFrom = context.validFrom.value;
  const aTo = range.validTo?.value;
  const bTo = context.validTo?.value;
  if (bTo !== undefined && aFrom > bTo) return false;
  if (aTo !== undefined && bFrom > aTo) return false;
  return true;
}

/**
 * Candidate nodes one hop beyond the current member set: every non-member
 * endpoint of every temporal-valid edge incident to a member.
 * Returns ascending-unique ids.
 */
export function expandGraphSteps(
  graph: Graph,
  memberNodeIds: readonly string[],
  temporalContext: TemporalInterval | null,
): string[] {
  const member = new Set(memberNodeIds);
  const candidates = new Set<string>();
  for (const nodeId of [...member].sort()) {
    if (!graph.hasNode(nodeId)) continue;
    for (const edgeKey of graph.edges(nodeId)) {
      if (!intervalOverlapsContext(graph.getEdgeAttributes(edgeKey).temporalRange, temporalContext)) {
        continue;
      }
      const [source, target] = graph.extremities(edgeKey);
      if (!member.has(source) && !candidates.has(source)) candidates.add(source);
      if (!member.has(target) && !candidates.has(target)) candidates.add(target);
    }
  }
  return [...candidates].sort();
}

/**
 * Every temporal-valid edge incident to ANY of the given node ids, ascending
 * and deduplicated. Used to collect the edges introduced by newly added nodes.
 */
export function incidentEdgesOf(
  graph: Graph,
  nodeIds: readonly string[],
  temporalContext: TemporalInterval | null,
): string[] {
  const edges = new Set<string>();
  for (const nodeId of [...new Set(nodeIds)].sort()) {
    if (!graph.hasNode(nodeId)) continue;
    for (const edgeKey of graph.edges(nodeId)) {
      if (!intervalOverlapsContext(graph.getEdgeAttributes(edgeKey).temporalRange, temporalContext)) {
        continue;
      }
      edges.add(edgeKey);
    }
  }
  return [...edges].sort();
}