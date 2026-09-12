// ============================================================================
// M-A09 Entity Hypothesis Persistence Store
//
// Single Prisma data-access boundary for durable EntityHypothesis writes + the
// read seam. Strict generated Prisma types only — no `any`, no `as any`, no
// `@ts-ignore`.
//
// Identity / idempotency rules (mirror CandidatePairStore / EntityMentionStore):
//   - EntityHypothesis.id @id             → deterministic UUID (SHA-256 of the
//       canonical identity key built by the pure engine's
//       buildEntityHypothesisIdentityKey).
//   - EntityHypothesis.identityKey @unique → exact-duplicate guard: a
//       candidatePairId + scoreModelVersion maps to exactly ONE logical
//       hypothesis. A retried / concurrent MA09 pass converges to that row —
//       never a duplicate.
//
// The STORE owns ONLY persistence + case scope + deterministic identity
// enforcement. It MUST NOT:
//   - calculate score
//   - infer status
//   - resolve identity
//   - create Entity IDs
// The PURE engine owns all semantics; this store is a faithful, total
// read-back of the durable rows reassembled into EntityHypothesisSchema.
//
// LIFECYCLE PRESERVATION (M-A09 requirement #10 / #20):
//   A re-run of the same logical pair/version MUST NOT reset an existing
//   ACCEPTED / REJECTED / REVERSED hypothesis back to PROPOSED. Those are
//   authority/lifecycle states owned by a later decision path. When a
//   hypothesis row already exists in one of those states, upsertHypothesis
//   keeps the existing lifecycle status UNTOUCHED and refreshes only the pure
//   machine fields (score / evidence / comparison fields) so reprocessing is
//   never destructive to a human/authority decision.
//
// REVERSED ≠ MERGED: reversal updates status + records audit history; it does
// NOT delete the row (deletion is never performed here) and is unrelated to
// future canonical-entity MERGE semantics.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  EntityHypothesisSchema,
  type EntityHypothesis,
  type EntityResolutionStatus,
} from "@indago/contracts";
import { db } from "../db/prisma.js";

/**
 * Round-trip value into a JSON-safe Prisma Json input. Strips `undefined`
 * fields, which Prisma rejects in Json columns.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

/**
 * Parse a bounded JSON column of UUID strings back into a typed string array.
 * The store writes these columns as JSON arrays; Prisma types them as
 * JsonValue (nullable), so we assert the runtime array shape explicitly — the
 * same pattern CandidatePairStore uses for its Json `blockingPasses` column.
 */
function toIdArray(value: Prisma.JsonValue): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value) === false) {
    return [];
  }
  return (value as unknown[]).filter(
    (entry): entry is string => typeof entry === "string",
  );
}

type EntityHypothesisRow = Prisma.EntityHypothesisGetPayload<Record<string, never>>;

/**
 * Lifecycle states owned by an authority decision path. A reprocessing pass
 * MUST NOT reset these back to a machine PROPOSED/UNRESOLVED value — see class
 * header.
 */
const PRESERVED_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  "ACCEPTED",
  "REJECTED",
  "REVERSED",
]);

function rowToHypothesis(row: EntityHypothesisRow): EntityHypothesis {
  const supportingCandidateIds = toIdArray(row.supportingCandidateIds);
  const supportingObservationIds = toIdArray(row.supportingObservationIds);
  const contradictingObservationIds = toIdArray(row.contradictingObservationIds);
  return EntityHypothesisSchema.parse({
    id: row.id,
    caseId: row.caseId,
    ...(row.investigationId !== null
      ? { investigationId: row.investigationId }
      : {}),
    ...(row.entityId !== null ? { entityId: row.entityId } : {}),
    candidatePairId: row.candidatePairId,
    ...(supportingCandidateIds.length > 0
      ? { supportingCandidateIds }
      : {}),
    ...(row.resolvedEntityId !== null
      ? { resolvedEntityId: row.resolvedEntityId }
      : {}),
    comparisonStatus: row.comparisonStatus,
    score: row.score,
    scoreModelVersion: row.scoreModelVersion,
    supportingObservationIds,
    contradictingObservationIds,
    status: row.status,
    provenance: row.provenance,
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
    createdAt: { value: row.createdAt.toISOString(), precision: "exact" },
    updatedAt: { value: row.updatedAt.toISOString(), precision: "exact" },
  });
}

