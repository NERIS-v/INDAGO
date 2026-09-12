import { describe, expect, it } from 'vitest';

import { EmbeddingEngineError } from '../src/types.js';
import { clampSimilarity, toVectorLiteral, validateEmbeddingVector } from '../src/vector.js';

describe('validateEmbeddingVector', () => {
  it('accepts an exact-dimension finite vector', () => {
    const vector = [0.1, -0.2, 0.3];
    expect(validateEmbeddingVector(vector, 3)).toBe(vector);
  });

  it('rejects wrong dimension count with DIMENSION_MISMATCH', () => {
    try {
      validateEmbeddingVector([0.1, 0.2], 3);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EmbeddingEngineError);
      expect((error as EmbeddingEngineError).code).toBe('DIMENSION_MISMATCH');
    }
  });

  it('rejects NaN/Infinity/missing elements', () => {
    for (const bad of [[NaN, 0.5], [Infinity, 0.5], [-Infinity, 0.5], [undefined]] as number[][]) {
      expect(() => validateEmbeddingVector(bad, 2)).toThrow(EmbeddingEngineError);
    }
  });

  it('rejects non-array input', () => {
    expect(() => validateEmbeddingVector('0.1' as unknown as number[], 2)).toThrow(
      EmbeddingEngineError,
    );
  });
});

describe('toVectorLiteral', () => {
  it('produces a pgvector parseable literal', () => {
    expect(toVectorLiteral([0.1, -0.2, 1])).toBe('[0.1,-0.2,1]');
  });
});

describe('clampSimilarity', () => {
  it('clamps into [0,1]', () => {
    expect(clampSimilarity(1.4)).toBe(1);
    expect(clampSimilarity(-0.3)).toBe(0);
    expect(clampSimilarity(0.82)).toBe(0.82);
  });

  it('treats non-finite input as 0', () => {
    expect(clampSimilarity(Number.NaN)).toBe(0);
    expect(clampSimilarity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});