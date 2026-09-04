// ============================================================================
// M-A10 Graph Projection — community detection (Louvain)
//
// Uses graphology-communities-louvain (§39) over the undirected projection of
// ACCEPTED canonical relations. Output semantics: each canonical entity is
// assigned a community id; groups are reported deterministically.
//
// Determinism (§65): louvain is stochastic by default, so we inject a
// deterministic RNG to make the assignment stable across builds from the same
// records. Communities are returned grouped and ordered for stable output.
//
// READ-ONLY: community detection never mutates the graph or any domain record
// (§40, §69).
// ============================================================================

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

export interface CommunityResult {
  /** Community index. */
  readonly communityId: number;
  /** Canonical EntityIds in this community, sorted for determinism. */
  readonly memberNodeIds: readonly string[];
  readonly size: number;
}

export const COMMUNITY_BOUNDS = {
  /** Hard cap on member nodes reported per community group. */
  maxMembersPerCommunity: 5_000,
} as const;

/**
 * Deterministic pseudo-random number generator (LCG) injected into louvain so
 * identical projections converge to identical community assignments. PURE, no
 * clock, no entropy.
 */
function deterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // 31-bit LCG (constants chosen for deterministic, non-degenerate output).
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Build a homogeneous UNDIRECTED derivative of the (possibly mixed) structural
 * graph, for algorithms that require a non-mixed graph (graphology-communities
 * -louvain rejects a true mixed graph). Direction is collapsed: a directed edge
 * A→B becomes an undirected edge between A and B. The derivative is built fresh
 * each call (cheap, node-bounded) and NEVER mutates the input graph — the
 * structural graph keeps its directed/undirected edges unchanged.
 */
function toUndirectedHomogeneousView(graph: Graph): Graph {
  const view = new Graph({ type: 'undirected' });
  for (const id of graph.nodes()) view.addNode(id);
  const seen = new Set<string>();
  for (const node of graph.nodes()) {
    for (const neighbor of graph.neighbors(node)) {
      const pair = node < neighbor ? `${node}|${neighbor}` : `${neighbor}|${node}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      if (!view.hasEdge(node, neighbor)) {
        view.addEdge(node, neighbor);
      }
    }
  }
  return view;
}

/**
 * Assign an entity to a community via Louvain on the accepted-relation
 * projection. Returns deterministic, case-scoped community groups.
 */
export function detectCommunities(
  graph: Graph,
): CommunityResult[] {
  // Louvain operates on the undirected, homogeneous derivative (direction is a
  // structural property of the stored graph; community structure derives from
  // connectivity, not orientation). Handles mixed graphs without error.
  const assignments = louvain(toUndirectedHomogeneousView(graph), {
    rng: deterministicRng(1),
  });

  const groups = new Map<number, string[]>();
  for (const [nodeId, communityId] of Object.entries(assignments)) {
    let list = groups.get(communityId);
    if (list === undefined) {
      list = [];
      groups.set(communityId, list);
    }
    list.push(nodeId);
  }

  const result: CommunityResult[] = [];
  for (const [communityId, members] of groups) {
    members.sort();
    const bounded = members.slice(0, COMMUNITY_BOUNDS.maxMembersPerCommunity);
    result.push({
      communityId,
      memberNodeIds: bounded,
      size: bounded.length,
    });
  }
  result.sort((a, b) => a.communityId - b.communityId);
  return result;
}
