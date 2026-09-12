import type {
  EmbeddingCandidateUnit,
  EmbeddingProviderIdentity,
  EmbeddingRepository,
  EmbeddingUpsertContext,
  EmbeddingWriteRecord,
  SemanticNeighborQuery,
  SemanticNeighborRow,
  SemanticSearchRepository,
} from '../../src/types.js';
import { DeterministicEmbeddingProvider } from '../../src/providers/deterministic.js';

// ============================================================================
// In-memory fakes for pipeline/service unit tests (Phase 5A-PR1.5)
// ============================================================================

/** Fake persistence: embeddings keyed by (unitId, providerIdentity). */
export class FakeEmbeddingRepository implements EmbeddingRepository {
  readonly rows = new Map<string, { contentHash: string; identity: EmbeddingProviderIdentity }>();
  /** Deterministic write order (Map preserves insertion order). */
  readonly written: EmbeddingWriteRecord[] = [];

  private key(unitId: string, identity: EmbeddingProviderIdentity): string {
    return [identity.providerId, identity.modelId, identity.modelVersion, unitId].join('|');
  }

  async findCurrent(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    _ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]> {
    return units
      .filter((unit) => this.rows.get(this.key(unit.semanticTextUnitId, identity))?.contentHash === unit.contentHash)
      .map((unit) => unit.semanticTextUnitId);
  }

  async findMissing(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    _ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]> {
    return units
      .filter((unit) => !this.rows.has(this.key(unit.semanticTextUnitId, identity)))
      .map((unit) => unit.semanticTextUnitId);
  }

  async findStale(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    _ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]> {
    return units
      .filter(
        (unit) =>
          this.rows.has(this.key(unit.semanticTextUnitId, identity)) &&
          this.rows.get(this.key(unit.semanticTextUnitId, identity))!.contentHash !== unit.contentHash,
      )
      .map((unit) => unit.semanticTextUnitId);
  }

  async upsertMany(records: readonly EmbeddingWriteRecord[]): Promise<number> {
    for (const record of records) {
      this.written.push(record);
      this.rows.set(
        this.key(record.semanticTextUnitId, record.providerIdentity),
        { contentHash: record.contentHash, identity: record.providerIdentity },
      );
    }
    return records.length;
  }
}

/** Deterministic provider that counts calls (idempotency + batching assertions). */
export class CountingProvider extends DeterministicEmbeddingProvider {
  embedCalls = 0;
  queryCalls = 0;

  constructor(dimensions = 8) {
    super(dimensions);
  }

  override async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    this.embedCalls += 1;
    return super.embedDocuments(texts);
  }

  override async embedQuery(text: string): Promise<number[]> {
    this.queryCalls += 1;
    return super.embedQuery(text);
  }
}

/** Fails transiently `failsBefore` times, then delegates to a real provider. */
export class FlakyProvider extends DeterministicEmbeddingProvider {
  failuresRemaining: number;

  constructor(failuresBeforeSucceeding: number, dimensions = 8) {
    super(dimensions);
    this.failuresRemaining = failuresBeforeSucceeding;
  }

  override async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new (await import('../../src/types.js')).EmbeddingEngineError(
        'PROVIDER_UNAVAILABLE',
        'flaky provider unavailable',
      );
    }
    return super.embedDocuments(texts);
  }
}

/** Fake nearest-neighbour store honouring threshold/limit/ordering + case id. */
export class FakeSemanticSearchRepository implements SemanticSearchRepository {
  lastQuery: SemanticNeighborQuery | null = null;

  constructor(private readonly rows: SemanticNeighborRow[] = []) {}

  async findNearestNeighbors(
    query: SemanticNeighborQuery,
  ): Promise<readonly SemanticNeighborRow[]> {
    this.lastQuery = query;
    return this.rows
      .filter((row) => 1 - row.distance >= query.threshold)
      .sort(
        (a, b) =>
          a.distance - b.distance || a.semanticTextUnitId.localeCompare(b.semanticTextUnitId),
      )
      .slice(0, query.limit);
  }
}