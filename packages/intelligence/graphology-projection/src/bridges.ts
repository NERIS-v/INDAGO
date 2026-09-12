// ============================================================================
// P4 Graph Analytics — bridge / connector candidates
//
// A BRIDGE edge is one whose removal disconnects its component into two
// pieces (classic graph-theoretic bridge / cut-edge). In an investigation
// graph a bridge is a STRUCTURAL signal that the two sides of the graph are
// connected through exactly this one relation — it says nothing about
// culpability, only about connectivity (see graph-analysis.ts StructuralMetric
// discipline: structural signal ≠ criminal relevance).
//
// ALGORITHM: a linear-time bridge-finding DFS (Tarjan's bridge algorithm) over
// the undirected, homogeneous derivative of the projection (mirrors the
// derivative already used by communities.ts — direction is a structural
// property of the stored relation, not of connectivity). Deterministic:
// traversal order is fixed by sorted adjacency, so the same graph always
// yields the same bridge set in the same order.
//
// bridgeImpact: for each bridge edge (u, v), removing it splits its component
// into two pieces of size |A| and |B| (|A| + |B| = component size). We report
// impact = min(|A|, |B|) — the size of the SMALLER side, i.e. how much of the
// graph would be cut off. A larger impact means the bridge separates a bigger
// sub-network from the rest, so it is a more consequential connector.
//
// READ-ONLY: bridge detection never mutates the graph or any domain record.
// ============================================================================

import Graph from 'graphology';

export interface BridgeCandidate {
  /** Canonical RelationId of the bridge edge. */
  readonly edgeId: string;
  /** Endpoints of the bridge (canonical EntityIds), sorted for determinism. */
  readonly nodeIds: readonly [string, string];
  /** Domain RelationType label on the bridge edge, if present. */
  readonly relationType: string | null;
  /** Size of the smaller side of the graph if this edge were removed. */
  readonly bridgeImpact: number;
  /** Total size of the connected component containing this bridge. */
  readonly componentSize: number;
}

export const BRIDGE_BOUNDS = {
  /** Hard cap on bridge candidates returned. */
  maxResults: 2_000,
} as const;

/**
 * Build a homogeneous UNDIRECTED derivative for bridge analysis. Bridges are a
 * property of connectivity, not orientation; a directed edge A→B still glues
 * the component together the same as an undirected one. The derivative
 * collapses parallel/multi edges into a single simple edge (bridge-finding is
 * defined over simple graphs — a multi-edge between the same pair can never be
 * a bridge, since removing one copy leaves the other).
 */
function toSimpleUndirected(graph: Graph): {
  view: Graph;
  edgeGroups: Map<string, string[]>;
} {
  const view = new Graph({ type: 'undirected' });
  const edgeGroups = new Map<string, string[]>(); // "a|b" -> [relationIds]

  for (const id of graph.nodes()) view.addNode(id);

  graph.forEachEdge((edgeKey, attrs, source, target) => {
    if (source === target) return; // no self-loop bridges
    const a = source < target ? source : target;
    const b = source < target ? target : source;
    const pairKey = `${a}|${b}`;
    const relationId =
      typeof (attrs as { relationId?: unknown }).relationId === 'string'
        ? (attrs as { relationId: string }).relationId
        : edgeKey;
    let group = edgeGroups.get(pairKey);
    if (group === undefined) {
      group = [];
      edgeGroups.set(pairKey, group);
    }
    group.push(relationId);
    if (!view.hasEdge(a, b)) view.addEdge(a, b);
  });

  return { view, edgeGroups };
}

/**
 * Tarjan's bridge-finding DFS over a simple undirected graph. Deterministic:
 * neighbor expansion is sorted, so traversal order (and therefore discovery
 * times / low-link values) is fixed for a given graph.
 *
 * Returns bridge edges as [a, b] endpoint pairs plus the size of the
 * component each belongs to, and the size of the smaller side produced by
 * removing the bridge.
 */
