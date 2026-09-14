// ============================================================================
// Semantic Retrieval (Phase 5A-PR1.5)
//
// Schema/type COMMITMENTS for the embedding + semantic-retrieval subsystem,
// deliberately kept independent of any concrete provider (Ollama now, cloud
// later) and of any storage engine (pgvector now). This module is contract
// ONLY. It declares NOTHING about batching, concurrency, retries, ranking
// internals or provider selection — those live in @indago/semantic-retrieval.
//
// Vocabulary:
//   - A SemanticTextUnit is the ATOMIC retrievable text item (a normalized
//     slice of an observation/evidence/artifact/document) that MAY be embedded.
//     It carries NO truth value and NO evidence authority: it is a recall
//     surface, never a conclusion.
//   - An Embedding is a vector trained ON a canonicalized text unit, bound to a
//     provider identity (providerId + modelId + modelVersion) and a policy
//     version. identity = semanticTextUnitId + contentHash + provider id +
//     model id + model version + dimensions + embeddingPolicyVersion.
//   - Similarity is dimensionless, in [0, 1], higher = more similar, and is a
//     RANKING signal only — never a probability, never a truth metric.
//
// Boundary statements (frozen):
//   - Semantic retrieval is a RECALL/context layer. It is NOT the authority for
//     entity/relation resolution (M-A09/M-A10 remain authoritative).
//   - Semantic ranking never creates graphs, entities, relations, hypotheses,
//     or evidence requests, and never mutates canonical state.
//   - A query never crosses case boundaries; case isolation is enforced at the
//     persistence boundary (in SQL), never in application memory.
//   - Retrieved text MAY be untrusted provider/evidence content. Callers must
//     treat it as data, never as instructions.
// ============================================================================

import { z } from 'zod';

import { CaseIdSchema } from '../common/ids.js';
import { TemporalIntervalSchema } from '../common/timestamps.js';
import {
  EMBEDDING_POLICY_VERSION,
  SEMANTIC_RETRIEVAL_POLICY_VERSION,
} from './graph-hole-policy.js';

// ============================================================================
// Source classification
// ============================================================================

/** The kind of original domain object a semantic text unit was derived from. */
export const SemanticSourceTypeSchema = z.enum([
  'OBSERVATION',
  'EVIDENCE',
  'ARTIFACT',
  'DOCUMENT',
]);
export type SemanticSourceType = z.infer<typeof SemanticSourceTypeSchema>;

// ============================================================================
// Semantic text unit
// ============================================================================

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const SemanticTextUnitSchema = z.object({
  /** Deterministic UUID (SHA-256 of the canonicalized text) — retry/race safe. */
  id: z.string().uuid(),
  caseId: CaseIdSchema,
  sourceType: SemanticSourceTypeSchema,
  /** Canonical id of the source domain object (e.g. an ObservationId). */
  sourceId: z.string().uuid(),
  normalizedText: z.string().trim().min(1),
  /** SHA-256 (hex) of normalizedText — content-addressed identity. */
  contentHash: z.string().regex(SHA256_HEX),
  /** Optional M-A12 temporal interval of the underlying source claim. */
  temporalScope: TemporalIntervalSchema.nullable().optional(),
}).strict();
export type SemanticTextUnit = z.infer<typeof SemanticTextUnitSchema>;

// ============================================================================
// Embedding identity + provider identity
// ============================================================================

/**
 * The provider/model half of an embedding's identity. Combined with the target
 * semanticTextUnitId + contentHash it fully identifies one embedding row.
 */
export const EmbeddingProviderIdentitySchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  dimensions: z.number().int().positive(),
  embeddingPolicyVersion: z.literal(EMBEDDING_POLICY_VERSION),
}).strict();
export type EmbeddingProviderIdentity = z.infer<typeof EmbeddingProviderIdentitySchema>;

