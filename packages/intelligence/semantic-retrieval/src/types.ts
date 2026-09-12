// ============================================================================
// Semantic retrieval types (Phase 5A-PR1.5)
//
// Engine-owned interfaces and the typed failure taxonomy. Persistent
// repositories (Postgres/pgvector) implement the repository interfaces BELOW
// this package's boundary; the pipeline and service depend on the interfaces,
// never on a concrete store.
//
// Provider failure taxonomy (frozen):
//   PROVIDER_UNAVAILABLE      — provider unreachable / connection failed
//   PROVIDER_TIMEOUT          — provider exceeded the configured timeout
//   PROVIDER_RATE_LIMITED     — provider returned an explicit rate-limit signal
//   PROVIDER_INVALID_RESPONSE — provider responded with an unusable payload
//   DIMENSION_MISMATCH        — vector length ≠ configured pipeline dimensions
//   MODEL_UNSUPPORTED         — the target model is not available on the provider
//   EMBEDDING_STORAGE_FAILURE — persistence of an embedding failed
//   VECTOR_QUERY_FAILURE      — nearest-neighbour query failed
//
// Failure discipline: a transient provider failure (UNAVAILABLE/TIMEOUT/
// RATE_LIMITED) is retried a BOUNDED number of times, then rethrown — never
// silently downgraded to an empty vector or empty result set.
// ============================================================================

import type {
  EmbeddingProviderHealth,
  EmbeddingProviderIdentity,
  TemporalInterval,
} from '@indago/contracts';
import type { SemanticSourceType } from '@indago/contracts';

export type EmbeddingErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'DIMENSION_MISMATCH'
  | 'MODEL_UNSUPPORTED'
  | 'EMBEDDING_STORAGE_FAILURE'
  | 'VECTOR_QUERY_FAILURE'
  | 'EMPTY_SEMANTIC_TEXT'
  | 'INVALID_EMBEDDING_VECTOR';

/** Codes for which a bounded retry is permitted (all others are dead-ends). */
export const TRANSIENT_EMBEDDING_ERROR_CODES: ReadonlySet<EmbeddingErrorCode> = new Set([
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
]);

export class EmbeddingEngineError extends Error {
  constructor(
    readonly code: EmbeddingErrorCode,
    message: string,
    options: ErrorOptions & { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = 'EmbeddingEngineError';
  }
}

/**
 * Embedding provider abstraction. Deterministic: the same canonical text MUST
 * yield the same vector for the same provider identity (no randomness, no
 * session state, no wall-clock influence on the vector).
 */
export interface EmbeddingProvider {
  readonly identity: EmbeddingProviderIdentity;
  /** Embed one canonical query text → vector. Length === identity.dimensions. */
  embedQuery(text: string): Promise<number[]>;
  /** Embed many canonical texts in one batched provider call, order preserved. */
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  /** Reachability + model-availability probe. Never throws. */
  healthCheck(): Promise<EmbeddingProviderHealth>;
}

/** A unit the pipeline considers for (re)indexing. */
export interface EmbeddingCandidateUnit {
  readonly semanticTextUnitId: string;
  readonly contentHash: string;
}

export interface EmbeddingUpsertContext {
  readonly caseId: string;
}

/** Durable embedding row to write (vector as plain array — store serializes). */
export interface EmbeddingWriteRecord {
  readonly semanticTextUnitId: string;
  readonly caseId: string;
  readonly contentHash: string;
  readonly providerIdentity: EmbeddingProviderIdentity;
  readonly vector: number[];
}

/**
 * Deterministic embedding persistence boundary. All reads are scoped by caseId
 * and by the provider identity, so a provider swap never mixes vectors.
 */
export interface EmbeddingRepository {
  /** Unit ids that already have a CURRENT embedding (same identity + same contentHash). */
  findCurrent(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]>;
  /** Unit ids with no embedding row at all for THIS identity. */
  findMissing(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]>;
  /** Unit ids whose embedding row exists but whose stored contentHash is stale. */
  findStale(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]>;
  /** Idempotent upsert (identity keyed); returns the number of rows upserted. */
  upsertMany(records: readonly EmbeddingWriteRecord[]): Promise<number>;
}

/**
 * One row returned by the nearest-neighbour repository. The repository owns
 * similarity calculation (pgvector), threshold filtering, case isolation,
 * temporal filtering, deduplication and the deterministic ORDER BY — the
 * service only normalizes distance → [0,1] similarity and assembles the result.
 */
export interface SemanticNeighborRow {
  readonly distance: number;
  readonly semanticTextUnitId: string;
  readonly contentHash: string;
  readonly normalizedText: string;
  readonly sourceType: SemanticSourceType;
  readonly sourceId: string;
  readonly temporalScope?: TemporalInterval | null;
}

export interface SemanticNeighborQuery {
  readonly caseId: string;
  readonly queryVector: number[];
  readonly providerIdentity: EmbeddingProviderIdentity;
  /** Only units whose embedding contentHash matches the CURRENT unit text are searched. */
  readonly limit: number;
  readonly threshold: number;
  readonly temporalContext?: TemporalInterval | null;
}

export interface SemanticSearchRepository {
  /**
   * Deterministic nearest-neighbour search: distance ASC (== similarity DESC),
   * ties broken by semanticTextUnitId ASC. Case isolation + temporal filtering
   * are enforced HERE (in SQL), never in application memory.
   */
  findNearestNeighbors(query: SemanticNeighborQuery): Promise<readonly SemanticNeighborRow[]>;
}