import { describe, expect, it } from 'vitest';
import { detectMissingEdge } from '../src/detectors/missing-edge.js';
import { buildDetectionContext } from '../src/context.js';
import { DETECTOR_BOUNDS } from '../src/bounds.js';
import {
  CASE_ID,
  VERSION_ID,
  mkNode,
  mkEdge,
  mkRelationHypothesis,
  mkEntityHypothesis,
  mkRegion,
  obs,
  obsSources,
  baseInput,
  uuid,
} from './helpers.js';

function detectHypothesisAssertedMissingEdge() {
  const N1 = uuid();
  const N2 = uuid();
  const O1 = uuid();
  const O2 = uuid();
  const S1 = uuid();
  const S2 = uuid();
  const H1 = uuid();
  const ctx = buildDetectionContext(
    baseInput({
      nodes: [mkNode(N1), mkNode(N2)],
      edges: [],
      observations: [obs(O1, S1), obs(O2, S2)],
      relationHypotheses: [
        mkRelationHypothesis(H1, N1, N2, {
          relationType: 'communication',
          evidenceBasis: [O1, O2],
          support: 0.9,
          strength: 0.7,
        }),
      ],
      enabledDetectors: ['MISSING_EDGE'],
    }),
  );
  const run = detectMissingEdge(ctx);
  const candidates = run.candidates.map((c) => ({
    nodeIds: c.nodeIds,
    expectedRelationshipType: c.expectedRelationshipType,
    structuralBasis: c.structuralBasis,
    supportingHypothesisIds: c.supportingHypothesisIds,
    supportingObservationIds: c.supportingObservationIds,
  }));
  return { run, candidates };
}

describe('MISSING_EDGE detector', () => {
  it('emits hypothesis-asserted typed candidate when edge is absent', () => {
    const { run, candidates } = detectHypothesisAssertedMissingEdge();
    expect(run.boundReached).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      expectedRelationshipType: 'communication',
      structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
    });
    expect(candidates[0]!.nodeIds).toHaveLength(2);
    expect(candidates[0]!.supportingHypothesisIds).toHaveLength(1);
    expect(candidates[0]!.supportingObservationIds).toHaveLength(2);
  });

  it('does not emit when a canonical edge already exists', () => {
    const N1 = uuid();
    const N2 = uuid();
    const E1 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [mkEdge(E1, N1, N2)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    const run = detectMissingEdge(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips hypothesis pairs with a node outside the region scope', () => {
    const N1 = uuid();
    const N_OUT = uuid(); // referenced but NOT in region nodeIds
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N_OUT, {
            relationType: 'financial',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    const run = detectMissingEdge(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips atomic with an empty supporting observation list', () => {
    const N1 = uuid();
    const N2 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [],
        observations: [],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [],
          }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    const run = detectMissingEdge(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('does not emit in group-bridge mode when no shared observations', () => {
    const N1 = uuid();
    const N2 = uuid();
    const N3 = uuid();
    const O1 = uuid();
    const O2 = uuid();
    const S1 = uuid();
    const S2 = uuid();
    const H1 = uuid();
    const H2 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2), mkNode(N3)],
        edges: [mkEdge(uuid(), N1, N3), mkEdge(uuid(), N2, N3)],
        observations: [obs(O1, S1), obs(O2, S2)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N3, { evidenceBasis: [O1] }),
          mkRelationHypothesis(H2, N2, N3, { evidenceBasis: [O2] }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    // H1 supports N1-N3, H2 supports N2-N3; no shared observations between
    // the two atoms' groups, so group-bridge between N1,N2 has no shared obs.
    const run = detectMissingEdge(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('emits group-bridge candidate with shared observations and no direct assertion', () => {
    const N1 = uuid();
    const N2 = uuid();
    const N3 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const H2 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2), mkNode(N3)],
        edges: [mkEdge(uuid(), N1, N3), mkEdge(uuid(), N2, N3)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N3, { evidenceBasis: [O1] }),
          mkRelationHypothesis(H2, N2, N3, { evidenceBasis: [O1] }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    const run = detectMissingEdge(ctx);
    // Expect one group-bridge MISSING_EDGE for (N1,N2)
    const bridgeCandidate = run.candidates.find(
      (c) =>
        c.structuralBasis === 'OBSERVED_NEIGHBOR_CONTEXT' &&
        c.nodeIds.sort().join(',') === [N1, N2].sort().join(','),
    );
    expect(bridgeCandidate).toBeDefined();
    expect(bridgeCandidate!.expectedRelationshipType).toBeNull();
    expect(bridgeCandidate!.supportingObservationIds).toContain(O1);
  });

  it('skips group-bridge for pairs directly asserted by any atomic', () => {
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
          mkRelationHypothesis(H1, N1, N2, { evidenceBasis: [O1] }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    const run = detectMissingEdge(ctx);
    expect(run.candidates).toHaveLength(1);
    expect(run.candidates[0]!.structuralBasis).toBe('SHARED_HYPOTHESIS_CONTEXT');
  });

  it('reports PAIR_EVALUATIONS bound correctly', () => {
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
          mkRelationHypothesis(H1, N1, N2, { evidenceBasis: [O1] }),
        ],
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    const run = detectMissingEdge(ctx);
    const meta = run.metadata();
    expect(meta.detectorType).toBe('MISSING_EDGE');
    expect(meta.boundReached).toBe(false);
    expect(meta.pairEvaluations).toBeGreaterThanOrEqual(1);
  });
});
