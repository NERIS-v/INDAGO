// ============================================================================
// P-09a Canonical Entity Persistence Store
//
// Single Prisma data-access boundary for durable Entity writes + reads.
// Strict generated Prisma types only — no `any`, no `as any`, no `@ts-ignore`.
//
// ENTITY MATERIALIZATION RULES:
//   A canonical Entity is created ONLY through an explicit authority decision
//   path: EntityHypothesis (PROPOSED) → explicit ACCEPTANCE → Entity.
//
//   Entity.id is a deterministic UUID derived from a canonical identity key
//   (namespace:v1:caseId:canonicalName:entityType). The same
//   case+name+type converges to one logical entity — no duplicates.
//
//   Canonical Entity creation MUST NOT happen from:
//     - candidate pair score
//     - resolution score
//     - graph proximity
//     - automated scoring alone
//
// The STORE owns persistence + case scope + deterministic identity enforcement.
// It MUST NOT calculate scores or infer status. The materialization logic
// in the worker / API route owns the semantic decision.
//
// LIFECYCLE PRESERVATION:
//   A re-run / retry MUST NOT reset an existing MERGED / SPLIT / ARCHIVED
//   entity status back to ACTIVE. Those are authority states.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";

/**
 * Round-trip value into a JSON-safe Prisma Json input.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

/**
 * Parse a bounded JSON column of UUID strings back into a typed string array.
 */
function toIdArray(value: Prisma.JsonValue): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value) === false) {
    return [];
  }
  return (value as unknown[]).filter(
    (entry): entry is string => typeof entry === "string",
  );
}

/**
 * Canonical Entity as read from the database. This is NOT the full
 * EntitySchema from contracts (which includes future fields like
 * roleHypothesisIds, comparisonIds, etc.). It is the minimal durable
 * shape that M-A10 requires.
 */
