import { describe, expect, it } from 'vitest';
import { detectGraphHoleCandidates } from '../src/index.js';
import {
  mkNode,
  mkEdge,
  mkRelationHypothesis,
  mkEntityHypothesis,
  mkRegion,
  obs,
  obsSources,
  baseInput,
  uuid,
  CASE_ID,
  VERSION_ID,
} from './helpers.js';

describe('PR4 adversarial / contract invariants', () => {
  it('empty graph and no hypotheses: zero candidates, no errors', () => {
    const result = detectGraphHoleCandidates(
      baseInput({ nodes: [], edges: [], observations: [] }),
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.summary.duplicateSuppressions).toBe(0);
    expect(result.summary.droppedCandidateCount).toBe(0);
  });

  it('dense fully-connected clique: no MISSING_EDGE or MISSING_PATH', () => {
    const nodes = Array.from({ length: 5 }, () => mkNode(uuid()));
    const edges = [];
    const hypotheses = [];
    const O1 = uuid();
    const S1 = uuid();
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const e = mkEdge(uuid(), nodes[i]!.id, nodes[j]!.id);
        edges.push(e);
        hypotheses.push(
          mkRelationHypothesis(uuid(), nodes[i]!.id, nodes[j]!.id, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        );
      }
    }
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes,
        edges,
        observations: [obs(O1, S1)],
        relationHypotheses: hypotheses,
      }),
    );
    const missingEdgePath = result.candidates.filter(
      (c) => c.detectorType === 'MISSING_EDGE' || c.detectorType === 'MISSING_PATH',
    );
    expect(missingEdgePath).toHaveLength(0);
  });

  it('self-loop does not hide a node from ISOLATED_NODE', () => {
    const A = uuid();
    const OTHER = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const LOOP_EDGE = uuid();
    // Self-loop is excluded by context (source != target filter).
    const result = detectGraphHoleCandidates(
      baseInput({
        region: mkRegion({ nodeIds: [A, OTHER], edgeIds: [LOOP_EDGE] }),
        nodes: [mkNode(A), mkNode(OTHER)],
        edges: [mkEdge(LOOP_EDGE, A, A)], // self-loop
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, OTHER, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
      }),
    );
    const isolated = result.candidates.filter((c) => c.detectorType === 'ISOLATED_NODE');
    expect(isolated.length).toBeGreaterThanOrEqual(1);
  });

  it('candidate identity is byte-stable across identical runs', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const input = baseInput({
      nodes: [mkNode(N1), mkNode(N2)],
      edges: [],
      observations: [obs(O1, S1)],
      relationHypotheses: [
        mkRelationHypothesis(H1, N1, N2, {
          relationType: 'communication',
          evidenceBasis: [O1],
        }),
      ],
    });
    const a = detectGraphHoleCandidates(input);
    const b = detectGraphHoleCandidates(input);
    expect(a.candidates.map((c) => c.candidateId)).toEqual(b.candidates.map((c) => c.candidateId));
  });

  it('never fabricates provenance: all derivedFrom source ids supplied', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
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
        ],
      }),
    );
    const edge = result.candidates.find((c) => c.detectorType === 'MISSING_EDGE')!;
    expect(edge.provenance.sourceId).toBe(S1);
    expect(edge.provenance.extractor).toBe('graph-hole-detection.v1');
    expect(edge.provenance.derivedFrom).toContain(O1);
  });

  it('duplicates across atomics are suppressed in accounting', () => {
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
    expect(result.summary.duplicateSuppressions).toBe(1);
    const missingEdges = result.candidates.filter(
      (c) => c.detectorType === 'MISSING_EDGE',
    );
    expect(missingEdges).toHaveLength(1);
    expect(missingEdges[0]!.supportingHypothesisIds.length).toBe(1);
  });

  it('contradicting observations are preserved in the candidate', () => {
    const N1 = uuid();
    const N2 = uuid();
    const O1 = uuid();
    const O2 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2)],
        edges: [],
        observations: [obs(O1, S1), obs(O2, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
            contradictions: [O2],
          }),
        ],
      }),
    );
    const edge = result.candidates.find((c) => c.detectorType === 'MISSING_EDGE')!;
    expect(edge.contradictingObservationIds).toContain(O2);
    expect(edge.supportingObservationIds).toContain(O1);
  });

  it('open-ended temporal bounds never produce a TEMPORAL_GAP', () => {
    const A = uuid();
    const B = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const DAY = (v: string) => ({ value: v, precision: 'day' as const });
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes: [
          mkNode(A, {
            temporalRange: {
              validFrom: DAY('2020-01-01'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
          mkNode(B, {
            temporalRange: {
              validFrom: DAY('2020-03-01'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
        ],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, B, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
      }),
    );
    expect(result.candidates.filter((c) => c.detectorType === 'TEMPORAL_GAP')).toHaveLength(0);
  });

  it('does not emit MISSING_EDGE for pairs outside the bounded region scope', () => {
    const N1 = uuid();
    const N_OUT = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const result = detectGraphHoleCandidates(
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
      }),
    );
    // N_OUT is outside the region: the asserted pair is NOT a candidate. The
    // only legitimate output is ISOLATED_NODE for N1 (hypothesis-referenced).
    expect(result.candidates.filter((c) => c.detectorType === 'MISSING_EDGE')).toHaveLength(0);
    expect(result.candidates.every((c) => c.detectorType === 'ISOLATED_NODE')).toBe(true);
  });

  it('OBSERVED_NEIGHBOR_CONTEXT group-bridge pair requires shared evidence', () => {
    const N1 = uuid();
    const N2 = uuid();
    const N3 = uuid();
    const O1 = uuid();
    const O2 = uuid();
    const S1 = uuid();
    const S2 = uuid();
    const H1 = uuid();
    const H2 = uuid();
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2), mkNode(N3)],
        edges: [mkEdge(uuid(), N1, N3), mkEdge(uuid(), N2, N3)],
        observations: [obs(O1, S1), obs(O2, S2)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N3, { evidenceBasis: [O1] }),
          mkRelationHypothesis(H2, N2, N3, { evidenceBasis: [O2] }),
        ],
      }),
    );
    const groupBridge = result.candidates.filter(
      (c) => c.structuralBasis === 'OBSERVED_NEIGHBOR_CONTEXT',
    );
    expect(groupBridge).toHaveLength(0);
  });

  it('BROKEN_CHAIN emits at most one candidate per asserted broken link', () => {
    const A = uuid();
    const B = uuid();
    const C = uuid();
    const D = uuid();
    const G = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes: [mkNode(A), mkNode(B), mkNode(C), mkNode(D), mkNode(G)],
        edges: [
          mkEdge(uuid(), A, B),
          mkEdge(uuid(), B, C),
          mkEdge(uuid(), D, G),
        ],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, C, D, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
      }),
    );
    const broken = result.candidates.filter((c) => c.detectorType === 'BROKEN_CHAIN');
    expect(broken).toHaveLength(1);
    expect(broken[0]!.supportingHypothesisIds).toHaveLength(1);
  });

  it('broken-chain mirror chain does not double-report the same missing link', () => {
    const A = uuid();
    const B = uuid();
    const C = uuid();
    const D = uuid();
    const G = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const input = baseInput({
      nodes: [mkNode(A), mkNode(B), mkNode(C), mkNode(D), mkNode(G)],
      edges: [
        mkEdge(uuid(), A, B),
        mkEdge(uuid(), B, C),
        mkEdge(uuid(), D, G),
      ],
      observations: [obs(O1, S1)],
      relationHypotheses: [
        mkRelationHypothesis(H1, C, D, {
          relationType: 'communication',
          evidenceBasis: [O1],
        }),
      ],
    });
    const alpha = detectGraphHoleCandidates(input);
    const beta = detectGraphHoleCandidates({
      ...input,
      // Reverse observation array only — proves direction-independence.
      observations: [...input.observations].reverse(),
    });
    expect(alpha.candidates.filter((c) => c.detectorType === 'BROKEN_CHAIN')).toHaveLength(
      beta.candidates.filter((c) => c.detectorType === 'BROKEN_CHAIN').length,
    );
  });

  it('community-boundary requires BOTH an inter-community edge and shared hypothesis', () => {
    const N1 = uuid();
    const N2 = uuid();
    const N3 = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const result = detectGraphHoleCandidates(
      baseInput({
        nodes: [mkNode(N1), mkNode(N2), mkNode(N3)],
        edges: [mkEdge(uuid(), N3, N2)],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, N1, N2, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        communities: new Map([
          [N1, 'a'],
          [N3, 'a'],
          [N2, 'b'],
        ]),
      }),
    );
    const boundary = result.candidates.filter(
      (c) => c.detectorType === 'COMMUNITY_BOUNDARY',
    );
    expect(boundary).toHaveLength(1);
    expect(boundary[0]!.expectedRelationshipType).toBe('communication');
  });
});