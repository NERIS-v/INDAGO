// ============================================================================
// SemanticSearchService (Phase 5A-PR1.5)
//
// Implements the SemanticRetrievalPort over {embedding provider + nearest
// neighbour repository}. The service owns:
//   - canonicalization of the raw query (deterministic)
//   - embedding the query through the SAME provider used for indexing
//   - the deterministic query hash ({caseId, canonical query, temporal context})
//   - default limit/threshold policy
//   - similarity normalization (1 − cosine distance, clamped to [0,1])
//
// The repository owns everything that must happen in SQL: case isolation,
// temporal filtering, threshold filtering, deduplication and the deterministic
// ORDER BY (distance ASC, unit id ASC). The service never re-orders, never
// re-filters case boundaries in memory, and never resolves text to entities.
// ============================================================================

import type {
  SemanticRetrievalPort,
  SemanticRetrievalResult,
  SemanticSearchRequest,
} from '@indago/contracts';

import { queryHashOf } from './content-hash.js';
import { canonicalizeSemanticText } from './text.js';
import type { EmbeddingProvider, SemanticSearchRepository } from './types.js';
import { clampSimilarity, validateEmbeddingVector } from './vector.js';

export interface SemanticSearchServiceDependencies {
  readonly provider: EmbeddingProvider;
  readonly repository: SemanticSearchRepository;
}

export interface SemanticSearchServiceOptions {
  /** Default result limit when the request does not specify one. */
  readonly limit?: number;
  /** Default minimum similarity [0,1] when the request does not specify one. */
  readonly threshold?: number;
}

export const DEFAULT_SEMANTIC_SEARCH_LIMIT = 20;
export const DEFAULT_SEMANTIC_SEARCH_THRESHOLD = 0;

export class SemanticSearchService implements SemanticRetrievalPort {
  constructor(
    private readonly deps: SemanticSearchServiceDependencies,
    private readonly options: SemanticSearchServiceOptions = {},
  ) {}

  async retrieve(request: SemanticSearchRequest): Promise<SemanticRetrievalResult> {
    const canonicalQuery = canonicalizeSemanticText(request.query);

    const queryVector = await this.deps.provider.embedQuery(canonicalQuery);
    validateEmbeddingVector(queryVector, this.deps.provider.identity.dimensions);

    const queryHash = queryHashOf({
      caseId: request.caseId,
      canonicalQuery,
      temporalContext: request.temporalContext ?? null,
    });

    const limit = request.limit ?? this.options.limit ?? DEFAULT_SEMANTIC_SEARCH_LIMIT;
    const threshold =
      request.threshold ?? this.options.threshold ?? DEFAULT_SEMANTIC_SEARCH_THRESHOLD;

    const rows = await this.deps.repository.findNearestNeighbors({
      caseId: request.caseId,
      queryVector,
      providerIdentity: this.deps.provider.identity,
      limit,
      threshold,
      temporalContext: request.temporalContext ?? null,
    });

    const identity = this.deps.provider.identity;
    const results = rows.map((row) => ({
      semanticTextUnitId: row.semanticTextUnitId,
      contentHash: row.contentHash,
      providerId: identity.providerId,
      modelId: identity.modelId,
      modelVersion: identity.modelVersion,
      dimensions: identity.dimensions,
      embeddingPolicyVersion: identity.embeddingPolicyVersion,
      similarity: clampSimilarity(1 - row.distance),
      normalizedText: row.normalizedText,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      ...(row.temporalScope !== undefined ? { temporalScope: row.temporalScope } : {}),
    }));

    const truncated = results.length >= limit;

    return {
      caseId: request.caseId,
      queryHash,
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: identity.embeddingPolicyVersion,
      results,
      truncated,
    };
  }
}