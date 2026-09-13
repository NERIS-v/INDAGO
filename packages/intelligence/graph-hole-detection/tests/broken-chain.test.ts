import { describe, expect, it } from 'vitest';
import { detectBrokenChain } from '../src/detectors/broken-chain.js';
import { buildDetectionContext } from '../src/context.js';
import { mkNode, mkEdge, mkRelationHypothesis, obs, baseInput, uuid } from './helpers.js';

describe('BROKEN_CHAIN detector', () => {
  it('emits continuation candidate when the observed chain tail has an expected pair', () => {
    const A = uuid();
    const B = uuid();
    const C = uuid();
    const D = uuid();
    const G = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        // D has onward structure through its in-region neighbor G, which would
        // form the mirror chain on D's side; only the LONGER chain (A-B-C)
        // may claim the broken link.
        nodes: [mkNode(A), mkNode(B), mkNode(C), mkNode(D), mkNode(G)],
        edges: [mkEdge(uuid(), A, B), mkEdge(uuid(), B, C), mkEdge(uuid(), D, G)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, C, D, {
            relationType: 'transport',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['BROKEN_CHAIN'],
      }),
    );
    const run = detectBrokenChain(ctx);
    expect(run.candidates).toHaveLength(1);
    const c = run.candidates[0]!;
    expect(c.structuralBasis).toBe('CHAIN_EXPECTED_CONTINUATION');
    expect([...c.nodeIds].sort()).toEqual([A, B, C, D].sort());
    expect(c.expectedRelationshipType).toBe('transport');
    expect(c.supportingHypothesisIds).toEqual([`atomic:RELATION_HYPOTHESIS:${H1}`]);
  });

  it('does not emit when the expected continuation node closes a cycle', () => {
    const A = uuid();
    const B = uuid();
    const C = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(A), mkNode(B), mkNode(C)],
        edges: [mkEdge(uuid(), A, B), mkEdge(uuid(), B, C)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          // C—A would close the cycle A-B-C back to A
          mkRelationHypothesis(H1, C, A, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['BROKEN_CHAIN'],
      }),
    );
    const run = detectBrokenChain(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('does not emit when the continuation target has no onward structure', () => {
    const A = uuid();
    const B = uuid();
    const C = uuid();
    const D = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(A), mkNode(B), mkNode(C), mkNode(D)],
        edges: [mkEdge(uuid(), A, B), mkEdge(uuid(), B, C)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, C, D, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['BROKEN_CHAIN'],
      }),
    );
    const run = detectBrokenChain(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('emits only the MAXIMAL chain per broken link, not shadowed shorter ones', () => {
    const A = uuid();
    const B = uuid();
    const C = uuid();
    const D = uuid();
    const F = uuid();
    const G = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(A), mkNode(B), mkNode(C), mkNode(D), mkNode(F), mkNode(G)],
        edges: [
          mkEdge(uuid(), A, B),
          mkEdge(uuid(), B, C),
          mkEdge(uuid(), C, D),
          mkEdge(uuid(), F, G),
        ],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, D, F, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['BROKEN_CHAIN'],
      }),
    );
    const run = detectBrokenChain(ctx);
    // Both sides of the D—F link have observed chains; only the LONGER one
    // (A-B-C-D) gets to claim it. Mirror chain G-F must not double-report.
    expect(run.candidates).toHaveLength(1);
    expect([...run.candidates[0]!.nodeIds].sort()).toEqual([A, B, C, D, F].sort());
  });
});