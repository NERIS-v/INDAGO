import { describe, expect, it } from 'vitest';

import {
  DeterministicEmbeddingProvider,
  deterministicVectorFor,
} from '../src/providers/deterministic.js';

describe('deterministicVectorFor', () => {
  it('produces exact-dimension finite vectors', () => {
    const vector = deterministicVectorFor('Payment received 2024-07-03.', 8);
    expect(vector).toHaveLength(8);
    for (const value of vector) expect(Number.isFinite(value)).toBe(true);
  });

  it('is deterministic and order-independent of input text order', () => {
    expect(deterministicVectorFor('Payment', 8)).toEqual(deterministicVectorFor('Payment', 8));
    expect(deterministicVectorFor('Payment', 8)).not.toEqual(deterministicVectorFor('Transfer', 8));
  });

  it('ranks overlapping trigram text higher than unrelated text', () => {
    const query = 'wire transfer from account';
    const related = 'wire transfer to account';
    const unrelated = 'the cat sat on the mat';
    const q = deterministicVectorFor(query, 16);
    const r = deterministicVectorFor(related, 16);
    const u = deterministicVectorFor(unrelated, 16);
    const cosine = (a: number[], b: number[]): number =>
      a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);
    expect(cosine(q, r)).toBeGreaterThan(cosine(q, u));
  });
});

describe('DeterministicEmbeddingProvider', () => {
  it('exposes a deterministic-test identity with the configured dimensions', () => {
    const provider = new DeterministicEmbeddingProvider(16);
    expect(provider.identity).toEqual({
      providerId: 'deterministic-test',
      modelId: 'deterministic',
      modelVersion: 'v1',
      dimensions: 16,
      embeddingPolicyVersion: 'v1',
    });
  });

  it('rejects invalid dimensions at construction', () => {
    expect(() => new DeterministicEmbeddingProvider(0)).toThrow(TypeError);
    expect(() => new DeterministicEmbeddingProvider(2.5)).toThrow(TypeError);
  });

  it('embedQuery matches the single-document embed', async () => {
    const provider = new DeterministicEmbeddingProvider(8);
    const [doc] = await provider.embedDocuments(['hello world']);
    await expect(provider.embedQuery('hello world')).resolves.toEqual(doc);
  });

  it('bulk embedding preserves order', async () => {
    const provider = new DeterministicEmbeddingProvider(4);
    const vectors = await provider.embedDocuments(['a', 'b', 'c']);
    expect(vectors).toHaveLength(3);
    expect(vectors[1]).toEqual(deterministicVectorFor('b', 4));
  });

  it('healthCheck is always healthy (test-only provider)', async () => {
    await expect(new DeterministicEmbeddingProvider(8).healthCheck()).resolves.toMatchObject({
      healthy: true,
      providerId: 'deterministic-test',
    });
  });
});