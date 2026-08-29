import { describe, it, expect } from 'vitest';
import {
  NormalizedExtractionSchema,
  NormalizationStatusSchema,
  NormalizationProvenanceSchema,
  NormalizationConfigSchema,
  DEFAULT_NORMALIZATION_CONFIG,
  AuditActionSchema,
} from '../src/index.js';

const VALID_ATTEMPT_ID = '550e8400-e29b-41d4-a716-446655440100';
const VALID_ARTIFACT_ID = '550e8400-e29b-41d4-a716-446655440101';
const VALID_INVESTIGATION_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CASE_ID = '550e8400-e29b-41d4-a716-446655440010';

const validNormalizedExtraction = {
  attemptId: VALID_ATTEMPT_ID,
  artifactId: VALID_ARTIFACT_ID,
  investigationId: VALID_INVESTIGATION_ID,
  caseId: VALID_CASE_ID,
  normalizerId: 'indago-text-canonicalizer',
  normalizerVersion: '1.0.0',
  config: DEFAULT_NORMALIZATION_CONFIG,
  canonicalFields: [
    {
      rawValue: '  01/02/2026  ',
      normalizedValue: null,
      type: 'date',
      normalizationStatus: 'AMBIGUOUS',
      confidence: 1,
      sourceReference: {
        kind: 'csv-cell',
        detail: { rowNumber: 2, columnIndex: 0, columnName: 'date' },
      },
    },
    {
      rawValue: 'John.Doe@Example.COM',
      normalizedValue: 'john.doe@example.com',
      type: 'email',
      normalizationStatus: 'NORMALIZED',
      confidence: 0.99,
      sourceReference: {
        kind: 'csv-cell',
        detail: { rowNumber: 2, columnIndex: 1, columnName: 'email' },
      },
    },
  ],
  quality: {
    completeness: 0.8,
    statusCounts: {
      normalized: 1,
      unchanged: 0,
      ambiguous: 1,
      unparsed: 0,
      invalid: 0,
    },
    perFieldConfidence: [1, 0.99],
    cleanliness: { whitespaceCollapsed: true },
    warnings: { totalCount: 0, byCode: {} },
  },
  lexicalStatistics: {
    tokenCount: 4,
    uniqueTokenCount: 4,
    averageTokenLength: 4,
    topTokens: [
      { token: 'john', count: 1 },
      { token: 'doe', count: 1 },
    ],
    topBigrams: [{ bigram: 'john doe', count: 1 }],
  },
};

describe('NormalizationStatusSchema', () => {
  it('accepts all documented statuses', () => {
    for (const s of ['NORMALIZED', 'UNCHANGED', 'AMBIGUOUS', 'UNPARSED', 'INVALID']) {
      expect(NormalizationStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    expect(NormalizationStatusSchema.safeParse('GUESSED').success).toBe(false);
  });
});

describe('NormalizationProvenanceSchema', () => {
  it('accepts valid provenance', () => {
    expect(
      NormalizationProvenanceSchema.safeParse({
        attemptId: VALID_ATTEMPT_ID,
        investigationId: VALID_INVESTIGATION_ID,
        caseId: VALID_CASE_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects missing attemptId', () => {
    const { attemptId: _, ...rest } = {
      attemptId: VALID_ATTEMPT_ID,
      investigationId: VALID_INVESTIGATION_ID,
      caseId: VALID_CASE_ID,
    };
    expect(NormalizationProvenanceSchema.safeParse(rest).success).toBe(false);
  });
});

describe('NormalizationConfigSchema', () => {
  it('accepts the default config', () => {
    expect(NormalizationConfigSchema.safeParse(DEFAULT_NORMALIZATION_CONFIG).success).toBe(true);
  });

  it('rejects config with missing policy version', () => {
    const { policyVersion: _, ...rest } = DEFAULT_NORMALIZATION_CONFIG;
    expect(NormalizationConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects config with negative maxTokens', () => {
    expect(
      NormalizationConfigSchema.safeParse({
        ...DEFAULT_NORMALIZATION_CONFIG,
        tokenHints: { ...DEFAULT_NORMALIZATION_CONFIG.tokenHints, maxTokens: 0 },
      }).success,
    ).toBe(false);
  });
});

describe('NormalizedExtractionSchema', () => {
  it('accepts valid extraction', () => {
    const result = NormalizedExtractionSchema.safeParse(validNormalizedExtraction);
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID attemptId', () => {
    const result = NormalizedExtractionSchema.safeParse({
      ...validNormalizedExtraction,
      attemptId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID artifactId', () => {
    const result = NormalizedExtractionSchema.safeParse({
      ...validNormalizedExtraction,
      artifactId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid normalizationStatus', () => {
    const result = NormalizedExtractionSchema.safeParse({
      ...validNormalizedExtraction,
      canonicalFields: [
        {
          ...validNormalizedExtraction.canonicalFields[0],
          normalizationStatus: 'GUESSED',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects per-field confidence out of range', () => {
    const result = NormalizedExtractionSchema.safeParse({
      ...validNormalizedExtraction,
      quality: {
        ...validNormalizedExtraction.quality,
        perFieldConfidence: [1.5, 0.5],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts AMBIGUOUS field with null normalizedValue', () => {
    const result = NormalizedExtractionSchema.safeParse(validNormalizedExtraction);
    expect(result.success).toBe(true);
  });

  it('rejects extra fields (strict)', () => {
    const result = NormalizedExtractionSchema.safeParse({
      ...validNormalizedExtraction,
      hackerField: 'inject',
    });
    expect(result.success).toBe(false);
  });

  it('JSON round-trip preserves all fields', () => {
    const parsed = NormalizedExtractionSchema.parse(validNormalizedExtraction);
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(Object.keys(roundTripped).sort()).toEqual([
      'artifactId',
      'attemptId',
      'canonicalFields',
      'caseId',
      'config',
      'investigationId',
      'lexicalStatistics',
      'normalizerId',
      'normalizerVersion',
      'quality',
    ]);
  });
});

describe('AuditActionSchema: M-A05 additions', () => {
  it('accepts NORMALIZATION_STORED', () => {
    expect(AuditActionSchema.safeParse('NORMALIZATION_STORED').success).toBe(true);
  });

  it('accepts NORMALIZATION_COMPLETED', () => {
    expect(AuditActionSchema.safeParse('NORMALIZATION_COMPLETED').success).toBe(true);
  });

  it('accepts NORMALIZATION_FAILED', () => {
    expect(AuditActionSchema.safeParse('NORMALIZATION_FAILED').success).toBe(true);
  });
});