// ============================================================================
// M-A10 Graph Projection — traversal
//
// Bounded, cycle-safe N-hop traversal over the Graphology projection (§36,
// §37, §66). Enforces exact configured hop limits and hard caps on returned
// paths. Cycles terminate because each walk tracks its visited set and never
// re-visits a node.
//
// Path semantics preserved: node identifiers are canonical EntityIds, edge
// identifiers are canonical RelationIds, relation labels are the domain
// RelationType — Graphology's internal representation never changes these.
//
// READ-ONLY: traversal never mutates the graph or any domain record (§40).
// ============================================================================

import Graph from 'graphology';

export interface TraversalHopCert {
  /** Canonical entity id of the node at this hop. */
  nodeId: string;
  /** Canonical entity type of this node, if any. */
  entityType: string | null;
  /** Canonical name of this node. */
  canonicalName: string;
}

export interface TraversalStep {
  /** Domain RelationType label on the edge traversed to reach `nodeId`. */
  relationType: string;
  /** Canonical edge (Relation) id traversed. */
  edgeId: string;
  /** The node reached at this step. */
  nodeId: string;
  /** Directedness recorded on the edge (domain semantics). */
  directed: boolean;
}

/**
 * A single bounded path from the start node.
 * `nodes` includes the start node at index 0; `steps` are the hops to reach
 * each subsequent node (steps[i] arrives at nodes[i+1]).
 */
export interface TraversalPath {
  readonly startNodeId: string;
  readonly nodes: TraversalHopCert[];
  readonly steps: TraversalStep[];
  readonly hopCount: number;
}

export const TRAVERSAL_BOUNDS = {
  /** Minimum hops to expand. */
  minHops: 0,
  /** Maximum hops to expand (the configured N in N-hop). */
  maxHops: 4,
  /** Hard cap on distinct paths returned per traversal. */
  maxPaths: 1_000,
} as const;

export interface TraversalOptions {
  /** Number of hops to expand. Bounded to [minHops, maxHops]. */
  hops?: number;
  /** Optional cap on returned paths. Defaults to TRAVERSAL_BOUNDS.maxPaths. */
  maxPaths?: number;
}

type NodeAttributes = {
  entityType: string | null;
  canonicalName?: string;
};

/**
 * Deterministic bounded N-hop traversal.
 *
 * BFS from `startNodeId`; each walk tracks a visited set so cycles terminate.
 * Paths are emitted in lexicographic order of the node id reached at each
 * level for determinism.
 */
export function traverseBounded(
  graph: Graph,
  startNodeId: string,
  options: TraversalOptions = {},
): TraversalPath[] {
  if (!graph.hasNode(startNodeId)) return [];

  const hops = Math.max(
    TRAVERSAL_BOUNDS.minHops,
    Math.min(options.hops ?? TRAVERSAL_BOUNDS.maxHops, TRAVERSAL_BOUNDS.maxHops),
  );
  const maxPaths = options.maxPaths ?? TRAVERSAL_BOUNDS.maxPaths;

  const paths: TraversalPath[] = [];
  const startAttrs = graph.getNodeAttributes(startNodeId) as NodeAttributes;

  // Level order (number of hops from start), each entry is a concrete path.
  type Walk = {
    nodes: TraversalHopCert[];
    steps: TraversalStep[];
    visited: Set<string>;
  };

  const startCert: TraversalHopCert = {
    nodeId: startNodeId,
    entityType: startAttrs.entityType ?? null,
    canonicalName: startAttrs.canonicalName ?? '',
  };

  let frontier: Walk[] = [
    { nodes: [startCert], steps: [], visited: new Set([startNodeId]) },
  ];

  for (let level = 0; level <= hops; level++) {
    // Record every completed walk at this level as a path.
    const emitted: TraversalPath[] = [];
    for (const walk of frontier) {
      emitted.push({
        startNodeId,
        nodes: walk.nodes,
        steps: walk.steps,
        hopCount: walk.steps.length,
      });
    }
    emitted.sort((a, b) => {
      const aLast = a.nodes[a.nodes.length - 1]?.nodeId ?? '';
      const bLast = b.nodes[b.nodes.length - 1]?.nodeId ?? '';
      return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
    });
    for (const p of emitted) {
      if (paths.length >= maxPaths) return paths;
      paths.push(p);
    }

    if (level === hops) break;

    // Expand one more hop.
    const next: Walk[] = [];
    for (const walk of frontier) {
      const currentNode = walk.nodes[walk.nodes.length - 1]!.nodeId;
      const neighbors = graph.neighbors(currentNode).sort();
      for (const nb of neighbors) {
        if (walk.visited.has(nb)) continue; // cycle-safe
        const edgeKey = graph.edge(currentNode, nb);
        if (edgeKey === undefined) continue;
        const edgeAttrs = graph.getEdgeAttributes(edgeKey) as {
          relationType?: string;
          relationId?: string;
        };
        const directed = graph.isDirected(edgeKey);
        const attrs = graph.getNodeAttributes(nb) as NodeAttributes;
        const nbCert: TraversalHopCert = {
          nodeId: nb,
          entityType: attrs.entityType ?? null,
          canonicalName: attrs.canonicalName ?? '',
        };
        const nextVisited = new Set(walk.visited);
        nextVisited.add(nb);
        next.push({
          nodes: [...walk.nodes, nbCert],
          steps: [
            ...walk.steps,
            {
              relationType: edgeAttrs.relationType ?? '',
              edgeId: edgeAttrs.relationId ?? edgeKey,
              nodeId: nb,
              directed,
            },
          ],
          visited: nextVisited,
        });
      }
    }
    frontier = next;
  }

  return paths;
}
