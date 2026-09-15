// ============================================================================
// M-A08 Candidate Pair Persistence Store
//
// Single Prisma data-access boundary for durable CandidatePair writes + the
// read seam. Strict generated Prisma types only — no `any`, no `as any`, no
// `@ts-ignore`.
//
// Idempotency / partial-retry semantics (the M-A07 L-2 lesson, fixed here):
//   - CandidatePair.id @id            → deterministic id (SHA-256 of identityKey)
//   - CandidatePair.identityKey @unique → exact-duplicate guard; createMany
//       skipDuplicates is a PER-PAIR idempotent write. There is deliberately NO
//       whole-batch "already has pairs → skip all" gate: if pair A persists and
//       pair B fails, a retry creates only B and leaves A untouched.
//
// Every read reassembles rows into the canonical CandidatePairSchema contract —
// there is no second, drifting "pair" shape in this codebase. blockingPasses is
// persisted as the deterministic-ordered array; no column carries an EntityId or
// a ResolutionScore (M-A08 is pre-resolution by design).
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  CandidatePairSchema,
  BlockingPassSchema,
  type CandidatePair,
} from "@indago/contracts";
import { db } from "../db/prisma.js";

/**
 * Round-trip value into a JSON-safe Prisma Json input. Strips `undefined`
 * fields, which Prisma rejects in Json columns.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

type CandidatePairRow = Prisma.CandidatePairGetPayload<Record<string, never>>;

export class CandidatePairStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Idempotent CandidatePair write. Pair.identityKey is unique, so a retried
   * MA08 pass (or a concurrent one) can never duplicate a row — `skipDuplicates`
   * is a per-pair safe no-op inside a bounded batch. Returns { created, skipped }.
   *
   * identityKey for each entry is the versioned canonical representation built
   * by the MA08 queue pipeline via @indago/ingestion
   * buildCandidatePairIdentityKey — this store never derives identity, it only
   * persists it (single source).
   */
  async ensureCandidatePairs(
    entries: readonly {
      readonly identityKey: string;
      readonly pair: CandidatePair;
    }[],
  ): Promise<{ created: number; skipped: number }> {
    if (entries.length === 0) return { created: 0, skipped: 0 };

    const data = entries.map(({ identityKey, pair }) => ({
      id: pair.id,
      identityKey,
      caseId: pair.caseId,
      investigationId: pair.investigationId ?? null,
      leftCandidateId: pair.leftCandidateId,
      rightCandidateId: pair.rightCandidateId,
      blockingPasses: toJson(pair.blockingPasses) as Prisma.InputJsonObject,
    }));

    const result = await this.prisma.candidatePair.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: result.count, skipped: entries.length - result.count };
  }

  /**
   * Read seam — count durable pairs for an evidence batch. Used ONLY for
   * metrics / auditing. It is deliberately NOT used as a whole-batch idempotency
   * gate (see class header).
   */
  async countByCase(caseId: string): Promise<number> {
    return this.prisma.candidatePair.count({ where: { caseId } });
  }

  /**
   * Read seam — list pairs within authorization boundaries. caseId is resolved
   * SERVER-SIDE by caller routes (never from the client). Rows are reassembled
   * and schema-validated; an invalid row surfaces loudly rather than being
   * silently dropped.
   */
  async listByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<CandidatePair[]> {
    const rows = await this.prisma.candidatePair.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => this.rowToPair(row));
  }

  /**
   * Read seam — fetch a bounded set of pairs by deterministic id, case-scoped.
   * Mirrors EntityMentionStore.findByIds (200-cap). Used by the targeted
   * reblock pipeline to hand a run's bounded pair set to the M-A09 boundary.
   */
  async findByIds(
    ids: readonly string[],
    filter: { investigationId: string; caseId: string },
  ): Promise<CandidatePair[]> {
    if (ids.length === 0) return [];
    const bounded = [...ids].slice(0, 200);
    const rows = await this.prisma.candidatePair.findMany({
      where: {
        id: { in: bounded },
        caseId: filter.caseId,
        investigationId: filter.investigationId,
      },
      orderBy: [{ id: "asc" }],
    });
    return rows.map((row) => this.rowToPair(row));
  }

  private rowToPair(row: CandidatePairRow): CandidatePair {
    const passes = (row.blockingPasses as unknown as unknown[]).map((p) =>
      BlockingPassSchema.parse(p),
    );
    return CandidatePairSchema.parse({
      id: row.id,
      caseId: row.caseId,
      ...(row.investigationId !== null
        ? { investigationId: row.investigationId }
        : {}),
      leftCandidateId: row.leftCandidateId,
      rightCandidateId: row.rightCandidateId,
      blockingPasses: passes,
      createdAt: { value: row.createdAt.toISOString(), precision: "exact" },
    });
  }
}

export const candidatePairStore = new CandidatePairStore();
