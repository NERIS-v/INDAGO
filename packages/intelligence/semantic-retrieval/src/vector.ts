// ============================================================================
// Vector validation + serialization (Phase 5A-PR1.5)
//
// A vector may enter the pipeline from a provider (embedQuery/embedDocuments)
// or leave it toward storage. Validation guarantees:
//   - finite elements only (no NaN/Infinity — providers never silently pad)
//   - EXACT configured dimension count (never pad, never truncate)
//   - at least one element (empty vectors are rejected)
//
// Similarity is pgvector cosine distance in [0,2]; similarity = 1 − distance,
// clamped to [0,1] at the SERVICE boundary so contract bounds can never be
// violated by a provider's raw numerical output.
// ============================================================================

import { EmbeddingEngineError } from './types.js';

/** Validates a vector; returns the same array. Throws typed on any violation. */
export function validateEmbeddingVector(vector: number[], dimensions: number): number[] {
  if (!Array.isArray(vector)) {
    throw new EmbeddingEngineError(
      'INVALID_EMBEDDING_VECTOR',
      'Provider returned a non-array vector',
    );
  }
  if (vector.length !== dimensions) {
    throw new EmbeddingEngineError(
      'DIMENSION_MISMATCH',
      `Provider returned ${vector.length} dimensions, expected ${dimensions}`,
    );
  }
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new EmbeddingEngineError(
        'INVALID_EMBEDDING_VECTOR',
        'Provider returned a non-finite vector element (NaN/Infinity/missing)',
      );
    }
  }
  return vector;
}

/** pgvector literal for a validated vector: '[0.1,0.2,…,vN]'. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/** [0,1] similarity clamp — the only place similarity bounds are enforced. */
export function clampSimilarity(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}