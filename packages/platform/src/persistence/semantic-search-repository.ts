// ============================================================================
// SemanticSearchRepository (Phase 5A-PR1.5)
//
// Implements SemanticSearchRepository from @indago/semantic-retrieval. All
// nearest-neighbour logic lives here: pgvector distance computation, freshness
// join (embeddings must match the CURRENT unit contentHash), case isolation,
// temporal filtering and the deterministic ORDER BY — the service only maps
// distance → similarity and assembles the result.
//
// temporalScope is JSONB:
//   validFrom/validTo each carry { value: string } or are absent.
//   Missing endpoint = open (no bound), matching graph-hole-region
//   intervalOverlaps semantics. When temporalContext is provided with both
//   endpoints the row overlaps iff NOT (validFrom > bTo OR bFrom > validTo).
//   When either endpoint is missing, that bound is unconstrained.
//
// Cosine distance ∈ [0, 2]; similarity = 1 − distance. A threshold of 0
// excludes distance > 1 (similarity < 0), which is defensible since
// similarity is clamped to [0,1] anyway.
// ============================================================================

import type {
  SemanticNeighborQuery,
  SemanticNeighborRow,
  SemanticSearchRepository,
} from '@indago/semantic-retrieval';
import { toVectorLiteral } from '@indago/semantic-retrieval';
import type { SemanticSourceType } from '@indago/contracts';

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { db } from '../db/prisma.js';

interface RawNeighborRow {
  distance: number;
  semanticTextUnitId: string;
  contentHash: string;
  normalizedText: string;
  sourceType: string;
  sourceId: string;
  temporalScope: unknown;
}

function toSemanticNeighborRow(raw: RawNeighborRow): SemanticNeighborRow {
  return {
    distance: typeof raw.distance === 'number' ? raw.distance : Number(raw.distance),
    semanticTextUnitId: raw.semanticTextUnitId,
    contentHash: raw.contentHash,
    normalizedText: raw.normalizedText,
    sourceType: raw.sourceType as SemanticSourceType,
    sourceId: raw.sourceId,
    ...(raw.temporalScope !== null && raw.temporalScope !== undefined
      ? { temporalScope: JSON.parse(JSON.stringify(raw.temporalScope)) }
      : {}),
  };
}

export class PostgresSemanticSearchRepository implements SemanticSearchRepository {
  constructor(private readonly prisma: PrismaClient = db) {}

  async findNearestNeighbors(
    query: SemanticNeighborQuery,
  ): Promise<readonly SemanticNeighborRow[]> {
    const vecLiteral = toVectorLiteral(query.queryVector);
    const maxDistance = 1 - query.threshold;

    // Temporal conditions: when an endpoint is provided, require overlap;
    // when it's missing, treat that bound as unconstrained. Rows without
    // temporalScope always pass. Each fragment is a parameterized Prisma.sql
    // fragment — never string-interpolated into the query.
    const temporalFilters: Prisma.Sql[] = [];

    if (query.temporalContext?.validFrom !== undefined) {
      temporalFilters.push(Prisma.sql`(
        u."temporalScope" IS NULL
        OR u."temporalScope"->'validFrom'->>'value' IS NULL
        OR NOT ((u."temporalScope"->'validFrom'->>'value') > ${query.temporalContext.validFrom})
      )`);
    }

    if (query.temporalContext?.validTo !== undefined) {
      temporalFilters.push(Prisma.sql`(
        u."temporalScope" IS NULL
        OR u."temporalScope"->'validTo'->>'value' IS NULL
        OR NOT (${query.temporalContext.validTo} > (u."temporalScope"->'validTo'->>'value'))
      )`);
    }

    const temporalFilter =
      temporalFilters.length > 0
        ? Prisma.sql`AND ${Prisma.join(temporalFilters, ' AND ')}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawNeighborRow[]>`
      SELECT
        (e."vector" <=> ${vecLiteral}::vector)    AS "distance",
        u."id"                                     AS "semanticTextUnitId",
        u."contentHash"                            AS "contentHash",
        u."normalizedText"                         AS "normalizedText",
        u."sourceType"                             AS "sourceType",
        u."sourceId"                               AS "sourceId",
        u."temporalScope"                          AS "temporalScope"
      FROM "SemanticTextUnit" u
      JOIN "SemanticEmbedding" e ON e."semanticTextUnitId" = u."id"
        AND e."caseId"                 = u."caseId"
        AND e."providerId"             = ${query.providerIdentity.providerId}
        AND e."modelId"                = ${query.providerIdentity.modelId}
        AND e."modelVersion"           = ${query.providerIdentity.modelVersion}
        AND e."embeddingPolicyVersion" = ${query.providerIdentity.embeddingPolicyVersion}
        AND e."contentHash"            = u."contentHash"
      WHERE u."caseId"  = ${query.caseId}
        AND e."caseId"  = ${query.caseId}
        AND (e."vector" <=> ${vecLiteral}::vector) <= ${maxDistance}
        ${temporalFilter}
      ORDER BY (e."vector" <=> ${vecLiteral}::vector) ASC, u."id" ASC
      LIMIT ${query.limit}
    `;

    return rows.map(toSemanticNeighborRow);
  }
}

export const semanticSearchRepository = new PostgresSemanticSearchRepository();