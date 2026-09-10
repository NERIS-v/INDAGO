import { describe, it, expect } from 'vitest';
import {
  buildGraph,
  traverseBounded,
  degreeCentrality,
  detectCommunities,
  GRAPH_PROJECTION_BOUNDS,
  TRAVERSAL_BOUNDS,
  COMMUNITY_BOUNDS,
  Graph,
  type GraphProjectionInput,
} from '../src/index.js';

// ============================================================================
// M-A10 Graph Projection (Graphology) — unit tests
//
// HARD RULES under test (§64-69):
//   § nodes = canonical entities; edges = ACCEPTED canonical relations only.
//   § proposed hypotheses are NOT canonical edges (projection input carries
//     only accepted relations).
//   § rebuild determinism — build twice from identical records ⇒ same graph.
//   § traversal is bounded (exact hop limits), cycle-safe.
//   § centrality is deterministic with defined ordering.
//   § communities are deterministic via seeded louvain.
//   § analytics are READ-ONLY — the graph is unchanged after traversal /
//     centrality / communities.
// ============================================================================

const ENT = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REL = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function makeInput(): GraphProjectionInput {
  return {
    caseId: 'case-1',
    nodes: [
      { id: ENT(1), entityType: 'PERSON', canonicalName: 'Alice' },
      { id: ENT(2), entityType: 'PERSON', canonicalName: 'Bob' },
      { id: ENT(3), entityType: 'ORGANIZATION', canonicalName: 'Acme' },
    ],
    edges: [
      {
        id: REL(1),
        relationType: 'communication',
        source: ENT(1),
        target: ENT(2),
        provenance: {},
      },
      {
        id: REL(2),
        relationType: 'organizational',
        source: ENT(2),
        target: ENT(3),
        provenance: {},
      },
    ],
  };
}

describe('M-A10 graph projection — buildGraph', () => {
  it('projects canonical entities as nodes and accepted relations as edges', () => {
    const { graph, nodeCount, edgeCount } = buildGraph(makeInput());
    expect(nodeCount).toBe(3);
    expect(edgeCount).toBe(2);
    expect(graph.hasNode(ENT(1))).toBe(true);
    expect(graph.hasNode(ENT(3))).toBe(true);
    expect(graph.hasEdge(ENT(1), ENT(2))).toBe(true);
  });

  it('is deterministic — identical records produce identical graph', () => {
    const input = makeInput();
    const a = buildGraph(input);
    const b = buildGraph(input);
    expect(a.nodeCount).toBe(b.nodeCount);
    expect(a.edgeCount).toBe(b.edgeCount);
    // Compare serialized node/edge attribute sets.
    const snapshotEdges = (g: Graph) => {
      const out: string[] = [];
      g.forEachEdge((edge, _attribs, source, target) => {
        out.push(`${edge}:${source}->${target}`);
      });
      return out.sort().join('|');
    };
    expect(snapshotEdges(a.graph)).toBe(snapshotEdges(b.graph));
  });

  it('skips edges referencing a non-projected node (no fabricated nodes)', () => {
    const input = makeInput();
    input.edges.push({
      id: REL(9),
      relationType: 'other',
      source: ENT(1),
      target: ENT(99), // not in nodes
      provenance: {},
    });
    const { graph, edgeCount } = buildGraph(input);
    expect(edgeCount).toBe(2); // edge 9 skipped
    expect(graph.hasNode(ENT(99))).toBe(false);
  });

  it('directionality is structural: directed types → directed edges, undirected → undirected', () => {
    // makeInput: REL(1) 'communication' (UNDIRECTED), REL(2) 'organizational' (DIRECTED).
    const { graph } = buildGraph(makeInput());
    // organizational is directed: its edge must be a Graphology directed edge.
    expect(graph.isDirected(REL(2))).toBe(true);
    expect(graph.isUndirected(REL(2))).toBe(false);
    // communication is undirected: its edge must be a Graphology undirected edge.
    expect(graph.isDirected(REL(1))).toBe(false);
    expect(graph.isUndirected(REL(1))).toBe(true);
  });

  it('directed A->B and B->A can both exist as distinct edges', () => {
    const input = makeInput();
    input.edges.push({
      id: REL(5),
      relationType: 'ownership', // directed
      source: ENT(3),
      target: ENT(1),
      provenance: {},
    });
    input.edges.push({
      id: REL(6),
      relationType: 'ownership', // directed, same endpoints reversed
      source: ENT(1),
      target: ENT(3),
      provenance: {},
    });
    const { graph, edgeCount } = buildGraph(input);
    expect(edgeCount).toBe(4);
    expect(graph.hasDirectedEdge(REL(5))).toBe(true);
    expect(graph.hasDirectedEdge(REL(6))).toBe(true);
    // Distinct keys prove both orientations coexisted.
    expect(graph.hasEdge(REL(5))).toBe(true);
    expect(graph.hasEdge(REL(6))).toBe(true);
  });
});

