// ============================================================================
// M-A07 Entity Mention Candidate Persistence Store
//
// Single Prisma data-access boundary for durable EntityMentionCandidate
// writes + the read seam. Strict generated Prisma types only — no `any`, no
// `as any`, no `@ts-ignore`.
//
// Uniqueness / idempotency rules (mirror ObservationStore):
//   - EntityMentionCandidate.id @id                  → deterministic id (SHA-256
//       of the canonical identity key)
//   - EntityMentionCandidate.identityKey @unique     → exact-duplicate guard;
//       createMany skipDuplicates is the idempotent write (P2002-free)
//
// Every read reassembles rows into the canonical EntityMentionCandidateSchema
// contract — there is no second, drifting "candidate" shape in this codebase.
// None of the columns are fabricated: entityType may be NULL (explicit
// uncertainty, never coerced to OTHER), provenance is inherited verbatim from
// the parent Observation.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  EntityMentionCandidateSchema,
  type EntityMentionCandidate,
} from "@indago/contracts";
import { db } from "../db/prisma.js";

/**
 * Round-trip value into a JSON-safe Prisma Json input. Strips `undefined`
 * fields, which Prisma rejects in Json columns.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

type EntityMentionCandidateRow =
  Prisma.EntityMentionCandidateGetPayload<Record<string, never>>;

export class EntityMentionStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Idempotent EntityMentionCandidate write. Candidate.identityKey is unique,
   * so a retried MA07 pass (or a concurrent one) can never duplicate a row —
   * `skipDuplicates` makes the race a safe no-op. Returns the number of rows
   * THIS call actually inserted; callers audit ENTITY_MENTION_EXTRACTED only
   * when created > 0 (append-only audit stays single-value).
   *
   * identityKey for each entry is the versioned canonical representation built
   * by the MA07 queue pipeline via @indago/ingestion
   * buildEntityMentionIdentityKey — this store never derives identity, it only
   * persists it (single source).
   */
  async ensureEntityMentions(
    entries: readonly {
      readonly identityKey: string;
      readonly candidate: EntityMentionCandidate;
    }[],
    context: { investigationId: string; caseId: string },
  ): Promise<{ created: number }> {
    if (entries.length === 0) return { created: 0 };

    const data = entries.map(({ identityKey, candidate: c }) => ({
      id: c.id,
      identityKey,
      observationId: c.observationId,
      investigationId: context.investigationId,
      caseId: context.caseId,
      text: c.text,
      start: c.start,
      end: c.end,
      entityType: c.entityType ?? null,
      extractionMethod: c.extractionMethod,
      canonicalMatchValue: c.canonicalMatchValue ?? null,
      provenance: toJson(c.provenance) as Prisma.InputJsonObject,
    }));

    const result = await this.prisma.entityMentionCandidate.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: result.count };
  }

  /**
   * Read seam — count durable candidates for an evidence batch (used by the
   * MA07 worker for idempotency: only extract when zero are durable).
   */
  async countByObservationIds(observationIds: readonly string[]): Promise<number> {
    if (observationIds.length === 0) return 0;
    return this.prisma.entityMentionCandidate.count({
      where: { observationId: { in: [...observationIds] } },
    });
  }

  /**
   * Read seam — list candidates within authorization boundaries. caseId is
   * resolved SERVER-SIDE by the caller routes (never from the client). Rows
   * are reassembled and schema-validated; an invalid row surfaces loudly
   * rather than being silently dropped.
   */
  async listByObservationIds(
    observationIds: readonly string[],
    filter: { investigationId: string; caseId?: string },
  ): Promise<EntityMentionCandidate[]> {
    if (observationIds.length === 0) return [];
    const rows = await this.prisma.entityMentionCandidate.findMany({
      where: {
        investigationId: filter.investigationId,
        caseId: filter.caseId,
        observationId: { in: [...observationIds] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => this.rowToCandidate(row));
  }

  /**
   * Read seam — list ALL durable candidates across a case (the M-A08
   * comparison universe). Blocking is case-scoped, so the engine reads the
   * whole case rather than a single evidence batch. Rows are reassembled and
   * schema-validated.
   */
  async listByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<EntityMentionCandidate[]> {
    const rows = await this.prisma.entityMentionCandidate.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ id: "asc" }],
    });
    return rows.map((row) => this.rowToCandidate(row));
  }

  private rowToCandidate(row: EntityMentionCandidateRow): EntityMentionCandidate {
    return EntityMentionCandidateSchema.parse({
      id: row.id,
      observationId: row.observationId,
      text: row.text,
      start: row.start,
      end: row.end,
      ...(row.entityType !== null ? { entityType: row.entityType } : {}),
      extractionMethod: row.extractionMethod,
      ...(row.canonicalMatchValue !== null
        ? { canonicalMatchValue: row.canonicalMatchValue }
        : {}),
      provenance: row.provenance,
      createdAt: { value: row.createdAt.toISOString(), precision: "exact" },
      updatedAt: { value: row.createdAt.toISOString(), precision: "exact" },
    });
  }
}

export const entityMentionStore = new EntityMentionStore();
