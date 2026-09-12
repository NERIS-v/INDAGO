// ============================================================================
// Provider factory (Phase 5A-PR1.5)
//
// Explicit provider construction from a validated EmbeddingConfig. There is NO
// automatic cloud fallback and NO implicit provider switching: unknown kinds
// are a hard configuration error.
// ============================================================================

import type { EmbeddingConfig } from '../config.js';
import type { EmbeddingProvider } from '../types.js';
import { DeterministicEmbeddingProvider } from './deterministic.js';
import { OllamaEmbeddingProvider } from './ollama.js';

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider({
        ...config.ollama,
        dimensions: config.dimensions,
      });
    case 'deterministic-test':
      return new DeterministicEmbeddingProvider(config.dimensions);
    default:
      throw new TypeError(`Cannot create embedding provider for "${String(config.provider)}"`);
  }
}