// ============================================================================
// Graph-Hole Analysis — context construction tests (Phase 5A-PR7)
//
// Verifies buildGraphHoleAnalysisContext: authority boundary, deterministic
// selection order, per-package caps, completeness flags, digest stamping,
// and hard failure modes.
// ============================================================================

import { describe, expect, it } from 'vitest';

import type { GraphHoleAnalysisBounds, GraphHoleAnalysisInput } from '../src/index.js';
import {
  buildGraphHoleAnalysisContext,
  GraphHoleAnalysisError,
} from '../src/index.js';
import {
  CASE,
  CAND,
  EDGE_AB,
  EDGE_BC,
  ENT_A,
  GVS,
  NODE_A,
  NODE_B,
  NODE_C,
  OBS_1,
  OBS_2,
  OBS_3,
  OBS_4,
  OBS_5,
  OBS_6,
  OTHER_CASE,
  OTHER_GVS,
  OTHER_REGION,
  REGION,
  SRC_0,
  region,
  scenario,
} from './fixtures.js';

/**
 * Build the authoritative GraphHoleAnalysisInput for the base scenario,
 * optionally overriding any slice (used to force failure/edge cases).
 */
function inputOf(
  sc: ReturnType<typeof scenario>,
  bounds?: Partial<GraphHoleAnalysisBounds>,
): GraphHoleAnalysisInput {
  return {
    caseId: sc.caseId,
    graphVersionId: sc.graphVersionId,
    qualifiedCandidate: sc.qualifiedCandidate,
    region: sc.region,
    nodes: sc.nodes,
    edges: sc.edges,
    observations: sc.observations,
    hypothesisContext: sc.hypothesisContext,
    communities: sc.communities,
    bounds,
  };
}

