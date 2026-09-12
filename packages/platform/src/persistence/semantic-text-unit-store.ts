// ============================================================================
// SemanticTextUnitStore (Phase 5A-PR1.5)
//
// Durable upsert boundary for the atomic retrievable text item. The platform
// materializes a SemanticTextUnit from canonical text (canonicalized + hashed
// by @indago/semantic-retrieval) and persists it here BEFORE embedding.
//
// Identity model:
//   - SemanticTextUnit IDENTITY = caseId + sourceType + sourceId
//     (@@unique[caseId, sourceType, sourceId]: ONE unit per source object).
//   - CURRENT TEXT VERSION = contentHash (SHA-256 of canonicalized text).
//     This is a MUTABLE CURRENT RETRIEVAL PROJECTION, not immutable historical
//     text identity: a changed source UPSERTS IN PLACE (normalizedText +
//     contentHash updated, id never changes). No version history is kept.
//   - Embedding freshness rule:
//     embedding.contentHash === semanticTextUnit.contentHash (current),
//     anything else is stale and excluded by the search freshness join.
//
// The row `id` is a deterministic UUID derived from
//   indago:semantic-text-unit:v1:caseId:sourceType:sourceId:contentHash
// AT FIRST UPSERT — retry/race safe for a first-seen slice — but is NOT part
// of the identity contract and is never recomputed on later updates.
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

/** Deterministic id key (first-seen slice; NOT the identity contract). */
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

/** Deterministic UUID (v4-shaped, contract-valid) for the durable row id. */
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