export interface UpsertHypothesisResult {
  /** Whether THIS call wrote the row (create) or refreshed machine fields. */
  readonly wrote: boolean;
  /** True when an existing authority lifecycle state was preserved verbatim. */
  readonly preservedExisting: boolean;
  /** Whether an existing durable row was reused (as opposed to created). */
  readonly reusedExisting: boolean;
  /** The durable EntityHypothesis as now persisted (authoritative read-back). */
  readonly hypothesis: EntityHypothesis;
}

export class EntityHypothesisStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Idempotent, lifecycle-preserving EntityHypothesis write.
   *
   * identityKey @unique → a retry / concurrent MA09 pass can never duplicate a
   * logical hypothesis. When a row already exists:
   *   - if its status is a preserved authority lifecycle state (ACCEPTED /
   *     REJECTED / REVERSED), the existing status is kept and ONLY the pure
   *     machine fields (score, comparisonStatus, evidence sets, updatedAt) are
   *     refreshed — a reprocess NEVER clobbers an authority decision.
   *   - otherwise (PROPOSED / UNRESOLVED / CONTRADICTED / etc.) the row is
   *     refreshed to reflect the recomputed machine result.
   *
   * The read-then-write is executed inside a transaction so concurrent
   * identical writes converge to one logical row. The insert uses
   * createMany(… skipDuplicates) as the idempotent write — P2002-free by
   * construction — so the transaction is never aborted and the winner row can
   * be read back inside the same transaction after a lost create race.
   */
  async upsertHypothesis(input: {
    readonly identityKey: string;
    readonly hypothesis: EntityHypothesis;
  }): Promise<UpsertHypothesisResult> {
    const { identityKey, hypothesis } = input;

    // v1 Candidate↔Candidate: candidatePairId is always present. A missing
    // candidatePairId would indicate a contract/stage violation (not a
    // legitimate future Entity↔Entity path in this store).
    if (hypothesis.candidatePairId === undefined) {
      throw new Error(
        "EntityHypothesisStore: candidatePairId is required in v1 Candidate↔Candidate resolution",
      );
    }
    const candidatePairId: string = hypothesis.candidatePairId;

    const now = new Date();

    return await this.prisma.$transaction(
      async (tx) => {
      let existing = await tx.entityHypothesis.findUnique({
        where: { identityKey },
      });

      // Lost-create race: a concurrent transaction inserted the identical
      // identityKey between our read and our write. Insert via
      // createMany(… skipDuplicates) — this is P2002-FREE by construction.
      // DO NOT 'create' + P2002-catch here: a unique-violation aborts the
      // PostgreSQL transaction, so any re-read inside it fails with 25P02
      // ("current transaction is aborted, commands ignored …").
      if (!existing) {
        const { count } = await tx.entityHypothesis.createMany({
          data: [
            {
              id: hypothesis.id,
              identityKey,
              caseId: hypothesis.caseId,
              investigationId: hypothesis.investigationId ?? null,
              candidatePairId,
              entityId: hypothesis.entityId ?? null,
              resolvedEntityId: hypothesis.resolvedEntityId ?? null,
              status: hypothesis.status,
              comparisonStatus: hypothesis.comparisonStatus,
              score: hypothesis.score,
              scoreModelVersion: hypothesis.scoreModelVersion,
              supportingCandidateIds: toJson(hypothesis.supportingCandidateIds ?? []),
              supportingObservationIds: toJson(hypothesis.supportingObservationIds ?? []),
              contradictingObservationIds: toJson(hypothesis.contradictingObservationIds ?? []),
              provenance: toJson(hypothesis.provenance),
              metadata: hypothesis.metadata !== undefined ? toJson(hypothesis.metadata) : Prisma.JsonNull,
              createdAt: now,
              updatedAt: now,
            },
          ],
          skipDuplicates: true,
        });

        if (count === 1) {
          // We won the insert race (or there was no race at all). Re-read the
          // durable row so the returned hypothesis reflects the stored row.
          const created = await tx.entityHypothesis.findUnique({
            where: { identityKey },
          });
          if (!created) {
            throw new Error(
              "EntityHypothesisStore: inserted hypothesis row vanished immediately after createMany",
            );
          }
          return {
            wrote: true,
            preservedExisting: false,
            reusedExisting: false,
            hypothesis: rowToHypothesis(created),
          };
        }

        // A concurrent writer inserted the identical row between our read and
        // create (skipDuplicates skipped our insert). The transaction is still
        // live — re-read the winner and proceed through the shared refresh path.
        existing = await tx.entityHypothesis.findUnique({
          where: { identityKey },
        });
        if (!existing) {
          // Defensive: a skip without a competing row is a constraint anomaly.
          throw new Error(
            `EntityHypothesisStore: unique conflict without a competing hypothesis row for ${identityKey}`,
          );
        }
      }

      // Existing row. Preserve an authority lifecycle status if present,
      // otherwise refresh machine fields to the recomputed result.
      const existingStatus = existing.status;
      const preservedExisting = PRESERVED_LIFECYCLE_STATUSES.has(existingStatus);

      const updated = await tx.entityHypothesis.update({
        where: { id: existing.id },
        data: {
          // Never touch the preserved lifecycle status.
          ...(preservedExisting
            ? {}
            : {
                status: hypothesis.status,
                comparisonStatus: hypothesis.comparisonStatus,
                score: hypothesis.score,
                scoreModelVersion: hypothesis.scoreModelVersion,
                supportingCandidateIds: toJson(hypothesis.supportingCandidateIds ?? []),
                supportingObservationIds: toJson(hypothesis.supportingObservationIds ?? []),
                contradictingObservationIds: toJson(hypothesis.contradictingObservationIds ?? []),
                provenance: toJson(hypothesis.provenance),
                ...(hypothesis.metadata !== undefined
                  ? { metadata: toJson(hypothesis.metadata) }
                  : {}),
                updatedAt: now,
              }),
        },
      });

      return {
        wrote: true,
        preservedExisting,
        reusedExisting: true,
        hypothesis: rowToHypothesis(updated),
      };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
  }

  /**
   * Authority decision — mark a PROPOSED hypothesis ACCEPTED and bind it to its
   * canonical EntityId. This is the explicit identity-materialization boundary
   * that M-A09.5 / M-A10 depend on: a canonical EntityId is written ONLY here,
   * from an explicit ACCEPT decision, never fabricated from a score.
   *
   * Guards:
   *   - case-scoped lookup (caseId resolved server-side)
   *   - only a PROPOSED hypothesis may be accepted; ACCEPTED / REJECTED /
   *     REVERSED decisions are never clobbered
   *
   * Returns null when the hypothesis does not exist in the case or is not
   * PROPOSED. Returns the durable re-read row in all valid banks.
   */
  async markAccepted(
    id: string,
    filter: { caseId: string },
    entityId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EntityHypothesis | null> {
    const client = tx ?? this.prisma;
    const existing = await client.entityHypothesis.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!existing) return null;
    if (existing.status !== "PROPOSED") return null;

    const updated = await client.entityHypothesis.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        entityId,
        updatedAt: new Date(),
      },
    });
    return rowToHypothesis(updated);
  }

  /**
   * Read seam — fetch a single hypothesis by deterministic id, strictly
   * case-scoped (caseId is resolved SERVER-SIDE; never trusted from a client).
   */
  async findById(
    id: string,
    filter: { caseId: string },
  ): Promise<EntityHypothesis | null> {
    const row = await this.prisma.entityHypothesis.findFirst({
      where: { id, caseId: filter.caseId },
    });
    return row ? rowToHypothesis(row) : null;
  }

  /**
   * Read seam — fetch the single logical hypothesis for a CandidatePair within
   * a case (a candidatePairId + scoreModelVersion ⇒ one row). Case-scoped.
   */
  async findByCandidatePair(
    candidatePairId: string,
    filter: { caseId: string; scoreModelVersion?: string },
  ): Promise<EntityHypothesis | null> {
    const where =
      filter.scoreModelVersion !== undefined
        ? { candidatePairId, caseId: filter.caseId, scoreModelVersion: filter.scoreModelVersion }
        : { candidatePairId, caseId: filter.caseId };
    const row = await this.prisma.entityHypothesis.findFirst({
      where,
      orderBy: { createdAt: "desc" },
    });
    return row ? rowToHypothesis(row) : null;
  }

  /**
   * Read seam — list hypotheses within authorization boundaries. Rows are
   * reassembled + schema-validated; an invalid row surfaces loudly rather than
   * being silently dropped.
   */
  async listByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<EntityHypothesis[]> {
    const rows = await this.prisma.entityHypothesis.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToHypothesis(row));
  }

  /**
   * Read seam — count hypotheses by lifecycle status within a case (metrics /
   * audit only; never an idempotency gate).
   */
  async countByCaseAndStatus(
    caseId: string,
    status: EntityResolutionStatus,
  ): Promise<number> {
    return this.prisma.entityHypothesis.count({ where: { caseId, status } });
  }
}

export const entityHypothesisStore = new EntityHypothesisStore();
