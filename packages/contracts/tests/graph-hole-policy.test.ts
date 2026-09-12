import { describe, it, expect } from 'vitest';
import {
  GRAPH_HOLE_POLICY_VERSION,
  SEMANTIC_RETRIEVAL_POLICY_VERSION,
  DETECTION_POLICY_VERSION,
  MIN_INDEPENDENT_SUPPORT_UNITS,
  MIN_STRUCTURAL_SCORE,
  MIN_SIGNIFICANCE,
  MAX_REGION_EXPANSION_ROUNDS,
  SATURATION_NOVELTY_THRESHOLD,
  SATURATION_REQUIRED_CONSECUTIVE_ROUNDS,
  MAX_REGION_NODES,
  MAX_REGION_EDGES,
  MAX_CONTEXT_OBSERVATIONS,
  MAX_SEMANTIC_RESULTS_PER_ROUND,
  MAX_TOTAL_SEMANTIC_RESULTS,
  MAX_HYPOTHESES_IN_CONTEXT,
  MAX_ATOMIC_HYPOTHESES_PER_GROUP,
  MAX_GROUP_NODES,
  MAX_GRAPH_HOLES_PER_REGION,
  MAX_AI_ANALYSES_PER_REGION,
  MAX_EVIDENCE_PER_AI_PACKAGE,
  STRUCTURAL_SCORE_WEIGHTS,
  SIGNIFICANCE_WEIGHTS,
  GraphHoleQualificationGateSchema,
  resolveSupportUnitKey,
  countIndependentSupportUnits,
  GRAPH_HOLE_POLICY_V1,
  SupportUnitKeySchema,
  SupportUnitResolutionSchema,
  GroupSplitOrderSchema,
  RegionSaturationDefinitionSchema,
} from '../src/index.js';

// ============================================================================
// Graph-Hole Policy Contracts (Phase 5A-PR0)
//
// Verifies the frozen V1 policy: constants, support-unit resolution rule,
// qualification gates, grouping policy, scoring, and the top-level instance.
// ============================================================================

describe('V1 policy versions', () => {
  it('freezes all three versions to v1', () => {
    expect(GRAPH_HOLE_POLICY_VERSION).toBe('v1');
    expect(SEMANTIC_RETRIEVAL_POLICY_VERSION).toBe('v1');
    expect(DETECTION_POLICY_VERSION).toBe('v1');
  });
});

describe('V1 constants (single source of truth)', () => {
  it('exposes the exact frozen threshold values', () => {
    expect(MIN_INDEPENDENT_SUPPORT_UNITS).toBe(2);
    expect(MIN_STRUCTURAL_SCORE).toBe(0.7);
    expect(MIN_SIGNIFICANCE).toBe(0.7);
  });

  it('exposes the exact frozen bound values', () => {
    expect(MAX_REGION_EXPANSION_ROUNDS).toBe(3);
    expect(SATURATION_NOVELTY_THRESHOLD).toBe(0.1);
    expect(SATURATION_REQUIRED_CONSECUTIVE_ROUNDS).toBe(2);
    expect(MAX_REGION_NODES).toBe(100);
    expect(MAX_REGION_EDGES).toBe(250);
    expect(MAX_CONTEXT_OBSERVATIONS).toBe(150);
    expect(MAX_SEMANTIC_RESULTS_PER_ROUND).toBe(20);
    expect(MAX_TOTAL_SEMANTIC_RESULTS).toBe(50);
    expect(MAX_HYPOTHESES_IN_CONTEXT).toBe(50);
    expect(MAX_ATOMIC_HYPOTHESES_PER_GROUP).toBe(25);
    expect(MAX_GROUP_NODES).toBe(50);
    expect(MAX_GRAPH_HOLES_PER_REGION).toBe(10);
    expect(MAX_AI_ANALYSES_PER_REGION).toBe(10);
    expect(MAX_EVIDENCE_PER_AI_PACKAGE).toBe(100);
  });
});

