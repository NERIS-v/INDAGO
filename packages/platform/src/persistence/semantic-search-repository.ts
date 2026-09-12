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
//   Missing endpoint (stored OR query) = OPEN bound, matching
//   graph-hole-region intervalOverlapsContext. The filter implements TRUE
//   closed-interval overlap for stored interval A and query window B:
//     NOT (A.validFrom > B.validTo  OR  B.validFrom > A.validTo)
//   so stored-contains-query, query-contains-stored, both partial overlaps and
//   exact boundary touches all RETAIN the row; only a stored interval fully
//   before OR fully after the query is excluded. All predicates are
//   parameterized — no user values are string-interpolated.
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

    // True closed-interval overlap, mirroring graph-hole-region
    // intervalOverlapsContext:
    //   NOT (A.validFrom > B.validTo  OR  B.validFrom > A.validTo)
    // where the STORED interval is A and the QUERY window is B. A missing
    // endpoint on either side (or a NULL temporalScope) is an OPEN bound and
    // always retains the row (SQL three-valued logic: every comparison is
    // guarded by IS NOT NULL so an unbound endpoint can never exclude a row).
    // A missing endpoint on either side (or a NULL temporalScope) is an OPEN
    // bound and always retains the row (SQL three-valued logic: every
    // comparison is guarded by IS NOT NULL so an unbound endpoint can never
    // exclude a row). Only the ISO string VALUES are compared — boundary
    // metadata (precision, semantics) is never used in the predicate.
    // A single static shape is used; the parameters themselves gate which
    // bounds are active — nothing is string-interpolated.
    const bFrom = query.temporalContext?.validFrom?.value ?? null;
    const bTo = query.temporalContext?.validTo?.value ?? null;

    const temporalPredicate = Prisma.sql`NOT (
      (u."temporalScope"->'validFrom'->>'value' IS NOT NULL
        AND ${bTo}::text IS NOT NULL
        AND (u."temporalScope"->'validFrom'->>'value') > ${bTo}::text)
      OR
      (${bFrom}::text IS NOT NULL
        AND u."temporalScope"->'validTo'->>'value' IS NOT NULL
        AND ${bFrom}::text > (u."temporalScope"->'validTo'->>'value'))
    )`;

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
        AND ${temporalPredicate}
      ORDER BY (e."vector" <=> ${vecLiteral}::vector) ASC, u."id" ASC
      LIMIT ${query.limit}
    `;

    return rows.map(toSemanticNeighborRow);
  }
}

export const semanticSearchRepository = new PostgresSemanticSearchRepository();