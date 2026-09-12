import { beforeEach, describe, expect, it } from 'vitest';

import type { SemanticTextUnit } from '@indago/contracts';

import { EmbeddingPipeline } from '../src/pipeline.js';
import { EmbeddingEngineError } from '../src/types.js';
import type { EmbeddingProvider } from '../src/types.js';
import {
  CountingProvider,
  FakeEmbeddingRepository,
  FlakyProvider,
} from './helpers/fakes.js';

const caseId = '11bf5b37-e0b8-42e0-8dcf-dc8c4aefc000';

const unitIds = Array.from({ length: 6 }, (_, i) =>
  `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
);

function makeUnit(id: string, text: string): SemanticTextUnit {
  return {
    id,
    caseId,
    sourceType: 'OBSERVATION',
    sourceId: '31bf5b37-e0b8-42e0-8dcf-dc8c4aefc002',
    normalizedText: text,
    contentHash: 'a'.repeat(64),
  };
}

const pipelineConfig = { batchSize: 2, concurrency: 2, maxRetries: 2, retryBaseDelayMs: 1 };

describe('EmbeddingPipeline', () => {
  let repository: FakeEmbeddingRepository;
  let provider: CountingProvider;

  beforeEach(() => {
    repository = new FakeEmbeddingRepository();
    provider = new CountingProvider(8);
  });

  function pipeline(): EmbeddingPipeline {
    return new EmbeddingPipeline({ provider, repository }, { pipeline: pipelineConfig });
  }

  it('embeds missing units in deterministic input order with the provider identity', async () => {
    const units = unitIds.slice(0, 5).map((id, i) => makeUnit(id, `unit text ${i}`));
    const report = await pipeline().embedUnits(units, { caseId });

    expect(report.embedded).toBe(5);
    expect(report.skipped).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(repository.written.map((r) => r.semanticTextUnitId)).toEqual(unitIds.slice(0, 5));
    for (const record of repository.written) {
      expect(record.providerIdentity.providerId).toBe('deterministic-test');
      expect(record.caseId).toBe(caseId);
      expect(record.vector).toHaveLength(8);
    }
  });

  it('recomputes the contentHash from the canonicalized text (skips stale hashes)', async () => {
    const text = '  Wire   transfer received  ';
    const report = await pipeline().embedUnits([makeUnit(unitIds[0] as string, text)], { caseId });
    expect(report.embedded).toBe(1);
    const record = repository.written[0];
    expect(record?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('makes ZERO provider calls when every unit is already current', async () => {
    const units = unitIds.slice(0, 3).map((id, i) => makeUnit(id, `unit text ${i}`));
    await pipeline().embedUnits(units, { caseId });
    const callsAfterFirst = provider.embedCalls;
    expect(callsAfterFirst).toBe(2); // batchSize 2 → [u0,u1] + [u2]

    const secondRun = await pipeline().embedUnits(units, { caseId });
    expect(provider.embedCalls).toBe(callsAfterFirst); // zero new provider calls
    expect(secondRun.embedded).toBe(0);
    expect(secondRun.unchanged).toBe(3);
  });

  it('re-embeds only stale units (content changed) and skips current ones', async () => {
    const original = unitIds.slice(0, 3).map((id, i) => makeUnit(id, `unit text ${i}`));
    await pipeline().embedUnits(original, { caseId });

    const changed = unitIds.slice(0, 3).map((id, i) =>
      makeUnit(id, i === 0 ? 'changed text' : `unit text ${i}`),
    );
    const report = await pipeline().embedUnits(changed, { caseId });

    expect(report.embedded).toBe(1);
    expect(report.unchanged).toBe(2);
    expect(provider.embedCalls).toBe(3); // 2 batches original + 1 batch stale-only
  });

  it('skips units whose canonical text collapses to empty', async () => {
    const report = await pipeline().embedUnits(
      [makeUnit(unitIds[0] as string, '   '), makeUnit(unitIds[1] as string, 'valid')],
      { caseId },
    );
    expect(report.skipped).toBe(1);
    expect(report.embedded).toBe(1);
    expect(repository.written.map((r) => r.semanticTextUnitId)).toEqual([unitIds[1]]);
  });

  it('batches beyond batchSize across multiple provider calls in order', async () => {
    const units = unitIds.map((id, i) => makeUnit(id, `unit text ${i}`));
    const report = await pipeline().embedUnits(units, { caseId });
    expect(report.embedded).toBe(6);
    expect(provider.embedCalls).toBe(3); // batchSize 2 → 3 batches
    expect(repository.written.map((r) => r.semanticTextUnitId)).toEqual(unitIds);
  });

  it('retries a transient provider failure and then succeeds', async () => {
    const flaky = new FlakyProvider(1, 8);
    const report = await new EmbeddingPipeline(
      { provider: flaky, repository },
      { pipeline: pipelineConfig },
    ).embedUnits([makeUnit(unitIds[0] as string, 'hello')], { caseId });
    expect(report.embedded).toBe(1);
  });

  it('rethrows after exhausting bounded retries on a persistent transient failure', async () => {
    const flaky = new FlakyProvider(5, 8);
    await expect(
      new EmbeddingPipeline({ provider: flaky, repository }, { pipeline: pipelineConfig }).embedUnits(
        [makeUnit(unitIds[0] as string, 'hello')],
        { caseId },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('never fabricates results: a fatal failure surfaces as a typed error', async () => {
    const broken: EmbeddingProvider = {
      identity: { providerId: 'broken', modelId: 'x', modelVersion: '1', dimensions: 8, embeddingPolicyVersion: 'v1' },
      embedQuery: async () => {
        throw new EmbeddingEngineError('DIMENSION_MISMATCH', 'boom');
      },
      embedDocuments: async () => {
        throw new EmbeddingEngineError('EMBEDDING_STORAGE_FAILURE', 'boom');
      },
      healthCheck: async () => ({ providerId: 'broken', modelId: 'x', modelVersion: '1', dimensions: 8, healthy: false, error: 'broken' }),
    };
    await expect(
      new EmbeddingPipeline({ provider: broken, repository }, { pipeline: pipelineConfig }).embedUnits(
        [makeUnit(unitIds[0] as string, 'hello')],
        { caseId },
      ),
    ).rejects.toBeInstanceOf(EmbeddingEngineError);
    expect(repository.written).toHaveLength(0);
  });
});