// ============================================================================
// M-A10 Relation Hypothesis Persistence Store
//
// Single Prisma data-access boundary for durable RelationHypothesis writes +
// the read seam. Strict generated Prisma types only — no `any`, no `as any`,
// no `@ts-ignore`.
//
// Identity / idempotency rules (mirror EntityHypothesisStore):
//   - RelationHypothesis.id @id             → deterministic UUID (SHA-256 of the
//       canonical identity key built by the pure engine's
//       buildRelationHypothesisIdentityKey).
//   - RelationHypothesis.identityKey @unique → exact-duplicate guard: the same
//       entity pair + relation type + scoring model maps to exactly ONE logical
//       hypothesis. A retried / concurrent MA10 pass converges to that row —
//       never a duplicate.
//
// LIFECYCLE PRESERVATION (M-A10 requirement):
//   A re-run of the same logical pair/version MUST NOT reset an existing
//   ACCEPTED / REJECTED / REVERSED hypothesis back to PROPOSED. Those are
//   authority/lifecycle states owned by a later decision path. When a
//   hypothesis row already exists in one of those states, upsertHypothesis
//   keeps the existing lifecycle status UNTOUCHED and refreshes only the pure
//   machine fields (score / evidence / metrics) so reprocessing is never
//   destructive to a human/authority decision.
//
// REVERSED ≠ MERGED: reversal updates status + records audit history; it does
// NOT delete the row.
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
 * Canonical RelationHypothesis as read from the database.
 */
export interface DurableRelationHypothesis {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly status: string;
  readonly scoreModelVersion: string;
  readonly evidenceCount: number;
  readonly evidenceStrength: number;
  readonly sourceCoverage: number;
  readonly temporalCoverage: number;
  readonly directed: boolean;
  readonly provenance: unknown;
  readonly metadata: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type RelationHypothesisRow = Prisma.RelationHypothesisGetPayload<Record<string, never>>;

function rowToRelationHypothesis(row: RelationHypothesisRow): DurableRelationHypothesis {
  return {
    id: row.id,
    caseId: row.caseId,
    investigationId: row.investigationId,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    relationType: row.relationType,
    support: row.support,
    evidenceBasis: toIdArray(row.evidenceBasis),
    contradictions: toIdArray(row.contradictions),
    status: row.status,
    scoreModelVersion: row.scoreModelVersion,
    evidenceCount: row.evidenceCount,
    evidenceStrength: row.evidenceStrength,
    sourceCoverage: row.sourceCoverage,
    temporalCoverage: row.temporalCoverage,
    directed: row.directed,
    provenance: row.provenance,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Lifecycle states owned by an authority decision path. A reprocessing pass
 * MUST NOT reset these back to a machine PROPOSED value.
 */
const PRESERVED_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  "ACCEPTED",
  "REJECTED",
  "REVERSED",
]);

export interface UpsertRelationHypothesisResult {
  readonly wrote: boolean;
  readonly preservedExisting: boolean;
  readonly reusedExisting: boolean;
  readonly hypothesis: DurableRelationHypothesis;
}

export interface RelationHypothesisInput {
  readonly id: string;
  readonly identityKey: string;
  readonly caseId: string;
  readonly investigationId?: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly status: string;
  readonly scoreModelVersion: string;
  readonly evidenceCount: number;
  readonly evidenceStrength: number;
  readonly sourceCoverage: number;
  readonly temporalCoverage: number;
  readonly directed: boolean;
  readonly provenance: unknown;
  readonly metadata?: unknown;
}

/**
 * Authority lifecycle transitions for a RelationHypothesis.
 *
 *   PROPOSED → ACCEPTED   (explicit accept — gates canonical Relation creation)
 *   PROPOSED → REJECTED   (explicit reject — proposition dismissed)
 *   ACCEPTED → REVERSED   (explicit reverse — retains history, REVERSED != MERGED)
 *   REJECTED → REVERSED   (explicit reverse of a rejection)
 *
 * Every other combination is INVALID: an authority decision on a terminal
 * state (e.g. re-accepting an already-ACCEPTED/REJECTED/REVERSED hypothesis) is
 * refused rather than silently clobbered. REVERSED is terminal.
 */
const RELATION_HYPOTHESIS_TRANSITIONS: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  // Keyed by TARGET status; the set lists the VALID SOURCE statuses that may
  // transition INTO that target via an authority decision.
  ACCEPTED: new Set(["PROPOSED"]),
  REJECTED: new Set(["PROPOSED"]),
  REVERSED: new Set(["ACCEPTED", "REJECTED"]),
  // PROPOSED is machine-produced; no authority decision targets it.
  PROPOSED: new Set([]),
};