describe('buildGraphHoleAnalysisContext', () => {
  it('builds a bounded, correctly-classified context with exact effective counts', () => {
    const sc = scenario();
    const { context, contextSha256, serialized } = buildGraphHoleAnalysisContext(inputOf(sc));

    expect(context.analysisPolicyVersion).toBe('v1');
    expect(context.caseId).toBe(CASE);
    expect(context.graphVersionId).toBe(GVS);
    expect(context.regionId).toBe(REGION);
    expect(context.regionStatus).toBe('SATURATED');
    expect(context.temporalContext?.validFrom.value).toBe('2021-01-01T00:00:00.000Z');
    expect(context.candidateTemporalScope?.validFrom.value).toBe('2021-02-01T00:00:00.000Z');

    // Candidate summary: detection facts from raw, scores from qualification.
    expect(context.candidate).toMatchObject({
      candidateId: CAND,
      holeType: 'MISSING_EDGE',
      expectedRelationshipType: 'communication',
      structuralBasis: 'HYPOTHESIS_REFERENCED_NODE',
      nodeIds: [NODE_A, NODE_C],
      observedEdgeIds: [],
      supportingObservationIds: [OBS_2, OBS_3],
      contradictingObservationIds: [OBS_4],
      structuralScore: 0.8,
      evidenceSupportScore: 0.7,
      expectedInformationValue: 0.85,
      significance: 0.7825,
      independentSupportUnitIds: [
        'sourceContext:ctx-1',
        'sourceContext:ctx-2',
        'sourceContext:ctx-3',
      ],
      regionStatus: 'SATURATED',
      scoringPolicyVersion: 'v2',
    });

    // All observations included: candidate refs first, then atomic refs, then the rest.
    expect(context.observations.map((o) => o.id)).toEqual([
      OBS_2, // candidate supporting
      OBS_3, // candidate supporting
      OBS_4, // candidate contradicting
      OBS_1, // atomic ref (RH_AB evidence)
      OBS_5, // remaining by id
      OBS_6, // remaining by id
    ]);
    expect(context.observations[0].kind).toBe('OBSERVED_FACT');
    expect(context.observations[0].supportUnitKey).toBe('sourceContext:ctx-2');

    // Both must-cover atomics included, grouped into the single PR3 group.
    expect(context.atomicHypotheses.map((a) => a.derivedId)).toEqual([sc.atomAB, sc.atomBC]);
    expect(context.atomicHypotheses[0]).toMatchObject({
      kind: 'HYPOTHESIS',
      hypothesisType: 'RELATION_HYPOTHESIS',
      subject: `canonical_entity:${ENT_A}`,
      predicate: 'communication',
      contradictingObservationIds: [OBS_4],
      graphVersion: GVS,
    });
    expect(context.groups).toHaveLength(1);
    expect(context.groups[0].atomicHypotheses).toHaveLength(2);
    expect(context.groups[0].canonicalEntityCount).toBeGreaterThanOrEqual(2);
    expect(context.groups[0].truncated).toBe(false);

    // Structural signals: candidate nodes first, then remaining nodes, then edges.
    expect(context.structuralSignals.map((s) => s.id)).toEqual([
      NODE_A,
      NODE_C,
      NODE_B,
      EDGE_AB,
      EDGE_BC,
    ]);
    expect(context.structuralSignals.find((s) => s.id === EDGE_AB)).toMatchObject({
      kind: 'STRUCTURAL_SIGNAL',
      kindLabel: 'EDGE',
      label: `${NODE_A}-communication-${NODE_B}`,
      relationType: 'communication',
    });

    // Inference signals mirror the qualification scores (analyst interpretation).
    expect(context.inferences.map((i) => [i.label, i.value])).toEqual([
      ['structuralScore', 0.8],
      ['evidenceSupportScore', 0.7],
      ['expectedInformationValue', 0.85],
      ['significance', 0.7825],
      ['independentSupportUnitCount', 3],
    ]);

    // Contradiction preserved (never resolved).
    expect(context.contradictions).toEqual([
      {
        id: `contrad:${sc.atomAB}:${OBS_4}`,
        kind: 'CONTRADICTION',
        observationId: OBS_4,
        hypothesisId: sc.atomAB,
        contradictsObservationId: OBS_4,
        contradictsHypothesisId: null,
      },
    ]);

    // Provenance: one entry per distinct source (6 observation sources + candidate source).
    expect(context.provenance).toHaveLength(7);
    expect(context.provenance[0]).toMatchObject({ sourceId: SRC_0, observedFactIds: [] });

    // Completeness: no truncation flags on the base scenario.
    expect(context.completeness).toEqual({
      semanticRetrievalTruncated: false,
      regionLimited: false,
      observationContextLimited: false,
      hypothesisContextLimited: false,
      hypothesisGroupingTruncated: false,
      temporalContextLimited: false,
      contextBudgetLimited: false,
    });

    // Exact effective counts the model saw.
    expect(context.counts).toEqual({
      suppliedRegions: 1,
      suppliedCandidate: 1,
      suppliedNodeIds: 3,
      suppliedEdgeIds: 2,
      suppliedObservations: 6,
      suppliedAtomicHypotheses: 2,
      suppliedGroups: 1,
      includedObservations: 6,
      includedAtomicHypotheses: 2,
      includedGroups: 1,
      includedNodes: 3,
      includedEdges: 2,
      includedContradictions: 1,
      includedProvenanceSources: 7,
      excludedObservations: 0,
      excludedAtomicHypotheses: 0,
      serializedContextChars: serialized.length,
    });

    // Digest stamped over the serialized form.
    expect(serialized.length).toBeGreaterThan(500);
    expect(contextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(context.counts.serializedContextChars).toBe(serialized.length);
  });

  it('is byte-stable under shuffled input order (deterministic serialization)', () => {
    const sc = scenario();
    const first = buildGraphHoleAnalysisContext(inputOf(sc));
    const second = buildGraphHoleAnalysisContext(
      inputOf({
        ...sc,
        observations: [...sc.observations].reverse(),
        nodes: [...sc.nodes].reverse(),
        edges: [...sc.edges].reverse(),
        communities: new Map([...sc.communities.entries()].reverse()),
      }),
    );

    expect(second.serialized).toBe(first.serialized);
    expect(second.contextSha256).toBe(first.contextSha256);
    expect(second.context.counts).toEqual(first.context.counts);
    expect(second.context).toEqual(first.context);
  });

  it('rejects a caseId mismatch across region/candidate (authority boundary)', () => {
    const sc = scenario();
    const bad = {
      ...sc,
      region: {
        ...sc.region,
        identity: { ...sc.region.identity, caseId: OTHER_CASE },
      },
    };
    expect(() => buildGraphHoleAnalysisContext(inputOf(bad))).toThrow(
      'INPUT_AUTHORITY_MISMATCH',
    );
  });

  it('rejects graphVersionId and regionId mismatches (authority boundary)', () => {
    const sc = scenario();
    expect(() =>
      buildGraphHoleAnalysisContext(inputOf({ ...sc, graphVersionId: OTHER_GVS })),
    ).toThrow('INPUT_AUTHORITY_MISMATCH');

    expect(() =>
      buildGraphHoleAnalysisContext(
        inputOf({
          ...sc,
          qualifiedCandidate: {
            ...sc.qualifiedCandidate,
            rawCandidate: { ...sc.qualifiedCandidate.rawCandidate, regionId: OTHER_REGION },
          },
        }),
      ),
    ).toThrow('INPUT_AUTHORITY_MISMATCH');
  });

  it('rejects an unqualified candidate', () => {
    const sc = scenario();
    expect(() =>
      buildGraphHoleAnalysisContext(
        inputOf({
          ...sc,
          qualifiedCandidate: {
            ...sc.qualifiedCandidate,
            qualified: false,
            failureReasons: ['INSUFFICIENT_SUPPORT'],
          },
        }),
      ),
    ).toThrow('INPUT_UNQUALIFIED_CANDIDATE');
  });

  it('rejects a missing must-cover supporting hypothesis reference', () => {
    const sc = scenario();
    const hc = sc.hypothesisContext;
    expect(() =>
      buildGraphHoleAnalysisContext(
        inputOf({
          ...sc,
          hypothesisContext: {
            ...hc,
            atomic: hc.atomic.filter((a) => a.derivedId !== sc.atomAB),
          },
        }),
      ),
    ).toThrow('INPUT_CONTEXT_INCONSISTENT');
  });

  it('rejects a missing required observation reference', () => {
    const sc = scenario();
    expect(() =>
      buildGraphHoleAnalysisContext(
        inputOf({ ...sc, observations: sc.observations.filter((o) => o.id !== OBS_4) }),
      ),
    ).toThrow('INPUT_CONTEXT_INCONSISTENT');
  });

  it('rejects a missing candidate node reference', () => {
    const sc = scenario();
    expect(() =>
      buildGraphHoleAnalysisContext(
        inputOf({ ...sc, nodes: sc.nodes.filter((n) => n.id !== NODE_A) }),
      ),
    ).toThrow('INPUT_CONTEXT_INCONSISTENT');
  });

  it('applies the observation cap and reports the overflow as observationContextLimited', () => {
    const sc = scenario();
    const { context } = buildGraphHoleAnalysisContext(
      inputOf(sc, { maxObservations: 5 }),
    );
    expect(context.counts.includedObservations).toBe(5);
    expect(context.counts.excludedObservations).toBe(1);
    expect(context.observations.map((o) => o.id)).toEqual([
      OBS_2,
      OBS_3,
      OBS_4,
      OBS_1,
      OBS_5,
    ]);
    expect(context.completeness.observationContextLimited).toBe(true);
    expect(context.completeness.contextBudgetLimited).toBe(false);
  });

  it('applies the hypothesis cap and reports the overflow as hypothesisContextLimited', () => {
    const sc = scenario();
    const { context } = buildGraphHoleAnalysisContext(
      inputOf(sc, { maxHypotheses: 1 }),
    );
    expect(context.counts.includedAtomicHypotheses).toBe(1);
    expect(context.counts.excludedAtomicHypotheses).toBe(1);
    expect(context.atomicHypotheses.map((a) => a.derivedId)).toEqual([sc.atomAB]);
    expect(context.completeness.hypothesisContextLimited).toBe(true);
  });

  it('derives regionLimited and semanticRetrievalTruncated from region flags/limitations', () => {
    const sc = scenario();

    const truncatedRegion = buildGraphHoleAnalysisContext(
      inputOf({ ...sc, region: region({ truncated: true, status: 'LIMITED' }) }),
    );
    expect(truncatedRegion.context.completeness.regionLimited).toBe(true);

    const limitedStatus = buildGraphHoleAnalysisContext(
      inputOf({ ...sc, region: region({ status: 'DEGRADED' }) }),
    );
    expect(limitedStatus.context.completeness.regionLimited).toBe(true);

    const semanticLimit = buildGraphHoleAnalysisContext(
      inputOf({ ...sc, region: region({ limitations: ['SEMANTIC_RESULTS_TRUNCATED'] }) }),
    );
    expect(semanticLimit.context.completeness.semanticRetrievalTruncated).toBe(true);
    expect(semanticLimit.context.completeness.regionLimited).toBe(false);

    const providerTruncated = buildGraphHoleAnalysisContext(
      inputOf({ ...sc, region: region({ providerTruncated: true }) }),
    );
    expect(providerTruncated.context.completeness.semanticRetrievalTruncated).toBe(true);
  });

  it('derives hypothesisGroupingTruncated from the PR3 grouping accounting', () => {
    const sc = scenario();
    const hc = sc.hypothesisContext;
    const { context } = buildGraphHoleAnalysisContext(
      inputOf({
        ...sc,
        hypothesisContext: {
          ...hc,
          accounting: { ...hc.accounting, truncatedGroups: 1 },
        },
      }),
    );
    expect(context.completeness.hypothesisGroupingTruncated).toBe(true);
  });

  it('derives temporalContextLimited when the candidate scope is not covered', () => {
    const sc = scenario();
    const { context } = buildGraphHoleAnalysisContext(
      inputOf({ ...sc, region: region({ temporalContext: null }) }),
    );
    expect(context.temporalContext).toBeNull();
    expect(context.completeness.temporalContextLimited).toBe(true);
  });

  it('enforces bounds: narrowing is honored, widening/illegal values are rejected', () => {
    const sc = scenario();
    const narrowed = buildGraphHoleAnalysisContext(
      inputOf(sc, { maxObservations: 5 }),
    );
    expect(narrowed.context.counts.suppliedObservations).toBe(6);
    expect(narrowed.context.counts.includedObservations).toBe(5);

    expect(() => buildGraphHoleAnalysisContext(inputOf(sc, { maxNodes: 101 }))).toThrow(
      'INPUT_BOUND_INVALID',
    );
    expect(() => buildGraphHoleAnalysisContext(inputOf(sc, { maxObservations: 5.5 }))).toThrow(
      'INPUT_BOUND_INVALID',
    );
    expect(() => buildGraphHoleAnalysisContext(inputOf(sc, { maxObservations: -1 }))).toThrow(
      'INPUT_BOUND_INVALID',
    );
  });

  it('fails hard with CONTEXT_TOO_LARGE when the char budget is exceeded', () => {
    const sc = scenario();
    let caught: unknown;
    try {
      buildGraphHoleAnalysisContext(inputOf(sc, { maxSerializedContextChars: 100 }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GraphHoleAnalysisError);
    expect((caught as GraphHoleAnalysisError).code).toBe('CONTEXT_TOO_LARGE');
  });

  it('filters communities to included nodes only and sorts deterministically', () => {
    const sc = scenario();
    const { context } = buildGraphHoleAnalysisContext(inputOf(sc));
    expect(context.communities).toHaveLength(3);
    expect(context.communities.map((c) => c.nodeId).sort()).toEqual([NODE_A, NODE_B, NODE_C]);
  });
});