/** Full embedding identity — the versioned, content-addressed key of one vector. */
export const EmbeddingIdentitySchema = EmbeddingProviderIdentitySchema.extend({
  semanticTextUnitId: z.string().uuid(),
  contentHash: z.string().regex(SHA256_HEX),
}).strict();
export type EmbeddingIdentity = z.infer<typeof EmbeddingIdentitySchema>;

// ============================================================================
// Search + retrieval result contracts
// ============================================================================

export const SimilaritySchema = z.number().min(0).max(1);
export type Similarity = z.infer<typeof SimilaritySchema>;

/**
 * One retrieval hit. `providerId`/`modelId`/`modelVersion`/`dimensions`/
 * `embeddingPolicyVersion` identify WHICH embedding matched; `normalizedText`
 * is the canonicalized retrievable text (a recall target, never instructions).
 */
export const SemanticSearchResultSchema = z.object({
  semanticTextUnitId: z.string().uuid(),
  contentHash: z.string().regex(SHA256_HEX),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  dimensions: z.number().int().positive(),
  embeddingPolicyVersion: z.literal(EMBEDDING_POLICY_VERSION),
  similarity: SimilaritySchema,
  normalizedText: z.string(),
  sourceType: SemanticSourceTypeSchema,
  sourceId: z.string().uuid(),
  temporalScope: TemporalIntervalSchema.nullable().optional(),
}).strict();
export type SemanticSearchResult = z.infer<typeof SemanticSearchResultSchema>;

/** Query hash: SHA-256 over {caseId, canonicalized query, temporalContext}. */
export const SemanticQueryHashSchema = z.string().regex(SHA256_HEX);
export type SemanticQueryHash = z.infer<typeof SemanticQueryHashSchema>;

/**
 * Envelope returned by the semantic-retrieval port. Always carries the query
 * hash and the retrieval + embedding policy versions so consumers can detect
 * stale indexes across policy bumps.
 */
export const SemanticRetrievalResultSchema = z.object({
  caseId: CaseIdSchema,
  queryHash: SemanticQueryHashSchema,
  semanticRetrievalPolicyVersion: z.literal(SEMANTIC_RETRIEVAL_POLICY_VERSION),
  embeddingPolicyVersion: z.literal(EMBEDDING_POLICY_VERSION),
  results: z.array(SemanticSearchResultSchema),
  /**
   * true when MORE THAN `limit` matching units existed and the returned list
   * was capped by the requested limit — i.e. retrieval was genuinely
   * incomplete. An exactly-full result set (results.length === limit) is
   * NOT truncated. Derived from an observed overflow probe, never from
   * "we hit the page size".
   */
  truncated: z.boolean(),
}).strict();
export type SemanticRetrievalResult = z.infer<typeof SemanticRetrievalResultSchema>;

export const SemanticSearchRequestSchema = z.object({
  caseId: CaseIdSchema,
  query: z.string().min(1),
  /** Narrow the analysis window (M-A12). Retrieval excludes non-overlapping units. */
  temporalContext: TemporalIntervalSchema.nullable().optional(),
  /** Max hits (1..50). Default applied by the service. */
  limit: z.number().int().min(1).max(50).optional(),
  /** Minimum similarity in [0,1] for a hit. Default applied by the service. */
  threshold: z.number().min(0).max(1).optional(),
}).strict();
export type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;

/**
 * The dependency-inversion boundary PR1's semantic seam (PR2 expansion) and the
 * search service both honor. PR1 MUST keep running with NO implementation; the
 * seam stays optional and never gates a valid region.
 */
export interface SemanticRetrievalPort {
  retrieve(request: SemanticSearchRequest): Promise<SemanticRetrievalResult>;
}

// ============================================================================
// Provider health
// ============================================================================

export const EmbeddingProviderHealthSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  dimensions: z.number().int().positive(),
  healthy: z.boolean(),
  /** Populated when healthy === false. */
  error: z.string().optional(),
}).strict();
export type EmbeddingProviderHealth = z.infer<typeof EmbeddingProviderHealthSchema>;