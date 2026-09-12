import { describe, expect, it } from 'vitest';

import {
  EMBEDDING_POLICY_VERSION,
  SEMANTIC_RETRIEVAL_POLICY_VERSION,
} from '../src/intelligence/graph-hole-policy.js';
import {
  EmbeddingProviderIdentitySchema,
  EmbeddingIdentitySchema,
  SemanticRetrievalResultSchema,
  SemanticSearchRequestSchema,
  SemanticSearchResultSchema,
  SemanticSourceTypeSchema,
  SemanticTextUnitSchema,
  type SemanticRetrievalPort,
} from '../src/intelligence/semantic-retrieval.js';

const caseId = '11bf5b37-e0b8-42e0-8dcf-dc8c4aefc000';
const unitId = '21bf5b37-e0b8-42e0-8dcf-dc8c4aefc001';
const sourceId = '31bf5b37-e0b8-42e0-8dcf-dc8c4aefc002';
const hash = 'a'.repeat(64);

function validUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: unitId,
    caseId,
    sourceType: 'OBSERVATION',
    sourceId,
    normalizedText: 'Payment received 2024-07-03.',
    contentHash: hash,
    ...overrides,
  };
}

function validSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    semanticTextUnitId: unitId,
    contentHash: hash,
    providerId: 'ollama',
    modelId: 'nomic-embed-text',
    modelVersion: 'latest',
    dimensions: 768,
    embeddingPolicyVersion: 'v1',
    similarity: 0.82,
    normalizedText: 'Payment received 2024-07-03.',
    sourceType: 'OBSERVATION',
    sourceId,
    ...overrides,
  };
}

describe('SemanticTextUnitSchema', () => {
  it('accepts a valid unit', () => {
    expect(SemanticTextUnitSchema.parse(validUnit())).toMatchObject({
      sourceType: 'OBSERVATION',
      normalizedText: 'Payment received 2024-07-03.',
    });
  });

  it('rejects a non-uuid caseId', () => {
    expect(() => SemanticTextUnitSchema.parse(validUnit({ caseId: 'case-1' }))).toThrow();
  });

  it('rejects an empty normalizedText', () => {
    expect(() => SemanticTextUnitSchema.parse(validUnit({ normalizedText: '   ' }))).toThrow();
  });

  it('rejects a malformed contentHash', () => {
    expect(() => SemanticTextUnitSchema.parse(validUnit({ contentHash: 'not-a-hash' }))).toThrow();
  });

  it('rejects an unknown sourceType', () => {
    const type = SemanticSourceTypeSchema.safeParse('LEDGER');
    expect(type.success).toBe(false);
    expect(SemanticSourceTypeSchema.options).toContain('DOCUMENT');
  });

  it('accepts an optional temporalScope and rejects an invalid one', () => {
    expect(
      SemanticTextUnitSchema.parse(
        validUnit({
          temporalScope: {
            validFrom: { value: '2024-07-01', precision: 'day' },
            validTo: { value: '2024-07-31', precision: 'day' },
            precision: 'day',
            semantics: 'observed',
          },
        }),
      ).temporalScope).toBeTruthy();
    expect(() =>
      SemanticTextUnitSchema.parse(validUnit({ temporalScope: { nope: true } })),
    ).toThrow();
  });
});

describe('Embedding identity schemas', () => {
  const providerIdentity = (overrides: Record<string, unknown> = {}) => ({
    providerId: 'ollama',
    modelId: 'nomic-embed-text',
    modelVersion: 'latest',
    dimensions: 768,
    embeddingPolicyVersion: 'v1',
    ...overrides,
  });

  it('accepts a valid provider identity', () => {
    expect(EmbeddingProviderIdentitySchema.parse(providerIdentity())).toBeTruthy();
  });

  it('rejects non-positive dimensions', () => {
    expect(() =>
      EmbeddingProviderIdentitySchema.parse(providerIdentity({ dimensions: 0 })),
    ).toThrow();
  });

  it('rejects any embedding policy version other than v1', () => {
    expect(() =>
      EmbeddingProviderIdentitySchema.parse(providerIdentity({ embeddingPolicyVersion: 'v2' })),
    ).toThrow();
  });

  it('full embedding identity requires unit id + contentHash', () => {
    const full = EmbeddingIdentitySchema.parse({ ...providerIdentity(), semanticTextUnitId: unitId, contentHash: hash });
    expect(full.semanticTextUnitId).toBe(unitId);
    expect(EmbeddingIdentitySchema.safeParse(providerIdentity()).success).toBe(false);
  });
});

describe('Search + retrieval contracts', () => {
  it('binds similarity to [0, 1]', () => {
    expect(SemanticSearchResultSchema.parse(validSearchResult()).similarity).toBe(0.82);
    expect(() => SemanticSearchResultSchema.parse(validSearchResult({ similarity: -0.1 }))).toThrow();
    expect(() => SemanticSearchResultSchema.parse(validSearchResult({ similarity: 1.5 }))).toThrow();
  });

  it('retrieval result envelope carries caseId, queryHash and both policy versions', () => {
    const result = SemanticRetrievalResultSchema.parse({
      caseId,
      queryHash: 'b'.repeat(64),
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: 'v1',
      results: [validSearchResult()],
      truncated: false,
    });
    expect(result.results).toHaveLength(1);
    expect(result.semanticRetrievalPolicyVersion).toBe(SEMANTIC_RETRIEVAL_POLICY_VERSION);
    expect(result.embeddingPolicyVersion).toBe(EMBEDDING_POLICY_VERSION);
  });

  it('rejects a result without case scoping', () => {
    expect(() =>
      SemanticRetrievalResultSchema.parse({
        queryHash: 'b'.repeat(64),
        semanticRetrievalPolicyVersion: 'v1',
        embeddingPolicyVersion: 'v1',
        results: [],
        truncated: false,
      }),
    ).toThrow();
  });

  it('search request bounds limit to 1..50 and threshold to [0,1]', () => {
    expect(SemanticSearchRequestSchema.parse({ caseId, query: 'x' }).limit).toBeUndefined();
    expect(() => SemanticSearchRequestSchema.parse({ caseId, query: 'x', limit: 0 })).toThrow();
    expect(() => SemanticSearchRequestSchema.parse({ caseId, query: 'x', limit: 51 })).toThrow();
    expect(() => SemanticSearchRequestSchema.parse({ caseId, query: 'x', threshold: 1.1 })).toThrow();
    expect(() => SemanticSearchRequestSchema.parse({ caseId, query: '' })).toThrow();
  });
});

describe('SemanticRetrievalPort interface conformance', () => {
  it('a service-like object satisfies the port shape', () => {
    const service = {
      retrieve: async () => ({
        caseId,
        queryHash: 'b'.repeat(64),
        semanticRetrievalPolicyVersion: 'v1',
        embeddingPolicyVersion: 'v1',
        results: [],
        truncated: false,
      }),
    };
    const port: SemanticRetrievalPort = service;
    expect(typeof port.retrieve).toBe('function');
  });
});