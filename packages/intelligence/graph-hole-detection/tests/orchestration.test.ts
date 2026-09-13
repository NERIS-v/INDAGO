import { describe, expect, it } from 'vitest';
import { detectGraphHoleCandidates, DETECTOR_ORDER } from '../src/index.js';
import { GraphHoleDetectionError } from '../src/types.js';
import { DETECTOR_BOUNDS } from '../src/bounds.js';
import {
  mkNode,
  mkEdge,
  mkRelationHypothesis,
  mkRegion,
  obs,
  baseInput,
  uuid,
  CASE_ID,
  VERSION_ID,
} from './helpers.js';

function mixedInput() {
  const N1 = uuid();
  const N2 = uuid();
  const N3 = uuid();
  const N4 = uuid();
  const O1 = uuid();
  const S1 = uuid();
  const H1 = uuid();
  const H2 = uuid();
  return {
    input: baseInput({
      nodes: [mkNode(N1), mkNode(N2), mkNode(N3), mkNode(N4)],
      // N3—N4 is observed; N1 and N2 are isolated hypothesis leaves.
      edges: [mkEdge(uuid(), N3, N4)],
      observations: [obs(O1, S1)],
      relationHypotheses: [
        mkRelationHypothesis(H1, N1, N2, {
          relationType: 'communication',
          evidenceBasis: [O1],
        }),
        mkRelationHypothesis(H2, N3, N4, {
          relationType: 'communication',
          evidenceBasis: [O1],
        }),
      ],
    }),
    N1,
    N2,
    N3,
    N4,
    O1,
  };
}

