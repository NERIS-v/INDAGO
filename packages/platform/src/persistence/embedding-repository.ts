// ============================================================================
// EmbeddingRepository (Phase 5A-PR1.5)
//
// Implements the EmbeddingRepository interface from @indago/semantic-retrieval.
// All operations are scoped by (caseId, provider identity), so a provider
// swap never mixes vectors. Reads/writes to the vector column use parameterized
// raw SQL ($queryRaw / $executeRaw) because Prisma models the column as
// Unsupported("vector(768)") and cannot express it in the typed client.
//
// Embedding row ids are deterministic UUIDs derived from the full identity key
// (unit id + provider identity fields), matching the repo-wide convention of
// content-addressed deterministic identifiers.
// ============================================================================

import { createHash } from 'node:crypto';

import { bytesToUuid4 } from '@indago/ingestion';
import type { EmbeddingProviderIdentity } from '@indago/contracts';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type {
  EmbeddingCandidateUnit,
  EmbeddingRepository,
  EmbeddingUpsertContext,
  EmbeddingWriteRecord,
} from '@indago/semantic-retrieval';
import { toVectorLiteral } from '@indago/semantic-retrieval';

import { db } from '../db/prisma.js';

export const SEMANTIC_EMBEDDING_NAMESPACE = 'indago:semantic-embedding';
const EMBEDDING_IDENTITY_VERSION = 1;

/** Deterministic row id from the full embedding identity key. */
export function embeddingRowId(unitId: string, identity: EmbeddingProviderIdentity): string {
  const key = JSON.stringify([
    SEMANTIC_EMBEDDING_NAMESPACE,
    `v${EMBEDDING_IDENTITY_VERSION}`,
    unitId,
    identity.providerId,
    identity.modelId,
    identity.modelVersion,
    identity.embeddingPolicyVersion,
  ]);
  const digest = createHash('sha256').update(key, 'utf8').digest();
  return bytesToUuid4(Array.from(digest.subarray(0, 16)));
}

interface StoredRow {
  semanticTextUnitId: string;
  contentHash: string;
}

export class PostgresEmbeddingRepository implements EmbeddingRepository {
  constructor(private readonly prisma: PrismaClient = db) {}

  async findCurrent(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]> {
    const rows = await this.queryStored(units, identity, ctx);
    const stored = new Map(rows.map((r) => [r.semanticTextUnitId, r.contentHash]));
    return units
      .filter((u) => stored.get(u.semanticTextUnitId) === u.contentHash)
      .map((u) => u.semanticTextUnitId);
  }

  async findMissing(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]> {
    const rows = await this.queryStored(units, identity, ctx);
    const stored = new Set(rows.map((r) => r.semanticTextUnitId));
    return units.filter((u) => !stored.has(u.semanticTextUnitId)).map((u) => u.semanticTextUnitId);
  }

  async findStale(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly string[]> {
    const rows = await this.queryStored(units, identity, ctx);
    const stored = new Map(rows.map((r) => [r.semanticTextUnitId, r.contentHash]));
    return units
      .filter((u) => {
        const hash = stored.get(u.semanticTextUnitId);
        return hash !== undefined && hash !== u.contentHash;
      })
      .map((u) => u.semanticTextUnitId);
  }

  async upsertMany(records: readonly EmbeddingWriteRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    const now = new Date();

    for (const record of records) {
      const id = embeddingRowId(record.semanticTextUnitId, record.providerIdentity);
      const vectorLiteral = toVectorLiteral(record.vector);

      await this.prisma.$executeRaw`
        INSERT INTO "SemanticEmbedding" (
          "id", "semanticTextUnitId", "caseId", "contentHash",
          "providerId", "modelId", "modelVersion", "dimensions",
          "embeddingPolicyVersion", "vector", "createdAt", "updatedAt"
        ) VALUES (
          ${id},
          ${record.semanticTextUnitId},
          ${record.caseId},
          ${record.contentHash},
          ${record.providerIdentity.providerId},
          ${record.providerIdentity.modelId},
          ${record.providerIdentity.modelVersion},
          ${record.providerIdentity.dimensions},
          ${record.providerIdentity.embeddingPolicyVersion},
          ${vectorLiteral}::vector,
          ${now},
          ${now}
        )
        ON CONFLICT ("semanticTextUnitId", "providerId", "modelId", "modelVersion", "embeddingPolicyVersion")
        DO UPDATE SET
          "contentHash" = EXCLUDED."contentHash",
          "vector"      = EXCLUDED."vector",
          "updatedAt"   = EXCLUDED."updatedAt"
      `;
    }

    return records.length;
  }

  private async queryStored(
    units: readonly EmbeddingCandidateUnit[],
    identity: EmbeddingProviderIdentity,
    ctx: EmbeddingUpsertContext,
  ): Promise<readonly StoredRow[]> {
    if (units.length === 0) return [];

    const ids = [...new Set(units.map((u) => u.semanticTextUnitId))];

    const rows = await this.prisma.$queryRaw<StoredRow[]>`
      SELECT "semanticTextUnitId", "contentHash"
      FROM "SemanticEmbedding"
      WHERE "caseId"               = ${ctx.caseId}
        AND "providerId"           = ${identity.providerId}
        AND "modelId"              = ${identity.modelId}
        AND "modelVersion"         = ${identity.modelVersion}
        AND "embeddingPolicyVersion" = ${identity.embeddingPolicyVersion}
        AND "semanticTextUnitId"   IN (${Prisma.join(ids)})
    `;

    return rows;
  }
}

export const embeddingRepository = new PostgresEmbeddingRepository();