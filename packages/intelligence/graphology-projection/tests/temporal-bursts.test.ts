import { describe, it, expect } from 'vitest';
import { buildGraph, type GraphProjectionInput } from '../src/index.js';
import { detectTemporalBursts, BURST_BOUNDS } from '../src/temporal-bursts.js';

const ENT = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REL = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function evt(iso: string, precision = 'exact') {
  return { validFrom: { value: iso, precision }, precision, semantics: 'observed' as const };
}

describe('P4 graph analytics — temporal burst detection', () => {
  it('flags a node with a dense same-day cluster of edges as a burst', () => {
    // Entity 1 (hub) has 4 edges on 2024-03-10 and 1 edge each on 3 other
    // scattered days -> baseline is low, the 2024-03-10 bucket is a burst.
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'communication', source: ENT(1), target: ENT(2), provenance: {}, temporalRange: evt('2024-03-10T09:00:00.000Z') },
        { id: REL(2), relationType: 'communication', source: ENT(1), target: ENT(3), provenance: {}, temporalRange: evt('2024-03-10T10:00:00.000Z') },
        { id: REL(3), relationType: 'communication', source: ENT(1), target: ENT(4), provenance: {}, temporalRange: evt('2024-03-10T11:00:00.000Z') },
        { id: REL(4), relationType: 'communication', source: ENT(1), target: ENT(5), provenance: {}, temporalRange: evt('2024-03-10T12:00:00.000Z') },
        { id: REL(5), relationType: 'communication', source: ENT(1), target: ENT(6), provenance: {}, temporalRange: evt('2024-01-01T00:00:00.000Z') },
        { id: REL(6), relationType: 'communication', source: ENT(1), target: ENT(7), provenance: {}, temporalRange: evt('2024-02-01T00:00:00.000Z') },
      ],
    };
    const { graph } = buildGraph(input);
    const bursts = detectTemporalBursts(graph);

    const hubBurst = bursts.find((b) => b.nodeId === ENT(1) && b.windowStart.startsWith('2024-03-10'));
    expect(hubBurst).toBeDefined();
    expect(hubBurst!.eventCount).toBe(4);
    expect(hubBurst!.edgeIds).toEqual([REL(1), REL(2), REL(3), REL(4)]);
    expect(hubBurst!.burstScore).toBeGreaterThan(1);
  });

  it('does not flag a node with steady, evenly-spread activity', () => {
    // One edge per day, every day for 5 days -> no bucket exceeds baseline.
    const days = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4, 5, 6].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: days.map((day, i) => ({
        id: REL(i + 1),
        relationType: 'communication',
        source: ENT(1),
        target: ENT(i + 2),
        provenance: {},
        temporalRange: evt(`${day}T00:00:00.000Z`),
      })),
    };
    const { graph } = buildGraph(input);
    const bursts = detectTemporalBursts(graph);
    expect(bursts.filter((b) => b.nodeId === ENT(1))).toHaveLength(0);
  });

  it('excludes edges with unparseable or non-instantable temporal precision', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [
        { id: REL(1), relationType: 'communication', source: ENT(1), target: ENT(2), provenance: {}, temporalRange: evt('sometime last year', 'approximate') },
        { id: REL(2), relationType: 'communication', source: ENT(1), target: ENT(3), provenance: {}, temporalRange: evt('unknown', 'unknown') },
        { id: REL(3), relationType: 'communication', source: ENT(1), target: ENT(4), provenance: {} }, // no temporalRange at all
      ],
    };
    const { graph } = buildGraph(input);
    expect(detectTemporalBursts(graph)).toHaveLength(0);
  });

  it('is deterministic across repeated calls', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2, 3, 4, 5].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [1, 2, 3, 4].map((i) => ({
        id: REL(i),
        relationType: 'communication',
        source: ENT(1),
        target: ENT(i + 1),
        provenance: {},
        temporalRange: evt('2024-03-10T00:00:00.000Z'),
      })),
    };
    const { graph } = buildGraph(input);
    expect(detectTemporalBursts(graph)).toEqual(detectTemporalBursts(graph));
  });

  it('never mutates the graph (read-only)', () => {
    const input: GraphProjectionInput = {
      caseId: 'case-1',
      nodes: [1, 2].map((n) => ({ id: ENT(n), entityType: null, canonicalName: `N${n}` })),
      edges: [{ id: REL(1), relationType: 'communication', source: ENT(1), target: ENT(2), provenance: {}, temporalRange: evt('2024-03-10T00:00:00.000Z') }],
    };
    const { graph } = buildGraph(input);
    const before = { nodes: graph.order, edges: graph.size };
    detectTemporalBursts(graph);
    expect({ nodes: graph.order, edges: graph.size }).toEqual(before);
  });

  it('respects configurable bounds', () => {
    expect(BURST_BOUNDS.minEventsForBurst).toBeGreaterThan(0);
    expect(BURST_BOUNDS.maxResults).toBeGreaterThan(0);
  });
});
 