// ============================================================================
// @indago/semantic-retrieval — public surface (Phase 5A-PR1.5)
// ============================================================================

// ---- Canonicalization + hashing ----
export { canonicalizeSemanticText } from './text.js';
export { sha256Hex, contentHashOf, queryHashOf } from './content-hash.js';

// ---- Vector validation ----
export { validateEmbeddingVector, toVectorLiteral, clampSimilarity } from './vector.js';

// ---- Engine types + errors ----
export {
  EmbeddingEngineError,
  TRANSIENT_EMBEDDING_ERROR_CODES,
} from './types.js';
export type {
  EmbeddingErrorCode,
  EmbeddingProvider,
  EmbeddingCandidateUnit,
  EmbeddingWriteRecord,
  EmbeddingUpsertContext,
  EmbeddingRepository,
  SemanticNeighborRow,
  SemanticNeighborQuery,
  SemanticSearchRepository,
} from './types.js';

// ---- Configuration ----
export {
  loadEmbeddingConfig,
  DEFAULT_EMBEDDING_PIPELINE,
  EMBEDDING_CONFIG_POLICY_VERSION,
} from './config.js';
export type {
  EmbeddingConfig,
  EmbeddingProviderKind,
  PipelineConfig,
  OllamaProviderConfig,
} from './config.js';

// ---- Providers (Ollama is production; deterministic-test is test-only) ----
export { OllamaEmbeddingProvider } from './providers/ollama.js';
export { DeterministicEmbeddingProvider, deterministicVectorFor } from './providers/deterministic.js';
export { createEmbeddingProvider } from './providers/factory.js';

// ---- Pipeline ----
export { EmbeddingPipeline, mapWithConcurrency } from './pipeline.js';
export type {
  EmbeddingPipelineDependencies,
  EmbeddingPipelineReport,
} from './pipeline.js';

// ---- Service (implements SemanticRetrievalPort) ----
export {
  SemanticSearchService,
  DEFAULT_SEMANTIC_SEARCH_LIMIT,
  DEFAULT_SEMANTIC_SEARCH_THRESHOLD,
} from './service.js';
export type {
  SemanticSearchServiceDependencies,
  SemanticSearchServiceOptions,
} from './service.js';