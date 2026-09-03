// ============================================================================
// M-A12-D6 TemporalStateChange History Store (PR1)
//
// Append-only store for canonical state transitions. The underlying
// TemporalStateChange rows are NEVER updated or deleted once written
// (append-only, D6), so canonical temporal state is reconstructable
// independently of the mutable current rows.
//
// Deterministic ordering:
//   sequence is allocated application-side within a transaction as
//   (max sequence for that (caseId, entityType, entityId)) + 1, never by the
//   DB. The @@unique([caseId, entityType, entityId, sequence]) constraint
//   rejects duplicates, so a replay of the same logical transition (same
//   deterministic id) is a safe no-op and reconstruction order is stable.
//
// No graph version coupling (D7): this store records transitions; it does not
// snapshot graphs. GraphVersion is deferred to PR2.
//
// Build mode: this store is the persistence boundary PR3's history/queries
// consume; it does not itself expose HTTP/APIs.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";
import { computeContentHash, bytesToUuid4 } from "@indago/ingestion";

function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

/**
 * Deterministic TemporalStateChange id (UUID v4-shaped) from the stable
 * identity (caseId:entityType:entityId:sequence) — same id on replay.
 */
export async function deterministicStateChangeId(
  caseId: string,
  entityType: string,
  entityId: string,
  sequence: number,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(
      `${caseId}:${entityType}:${entityId}:${sequence}`,
    ),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}

export type TemporalStateChangeEntityType =
  | "OBSERVATION"
  | "RELATION"
  | "RELATION_HYPOTHESIS";

export interface TemporalStateChangeRecord {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly entityType: TemporalStateChangeEntityType;
  readonly entityId: string;
  readonly stateType: string;
  readonly sequence: number;
  readonly eventTime: unknown;
  readonly validityInterval: unknown;
  readonly provenance: unknown;
  readonly ingestedAt: Date | null;
  readonly transactionTime: Date;
  readonly note: string | null;
  readonly createdAt: Date;
}

export interface RecordStateChangeInput {
  readonly caseId: string;
  readonly investigationId?: string;
  readonly entityType: TemporalStateChangeEntityType;
  readonly entityId: string;
  readonly stateType: string;
  readonly eventTime?: unknown;
  readonly validityInterval?: unknown;
  readonly provenance?: unknown;
  readonly ingestedAt?: Date | null;
  readonly note?: string;
}

type StateChangeRow = Prisma.TemporalStateChangeGetPayload<Record<string, never>>;

function rowToRecord(row: StateChangeRow): TemporalStateChangeRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    investigationId: row.investigationId,
    entityType: row.entityType as TemporalStateChangeEntityType,
    entityId: row.entityId,
    stateType: row.stateType,
    sequence: row.sequence,
    eventTime: row.eventTime,
    validityInterval: row.validityInterval,
    provenance: row.provenance,
    ingestedAt: row.ingestedAt,
    transactionTime: row.transactionTime,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/**
 * Allocate the next sequence for a (caseId, entityType, entityId) identity
 * deterministically as max(existing)+1 within the caller's transaction. The
 * @@unique constraint then guarantees only ONE row can win that sequence —
 * a replay producing the same deterministic id is a no-op, and two different
 * transitions racing for the same sequence are mutually exclusive.
 */
async function nextSequence(
  client: Pick<Prisma.TransactionClient, "temporalStateChange">,
  caseId: string,
  entityType: string,
  entityId: string,
): Promise<number> {
  const latest = await client.temporalStateChange.findFirst({
    where: { caseId, entityType, entityId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

export class TemporalStateChangeStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Append a canonical state transition. Idempotent: the same deterministic id
   * cannot be inserted twice (primary key), so a replay of an identical logical
   * transition is a no-op (`written=false`). Sequence is allocated
   * deterministically within the transaction.
   *
   * Prefer passing a `tx` when the change MUST be co-located with the entity
   * write that triggered it (atomic append with the current-row mutation).
   * Without a tx, this opens its own interactive transaction so the
   * allocate-max→insert is race-free.
   */
  async recordChange(
    input: RecordStateChangeInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ written: boolean; record: TemporalStateChangeRecord }> {
    const run = async (
      client: Prisma.TransactionClient,
    ): Promise<{ written: boolean; record: TemporalStateChangeRecord }> => {
      const sequence = await nextSequence(
        client,
        input.caseId,
        input.entityType,
        input.entityId,
      );
      const id = await deterministicStateChangeId(
        input.caseId,
        input.entityType,
        input.entityId,
        sequence,
      );
      const now = new Date();

      try {
        const created = await client.temporalStateChange.create({
          data: {
            id,
            caseId: input.caseId,
            investigationId: input.investigationId ?? null,
            entityType: input.entityType,
            entityId: input.entityId,
            stateType: input.stateType,
            sequence,
            eventTime:
              input.eventTime !== undefined
                ? toJson(input.eventTime)
                : Prisma.JsonNull,
            validityInterval:
              input.validityInterval !== undefined
                ? toJson(input.validityInterval)
                : Prisma.JsonNull,
            provenance:
              input.provenance !== undefined
                ? toJson(input.provenance)
                : Prisma.JsonNull,
            ingestedAt: input.ingestedAt ?? null,
            transactionTime: now,
            note: input.note ?? null,
            createdAt: now,
          },
        });
        return { written: true, record: rowToRecord(created) };
      } catch (cause) {
        const code =
          cause instanceof Prisma.PrismaClientKnownRequestError
            ? cause.code
            : undefined;
        if (code !== "P2002") throw cause;
        // Deterministic id already exists → identical transition already
        // recorded (replay). Re-read and report as not-this-replay's write.
        const existing = await client.temporalStateChange.findUnique({
          where: { id },
        });
        if (!existing) throw cause;
        return { written: false, record: rowToRecord(existing) };
      }
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  /**
   * Read a single entity's transition history in deterministic order:
   * (caseId, sequence) ascending. This is the reconstruction seam.
   */
  async listForEntity(
    caseId: string,
    entityType: TemporalStateChangeEntityType,
    entityId: string,
  ): Promise<TemporalStateChangeRecord[]> {
    const rows = await this.prisma.temporalStateChange.findMany({
      where: { caseId, entityType, entityId },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToRecord(row));
  }

  /**
   * Read the most recent transition for an entity (reconstruction tail).
   */
  async latestForEntity(
    caseId: string,
    entityType: TemporalStateChangeEntityType,
    entityId: string,
  ): Promise<TemporalStateChangeRecord | null> {
    const row = await this.prisma.temporalStateChange.findFirst({
      where: { caseId, entityType, entityId },
      orderBy: { sequence: "desc" },
    });
    return row ? rowToRecord(row) : null;
  }

  /**
   * Read all transitions within a case ordered deterministically
   * (caseId, sequence). Bounded per case (append-only history is small).
   */
  async listForCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<TemporalStateChangeRecord[]> {
    const rows = await this.prisma.temporalStateChange.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToRecord(row));
  }

  /**
   * Count transitions recorded for a (caseId, entityType, entityId) identity.
   */
  async countForEntity(
    caseId: string,
    entityType: TemporalStateChangeEntityType,
    entityId: string,
  ): Promise<number> {
    return this.prisma.temporalStateChange.count({
      where: { caseId, entityType, entityId },
    });
  }
}

export const temporalStateChangeStore = new TemporalStateChangeStore();
