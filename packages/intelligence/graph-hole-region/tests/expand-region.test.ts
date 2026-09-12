import { describe, it, expect } from 'vitest';
import { buildGraph } from '@indago/graphology-projection';
import type { GraphProjectionInput } from '@indago/graphology-projection';
import { intervalOverlapsContext, expandGraphSteps, incidentEdgesOf } from '../src/index.js';
import type { TemporalInterval } from '@indago/contracts';
import {
  starProjection,
  node,
  edge,
  CASE_A,
  NODE_CENTER,
  NODE_LEAF_A,
  NODE_LEAF_B,
  NODE_LEAF_C,
  EDGE_A,
  EDGE_B,
  EDGE_C,
} from './helpers/fixtures.js';

const window: TemporalInterval = {
  validFrom: { value: '2023-01-01T00:00:00.000Z', precision: 'exact' },
  validTo: { value: '2023-06-01T00:00:00.000Z', precision: 'exact' },
  precision: 'exact',
  semantics: 'observed',
};

describe('intervalOverlapsContext', () => {
  const ranges = {
    inWindow: { validFrom: { value: '2023-02-01T00:00:00.000Z' }, validTo: { value: '2023-03-01T00:00:00.000Z' } },
    before: { validFrom: { value: '2022-01-01T00:00:00.000Z' }, validTo: { value: '2022-06-01T00:00:00.000Z' } },
    after: { validFrom: { value: '2024-01-01T00:00:00.000Z' } },
  };

  it('retains everything when no context window is given', () => {
    for (const range of Object.values(ranges)) {
      expect(intervalOverlapsContext(range, null)).toBe(true);
    }
  });

  it('retains ranges that overlap the window', () => {
    expect(intervalOverlapsContext(ranges.inWindow, window)).toBe(true);
  });

  it('retains edges without a temporalRange (spanning)', () => {
    expect(intervalOverlapsContext(undefined, window)).toBe(true);
    expect(intervalOverlapsContext(null, window)).toBe(true);
  });

  it('excludes fully-before and fully-after ranges', () => {
    expect(intervalOverlapsContext(ranges.before, window)).toBe(false);
    expect(intervalOverlapsContext(ranges.after, window)).toBe(false);
  });
});

describe('expandGraphSteps', () => {
  it('expands one hop beyond the member set, sorted and deduplicated', () => {
    const built = buildGraph(starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B, NODE_LEAF_C]));
    const frontier = expandGraphSteps(built.graph, [NODE_CENTER], null);
    expect(frontier).toEqual([NODE_LEAF_A, NODE_LEAF_B, NODE_LEAF_C]);
  });

  it('does not expand a member through itself', () => {
    const built = buildGraph(starProjection(CASE_A, [NODE_LEAF_A]));
    const frontier = expandGraphSteps(built.graph, [NODE_LEAF_A], null);
    expect(frontier).toEqual([NODE_CENTER]);
  });

  it('skips out-of-window edges during frontier expansion', () => {
    const projection = starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B]);
    projection.edges = [
      edge(EDGE_A, NODE_CENTER, NODE_LEAF_A, 'communication'),
      { ...edge(EDGE_B, NODE_CENTER, NODE_LEAF_B, 'communication') },
    ];
    (projection.edges[0] as { temporalRange?: unknown }).temporalRange = {
      validFrom: { value: '2023-02-01T00:00:00.000Z' },
      validTo: { value: '2023-03-01T00:00:00.000Z' },
    };
    (projection.edges[1] as { temporalRange?: unknown }).temporalRange = {
      validFrom: { value: '2024-01-01T00:00:00.000Z' },
    };
    const built = buildGraph(projection);
    const frontier = expandGraphSteps(built.graph, [NODE_CENTER], window);
    expect(frontier).toEqual([NODE_LEAF_A]);
  });
});

describe('incidentEdgesOf', () => {
  it('collects every edge of the given nodes, sorted and deduplicated', () => {
    const built = buildGraph(
      starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B], [EDGE_A, EDGE_B]),
    );
    const edges = incidentEdgesOf(built.graph, [NODE_LEAF_B, NODE_LEAF_A, NODE_LEAF_A], null);
    expect(edges).toEqual([EDGE_A, EDGE_B]);
  });

  it('returns nothing for unknown node ids', () => {
    const built = buildGraph(starProjection(CASE_A, [NODE_LEAF_A]));
    expect(incidentEdgesOf(built.graph, ['missing-node'], null)).toEqual([]);
  });

  it('applies the temporal window to incident edges', () => {
    const projection: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [node(NODE_CENTER, 'Center'), node(NODE_LEAF_A, 'LeafA'), node(NODE_LEAF_B, 'LeafB')],
      edges: [
        {
          ...edge(EDGE_A, NODE_CENTER, NODE_LEAF_A),
          temporalRange: { validFrom: { value: '2023-02-01T00:00:00.000Z' } },
        },
        {
          ...edge(EDGE_B, NODE_CENTER, NODE_LEAF_B),
          temporalRange: { validFrom: { value: '2024-01-01T00:00:00.000Z' } },
        },
      ],
    };
    const built = buildGraph(projection);
    const edges = incidentEdgesOf(built.graph, [NODE_CENTER], window);
    expect(edges).toEqual([EDGE_A]);
  });
});