export class RelationHypothesisTransitionError extends Error {
  constructor(
    public readonly code:
      | "HYPOTHESIS_NOT_FOUND"
      | "INVALID_TRANSITION"
      | "CASE_MISMATCH",
    public readonly hypothesisId: string,
    public readonly fromStatus?: string,
    public readonly toStatus?: string,
  ) {
    super(
      `Relation hypothesis transition refused (${code}): ${fromStatus ?? "unknown"} -> ${toStatus ?? "unknown"} for ${hypothesisId}`,
    );
    this.name = "RelationHypothesisTransitionError";
  }
}

function assertTransition(
  id: string,
  rowStatus: string,
  newStatus: string,
): void {
  const allowed = RELATION_HYPOTHESIS_TRANSITIONS[newStatus];
  // A transition is only permitted if the row's CURRENT status is listed as a
  // valid predecessor of the requested target state.
  if (allowed === undefined || !allowed.has(rowStatus)) {
    throw new RelationHypothesisTransitionError(
      "INVALID_TRANSITION",
      id,
      rowStatus,
      newStatus,
    );
  }
}

export class RelationHypothesisStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Idempotent, lifecycle-preserving RelationHypothesis write.
   *
   * identityKey @unique → a retry / concurrent MA10 pass can never duplicate
   * a logical hypothesis. When a row already exists:
   *   - if its status is a preserved authority lifecycle state (ACCEPTED /
   *     REJECTED / REVERSED), the existing status is kept and ONLY the pure
   *     machine fields (score, evidence, metrics) are refreshed.
   *   - otherwise (PROPOSED) the row is refreshed to reflect the recomputed
   *     machine result.
   */
  async upsertHypothesis(
    input: RelationHypothesisInput,
  ): Promise<UpsertRelationHypothesisResult> {
    const { identityKey, id } = input;
    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      let existing = await tx.relationHypothesis.findUnique({
        where: { identityKey },
      });

      if (!existing) {
        try {
          const created = await tx.relationHypothesis.create({
            data: {
              id,
              identityKey,
              caseId: input.caseId,
              investigationId: input.investigationId ?? null,
              sourceEntityId: input.sourceEntityId,
              targetEntityId: input.targetEntityId,
              relationType: input.relationType,
              support: input.support,
              evidenceBasis: toJson(input.evidenceBasis),
              contradictions: toJson(input.contradictions),
              status: input.status,
              scoreModelVersion: input.scoreModelVersion,
              evidenceCount: input.evidenceCount,
              evidenceStrength: input.evidenceStrength,
              sourceCoverage: input.sourceCoverage,
              temporalCoverage: input.temporalCoverage,
              directed: input.directed,
              provenance: toJson(input.provenance),
              metadata: input.metadata !== undefined ? toJson(input.metadata) : Prisma.JsonNull,
              createdAt: now,
              updatedAt: now,
            },
          });
          return {
            wrote: true,
            preservedExisting: false,
            reusedExisting: false,
            hypothesis: rowToRelationHypothesis(created),
          };
        } catch (cause) {
          const code =
            cause instanceof Prisma.PrismaClientKnownRequestError
              ? cause.code
              : undefined;
          if (code !== "P2002") throw cause;
          existing = await tx.relationHypothesis.findUnique({
            where: { identityKey },
          });
          if (!existing) throw cause;
        }
      }

      const existingStatus = existing.status;
      const preservedExisting = PRESERVED_LIFECYCLE_STATUSES.has(existingStatus);

      const updated = await tx.relationHypothesis.update({
        where: { id: existing.id },
        data: {
          ...(preservedExisting
            ? {}
            : {
                sourceEntityId: input.sourceEntityId,
                targetEntityId: input.targetEntityId,
                relationType: input.relationType,
                support: input.support,
                evidenceBasis: toJson(input.evidenceBasis),
                contradictions: toJson(input.contradictions),
                status: input.status,
                scoreModelVersion: input.scoreModelVersion,
                evidenceCount: input.evidenceCount,
                evidenceStrength: input.evidenceStrength,
                sourceCoverage: input.sourceCoverage,
                temporalCoverage: input.temporalCoverage,
                directed: input.directed,
                provenance: toJson(input.provenance),
                ...(input.metadata !== undefined
                  ? { metadata: toJson(input.metadata) }
                  : {}),
                updatedAt: now,
              }),
        },
      });

      return {
        wrote: true,
        preservedExisting,
        reusedExisting: true,
        hypothesis: rowToRelationHypothesis(updated),
      };
    });
  }

  /**
   * Read seam — fetch a single hypothesis by deterministic id, case-scoped.
   */
  async findById(
    id: string,
    filter: { caseId: string },
  ): Promise<DurableRelationHypothesis | null> {
    const row = await this.prisma.relationHypothesis.findFirst({
      where: { id, caseId: filter.caseId },
    });
    return row ? rowToRelationHypothesis(row) : null;
  }

  /**
   * Read seam — list hypotheses within authorization boundaries. Rows are
   * reassembled and schema-validated.
   */
  async listByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<DurableRelationHypothesis[]> {
    const rows = await this.prisma.relationHypothesis.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ support: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToRelationHypothesis(row));
  }

  /**
   * Read seam — list hypotheses by lifecycle status within a case.
   */
  async listByCaseAndStatus(
    caseId: string,
    filter: { investigationId: string; status: string },
  ): Promise<DurableRelationHypothesis[]> {
    const rows = await this.prisma.relationHypothesis.findMany({
      where: {
        caseId,
        investigationId: filter.investigationId,
        status: filter.status,
      },
      orderBy: [{ support: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToRelationHypothesis(row));
  }

  /**
   * Read seam — list hypotheses involving a specific entity (as source or target).
   */
  async listByEntity(
    entityId: string,
    filter: { caseId: string; investigationId: string },
  ): Promise<DurableRelationHypothesis[]> {
    const rows = await this.prisma.relationHypothesis.findMany({
      where: {
        caseId: filter.caseId,
        investigationId: filter.investigationId,
        OR: [
          { sourceEntityId: entityId },
          { targetEntityId: entityId },
        ],
      },
      orderBy: [{ support: "desc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => rowToRelationHypothesis(row));
  }

  /**
   * Read seam — count hypotheses by lifecycle status within a case.
   */
  async countByCaseAndStatus(
    caseId: string,
    status: string,
  ): Promise<number> {
    return this.prisma.relationHypothesis.count({
      where: { caseId, status },
    });
  }

/**
 * Update hypothesis status. Used for authority decisions (ACCEPT, REJECT,
 * REVERSE). Validates that the transition is permitted by the lifecycle state
 * diagram:
 *   PROPOSED → ACCEPTED | REJECTED
 *   ACCEPTED → REVERSED
 *   REJECTED → REVERSED
 * An invalid transition (including any attempt to mutate a terminal REVERSED
 * state, or re-apply a decision) throws RelationHypothesisTransitionError.
 *
 * Returns the durable re-read row on success; throws when validation fails.
 */
  async updateStatus(
    id: string,
    filter: { caseId: string },
    newStatus: string,
  ): Promise<DurableRelationHypothesis | null> {
    const row = await this.prisma.relationHypothesis.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row) {
      throw new RelationHypothesisTransitionError(
        "HYPOTHESIS_NOT_FOUND",
        id,
      );
    }

    const now = new Date();
    // Authoritative transition guard: only a permitted successor of the row's
    // current status may be written. Terminal / repeat authority decisions are
    // refused (the durable decision is never clobbered).
    assertTransition(id, row.status, newStatus);

    const updated = await this.prisma.relationHypothesis.update({
      where: { id },
      data: { status: newStatus, updatedAt: now },
    });
    return rowToRelationHypothesis(updated);
  }

  /**
   * Authority decision helpers — thin, transition-guarded wrappers over
   * updateStatus so callers never pass an arbitrary status string.
   */
  async acceptHypothesis(
    id: string,
    filter: { caseId: string },
  ): Promise<DurableRelationHypothesis | null> {
    return this.updateStatus(id, filter, "ACCEPTED");
  }

  async rejectHypothesis(
    id: string,
    filter: { caseId: string },
  ): Promise<DurableRelationHypothesis | null> {
    return this.updateStatus(id, filter, "REJECTED");
  }

  async reverseHypothesis(
    id: string,
    filter: { caseId: string },
  ): Promise<DurableRelationHypothesis | null> {
    return this.updateStatus(id, filter, "REVERSED");
  }
}

export const relationHypothesisStore = new RelationHypothesisStore();
