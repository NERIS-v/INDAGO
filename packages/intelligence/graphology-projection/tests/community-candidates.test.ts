import { describe, it, expect } from 'vitest';
import { buildGraph, type GraphProjectionInput } from '../src/index.js';
import { detectCommunityCandidates, COMMUNITY_CANDIDATE_BOUNDS } from '../src/community-candidates.js';

const ENT = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REL = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('P4 graph analytics — community candidates', () => {
  it('surfaces a dense clique as a high-cohesion candidate', () => {
    // Complete graph on {1,2,3,4}: cohesion = 1.0 (all 6 possible edges present).
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
      ].map(([a, b], i) => ({
        id: REL(i + 1),
        relationType: 'associate',
        source: ENT(a!),
        target: ENT(b!),
        provenance: {},
      })),
    };
    const { graph } = buildGraph(input);
    const candidates = detectCommunityCandidates(graph);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.size).toBe(4);
    expect(candidates[0]!.cohesion).toBe(1);
    expect(candidates[0]!.internalEdgeCount).toBe(6);
  });

  it('excludes communities below the minSize threshold', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [{ id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} }],
    };
    const { graph } = buildGraph(input);
    const candidates = detectCommunityCandidates(graph, { minSize: 3 });
    expect(candidates).toHaveLength(0);
  });

  it('excludes sparse communities below the minCohesion threshold', () => {
    // A 20-node star: Louvain keeps it as ONE community (no better modularity
    // split exists for a star), size 20, cohesion = 19 / C(20,2) = 19/190 =
    // 0.1, below the default 0.15 floor.
    const bigN = 20;
    const nodes = Array.from({ length: bigN }, (_, i) => ({
      id: ENT(i + 1),
      entityType: null,
      canonicalName: `N${i + 1}`,
    }));
    const edges = Array.from({ length: bigN - 1 }, (_, i) => ({
      id: REL(i + 1),
      relationType: 'associate',
      source: ENT(1),
      target: ENT(i + 2),
      provenance: {},
    }));
    const { graph } = buildGraph({ caseId: 'case-1', nodes, edges });
    const candidates = detectCommunityCandidates(graph);
    expect(candidates).toHaveLength(0);
  });

  it('is deterministic across repeated calls', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
      ].map(([a, b], i) => ({
        id: REL(i + 1),
        relationType: 'associate',
        source: ENT(a!),
        target: ENT(b!),
        provenance: {},
      })),
    };
    const { graph } = buildGraph(input);
    expect(detectCommunityCandidates(graph)).toEqual(detectCommunityCandidates(graph));
  });

  it('never mutates the graph (read-only)', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'associate', source: ENT(1), target: ENT(2), provenance: {} },
        { id: REL(2), relationType: 'associate', source: ENT(2), target: ENT(3), provenance: {} },
      ],
    };
    const { graph } = buildGraph(input);
    const before = { nodes: graph.order, edges: graph.size };
    detectCommunityCandidates(graph);
    expect({ nodes: graph.order, edges: graph.size }).toEqual(before);
  });

  it('exposes configurable, positive bounds', () => {
    expect(COMMUNITY_CANDIDATE_BOUNDS.minSize).toBeGreaterThan(0);
    expect(COMMUNITY_CANDIDATE_BOUNDS.minCohesion).toBeGreaterThan(0);
    expect(COMMUNITY_CANDIDATE_BOUNDS.maxResults).toBeGreaterThan(0);
  });
});
