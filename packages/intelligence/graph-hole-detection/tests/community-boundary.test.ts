import { describe, expect, it } from 'vitest';
import { detectCommunityBoundary } from '../src/detectors/community-boundary.js';
import { buildDetectionContext } from '../src/context.js';
import { mkNode, mkEdge, mkRelationHypothesis, obs, baseInput, uuid } from './helpers.js';

describe('COMMUNITY_BOUNDARY detector', () => {
  it('emits typed candidate for a hypothesis assertion spanning two communities', () => {
    const N1 = uuid();
    const N2 = uuid();
    const N3 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2), mkNode(N3)],
        // N3—N2 bridges the two communities; the asserted N1—N2 pair is not
        // itself materialized (that is the boundary hole).
        edges: [mkEdge(uuid(), N2, N3)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'financial',
            evidenceBasis: [O1],
          }),
        ],
        communities: new Map([
          [N1, 'community-a'],
          [N3, 'community-a'],
          [N2, 'community-b'],
        ]),
        enabledDetectors: ['COMMUNITY_BOUNDARY'],
      }),
    );
    const run = detectCommunityBoundary(ctx);
    expect(run.candidates).toHaveLength(1);
    const c = run.candidates[0]!;
    expect(c.structuralBasis).toBe('CROSS_COMMUNITY_HYPOTHESIS_CONTEXT');
    expect(c.expectedRelationshipType).toBe('financial');
    expect([...c.nodeIds].sort()).toEqual([N1, N2].sort());
  });

  it('gracefully skips when no communities are supplied', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        communities: null,
        enabledDetectors: ['COMMUNITY_BOUNDARY'],
      }),
    );
    const run = detectCommunityBoundary(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips when no observed edge crosses a community boundary', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        communities: new Map([
          [N1, 'community-a'],
          [N2, 'community-b'],
        ]),
        enabledDetectors: ['COMMUNITY_BOUNDARY'],
      }),
    );
    const run = detectCommunityBoundary(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips pairs within the same community or not in the community map', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [mkEdge(uuid(), N1, N2)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        communities: new Map([[N1, 'community-a']]), // N2 unassigned
        enabledDetectors: ['COMMUNITY_BOUNDARY'],
      }),
    );
    const run = detectCommunityBoundary(ctx);
    expect(run.candidates).toHaveLength(0);
  });
});