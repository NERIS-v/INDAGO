// ============================================================================
// Embedding pipeline (Phase 5A-PR1.5)
//
// Deterministic indexing path:
//   1. recompute canonical text + contentHash for every supplied unit
//   2. ask the repository which units are MISSING or STALE for the provider
//      identity (nothing to do ⇒ ZERO provider calls — idempotent double-runs)
//   3. embed pending units in deterministic order (batches of batchSize,
//      bounded concurrency), each batch retried ONLY for transient provider
//      failures (UNAVAILABLE/TIMEOUT/RATE_LIMITED), at most maxRetries times
//   4. upsert embeddings idempotently (identity keyed)
//
// A unit whose canonical text collapses to empty is SKIPPED (counted), never
// embedded. A final non-transient failure rethrows a typed
// EmbeddingEngineError — the pipeline never fabricates empty vectors or empty
// results to "succeed".
// ============================================================================

import type { SemanticTextUnit } from '@indago/contracts';

import type { PipelineConfig } from './config.js';
import { contentHashOf } from './content-hash.js';
import { canonicalizeSemanticText } from './text.js';
import {
  EmbeddingEngineError,
  TRANSIENT_EMBEDDING_ERROR_CODES,
} from './types.js';
import type {
  EmbeddingProvider,
  EmbeddingRepository,
  EmbeddingUpsertContext,
  EmbeddingWriteRecord,
} from './types.js';
import { validateEmbeddingVector } from './vector.js';

/**
 * Runs `worker` over every item with at most `limit` in flight, preserving
 * input order in the results. Deterministic concurrency for batch pipelines.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  const safeLimit = Math.max(1, limit);
  let cursor = 0;
  async function pump(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(safeLimit, items.length); i += 1) {
    workers.push(pump());
  }
  await Promise.all(workers);
  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  return error instanceof EmbeddingEngineError && TRANSIENT_EMBEDDING_ERROR_CODES.has(error.code);
}

async function withBoundedRetry<T>(
  run: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      if (!isRetryable(error) || attempt > maxRetries) throw error;
      await delay(baseDelayMs * attempt);
    }
  }
}

/** Pending unit = a unit that needs embedding now, with its canonical text. */
interface PendingUnit {
  readonly semanticTextUnitId: string;
  readonly contentHash: string;
  readonly canonicalText: string;
}

export interface EmbeddingPipelineDependencies {
  readonly provider: EmbeddingProvider;
  readonly repository: EmbeddingRepository;
}

export interface EmbeddingPipelineReport {
  /** Units supplied to embedUnits(). */
  readonly requested: number;
  /** Units whose canonical text collapsed to empty (never embedded). */
  readonly skipped: number;
  /** Units already current for the provider identity (no provider calls). */
  readonly unchanged: number;
  /** Units embedded + upserted in this run. */
  readonly embedded: number;
}

export class EmbeddingPipeline {
  constructor(
    private readonly deps: EmbeddingPipelineDependencies,
    private readonly options: { readonly pipeline: PipelineConfig },
  ) {}

  async embedUnits(
    units: readonly SemanticTextUnit[],
    ctx: EmbeddingUpsertContext,
  ): Promise<EmbeddingPipelineReport> {
    const candidates: PendingUnit[] = [];
    let skipped = 0;
    for (const unit of units) {
      let canonical: string;
      try {
        canonical = canonicalizeSemanticText(unit.normalizedText);
      } catch {
        skipped += 1;
        continue;
      }
      candidates.push({
        semanticTextUnitId: unit.id,
        contentHash: contentHashOf(canonical),
        canonicalText: canonical,
      });
    }

    if (candidates.length === 0) {
      return { requested: units.length, skipped, unchanged: 0, embedded: 0 };
    }

    const identity = this.deps.provider.identity;
    const [missing, stale] = await Promise.all([
      this.deps.repository.findMissing(candidates, identity, ctx),
      this.deps.repository.findStale(candidates, identity, ctx),
    ]);

    const pendingSet = new Set<string>([...missing, ...stale]);
    const pendingUnits = candidates.filter((candidate) =>
      pendingSet.has(candidate.semanticTextUnitId),
    );

    if (pendingUnits.length === 0) {
      return {
        requested: units.length,
        skipped,
        unchanged: candidates.length,
        embedded: 0,
      };
    }

    const { batchSize, concurrency, maxRetries, retryBaseDelayMs } = this.options.pipeline;
    const batches: PendingUnit[][] = [];
    for (let i = 0; i < pendingUnits.length; i += batchSize) {
      batches.push(pendingUnits.slice(i, i + batchSize));
    }

    const embeddedPerBatch = await mapWithConcurrency(
      batches,
      concurrency,
      (batch) => this.processBatch(batch, ctx, { maxRetries, retryBaseDelayMs }),
    );

    return {
      requested: units.length,
      skipped,
      unchanged: candidates.length - pendingUnits.length,
      embedded: embeddedPerBatch.reduce((sum, count) => sum + count, 0),
    };
  }

  private async processBatch(
    batch: readonly PendingUnit[],
    ctx: EmbeddingUpsertContext,
    retry: { maxRetries: number; retryBaseDelayMs: number },
  ): Promise<number> {
    const texts = batch.map((candidate) => candidate.canonicalText);
    const vectors = await withBoundedRetry(
      () => this.deps.provider.embedDocuments(texts),
      retry.maxRetries,
      retry.retryBaseDelayMs,
    );

    if (vectors.length !== batch.length) {
      throw new EmbeddingEngineError(
        'PROVIDER_INVALID_RESPONSE',
        `Provider returned ${vectors.length} vectors for ${batch.length} texts`,
      );
    }

    for (const vector of vectors) {
      validateEmbeddingVector(vector, this.deps.provider.identity.dimensions);
    }

    const records: EmbeddingWriteRecord[] = batch.map((candidate, index) => ({
      semanticTextUnitId: candidate.semanticTextUnitId,
      caseId: ctx.caseId,
      contentHash: candidate.contentHash,
      providerIdentity: this.deps.provider.identity,
      vector: vectors[index] as number[],
    }));

    return this.deps.repository.upsertMany(records);
  }
}