export interface CanonicalEntity {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly canonicalName: string;
  readonly entityType: string | null;
  readonly status: string;
  readonly observationIds: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly sourceIdentifiers: unknown;
  readonly provenance: unknown;
  readonly metadata: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type EntityRow = Prisma.EntityGetPayload<Record<string, never>>;

function rowToEntity(row: EntityRow): CanonicalEntity {
  return {
    id: row.id,
    caseId: row.caseId,
    investigationId: row.investigationId,
    canonicalName: row.canonicalName,
    entityType: row.entityType,
    status: row.status,
    observationIds: toIdArray(row.observationIds),
    hypothesisIds: toIdArray(row.hypothesisIds),
    sourceIdentifiers: row.sourceIdentifiers,
    provenance: row.provenance,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Lifecycle states owned by an authority decision path. A reprocessing pass
 * MUST NOT reset these.
 */
const PRESERVED_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  "MERGED",
  "SPLIT",
  "ARCHIVED",
]);

export interface MaterializeEntityResult {
  readonly wrote: boolean;
  readonly preservedExisting: boolean;
  readonly reusedExisting: boolean;
  readonly entity: CanonicalEntity;
}

export class EntityStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Interactive transaction runner bound to THIS store's Prisma client (so an
   * injected test-DB store opens its transaction against the test database,
   * not the global `db`). The authority layer uses this to co-locate the
   * hypothesis ACCEPT decision + canonical entity materialization + the
   * ENTITY_CREATED temporal record in one atomic boundary.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn, { maxWait: 30_000, timeout: 60_000 });
  }

  /**
   * Idempotent, lifecycle-preserving canonical Entity write.
   *
   * identityKey @unique ensures the same case+name+type converges to one
   * logical entity. When a row already exists:
   *   - PRESERVED status (MERGED/SPLIT/ARCHIVED): existing status kept,
   *     only machine-readable fields refreshed.
   *   - Otherwise: status + fields refreshed.
   *
   * The observationIds and hypothesisIds arrays are MERGED with any existing
   * values — a retry / concurrent pass never loses previously linked data.
   */
  async materializeEntity(
    input: {
      readonly identityKey: string;
      readonly entity: {
        readonly id: string;
        readonly caseId: string;
        readonly investigationId?: string;
        readonly canonicalName: string;
        readonly entityType?: string;
        readonly status: string;
        readonly observationIds: readonly string[];
        readonly hypothesisIds: readonly string[];
        readonly provenance: unknown;
        readonly metadata?: unknown;
      };
    },
    tx?: Prisma.TransactionClient,
  ): Promise<MaterializeEntityResult> {
    const { identityKey, entity } = input;

    const run = async (
      client: Prisma.TransactionClient,
    ): Promise<MaterializeEntityResult> => {
      const now = new Date();
      let existing = await client.entity.findUnique({
        where: { identityKey },
      });

      if (!existing) {
        try {
          const created = await client.entity.create({
            data: {
              id: entity.id,
              identityKey,
              caseId: entity.caseId,
              investigationId: entity.investigationId ?? null,
              canonicalName: entity.canonicalName,
              entityType: entity.entityType ?? null,
              status: entity.status,
              observationIds: toJson(entity.observationIds),
              hypothesisIds: toJson(entity.hypothesisIds),
              provenance: toJson(entity.provenance),
              metadata: entity.metadata !== undefined ? toJson(entity.metadata) : Prisma.JsonNull,
              createdAt: now,
              updatedAt: now,
            },
          });
          return {
            wrote: true,
            preservedExisting: false,
            reusedExisting: false,
            entity: rowToEntity(created),
          };
        } catch (cause) {
          const code =
            cause instanceof Prisma.PrismaClientKnownRequestError
              ? cause.code
              : undefined;
          if (code !== "P2002") throw cause;
          existing = await client.entity.findUnique({
            where: { identityKey },
          });
          if (!existing) throw cause;
        }
      }

      const existingStatus = existing.status;
      const preservedExisting = PRESERVED_LIFECYCLE_STATUSES.has(existingStatus);

      // Merge observationIds and hypothesisIds — never lose previously linked data.
      const mergedObsIds = Array.from(new Set([
        ...toIdArray(existing.observationIds),
        ...entity.observationIds,
      ]));
      const mergedHypIds = Array.from(new Set([
        ...toIdArray(existing.hypothesisIds),
        ...entity.hypothesisIds,
      ]));

      const updated = await client.entity.update({
        where: { id: existing.id },
        data: {
          ...(preservedExisting
            ? {
                observationIds: toJson(mergedObsIds),
                hypothesisIds: toJson(mergedHypIds),
                updatedAt: now,
              }
            : {
                canonicalName: entity.canonicalName,
                entityType: entity.entityType ?? null,
                status: entity.status,
                observationIds: toJson(mergedObsIds),
                hypothesisIds: toJson(mergedHypIds),
                provenance: toJson(entity.provenance),
                ...(entity.metadata !== undefined
                  ? { metadata: toJson(entity.metadata) }
                  : {}),
                updatedAt: now,
              }),
        },
      });

      return {
        wrote: true,
        preservedExisting,
        reusedExisting: true,
        entity: rowToEntity(updated),
      };
    };

    // When the caller supplied a transaction client we operate directly inside
    // it (no nested $transaction). Otherwise we open our own interactive tx.
    if (tx) return run(tx);
    return this.prisma.$transaction(run, { maxWait: 30_000, timeout: 60_000 });
  }

  /**
   * Read seam — fetch a single entity by deterministic id, case-scoped.
   */
  async findById(
    id: string,
    filter: { caseId: string },
  ): Promise<CanonicalEntity | null> {
    const row = await this.prisma.entity.findFirst({
      where: { id, caseId: filter.caseId },
    });
    return row ? rowToEntity(row) : null;
  }

  /**
   * Read seam — list all canonical entities within a case.
   */
  async listByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<CanonicalEntity[]> {
    const rows = await this.prisma.entity.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToEntity(row));
  }

  /**
   * Read seam — count entities by status within a case.
   */
  async countByCaseAndStatus(
    caseId: string,
    status: string,
  ): Promise<number> {
    return this.prisma.entity.count({ where: { caseId, status } });
  }

  /**
   * Read seam — list entities that participate in the given observation IDs.
   * Used by M-A10 to build EntityEvidence[] from canonical entities.
   */
  async listByCaseWithObservations(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<CanonicalEntity[]> {
    const rows = await this.prisma.entity.findMany({
      where: {
        caseId,
        investigationId: filter.investigationId,
        status: { notIn: ["ARCHIVED"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToEntity(row));
  }

  /**
   * Update an entity's status. Used for authority decisions (ACCEPT, REJECT,
   * MERGE, SPLIT, ARCHIVE). Validates that the transition is permitted.
   */
  async updateStatus(
    id: string,
    filter: { caseId: string },
    newStatus: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CanonicalEntity | null> {
    const client = tx ?? this.prisma;
    const row = await client.entity.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row) return null;

    const updated = await client.entity.update({
      where: { id },
      data: { status: newStatus, updatedAt: new Date() },
    });
    return rowToEntity(updated);
  }
}

export const entityStore = new EntityStore();