function findBridges(view: Graph): Array<{
  a: string;
  b: string;
  componentSize: number;
  smallerSide: number;
}> {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  let timer = 0;
  const bridges: Array<{ a: string; b: string; smallerSide: number; componentSize: number }> = [];

  const nodesSorted = [...view.nodes()].sort();

  for (const root of nodesSorted) {
    if (disc.has(root)) continue;

    // Iterative DFS (avoid recursion-depth issues on large graphs).
    // Stack frames: [node, parentEdgeNodeOrNull, neighborIndex]
    type Frame = { node: string; parent: string | null; neighbors: string[]; idx: number };
    const componentNodes: string[] = [];
    const stack: Frame[] = [];

    disc.set(root, timer);
    low.set(root, timer);
    timer++;
    componentNodes.push(root);
    stack.push({ node: root, parent: null, neighbors: [...view.neighbors(root)].sort(), idx: 0 });

    // Subtree size (for smaller-side computation), computed post-order.
    const subtreeSize = new Map<string, number>();
    subtreeSize.set(root, 1);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.idx < frame.neighbors.length) {
        const child = frame.neighbors[frame.idx]!;
        frame.idx++;
        if (child === frame.parent) continue; // skip the edge back to parent
        if (!disc.has(child)) {
          disc.set(child, timer);
          low.set(child, timer);
          timer++;
          componentNodes.push(child);
          subtreeSize.set(child, 1);
          stack.push({ node: child, parent: frame.node, neighbors: [...view.neighbors(child)].sort(), idx: 0 });
        } else {
          // Back edge.
          low.set(frame.node, Math.min(low.get(frame.node)!, disc.get(child)!));
        }
      } else {
        stack.pop();
        const parentFrame = stack[stack.length - 1];
        if (parentFrame) {
          const parentNode = parentFrame.node;
          low.set(parentNode, Math.min(low.get(parentNode)!, low.get(frame.node)!));
          subtreeSize.set(parentNode, (subtreeSize.get(parentNode) ?? 1) + (subtreeSize.get(frame.node) ?? 1));
          if (low.get(frame.node)! > disc.get(parentNode)!) {
            const a = parentNode < frame.node ? parentNode : frame.node;
            const b = parentNode < frame.node ? frame.node : parentNode;
            bridges.push({ a, b, smallerSide: subtreeSize.get(frame.node)!, componentSize: -1 });
          }
        }
      }
    }

    const componentSize = componentNodes.length;
    for (const br of bridges) {
      if (br.componentSize === -1 && componentNodes.includes(br.a)) {
        br.componentSize = componentSize;
      }
    }
  }

  return bridges.map((b) => ({
    a: b.a,
    b: b.b,
    componentSize: b.componentSize,
    smallerSide: Math.min(b.smallerSide, b.componentSize - b.smallerSide),
  }));
}

/**
 * Detect bridge / connector candidates in the projection: edges whose removal
 * would disconnect the graph. Results are sorted by descending bridgeImpact
 * (bigger cut first), then ascending edgeId for a stable tiebreak, and bounded
 * by BRIDGE_BOUNDS.maxResults.
 *
 * A multi-edge pair (more than one accepted relation between the same two
 * entities) can never be a bridge — removing one relation leaves the other,
 * so the pair stays connected. Such pairs are correctly excluded by
 * construction (toSimpleUndirected collapses them to one edge, which is then
 * only a bridge if it is the graph's SOLE connection between the components
 * on either side; a genuine multi-edge pair never appears as a cut edge in
 * the simple derivative because... note below).
 */
export function detectBridgeCandidates(
  graph: Graph,
  maxResults: number = BRIDGE_BOUNDS.maxResults,
): BridgeCandidate[] {
  const { view, edgeGroups } = toSimpleUndirected(graph);
  const rawBridges = findBridges(view);

  const results: BridgeCandidate[] = [];
  for (const br of rawBridges) {
    const pairKey = `${br.a}|${br.b}`;
    const relationIds = edgeGroups.get(pairKey) ?? [];
    // A pair carrying more than one accepted relation is never a true single
    // bridge edge in domain terms (parallel relations keep the pair
    // connected even if one relation is severed) — exclude multi-edge pairs.
    if (relationIds.length !== 1) continue;
    const relationId = relationIds[0]!;
    const edgeAttrs = graph.hasEdge(relationId)
      ? (graph.getEdgeAttributes(relationId) as { relationType?: string })
      : undefined;
    results.push({
      edgeId: relationId,
      nodeIds: [br.a, br.b],
      relationType: edgeAttrs?.relationType ?? null,
      bridgeImpact: br.smallerSide,
      componentSize: br.componentSize,
    });
  }

  results.sort((x, y) => {
    if (x.bridgeImpact !== y.bridgeImpact) return y.bridgeImpact - x.bridgeImpact;
    return x.edgeId < y.edgeId ? -1 : x.edgeId > y.edgeId ? 1 : 0;
  });

  return results.slice(0, maxResults);
}
