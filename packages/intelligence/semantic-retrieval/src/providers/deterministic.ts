// ============================================================================
// Deterministic test embedding provider (Phase 5A-PR1.5)
//
// TEST-ONLY provider that never touches a network. Vectors are a deterministic
// random-projection of character-trigram features:
//   - identical texts → identical vectors
//   - overlapping trigrams → correlated vectors (meaningful cosine similarity)
//   - fixed dimensions, finite values, unit-magnitude after projection
//
// Deliberately NOT exported from the package index as a production default: it
// exists so unit tests and DB integration tests exercise the FULL pipeline and
// retrieval path without Ollama. Only use it in tests/demo config.
// ============================================================================

import type { EmbeddingProviderHealth } from '@indago/contracts';
import type { EmbeddingProvider } from '../types.js';

import { sha256Hex } from '../content-hash.js';

function trigramsOf(text: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    grams.push(text.slice(i, i + 3));
  }
  return grams.length > 0 ? grams : ['\u0000'];
}

export function deterministicVectorFor(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const grams = trigramsOf(text);
  for (const gram of grams) {
    const digest = sha256Hex(gram);
    for (let d = 0; d < dimensions; d += 1) {
      const byte = Number.parseInt(digest.slice((d * 2) % 64, (d * 2) % 64 + 2), 16);
      const sign = byte >= 128 ? 1 : -1;
      vector[d] = (vector[d] ?? 0) + sign * ((byte % 32) + 1);
    }
  }
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);
  const normalized = magnitude > 0 ? vector.map((value) => value / magnitude) : vector;
  return normalized.map((value) => (Number.isFinite(value) ? value : 0));
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly identity: {
    readonly providerId: 'deterministic-test';
    readonly modelId: 'deterministic';
    readonly modelVersion: 'v1';
    readonly dimensions: number;
    readonly embeddingPolicyVersion: 'v1';
  };

  constructor(readonly dimensions = 8) {
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new TypeError(`DeterministicEmbeddingProvider dimensions must be a positive integer, got ${dimensions}`);
    }
    this.identity = {
      providerId: 'deterministic-test',
      modelId: 'deterministic',
      modelVersion: 'v1',
      dimensions,
      embeddingPolicyVersion: 'v1',
    };
  }

  async embedQuery(text: string): Promise<number[]> {
    return deterministicVectorFor(text, this.identity.dimensions);
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => deterministicVectorFor(text, this.identity.dimensions));
  }

  async healthCheck(): Promise<EmbeddingProviderHealth> {
    return {
      providerId: this.identity.providerId,
      modelId: this.identity.modelId,
      modelVersion: this.identity.modelVersion,
      dimensions: this.identity.dimensions,
      healthy: true,
    };
  }
}