describe('M-A10 graph projection — traversal', () => {
  it('1-hop returns the start node plus its direct neighbors', () => {
    const { graph } = buildGraph(makeInput());
    const paths = traverseBounded(graph, ENT(1), { hops: 1 });
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const direct = paths.find((p) => p.hopCount === 1);
    expect(direct).toBeDefined();
    expect(direct!.steps[0]!.relationType).toBe('communication');
    expect(direct!.steps[0]!.nodeId).toBe(ENT(2));
  });

  it('expands to exact hop limit and no further', () => {
    const { graph } = buildGraph(makeInput());
    const paths2 = traverseBounded(graph, ENT(1), { hops: 2 });
    const maxHop = Math.max(...paths2.map((p) => p.hopCount));
    expect(maxHop).toBe(2);
  });

  it('terminates on cycles (no infinite traversal)', () => {
    const input = makeInput();
    // Form a cycle: 1-2, 2-3, 3-1 accepted relations.
    input.edges = [
      { id: REL(1), relationType: 'other', source: ENT(1), target: ENT(2), provenance: {} },
      { id: REL(2), relationType: 'other', source: ENT(2), target: ENT(3), provenance: {} },
      { id: REL(3), relationType: 'other', source: ENT(3), target: ENT(1), provenance: {} },
    ];
    const { graph } = buildGraph(input);
    const paths = traverseBounded(graph, ENT(1), { hops: 4 });
    // Completes without hanging; every path is cycle-free by construction.
    for (const p of paths) {
      const ids = p.nodes.map((n) => n.nodeId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('M-A10 graph projection — centrality', () => {
  it('orders by descending degree with a deterministic tiebreak', () => {
    const { graph } = buildGraph(makeInput());
    const results = degreeCentrality(graph);
    // Bob (ENT 2) has degree 2 (edges to 1 and 3) — highest.
    expect(results[0]!.nodeId).toBe(ENT(2));
    expect(results[0]!.degree).toBe(2);
    expect(results[0]!.centrality).toBe(1); // normalized to max degree
    // Alice and Acme each have degree 1.
    const degree1 = results.filter((r) => r.degree === 1);
    expect(degree1).toHaveLength(2);
  });
});

describe('M-A10 graph projection — communities', () => {
  it('assigns every node to a community and never mutates the graph', () => {
    const { graph } = buildGraph(makeInput());
    const orderBefore = graph.order;
    const communities = detectCommunities(graph);
    // All 3 nodes are covered by the union of memberships.
    const members = new Set<string>();
    for (const c of communities) for (const id of c.memberNodeIds) members.add(id);
    expect(members.has(ENT(1))).toBe(true);
    expect(members.has(ENT(2))).toBe(true);
    expect(members.has(ENT(3))).toBe(true);
    // Read-only: graph structure unchanged.
    expect(graph.order).toBe(orderBefore);
  });
});

describe('M-A10 graph projection — analytics read-only', () => {
  it('buildGraph/traversal/centrality/communities leave the graph unchanged', () => {
    const { graph } = buildGraph(makeInput());
    const edgeSnapshotBefore = new Set<string>();
    graph.forEachEdge((e) => void edgeSnapshotBefore.add(e));
    traverseBounded(graph, ENT(1), { hops: 2 });
    degreeCentrality(graph);
    detectCommunities(graph);
    const edgeSnapshotAfter = new Set<string>();
    graph.forEachEdge((e) => void edgeSnapshotAfter.add(e));
    expect(edgeSnapshotAfter.size).toBe(edgeSnapshotBefore.size);
    for (const e of edgeSnapshotBefore) expect(edgeSnapshotAfter.has(e)).toBe(true);
  });
});

describe('M-A13 — buildGraph truncation metadata', () => {
  it('reports accurate source counts and truncated flags when bounds are exceeded', () => {
    // Over-maxNodes input: GRAPH_PROJECTION_BOUNDS.maxNodes + 10 nodes.
    const N = GRAPH_PROJECTION_BOUNDS.maxNodes + 10;
    const input: GraphProjectionInput = {
      caseId: 'trunc-case',
      nodes: Array.from({ length: N }, (_, i) => ({
        id: ENT(i + 1),
        entityType: 'PERSON',
        canonicalName: `node-${i}`,
      })),
      edges: [],
    };
    const built = buildGraph(input);
    expect(built.sourceNodeCount).toBe(N);
    expect(built.nodeCount).toBe(GRAPH_PROJECTION_BOUNDS.maxNodes);
    expect(built.truncated.nodes).toBe(true);
    expect(built.truncated.edges).toBe(false);
  });

  it('reports accurate edge truncation independently of node truncation', () => {
    // 3 nodes, but E > maxEdges edges — some duplicated to avoid self-loops.
    // create 3 nodes, maxEdges+5 edges using multi-edges (different IDs, same endpoints).
    const E = GRAPH_PROJECTION_BOUNDS.maxEdges + 5;
    const input: GraphProjectionInput = {
      caseId: 'edge-trunc-case',
      nodes: [
        { id: ENT(1), entityType: 'PERSON', canonicalName: 'A' },
        { id: ENT(2), entityType: 'PERSON', canonicalName: 'B' },
      ],
      edges: Array.from({ length: E }, (_, i) => ({
        id: REL(i + 1),
        relationType: 'communication',
        source: ENT(1),
        target: ENT(2),
        provenance: {},
      })),
    };
    const built = buildGraph(input);
    expect(built.sourceNodeCount).toBe(2);
    expect(built.sourceEdgeCount).toBe(E);
    expect(built.nodeCount).toBe(2);
    expect(built.edgeCount).toBe(GRAPH_PROJECTION_BOUNDS.maxEdges);
    expect(built.truncated.nodes).toBe(false);
    expect(built.truncated.edges).toBe(true);
  });

  it('untruncated input yields source === returned counts and truncated = false', () => {
    const built = buildGraph(makeInput());
    expect(built.sourceNodeCount).toBe(built.nodeCount);
    expect(built.sourceEdgeCount).toBe(built.edgeCount);
    expect(built.truncated.nodes).toBe(false);
    expect(built.truncated.edges).toBe(false);
  });
});

describe('M-A13 — communities actual size and truncation', () => {
  it('reports the true community size even when the member list is bounded', () => {
    // Build a graph with > COMMUNITY_BOUNDS.maxMembersPerCommunity nodes in a
    // single community. A dense core (small clique) with periphery nodes each
    // connected to every core node forces Louvain to keep the whole component
    // as one community: all periphery edges go to the core, so there is no
    // modularity gain from splitting.
    const CORE_SIZE = 10;
    const PERIPHERY_SIZE = COMMUNITY_BOUNDS.maxMembersPerCommunity + 100 - CORE_SIZE; // 5090
    const TOTAL = CORE_SIZE + PERIPHERY_SIZE; // 5100

    const nodes: GraphProjectionInput['nodes'] = [];
    for (let i = 0; i < TOTAL; i++) {
      nodes.push({ id: ENT(i), entityType: 'PERSON', canonicalName: `n${i}` });
    }
    const edges: GraphProjectionInput['edges'] = [];
    let relIdx = 0;
    // Core clique (CORE_SIZE nodes, fully connected)
    for (let i = 0; i < CORE_SIZE; i++) {
      for (let j = i + 1; j < CORE_SIZE; j++) {
        edges.push({
          id: REL(relIdx++),
          relationType: 'communication',
          source: ENT(i),
          target: ENT(j),
          provenance: {},
        });
      }
    }
    // Periphery: each periphery node connects to EVERY core node.
    for (let p = CORE_SIZE; p < TOTAL; p++) {
      for (let c = 0; c < CORE_SIZE; c++) {
        edges.push({
          id: REL(relIdx++),
          relationType: 'communication',
          source: ENT(p),
          target: ENT(c),
          provenance: {},
        });
      }
    }

    const { graph } = buildGraph({ caseId: 'comm-trunc', nodes, edges });
    const communities = detectCommunities(graph);

    // Find the community containing ENT(0) (a core node) — it should contain
    // the full graph.
    const bigCommunity = communities.find((c) => c.memberNodeIds.includes(ENT(0)));
    expect(bigCommunity).toBeDefined();
    expect(bigCommunity!.size).toBe(TOTAL);
    expect(bigCommunity!.memberNodeIds.length).toBe(COMMUNITY_BOUNDS.maxMembersPerCommunity);
    expect(bigCommunity!.truncated).toBe(true);
  });

  it('small communities report size === memberNodeIds.length with truncated = false', () => {
    const { graph } = buildGraph(makeInput()); // 3 nodes, 2 edges
    const communities = detectCommunities(graph);
    for (const c of communities) {
      expect(c.size).toBe(c.memberNodeIds.length);
      expect(c.truncated).toBe(false);
    }
  });
});

describe('M-A13 — traversal work cap (pathological dense graph)', () => {
  it('completes within a reasonable time on a dense graph without exploding', () => {
    // A 30-node clique: 30×29/2 = 435 edges. 4-hop BFS from node 0 would
    // produce exponentially many walks — but the work cap (maxExpandedWalksPerLevel)
    // bounds transient frontier state and the output (maxPaths) limits paths.
    const N = 30;
    const nodes: GraphProjectionInput['nodes'] = [];
    for (let i = 0; i < N; i++) {
      nodes.push({ id: ENT(i), entityType: 'PERSON', canonicalName: `n${i}` });
    }
    const edges: GraphProjectionInput['edges'] = [];
    let relIdx = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        edges.push({
          id: REL(relIdx++),
          relationType: 'communication',
          source: ENT(i),
          target: ENT(j),
          provenance: {},
        });
      }
    }
    const { graph } = buildGraph({ caseId: 'dense-case', nodes, edges });

    const start = Date.now();
    const paths = traverseBounded(graph, ENT(0), {
      hops: TRAVERSAL_BOUNDS.maxHops,
      maxPaths: TRAVERSAL_BOUNDS.maxPaths,
    });
    const elapsedMs = Date.now() - start;

    // Must complete and return at most maxPaths paths.
    expect(paths.length).toBeLessThanOrEqual(TRAVERSAL_BOUNDS.maxPaths);
    // Must complete in well under 5 seconds — the work cap prevents explosion.
    expect(elapsedMs).toBeLessThan(5_000);
  });
});
