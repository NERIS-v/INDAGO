import { beforeEach, describe, expect, it } from 'vitest';

import type { SemanticRetrievalPort, SemanticSearchRequest } from '@indago/contracts';

import { SemanticSearchService } from '../src/service.js';
import type { SemanticNeighborRow } from '../src/types.js';
import {
  CountingProvider,
  FakeSemanticSearchRepository,
} from './helpers/fakes.js';

const caseId = '11bf5b37-e0b8-42e0-8dcf-dc8c4aefc000';
const otherCaseId = '22bf5b37-e0b8-42e0-8dcf-dc8c4aefc000';

const unitA = '00000000-0000-4000-8000-00000000000a';
const unitB = '00000000-0000-4000-8000-00000000000b';

function rows(): SemanticNeighborRow[] {
  return [
    {
      distance: 0.1,
      semanticTextUnitId: unitA,
      contentHash: 'a'.repeat(64),
      normalizedText: 'Payment received July 2024',
      sourceType: 'OBSERVATION',
      sourceId: '31bf5b37-e0b8-42e0-8dcf-dc8c4aefc002',
    },
    {
      distance: 0.25,
      semanticTextUnitId: unitB,
      contentHash: 'b'.repeat(64),
      normalizedText: 'Wire transfer account closed',
      sourceType: 'EVIDENCE',
      sourceId: '41bf5b37-e0b8-42e0-8dcf-dc8c4aefc003',
      temporalScope: {
        validFrom: { value: '2024-07-03', precision: 'day' },
        precision: 'day',
        semantics: 'observed',
      },
    },
  ];
}

describe('SemanticSearchService', () => {
  let provider: CountingProvider;
  let repository: FakeSemanticSearchRepository;
  let service: SemanticSearchService;

  beforeEach(() => {
    provider = new CountingProvider(8);
    repository = new FakeSemanticSearchRepository(rows());
    service = new SemanticSearchService({ provider, repository });
  });

  async function request(overrides: Partial<SemanticSearchRequest> = {}): Promise<SemanticSearchRequest> {
    return {
      caseId,
      query: '  Payment received 2024-07-03  ',
      ...overrides,
    } as SemanticSearchRequest;
  }

  it('implements the SemanticRetrievalPort shape', () => {
    const port: SemanticRetrievalPort = service;
    expect(typeof port.retrieve).toBe('function');
  });

  it('returns results with similarity = 1 − distance clamped to [0,1]', async () => {
    const result = await service.retrieve(await request());
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.similarity).toBeCloseTo(0.9);
    expect(result.results[1]?.similarity).toBeCloseTo(0.75);
    expect(result.results[0]?.providerId).toBe('deterministic-test');
    expect(result.results[0]?.sourceType).toBe('OBSERVATION');
    expect(result.results[1]?.temporalScope?.validFrom.value).toBe('2024-07-03');
  });

  it('embeds the CANONICALIZED query so hits never depend on raw formatting', async () => {
    await service.retrieve(await request());
    const expectedVector = await provider.embedQuery('Payment received 2024-07-03');
    expect(repository.lastQuery?.queryVector).toEqual(expectedVector);
  });

  it('probes the repository with limit + 1 (overflow detection), forwards caseId, threshold and identity', async () => {
    await service.retrieve(await request());
    expect(repository.lastQuery?.caseId).toBe(caseId);
    expect(repository.lastQuery?.limit).toBe(21);
    expect(repository.lastQuery?.threshold).toBe(0);
    expect(repository.lastQuery?.providerIdentity).toEqual(provider.identity);
  });

  it('honours request-level limit and threshold overrides (probing limit + 1)', async () => {
    await service.retrieve(await request({ limit: 1, threshold: 0.8 }));
    expect(repository.lastQuery?.limit).toBe(2);
    expect(repository.lastQuery?.threshold).toBe(0.8);
  });

  it('produces a deterministic query hash sensitive to case and temporal context', async () => {
    const a = await service.retrieve(await request());
    const b = await service.retrieve(await request());
    expect(a.queryHash).toBe(b.queryHash);
    expect(a.queryHash).toMatch(/^[0-9a-f]{64}$/);

    const otherCase = await service.retrieve(await request({ caseId: otherCaseId }));
    expect(otherCase.queryHash).not.toBe(a.queryHash);

    const temporal = await service.retrieve(
      await request({
        temporalContext: {
          validFrom: { value: '2024-07-01', precision: 'day' },
          precision: 'day',
          semantics: 'observed',
        },
      }),
    );
    expect(temporal.queryHash).not.toBe(a.queryHash);
  });

  it('reports truncated only on OBSERVED overflow — NOT an exactly-full result set', async () => {
    // fewer than limit → not truncated
    const partial = await service.retrieve(await request());
    expect(partial.results).toHaveLength(2);
    expect(partial.truncated).toBe(false);

    // exactly limit matches exist → NOT truncated (the fixed boundary bug)
    const exactly = await service.retrieve(await request({ limit: 2 }));
    expect(exactly.results).toHaveLength(2);
    expect(exactly.truncated).toBe(false);

    // more than limit matches exist → truncated, returned count = limit
    const overflowing = await service.retrieve(await request({ limit: 1 }));
    expect(overflowing.results).toHaveLength(1);
    expect(overflowing.truncated).toBe(true);
    expect(overflowing.results[0]?.semanticTextUnitId).toBe(unitA);
  });

  it('returns an empty, non-truncated result for no hits', async () => {
    const empty = new FakeSemanticSearchRepository([]);
    const svc = new SemanticSearchService({ provider, repository: empty });
    const result = await svc.retrieve(await request());
    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});