// ============================================================================
// SemanticTextUnitStore (Phase 5A-PR1.5)
//
// Durable upsert boundary for the atomic retrievable text item. The platform
// materializes a SemanticTextUnit from canonical text (canonicalized + hashed
// by @indago/semantic-retrieval) and persists it here BEFORE embedding.
//
// Identity:
//   - id = deterministic UUID of the canonical identity key
//     indago:semantic-text-unit:v1:caseId:sourceType:sourceId:contentHash —
//     retry/race safe; same source slice + same canonical text ≡ same unit.
//   - @@unique([caseId, sourceType, sourceId]): one unit per source object.
//     A changed source upserts in place (contentHash/normalizedText updated),
//     which is exactly what drives staleness detection in the embedding
//     pipeline.
//
// This store persists RECALL SURFACES only. A SemanticTextUnit carries NO truth
// value, NO evidence authority and NO entity/relation meaning.
// ============================================================================

import { createHash } from 'node:crypto';

import { bytesToUuid4 } from '@indago/ingestion';
import type { SemanticTextUnit } from '@indago/contracts';
import { SemanticTextUnitSchema } from '@indago/contracts';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { db } from '../db/prisma.js';

export const SEMANTIC_TEXT_UNIT_NAMESPACE = 'indago:semantic-text-unit';
export const SEMANTIC_TEXT_UNIT_IDENTITY_VERSION = 1;

export interface SemanticTextUnitIdentityInput {
  readonly caseId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly contentHash: string;
}

/** Canonical identity representation (single source for key + id). */
export function buildSemanticTextUnitIdentityKey(input: SemanticTextUnitIdentityInput): string {
  return JSON.stringify([
    SEMANTIC_TEXT_UNIT_NAMESPACE,
    `v${SEMANTIC_TEXT_UNIT_IDENTITY_VERSION}`,
    input.caseId,
    input.sourceType,
    input.sourceId,
    input.contentHash,
  ]);
}

/** Deterministic UUID (v4-shaped, contract-valid) from the identity key. */
export function deterministicSemanticTextUnitId(input: SemanticTextUnitIdentityInput): string {
  const digest = createHash('sha256').update(buildSemanticTextUnitIdentityKey(input), 'utf8').digest();
  return bytesToUuid4(Array.from(digest.subarray(0, 16)));
}

export interface DurableSemanticTextUnit {
  readonly id: string;
  readonly caseId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly contentHash: string;
  readonly normalizedText: string;
  readonly temporalScope: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type SemanticTextUnitRow = Prisma.SemanticTextUnitGetPayload<Record<string, never>>;

function toContract(row: SemanticTextUnitRow): SemanticTextUnit {
  return SemanticTextUnitSchema.parse({
    id: row.id,
    caseId: row.caseId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    normalizedText: row.normalizedText,
    contentHash: row.contentHash,
    ...(row.temporalScope === null
      ? {}
      : { temporalScope: JSON.parse(JSON.stringify(row.temporalScope)) }),
  });
}

function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

function toWriteJson(input: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return input === undefined || input === null ? Prisma.DbNull : toJson(input);
}

export class SemanticTextUnitStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Idempotent upsert keyed by (caseId, sourceType, sourceId). Deterministic:
   * identical inputs converge to the same row content hash; a changed source
   * updates normalizedText + contentHash in place.
   */
  async upsert(unit: SemanticTextUnit): Promise<DurableSemanticTextUnit> {
    const now = new Date();
    const row = await this.prisma.semanticTextUnit.upsert({
      where: {
        caseId_sourceType_sourceId: {
          caseId: unit.caseId,
          sourceType: unit.sourceType,
          sourceId: unit.sourceId,
        },
      },
      create: {
        id: unit.id,
        caseId: unit.caseId,
        sourceType: unit.sourceType,
        sourceId: unit.sourceId,
        normalizedText: unit.normalizedText,
        contentHash: unit.contentHash,
        temporalScope: toWriteJson(unit.temporalScope),
        createdAt: now,
        updatedAt: now,
      },
      update: {
        normalizedText: unit.normalizedText,
        contentHash: unit.contentHash,
        temporalScope: toWriteJson(unit.temporalScope),
        updatedAt: now,
      },
    });
    return {
      id: row.id,
      caseId: row.caseId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      contentHash: row.contentHash,
      normalizedText: row.normalizedText,
      temporalScope: row.temporalScope,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Sequential deterministic batch upsert (input order preserved). */
  async upsertMany(units: readonly SemanticTextUnit[]): Promise<number> {
    for (const unit of units) {
      await this.upsert(unit);
    }
    return units.length;
  }

  async findByCase(caseId: string): Promise<readonly SemanticTextUnit[]> {
    const rows = await this.prisma.semanticTextUnit.findMany({
      where: { caseId },
      orderBy: [{ id: 'asc' }],
    });
    return rows.map(toContract);
  }

  async findById(id: string): Promise<SemanticTextUnit | null> {
    const row = await this.prisma.semanticTextUnit.findUnique({ where: { id } });
    return row ? toContract(row) : null;
  }
}

export const semanticTextUnitStore = new SemanticTextUnitStore();