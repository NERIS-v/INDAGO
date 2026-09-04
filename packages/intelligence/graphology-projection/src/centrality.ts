// ============================================================================
// M-A10 Graph Projection — centrality
//
// Deterministic degree centrality over the Graphology projection. The
// specified M-A10 centrality metric is degree centrality — the number of
// accepted-relation edges incident to each canonical entity — reported as a
// rank ordering (highest first) with a bounded result size.
//
// READ-ONLY: centrality never mutates the graph or any domain record (§40,
// §69). Output is purely derived from the in-memory projection.
// ============================================================================

import Graph from 'graphology';

export interface CentralityResult {
  /** Canonical EntityId. */
  readonly nodeId: string;
  /** Degree (incident accepted-relation edge count). */
  readonly degree: number;
  /** Normalized degree in [0,1] over the projection's max degree. */
  readonly centrality: number;
}

export const CENTRALITY_BOUNDS = {
  /** Hard cap on centrality results returned. */
  maxResults: 1_000,
} as const;

/**
 * Deterministic degree centrality over the projection's accepted relations.
 * Nodes are ordered by descending degree, then ascending node id (stable
 * tiebreak). Nodes with degree 0 are omitted (they carry no accepted-relation
 * signal and would otherwise dominate a large graph).
 */
export function degreeCentrality(
  graph: Graph,
  maxResults: number = CENTRALITY_BOUNDS.maxResults,
): CentralityResult[] {
  type Entry = { nodeId: string; degree: number; maxDegree: number };
  let maxDegree = 0;
  const entries: Entry[] = [];

  graph.forEachNode((nodeId) => {
    const degree = graph.edges(nodeId).length;
    if (degree === 0) return;
    entries.push({ nodeId, degree, maxDegree: 0 });
    if (degree > maxDegree) maxDegree = degree;
  });

  for (const e of entries) e.maxDegree = maxDegree;

  entries.sort((a, b) => {
    if (a.degree !== b.degree) return b.degree - a.degree;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });

  const bounded = entries.slice(0, maxResults);
  const result: CentralityResult[] = [];
  for (const e of bounded) {
    result.push({
      nodeId: e.nodeId,
      degree: e.degree,
      centrality: e.maxDegree > 0 ? e.degree / e.maxDegree : 0,
    });
  }
  return result;
}
