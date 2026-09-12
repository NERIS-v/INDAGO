import { describe, it, expect } from 'vitest';
import { buildGraph, type GraphProjectionInput } from '../src/index.js';
import { detectBridgeCandidates, BRIDGE_BOUNDS } from '../src/bridges.js';

const ENT = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REL = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('P4 graph analytics — bridge candidates', () => {
  it('detects the sole edge connecting two triangles as a bridge', () => {
    // Triangle A: 1-2-3 (all connected). Triangle B: 4-5-6. Bridge: 3-4.
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4, 5, 6].map((n) => ({
        id: ENT(n),
        entityType: 'PERSON',
        canonicalName: `N${n}`,
      })),
      edges: [
        { id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} },
        { id: REL(2), relationType: 'associate', source: ENT(2), target: ENT(3), provenance: {} },
        { id: REL(3), relationType: 'associate', source: ENT(3), target: ENT(1), provenance: {} },
        { id: REL(4), relationType: 'associate', source: ENT(3), target: ENT(4), provenance: {} }, // bridge
        { id: REL(5), relationType: 'associate', source: ENT(4), target: ENT(5), provenance: {} },
        { id: REL(6), relationType: 'associate', source: ENT(5), target: ENT(6), provenance: {} },
        { id: REL(7), relationType: 'associate', source: ENT(6), target: ENT(4), provenance: {} },
      ],
    };

    const { graph } = buildGraph(input);
    const bridges = detectBridgeCandidates(graph);

    expect(bridges).toHaveLength(1);
    expect(bridges[0]!.edgeId).toBe(REL(4));
    expect(bridges[0]!.nodeIds).toEqual([ENT(3), ENT(4)]);
    expect(bridges[0]!.componentSize).toBe(6);
    expect(bridges[0]!.bridgeImpact).toBe(3); // both sides are size 3
  });

  it('reports no bridges in a fully cyclic graph', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} },
        { id: REL(2), relationType: 'associate', source: ENT(2), target: ENT(3), provenance: {} },
        { id: REL(3), relationType: 'associate', source: ENT(3), target: ENT(4), provenance: {} },
        { id: REL(4), relationType: 'associate', source: ENT(4), target: ENT(1), provenance: {} },
      ],
    };
    const { graph } = buildGraph(input);
    expect(detectBridgeCandidates(graph)).toHaveLength(0);
  });

  it('excludes a pair carrying more than one accepted relation (never a true bridge)', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'communication', source: ENT(1), target: ENT(2), provenance: {} },
        { id: REL(2), relationType: 'financial', source: ENT(1), target: ENT(2), provenance: {} },
      ],
    };
    const { graph } = buildGraph(input);
    expect(detectBridgeCandidates(graph)).toHaveLength(0);
  });

  it('is deterministic across repeated calls on the same graph', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4, 5].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} },
        { id: REL(2), relationType: 'associate', source: ENT(2), target: ENT(3), provenance: {} },
        { id: REL(3), relationType: 'associate', source: ENT(3), target: ENT(4), provenance: {} },
        { id: REL(4), relationType: 'associate', source: ENT(4), target: ENT(5), provenance: {} },
      ],
    };
    const { graph } = buildGraph(input);
    const a = detectBridgeCandidates(graph);
    const b = detectBridgeCandidates(graph);
    expect(a).toEqual(b);
  });

  it('never mutates the graph (read-only)', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [{ id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} }],
    };
    const { graph } = buildGraph(input);
    const before = { nodes: graph.order, edges: graph.size };
    detectBridgeCandidates(graph);
    expect({ nodes: graph.order, edges: graph.size }).toEqual(before);
  });

  it('respects the maxResults bound', () => {
    // Build a path graph 1-2-3-4-5-6-7 (every edge is a bridge).
    const n = 7;
    const nodes = Array.from({ length: n }, (_, i) => ({
      id: ENT(i + 1),
      entityType: null,
      canonicalName: `N${i + 1}`,
    }));
    const edges = Array.from({ length: n - 1 }, (_, i) => ({
      id: REL(i + 1),
      relationType: 'associate',
      source: ENT(i + 1),
      target: ENT(i + 2),
      provenance: {},
    }));
    const { graph } = buildGraph({ caseId: 'case-1', nodes, edges });
    const bounded = detectBridgeCandidates(graph, 2);
    expect(bounded.length).toBeLessThanOrEqual(2);
    expect(BRIDGE_BOUNDS.maxResults).toBeGreaterThan(0);
  });
});
