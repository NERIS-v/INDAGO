import { describe, expect, it } from 'vitest';
import { detectIsolatedNode } from '../src/detectors/isolated-node.js';
import { buildDetectionContext } from '../src/context.js';
import { mkNode, mkEdge, mkRelationHypothesis, mkRegion, obs, baseInput, uuid } from './helpers.js';

describe('ISOLATED_NODE detector', () => {
  it('emits hypothesis-referenced candidate for an isolated canonical node', () => {
    const N = uuid();
    const OTHER = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N, OTHER, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['ISOLATED_NODE'],
      }),
    );
    const run = detectIsolatedNode(ctx);
    expect(run.candidates).toHaveLength(1);
    const c = run.candidates[0]!;
    expect(c.nodeIds).toEqual([N]);
    expect(c.structuralBasis).toBe('HYPOTHESIS_REFERENCED_NODE');
    expect(c.supportingHypothesisIds).toEqual([`atomic:RELATION_HYPOTHESIS:${H1}`]);
  });

  it('emits seed-referenced candidate when the region resolved the node from a seed', () => {
    const N = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        region: mkRegion({
          nodeIds: [N],
          resolvedSeedNodeIds: [N],
          seedObservationIds: [O1],
        }),
        nodes: [mkNode(N)],
        edges: [],
        observations: [obs(O1, S1)],
        enabledDetectors: ['ISOLATED_NODE'],
      }),
    );
    const run = detectIsolatedNode(ctx);
    expect(run.candidates).toHaveLength(1);
    expect(run.candidates[0]!.structuralBasis).toBe('SEED_REFERENCED_NODE');
    expect(run.candidates[0]!.supportingObservationIds).toContain(O1);
  });

  it('does not emit for an isolated node with no hypothesis or seed context', () => {
    const N = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N)],
        edges: [],
        observations: [],
        enabledDetectors: ['ISOLATED_NODE'],
      }),
    );
    const run = detectIsolatedNode(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('does not emit when the node has an observed incident edge', () => {
    const N = uuid();
    const OTHER = uuid();
    const EDGE = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        region: mkRegion({ nodeIds: [N, OTHER], edgeIds: [EDGE] }),
        nodes: [mkNode(N), mkNode(OTHER)],
        edges: [mkEdge(EDGE, N, OTHER)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N, OTHER, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['ISOLATED_NODE'],
      }),
    );
    const run = detectIsolatedNode(ctx);
    expect(run.candidates).toHaveLength(0);
  });
});