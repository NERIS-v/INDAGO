import { describe, it, expect } from 'vitest';
import {
  InvestigationIdSchema,
  EvidenceIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
  TimestampPrecisionSchema,
  EvidencePostureSchema,
  EntityComparisonStatusSchema,
  EntityResolutionStatusSchema,
  EntityRoleSchema,
  RelationTypeSchema,
  InvestigationRunStateSchema,
  GraphAnalysisTypeSchema,
  StructuralMetricTypeSchema,
  GraphNodeSchema,
  ResumeTransitionSchema,
  DEFAULT_RUN_STATE_CONFIGURATION,
} from '../src/index.js';
import { IngestionErrorCategorySchema } from '../src/intelligence/ingestion-errors.js';

// ============================================================================
// Schema Validation Tests
//
// Verifies that schemas reject invalid data and accept valid data.
// ============================================================================

describe('ID Schemas', () => {
  it('accepts valid UUID', () => {
    const result = InvestigationIdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID string', () => {
    const result = InvestigationIdSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = EvidenceIdSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('Timestamp Schemas', () => {
  it('accepts valid TimestampPrecision', () => {
    const result = TimestampPrecisionSchema.safeParse('exact');
    expect(result.success).toBe(true);
  });

  it('rejects invalid TimestampPrecision', () => {
    const result = TimestampPrecisionSchema.safeParse('very-exact');
    expect(result.success).toBe(false);
  });
});

describe('Evidence Posture', () => {
  it('accepts valid posture tiers', () => {
    expect(EvidencePostureSchema.safeParse('T0_OBSERVATION').success).toBe(true);
    expect(EvidencePostureSchema.safeParse('T1_INVESTIGATIVE_LEAD').success).toBe(true);
    expect(EvidencePostureSchema.safeParse('T2_CORROBORATED_LEAD').success).toBe(true);
    expect(EvidencePostureSchema.safeParse('T3_EVIDENCE_PACKAGE_CANDIDATE').success).toBe(true);
  });

  it('rejects invalid posture', () => {
    expect(EvidencePostureSchema.safeParse('T4_INVALID').success).toBe(false);
  });
});

describe('Entity Comparison Status', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'NOT_COMPARED',
      'COMPARED_AND_UNRESOLVED',
      'RESOLVED_MATCH',
      'RESOLVED_NON_MATCH',
      'REJECTED_CANDIDATE',
    ];
    for (const status of statuses) {
      expect(EntityComparisonStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});

describe('Entity Resolution Status', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'UNRESOLVED',
      'PARTIALLY_RESOLVED',
      'RESOLVED',
      'SPLIT',
      'MERGED',
      'CONTRADICTED',
    ];
    for (const status of statuses) {
      expect(EntityResolutionStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});

describe('Entity Role', () => {
  it('accepts all valid roles', () => {
    const roles = ['victim', 'suspect', 'witness', 'facilitator', 'unknown'];
    for (const role of roles) {
      expect(EntityRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects invalid role', () => {
    expect(EntityRoleSchema.safeParse('guilty').success).toBe(false);
  });
});

describe('Relation Type', () => {
  it('accepts all valid relation types', () => {
    const types = [
      'communication', 'financial', 'ownership', 'co-location',
      'association', 'organizational', 'transport', 'family',
      'vehicle', 'case-link', 'other',
    ];
    for (const type of types) {
      expect(RelationTypeSchema.safeParse(type).success).toBe(true);
    }
  });
});

describe('A: PAUSED Resumability', () => {
  it('PAUSED is in the valid run states', () => {
    expect(InvestigationRunStateSchema.safeParse('PAUSED').success).toBe(true);
  });

  it('PAUSED is NOT a valid target in ordinary transitions', () => {
    const pausedAsTarget = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.filter(
      (t) => t.to === 'PAUSED'
    );
    expect(pausedAsTarget).toHaveLength(0);
  });

  it('resume transitions define valid PAUSED targets', () => {
    expect(DEFAULT_RUN_STATE_CONFIGURATION.resumeTransitions.length).toBeGreaterThan(0);
    for (const rt of DEFAULT_RUN_STATE_CONFIGURATION.resumeTransitions) {
      expect(rt.fromState).toBe('PAUSED');
      expect(InvestigationRunStateSchema.safeParse(rt.resumeToState).success).toBe(true);
      expect(InvestigationRunStateSchema.safeParse(rt.pausedFromState).success).toBe(true);
    }
  });

  it('ResumeTransitionSchema accepts valid resume transitions', () => {
    const result = ResumeTransitionSchema.safeParse({
      fromState: 'PAUSED',
      resumeToState: 'ANALYZING',
      pausedFromState: 'ANALYZING',
    });
    expect(result.success).toBe(true);
  });

  it('ResumeTransitionSchema rejects non-PAUSED fromState', () => {
    const result = ResumeTransitionSchema.safeParse({
      fromState: 'ANALYZING',
      resumeToState: 'DISCOVERING',
      pausedFromState: 'ANALYZING',
    });
    expect(result.success).toBe(false);
  });
});

describe('B: GraphAnalysisType vs StructuralMetricType Separation', () => {
  it('GraphAnalysisType and StructuralMetricType have no overlapping values', () => {
    const analysisTypes = GraphAnalysisTypeSchema.options;
    const metricTypes = StructuralMetricTypeSchema.options as readonly string[];
    const overlap = analysisTypes.filter((at) => metricTypes.includes(at));
    expect(overlap).toHaveLength(0);
  });

  it('GraphAnalysisType accepts only valid categories', () => {
    const categories = ['CENTRALITY', 'COMMUNITY', 'PATH', 'CLUSTER', 'BRIDGE', 'ANOMALY', 'HOLE', 'CONNECTIVITY'];
    for (const cat of categories) {
      expect(GraphAnalysisTypeSchema.safeParse(cat).success).toBe(true);
    }
  });

  it('StructuralMetricType accepts only implemented graph-theoretic metrics', () => {
    const metrics = ['degree', 'community_membership'];
    for (const m of metrics) {
      expect(StructuralMetricTypeSchema.safeParse(m).success).toBe(true);
    }
  });

  it('StructuralMetricType rejects unimplemented metric names', () => {
    const unimplemented = ['weighted_degree', 'betweenness', 'closeness', 'pagerank', 'bridge_impact', 'connectivity', 'anomaly', 'path_score'];
    for (const m of unimplemented) {
      expect(StructuralMetricTypeSchema.safeParse(m).success).toBe(false);
    }
  });

  it('StructuralMetricType rejects criminality values', () => {
    expect(StructuralMetricTypeSchema.safeParse('isCriminal').success).toBe(false);
    expect(StructuralMetricTypeSchema.safeParse('isGuilty').success).toBe(false);
    expect(StructuralMetricTypeSchema.safeParse('suspectProbability').success).toBe(false);
  });

  it('valid documented pairings exist', () => {
    const validPairings = [
      { analysis: 'CENTRALITY', metric: 'degree' },
      { analysis: 'COMMUNITY', metric: 'community_membership' },
    ];
    for (const pairing of validPairings) {
      expect(GraphAnalysisTypeSchema.safeParse(pairing.analysis).success).toBe(true);
      expect(StructuralMetricTypeSchema.safeParse(pairing.metric).success).toBe(true);
    }
  });
});

describe('G: Generic Confidence Rejection', () => {
  it('GraphNodeSchema rejects data with unknown confidence field', () => {
    const result = GraphNodeSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      investigationId: '550e8400-e29b-41d4-a716-446655440000',
      versionId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'ENTITY',
      label: 'Test',
      structuralImportance: 0.5,
      observationCount: 1,
      sourceCount: 1,
      confidence: 0.99,
      createdAt: { value: '2025-01-15T10:10:00Z', precision: 'exact' },
      updatedAt: { value: '2025-01-15T10:10:00Z', precision: 'exact' },
    });
    expect(result.success).toBe(false);
  });
});

describe('M-PR2: IngestionErrorCategory UNSUPPORTED_FORMAT', () => {
  it('IngestionErrorCategorySchema accepts UNSUPPORTED_FORMAT', () => {
    const result = IngestionErrorCategorySchema.safeParse('UNSUPPORTED_FORMAT');
    expect(result.success).toBe(true);
  });

  it('IngestionErrorCategorySchema rejects invalid category', () => {
    const result = IngestionErrorCategorySchema.safeParse('UNSUPPORTED_PARSER');
    expect(result.success).toBe(false);
  });
});

describe('M-PR3: IngestionErrorCategory EXTRACTION_FAILED and MALFORMED_ARTIFACT', () => {
  it('IngestionErrorCategorySchema accepts EXTRACTION_FAILED', () => {
    const result = IngestionErrorCategorySchema.safeParse('EXTRACTION_FAILED');
    expect(result.success).toBe(true);
  });

  it('IngestionErrorCategorySchema accepts MALFORMED_ARTIFACT', () => {
    const result = IngestionErrorCategorySchema.safeParse('MALFORMED_ARTIFACT');
    expect(result.success).toBe(true);
  });
});

describe('Failure Transitions (INGESTION_PERMANENT_FAILURE)', () => {
  it('CREATED → FAILED is a valid transition', () => {
    const t = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
      (x) => x.from === 'CREATED' && x.to === 'FAILED',
    );
    expect(t).toBeDefined();
    expect(t!.trigger).toBe('INGESTION_PERMANENT_FAILURE');
  });

  it('INGESTING → FAILED is a valid transition', () => {
    const t = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
      (x) => x.from === 'INGESTING' && x.to === 'FAILED',
    );
    expect(t).toBeDefined();
    expect(t!.trigger).toBe('INGESTION_PERMANENT_FAILURE');
  });

  it('NORMALIZING → FAILED is a valid transition (M-A05 permanent normalization failure)', () => {
    const t = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
      (x) => x.from === 'NORMALIZING' && x.to === 'FAILED',
    );
    expect(t).toBeDefined();
    expect(t!.trigger).toBe('INGESTION_PERMANENT_FAILURE');
  });

  it('FAILED is reachable only through the INGESTION_PERMANENT_FAILURE trigger from pipeline states', () => {
    const intoFailed = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.filter(
      (x) =>
        x.to === 'FAILED' &&
        x.from !== 'INGESTING' &&
        x.from !== 'CREATED' &&
        x.from !== 'NORMALIZING',
    );
    expect(intoFailed).toHaveLength(0);
  });
});
