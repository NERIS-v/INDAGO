import { describe, it, expect } from 'vitest';
import { buildGraph, type GraphProjectionInput } from '../src/index.js';
import { findConnectingPaths, CONNECTING_PATH_BOUNDS } from '../src/path-candidates.js';

const ENT = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REL = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('P4 graph analytics — connecting path candidates', () => {
  function chainInput(): GraphProjectionInput {
    // 1 - 2 - 3 - 4 (a simple chain), plus an unrelated isolated node 5.
    return {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4, 5].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} },
        { id: REL(2), relationType: 'associate', source: ENT(2), target: ENT(3), provenance: {} },
        { id: REL(3), relationType: 'associate', source: ENT(3), target: ENT(4), provenance: {} },
      ],
    };
  }

  it('finds the shortest connecting path between two entities', () => {
    const { graph } = buildGraph(chainInput());
    const paths = findConnectingPaths(graph, ENT(1), ENT(4));
    expect(paths.length).toBeGreaterThan(0);
    const shortest = paths[0]!;
    expect(shortest.targetNodeId).toBe(ENT(4));
    expect(shortest.nodes[0]!.nodeId).toBe(ENT(1));
    expect(shortest.nodes[shortest.nodes.length - 1]!.nodeId).toBe(ENT(4));
    expect(shortest.hopCount).toBe(3);
  });

  it('returns an empty array when there is no path within the hop bound', () => {
    const { graph } = buildGraph(chainInput());
    const paths = findConnectingPaths(graph, ENT(1), ENT(5));
    expect(paths).toHaveLength(0);
  });

  it('returns an empty array for unknown nodes rather than throwing', () => {
    const { graph } = buildGraph(chainInput());
    expect(findConnectingPaths(graph, 'not-a-node', ENT(1))).toHaveLength(0);
    expect(findConnectingPaths(graph, ENT(1), 'not-a-node')).toHaveLength(0);
  });

  it('returns an empty array when source equals target', () => {
    const { graph } = buildGraph(chainInput());
    expect(findConnectingPaths(graph, ENT(1), ENT(1))).toHaveLength(0);
  });

  it('is deterministic across repeated calls', () => {
    const { graph } = buildGraph(chainInput());
    const a = findConnectingPaths(graph, ENT(1), ENT(4));
    const b = findConnectingPaths(graph, ENT(1), ENT(4));
    expect(a).toEqual(b);
  });

  it('never mutates the graph (read-only)', () => {
    const { graph } = buildGraph(chainInput());
    const before = { nodes: graph.order, edges: graph.size };
    findConnectingPaths(graph, ENT(1), ENT(4));
    expect({ nodes: graph.order, edges: graph.size }).toEqual(before);
  });

  it('exposes a positive maxResults bound', () => {
    expect(CONNECTING_PATH_BOUNDS.maxResults).toBeGreaterThan(0);
  });
});
