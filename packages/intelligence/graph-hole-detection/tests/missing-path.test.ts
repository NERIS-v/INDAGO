import { describe, expect, it } from 'vitest';
import { detectMissingPath } from '../src/detectors/missing-path.js';
import { buildDetectionContext } from '../src/context.js';
import { mkNode, mkEdge, mkRelationHypothesis, obs, baseInput, uuid } from './helpers.js';

function chainFixtures(opts: { edges: 'none' | 'bridge' | 'two-hop' }) {
  const A = uuid();
  const X = uuid();
  const B = uuid();
  const O1 = uuid();
  const O2 = uuid();
  const S1 = uuid();
  const S2 = uuid();
  const H1 = uuid();
  const H2 = uuid();
  const P = uuid();
  const edges =
    opts.edges === 'bridge'
      ? [mkEdge(uuid(), A, B)]
      : opts.edges === 'two-hop'
        ? [mkEdge(uuid(), A, P), mkEdge(uuid(), P, B)]
        : [];
  const extraNodes = opts.edges === 'two-hop' ? [mkNode(P)] : [];
  return {
    input: baseInput({
      nodes: [mkNode(A), mkNode(X), mkNode(B), ...extraNodes],
      edges,
      observations: [obs(O1, S1), obs(O2, S2)],
      relationHypotheses: [
        mkRelationHypothesis(H1, A, X, {
          relationType: 'meeting',
          evidenceBasis: [O1],
        }),
        mkRelationHypothesis(H2, X, B, {
          relationType: 'meeting',
          evidenceBasis: [O2],
        }),
      ],
      enabledDetectors: ['MISSING_PATH'],
    }),
    A,
    X,
    B,
  };
}

describe('MISSING_PATH detector', () => {
  it('emits candidate when hypothesis chain A—x—B has no observed path', () => {
    const { input, A, X, B } = chainFixtures({ edges: 'none' });
    const ctx = buildDetectionContext(input);
    const run = detectMissingPath(ctx);
    expect(run.candidates).toHaveLength(1);
    const c = run.candidates[0]!;
    expect([...c.nodeIds].sort()).toEqual([A, X, B].sort());
    expect(c.structuralBasis).toBe('EXPECTED_PATH_BROKEN');
    expect(c.expectedRelationshipType).toBeNull();
    expect(c.supportingHypothesisIds).toHaveLength(2);
  });

  it('skips when a direct edge already exists between the endpoints', () => {
    const { input } = chainFixtures({ edges: 'bridge' });
    const ctx = buildDetectionContext(input);
    const run = detectMissingPath(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips when an observed path connects the endpoints within the hop bound', () => {
    const { input } = chainFixtures({ edges: 'two-hop' });
    const ctx = buildDetectionContext(input);
    const run = detectMissingPath(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips transitive combos when both endpoints live in a single atomic', () => {
    const A = uuid();
    const X = uuid();
    const B = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(A), mkNode(X), mkNode(B)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, B, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['MISSING_PATH'],
      }),
    );
    const run = detectMissingPath(ctx);
    // H1 alone cannot form a chain A—x—B (needs two distinct atomics); the
    // pair A,B is directly asserted and belongs to MISSING_EDGE domain.
    expect(run.candidates).toHaveLength(0);
  });
});