describe('detectGraphHoleCandidates orchestration', () => {
  it('preserves region and reports artifact-free candidates across detectors', () => {
    const { input, N1, N2, O1 } = mixedInput();
    const result = detectGraphHoleCandidates(input);
    expect(result.region.regionId).toBe(input.region.regionId);
    expect(result.candidates.length).toBeGreaterThan(0);

    const egde = result.candidates.find(
      (c) => c.structuralBasis === 'SHARED_HYPOTHESIS_CONTEXT',
    );
    expect(egde).toBeDefined();
    expect(egde!.detectorType).toBe('MISSING_EDGE');
    expect([...egde!.nodeIds].sort()).toEqual([N1, N2].sort());
    expect(egde!.provenance.derivedFrom).toHaveLength(1);
    expect(egde!.provenance.derivedFrom![0]).toEqual(O1);
  });

  it('is byte-stable across shuffled input ordering', () => {
    // Same logical graph, three orderings (reusing the SAME region so only the
    // array iteration order changes).
    const { input } = mixedInput();
    const region = input.region;
    const shuffledReverse = baseInput({
      region,
      nodes: [...input.nodes].reverse(),
      edges: [...input.edges].reverse(),
      observations: [...input.observations].reverse(),
      relationHypotheses: [...input.relationHypotheses].reverse(),
    });
    const shuffledRotate = baseInput({
      region,
      nodes: [...input.nodes.slice(2), ...input.nodes.slice(0, 2)],
      edges: [...input.edges],
      observations: [input.observations[input.observations.length - 1]!, input.observations[0]!],
      relationHypotheses: [
        input.relationHypotheses[input.relationHypotheses.length - 1]!,
        input.relationHypotheses[0]!,
      ],
    });
    const alpha = detectGraphHoleCandidates(input);
    const beta = detectGraphHoleCandidates(shuffledReverse);
    const gamma = detectGraphHoleCandidates(shuffledRotate);
    expect(JSON.stringify(beta.candidates)).toBe(JSON.stringify(alpha.candidates));
    expect(JSON.stringify(gamma.candidates)).toBe(JSON.stringify(alpha.candidates));
    expect(beta.summary.detectors).toEqual(alpha.summary.detectors);
    expect(gamma.summary.detectors).toEqual(alpha.summary.detectors);
    expect(beta.summary.duplicateSuppressions).toBe(alpha.summary.duplicateSuppressions);
    expect(gamma.summary.duplicateSuppressions).toBe(alpha.summary.duplicateSuppressions);
  });

  it('dedupes identical candidate identities emitted by distinct hypothesis sources', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const H2 = uuid();
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
          mkRelationHypothesis(H2, N2, N1, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
      }),
    );
    const edgeCandidates = result.candidates.filter(
      (c) => c.detectorType === 'MISSING_EDGE',
    );
    expect(edgeCandidates).toHaveLength(1);
    expect(result.summary.duplicateSuppressions).toBe(1);
  });

  it('applies the region candidate cap with explicit drop accounting', () => {
    // 25 isolated hypothesis-referenced leaves => 25 candidates > cap 10.
    const nodes = [];
    const hypotheses = [];
    const O1 = uuid();
    const S1 = uuid();
    for (let i = 0; i < 25; i += 1) {
      const leaf = uuid();
      const other = uuid();
      nodes.push(mkNode(leaf), mkNode(other));
      hypotheses.push(
        mkRelationHypothesis(uuid(), leaf, other, {
          relationType: 'communication',
          evidenceBasis: [O1],
        }),
      );
    }
    const result = detectGraphHoleCandidates(
      baseInput({ nodes, edges: [], observations: [obs(O1, S1)], relationHypotheses: hypotheses }),
    );
    expect(result.summary.regionCandidateCapReached).toBe(true);
    expect(result.summary.droppedCandidateCount).toBeGreaterThan(0);
    expect(result.candidates).toHaveLength(DETECTOR_BOUNDS.maxRegionCandidates);
    expect(result.summary.candidateCap).toBe(DETECTOR_BOUNDS.maxRegionCandidates);
    // Byte-stable ordering by candidateId.
    const ids = result.candidates.map((c) => c.candidateId);
    expect([...ids].sort()).toEqual(ids);
  });

  it('runs only the enabled detector subset', () => {
    const { input } = mixedInput();
    const result = detectGraphHoleCandidates(
      baseInput({
        ...input,
        enabledDetectors: ['MISSING_EDGE'],
      }),
    );
    expect(result.summary.detectors.map((d) => d.detectorType)).toEqual(['MISSING_EDGE']);
    expect(result.candidates[0]!.detectorType).toBe('MISSING_EDGE');
  });

  it('reports detector bound metadata (boundKind) when a bound is reached', () => {
    const nodes = [];
    const hypotheses = [];
    const O1 = uuid();
    const S1 = uuid();
    for (let i = 0; i < 2600; i += 1) {
      const leaf = uuid();
      const other = uuid();
      nodes.push(mkNode(leaf), mkNode(other));
      hypotheses.push(
        mkRelationHypothesis(uuid(), leaf, other, {
          relationType: 'communication',
          evidenceBasis: [O1],
        }),
      );
    }
    const result = detectGraphHoleCandidates(
      baseInput({ nodes, edges: [], observations: [obs(O1, S1)], relationHypotheses: hypotheses }),
    );
    const missingEdge = result.summary.detectors.find(
      (d) => d.detectorType === 'MISSING_EDGE',
    )!;
    expect(missingEdge.boundReached).toBe(true);
    expect(missingEdge.boundKind).toBe('PAIR_EVALUATIONS');
    expect(missingEdge.pairEvaluations).toBeGreaterThanOrEqual(
      DETECTOR_BOUNDS.maxPairEvaluationsPerDetector,
    );
  });

  it('propagates region.truncated into the summary', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const result = detectGraphHoleCandidates(
      baseInput({
        region: mkRegion({
          nodeIds: [N1, N2],
          edgeIds: [],
          truncated: true,
        }),
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
      }),
    );
    expect(result.summary.regionTruncated).toBe(true);
  });

  it('fails fast on a region/hypothesis graph authority mismatch', () => {
    const N1 = uuid();
    const region = mkRegion({ nodeIds: [N1], edgeIds: [] });
    const mismatched = {
      ...region,
      identity: {
        ...region.identity,
        caseId: uuid(), // DRIFTED: belongs to a different case
      },
    };
    expect(() =>
      detectGraphHoleCandidates(
        baseInput({
          region: mismatched as typeof region,
          nodes: [mkNode(N1)],
          edges: [],
          observations: [],
        }),
      ),
    ).toThrow(GraphHoleDetectionError);
  });

  it('refuses to run when an observation source record is missing (never fabricates)', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const H1 = uuid();
    expect(() =>
      detectGraphHoleCandidates(
        baseInput({
          nodes: [mkNode(N1), mkNode(N2)],
          edges: [],
          observations: [], // O1 has no source record
          relationHypotheses: [
            mkRelationHypothesis(H1, N1, N2, {
              relationType: 'communication',
              evidenceBasis: [O1],
            }),
          ],
        }),
      ),
    ).toThrow(GraphHoleDetectionError);
  });

  it('rejects an explicitly empty enabledDetectors list', () => {
    expect(() =>
      detectGraphHoleCandidates(
        baseInput({
          nodes: [],
          edges: [],
          observations: [],
          enabledDetectors: [],
        }),
      ),
    ).toThrow(GraphHoleDetectionError);
  });

  it('always lists all six detector types in the frozen order', () => {
    expect(DETECTOR_ORDER).toEqual([
      'MISSING_EDGE',
      'MISSING_PATH',
      'ISOLATED_NODE',
      'BROKEN_CHAIN',
      'TEMPORAL_GAP',
      'COMMUNITY_BOUNDARY',
    ]);
  });
});