describe('V1 weights', () => {
  it('freezes structural weights at exact fractions summing to 1', () => {
    expect(STRUCTURAL_SCORE_WEIGHTS).toEqual({
      patternStrength: 0.3,
      connectivitySupport: 0.25,
      contextualSupport: 0.2,
      temporalSupport: 0.15,
      communitySupport: 0.1,
    });
    const sum = Object.values(STRUCTURAL_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('freezes significance weights at exact fractions summing to 1', () => {
    expect(SIGNIFICANCE_WEIGHTS).toEqual({
      structuralScore: 0.6,
      evidenceSupportScore: 0.25,
      expectedInformationValue: 0.15,
    });
    const sum = Object.values(SIGNIFICANCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('Hard qualification gates', () => {
  it('freezes all 11 mandatory gates', () => {
    expect(Object.values(GraphHoleQualificationGateSchema.enum)).toEqual([
      'GRAPH_VERSION_EXISTS',
      'PROJECTION_NOT_TRUNCATED',
      'REGION_SATURATED',
      'CASE_ISOLATION_VALID',
      'MINIMUM_INDEPENDENT_SUPPORT_UNITS',
      'MINIMUM_STRUCTURAL_SCORE',
      'MINIMUM_SIGNIFICANCE',
      'CANDIDATE_NOT_RESOLVED',
      'CANDIDATE_NOT_DUPLICATE',
      'TEMPORAL_CONTEXT_VALID',
      'COMPUTATION_BOUNDS_SATISFIED',
    ]);
  });

  it('rejects unknown gate names', () => {
    expect(GraphHoleQualificationGateSchema.safeParse('IS_PROBABLY_CULPABLE').success).toBe(false);
  });
});

describe('§9 support-unit resolution rule', () => {
  it('resolves by priority: sourceContextId > artifactId > contentHash > sourceId', () => {
    const observation = {
      sourceContextId: 'ctx-1',
      artifactId: 'art-1',
      contentHash: 'hash-1',
      sourceId: 'src-1',
    };
    const resolved = resolveSupportUnitKey(observation);
    expect(resolved).toEqual({ key: 'sourceContext:ctx-1', basis: 'sourceContextId' });
  });

  it('falls back to artifactId when sourceContextId is absent', () => {
    expect(resolveSupportUnitKey({ artifactId: 'art-2', sourceId: 'src-1' })).toEqual({
      key: 'artifact:art-2',
      basis: 'artifactId',
    });
  });

  it('falls back to contentHash before sourceId', () => {
    expect(resolveSupportUnitKey({ contentHash: 'hash-3', sourceId: 'src-1' })).toEqual({
      key: 'contentHash:hash-3',
      basis: 'contentHash',
    });
  });

  it('falls back to sourceId as the last resort', () => {
    expect(resolveSupportUnitKey({ sourceId: 'src-4' })).toEqual({
      key: 'source:src-4',
      basis: 'sourceId',
    });
  });

  it('duplicate sourceContextId binds observations to the same support unit', () => {
    const a = resolveSupportUnitKey({ sourceContextId: 'same', sourceId: 'x' });
    const b = resolveSupportUnitKey({ sourceContextId: 'same', sourceId: 'y' });
    expect(a.key).toBe('sourceContext:same');
    expect(b.key).toBe('sourceContext:same');
    expect(a.key).toEqual(b.key);
  });

  it('counts only distinct support-unit keys as independent', () => {
    const keys = [
      'sourceContext:a',
      'sourceContext:a',
      'artifact:b',
      null,
      '',
      'source:c',
    ];
    expect(countIndependentSupportUnits(keys)).toBe(3);
  });

  it('treats two different sourceContextIds as independent', () => {
    const keys = ['sourceContext:a', 'sourceContext:b'];
    expect(countIndependentSupportUnits(keys)).toBe(2);
  });

  it('recognizes all four support-unit key bases', () => {
    expect(Object.values(SupportUnitKeySchema.enum)).toEqual([
      'sourceContextId',
      'artifactId',
      'contentHash',
      'sourceId',
    ]);
  });

  it('validates support-unit resolution records (key + basis)', () => {
    const good = SupportUnitResolutionSchema.safeParse({
      key: 'sourceContext:ctx-1',
      basis: 'sourceContextId',
    });
    expect(good.success).toBe(true);
    expect(SupportUnitResolutionSchema.safeParse({
      key: 'artifact:a',
      basis: 'artifactId',
    }).success).toBe(true);
    expect(SupportUnitResolutionSchema.safeParse({
      key: 'sourceContext:ctx-1',
      basis: 'unknown',
    }).success).toBe(false);
    expect(SupportUnitResolutionSchema.safeParse({
      key: '',
      basis: 'sourceId',
    }).success).toBe(false);
  });
});

describe('§8 region saturation contract', () => {
  it('freezes the V1 saturation definition instance', () => {
    const saturationV1 = RegionSaturationDefinitionSchema.parse({
      requiredConsecutiveRounds: 2,
      observationNoveltyThreshold: 0.1,
      nodeNoveltyThreshold: 0.1,
      hardBudgetExhaustionDisqualifiesSaturation: true,
      saturationSemanticsNote:
        'Retrieval produced sufficiently little new context; NOT mathematical completeness.',
    });
    expect(saturationV1.requiredConsecutiveRounds).toBe(2);
    expect(saturationV1.observationNoveltyThreshold).toBe(0.1);
    expect(saturationV1.nodeNoveltyThreshold).toBe(0.1);
    expect(saturationV1.hardBudgetExhaustionDisqualifiesSaturation).toBe(true);
  });

  it('rejects a saturation definition that allows budget exhaustion', () => {
    expect(
      RegionSaturationDefinitionSchema.safeParse({
        requiredConsecutiveRounds: 2,
        observationNoveltyThreshold: 0.1,
        nodeNoveltyThreshold: 0.1,
        hardBudgetExhaustionDisqualifiesSaturation: false,
        saturationSemanticsNote:
          'Retrieval produced sufficiently little new context; NOT mathematical completeness.',
      }).success,
    ).toBe(false);
  });
});

describe('§18/§19 grouping policy', () => {
  it('uses weakly connected components over shared canonical nodes', () => {
    expect(GRAPH_HOLE_POLICY_V1.grouping.overlapRule).toBe('SHARED_CANONICAL_GRAPH_NODE_OR_ENTITY');
    expect(GRAPH_HOLE_POLICY_V1.grouping.componentModel).toBe('WEAKLY_CONNECTED_COMPONENTS');
    expect(GRAPH_HOLE_POLICY_V1.grouping.directionalityAware).toBe(false);
    expect(GRAPH_HOLE_POLICY_V1.grouping.minimumSharedNodes).toBe(1);
  });

  it('enforces deterministic split ordering', () => {
    expect(GRAPH_HOLE_POLICY_V1.grouping.splitOrdering).toEqual([
      'EVIDENCE_SUPPORT_DESC',
      'STRUCTURAL_RELEVANCE_DESC',
      'HYPOTHESIS_ID_ASC',
    ]);
    expect(GroupSplitOrderSchema.safeParse('EVIDENCE_SUPPORT_DESC').success).toBe(true);
    expect(GroupSplitOrderSchema.safeParse('HYPOTHESIS_ID_DESC').success).toBe(false);
  });

  it('binds the V1 grouping limits', () => {
    expect(GRAPH_HOLE_POLICY_V1.grouping.maxAtomicHypothesesPerGroup).toBe(
      MAX_ATOMIC_HYPOTHESES_PER_GROUP,
    );
    expect(GRAPH_HOLE_POLICY_V1.grouping.maxGroupNodes).toBe(MAX_GROUP_NODES);
  });
});

describe('§26 GRAPH_HOLE_POLICY_V1', () => {
  it('is a valid instance of the policy schema', () => {
    const parsed = GRAPH_HOLE_POLICY_V1;
    expect(parsed.version).toBe('v1');
    expect(parsed.qualification.requiresAllHardGates).toBe(true);
    expect(parsed.qualification.hardGates).toHaveLength(11);
    expect(parsed.qualification.eligibleRegionStatus).toBe('SATURATED');
    expect(parsed.qualification.truncatedProjectionBehavior).toBe('SUPPRESS');
  });

  it('uses the shared constants (no drift between constants and policy)', () => {
    const policy = GRAPH_HOLE_POLICY_V1;
    expect(policy.qualification.minIndependentSupportUnits).toBe(MIN_INDEPENDENT_SUPPORT_UNITS);
    expect(policy.qualification.minStructuralScore).toBe(MIN_STRUCTURAL_SCORE);
    expect(policy.qualification.minSignificance).toBe(MIN_SIGNIFICANCE);
    expect(policy.region.maxExpansionRounds).toBe(MAX_REGION_EXPANSION_ROUNDS);
    expect(policy.region.maxRegionNodes).toBe(MAX_REGION_NODES);
    expect(policy.region.maxRegionEdges).toBe(MAX_REGION_EDGES);
    expect(policy.region.maxContextObservations).toBe(MAX_CONTEXT_OBSERVATIONS);
    expect(policy.region.maxSemanticResultsPerRound).toBe(MAX_SEMANTIC_RESULTS_PER_ROUND);
    expect(policy.region.maxTotalSemanticResults).toBe(MAX_TOTAL_SEMANTIC_RESULTS);
    expect(policy.region.maxGraphHolesPerRegion).toBe(MAX_GRAPH_HOLES_PER_REGION);
    expect(policy.aiContext.maxHypothesesInContext).toBe(MAX_HYPOTHESES_IN_CONTEXT);
    expect(policy.aiContext.maxAiAnalysesPerRegion).toBe(MAX_AI_ANALYSES_PER_REGION);
    expect(policy.aiContext.maxEvidencePerAiPackage).toBe(MAX_EVIDENCE_PER_AI_PACKAGE);
  });

  it('asserts the V1 semantic invariants explicitly', () => {
    const policy = GRAPH_HOLE_POLICY_V1;
    expect(policy.scoring.structuralComponentNotApplicableRenormalizes).toBe(true);
    expect(policy.scoring.significanceMeaning).toBe(
      'INVESTIGATIVE_PRIORITIZATION_VALUE_NOT_PROBABILITY',
    );
    expect(policy.scoring.structuralScoreWeights).toEqual({ ...STRUCTURAL_SCORE_WEIGHTS });
    expect(policy.scoring.significanceWeights).toEqual({ ...SIGNIFICANCE_WEIGHTS });
  });
});