// ============================================================================
// Graph-Hole Analysis — output schema tests (Phase 5A-PR7)
//
// Verifies the GraphHoleAnalysisV1 schema: strict object rejection of
// unknown fields, required fields, enum enforcement, the reasoning guard,
// and runtime JSON-Schema conversion without disallowed constructs.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  GraphHoleAnalysisV1Schema,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
} from '../src/index.js';

/**
 * A minimal but fully conforming GraphHoleAnalysisV1 that passes zod
 * parsing. Every array field is present even when empty; direction is
 * explicitly set (NOT defaulted).
 */
function validMinimal() {
  return {
    candidateAssessment: 'WEAKLY_SUPPORTED',
    missingRelationship: {
      expectedRelationshipType: 'communication',
      direction: 'UNKNOWN',
      assessment: 'CONSISTENT_WITH_GAP',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      supportingHypothesisIds: [],
      groupedHypothesisId: null,
    },
    supportingObservationIds: [],
    contradictingObservationIds: [],
    supportingHypothesisIds: [],
    groupedHypothesisId: null,
    alternativeExplanations: [],
    reasoning: [
      {
        id: 'R1',
        kind: 'STRUCTURAL_SIGNAL',
        statement: 'Three nodes form a chain with a missing direct edge.',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ],
    recommendedEvidence: [],
    uncertainty: { rating: 'MEDIUM', note: null },
    warnings: [],
  };
}

describe('GraphHoleAnalysisV1Schema', () => {
  it('parses a minimal conforming object without error', () => {
    const result = GraphHoleAnalysisV1Schema.safeParse(validMinimal());
    expect(result.success).toBe(true);
  });

  it('rejects objects with unknown top-level fields (zod strict)', () => {
    const result = GraphHoleAnalysisV1Schema.safeParse({
      ...validMinimal(),
      spurious: 'should not be here',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects objects with unknown fields nested in missingRelationship', () => {
    const result = GraphHoleAnalysisV1Schema.safeParse({
      ...validMinimal(),
      missingRelationship: {
        ...validMinimal().missingRelationship,
        extraField: 123,
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects when reasoning is an empty array', () => {
    const result = GraphHoleAnalysisV1Schema.safeParse({
      ...validMinimal(),
      reasoning: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('reasoning must contain at least one step');
    }
  });

  it('rejects invalid enum values for candidateAssessment', () => {
    const result = GraphHoleAnalysisV1Schema.safeParse({
      ...validMinimal(),
      candidateAssessment: 'CONFIDENT',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid enum values for direction (not optional/default)', () => {
    const result = GraphHoleAnalysisV1Schema.safeParse({
      ...validMinimal(),
      missingRelationship: {
        ...validMinimal().missingRelationship,
        direction: 'CLOCKWISE',
      },
    });
    expect(result.success).toBe(false);
  });

  it('requires groupedHypothesisId to be nullable (null accepted)', () => {
    const base = validMinimal();
    const withNull = GraphHoleAnalysisV1Schema.safeParse({
      ...base,
      groupedHypothesisId: null,
    });
    expect(withNull.success).toBe(true);
  });

  it('converts to JSON-Schema without $ref or $defs (runtime integration)', async () => {
    const { convertSchemaDocument } = await import('@indago/ai-agent-runtime');
    const doc = convertSchemaDocument(GraphHoleAnalysisV1Schema, { maxBytes: 50_000 });
    const json = doc.schema as Record<string, unknown>;
    expect(json).toBeDefined();
    expect(json['$ref']).toBeUndefined();
    expect(json['$defs']).toBeUndefined();
    expect(json['definitions']).toBeUndefined();
    expect(json.additionalProperties).toBe(false);
  });
});