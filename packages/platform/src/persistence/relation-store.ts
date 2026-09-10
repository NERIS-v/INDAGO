// ============================================================================
// Canonical Relation Persistence Store (M-A10 relation authority output)
//
// Single Prisma data-access boundary for durable Canonical Relation writes +
// the canonical-relation read seam. Generared Prisma types only — no `any`, no
// `as any`, no `@ts-ignore`.
//
// A Canonical Relation is the EXPLICIT outcome of an ACCEPTED RelationHypothesis
// (relation authority). It is NEVER fabricated from a resolution score alone;
// it is created only through the relation-materialization authority path. The
// Graphology projection consumes these Canonical Relations (§32, §35, §65).
//
// Idempotency: relationKey @unique → the same (source, target, relationType,
// directed, model) maps to exactly ONE canonical relation. A retry of an accept
// converges to that row — never a duplicate.
//
// REVERSED != MERGED: reversal updates the canonical relation's status + records
// reversedAt; it does not delete the row.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";
import { computeContentHash, bytesToUuid4 } from "@indago/ingestion";
import {
  TemporalAssertionSchema,
  type TemporalAssertion,
  type TemporalInterval,
} from "@indago/contracts";

/**
 * Parse the bounded `temporalAssertions` JSON column into a typed,
 * chronologically ordered assertion array. Empty / malformed payloads are
 * treated as zero assertions (pre-amendment rows).
 */
export function parseTemporalAssertions(raw: unknown): readonly TemporalAssertion[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw.map((entry) => TemporalAssertionSchema.safeParse(entry));
  // Drop any malformed assertion entries rather than throwing — an
  // assertion recorded by an older code revision may carry fields that
  // later schemas tightened.  Only valid assertions contribute.
  return parsed
    .filter((r): r is { success: true; data: TemporalAssertion } => r.success)
    .map((r) => r.data);
}

/**
 * Versioned canonical identity namespace for Canonical Relations. Deliberately
 * distinct from the hypothesis namespace so a canonical Relation id can never
 * collide with the hypothesis id that produced it.
 */
export const RELATION_IDENTITY_NAMESPACE = "indago:canonical-relation";
export const RELATION_IDENTITY_VERSION = 1;

export interface RelationIdentityInput {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly directed: boolean;
  readonly scoreModelVersion: string;
}

/**
 * Build the versioned canonical relation key (same layout as the hypothesis key
 * so interpretation is identical, but under the canonical namespace).
 */
export function buildRelationKey(input: RelationIdentityInput): string {
  return JSON.stringify([
    RELATION_IDENTITY_NAMESPACE,
    `v${RELATION_IDENTITY_VERSION}`,
    input.sourceEntityId,
    input.targetEntityId,
    input.relationType,
    input.directed ? "directed" : "undirected",
    input.scoreModelVersion,
  ]);
}

/**
 * Derive a deterministic canonical RelationId (UUID v4-shaped) from the
 * canonical relation key. Same inputs → same id across retries.
 */
export async function deterministicRelationId(
  input: RelationIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildRelationKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h: string) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}

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
 * Canonical Relation as read from the database.
 */
export interface DurableRelation {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly directed: boolean;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly status: string;
  readonly scoreModelVersion: string;
  readonly evidenceCount: number;
  readonly provenance: unknown;
  readonly hypothesisId: string;
  readonly validityInterval: unknown | null;
  /** Structured temporal assertion family (append-only; amendments never overwrite). */
  readonly temporalAssertions: readonly TemporalAssertion[];
  readonly createdAt: Date;
  readonly reversedAt: Date | null;
}

type RelationRow = Prisma.RelationGetPayload<Record<string, never>>;

function rowToRelation(row: RelationRow): DurableRelation {
  return {
    id: row.id,
    caseId: row.caseId,
    investigationId: row.investigationId,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    relationType: row.relationType,
    directed: row.directed,
    support: row.support,
    evidenceBasis: toIdArray(row.evidenceBasis),
    contradictions: toIdArray(row.contradictions),
    status: row.status,
    scoreModelVersion: row.scoreModelVersion,
    evidenceCount: row.evidenceCount,
    provenance: row.provenance,
    hypothesisId: row.hypothesisId,
    validityInterval: row.validityInterval,
    temporalAssertions: parseTemporalAssertions(row.temporalAssertions),
    createdAt: row.createdAt,
    reversedAt: row.reversedAt,
  };
}

export interface MaterializeRelationInput {
  readonly id: string;
  readonly relationKey: string;
  readonly caseId: string;
  readonly investigationId?: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly directed: boolean;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly scoreModelVersion: string;
  readonly evidenceCount: number;
  readonly provenance: unknown;
  readonly hypothesisId: string;
  readonly validityInterval?: unknown;
}

export interface MaterializeRelationResult {
  readonly wrote: boolean;
  readonly reusedExisting: boolean;
  readonly relation: DurableRelation;
}

export class RelationStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Idempotent canonical-relation write. relationKey @unique makes an accept
   * retry converge to the already-materialized relation (never a duplicate).
   * Because a canonical relation is authoritative, a re-write never resets
   * its status — an existing ACTIVE row stays ACTIVE, an existing REVERSED row
   * stays REVERSED (REVERSED != MERGED; history is preserved).
   */
  /**
   * Interactive transaction runner bound to THIS store's Prisma client (so an
   * injected test-DB store opens its transaction against the test database,
   * not the global `db`). The authority layer uses this to co-locate the
   * hypothesis decision + canonical-relation write in one atomic boundary.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn, {
      maxWait: 30_000,
      timeout: 60_000,
    });
  }

  async materializeRelation(
    input: MaterializeRelationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<MaterializeRelationResult> {
    const run = async (
      client: Pick<Prisma.TransactionClient, "relation">,
    ): Promise<MaterializeRelationResult> => {
      const { id, relationKey } = input;
      const now = new Date();
      const existing = await client.relation.findUnique({
        where: { relationKey },
      });
      if (!existing) {
        try {
          const created = await client.relation.create({
            data: {
              id,
              relationKey,
              caseId: input.caseId,
              investigationId: input.investigationId ?? null,
              sourceEntityId: input.sourceEntityId,
              targetEntityId: input.targetEntityId,
              relationType: input.relationType,
              directed: input.directed,
              support: input.support,
              evidenceBasis: toJson(input.evidenceBasis),
              contradictions: toJson(input.contradictions),
              status: "ACTIVE",
              scoreModelVersion: input.scoreModelVersion,
              evidenceCount: input.evidenceCount,
              provenance: toJson(input.provenance),
              hypothesisId: input.hypothesisId,
              validityInterval:
                input.validityInterval !== undefined
                  ? toJson(input.validityInterval)
                  : Prisma.JsonNull,
              createdAt: now,
              updatedAt: now,
            },
          });
          return {
            wrote: true,
            reusedExisting: false,
            relation: rowToRelation(created),
          };
        } catch (cause) {
          const code =
            cause instanceof Prisma.PrismaClientKnownRequestError
              ? cause.code
              : undefined;
          if (code !== "P2002") throw cause;
          const raced = await client.relation.findUnique({ where: { relationKey } });
          if (!raced) throw cause;
          return {
            wrote: true,
            reusedExisting: true,
            relation: rowToRelation(raced),
          };
        }
      }
      return {
        wrote: true,
        reusedExisting: true,
        relation: rowToRelation(existing),
      };
    };

    // When the caller supplied a transaction client we operate directly inside
    // it (no nested $transaction). Otherwise we open our own interactive tx.
    if (tx) return run(tx);
    return this.prisma.$transaction(run, {
      maxWait: 30_000,
      timeout: 60_000,
    });
  }

  /**
   * Reverse a canonical relation — the durable flip of an accepted relation.
   * Guards: case-scoped; only an ACTIVE relation may be reversed (a REVERSED
   * relation is terminal and refused). Returns null when not found / not ACTIVE,
   * the durable re-read row when reversed.
   */
  async markReversed(
    id: string,
    filter: { caseId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<DurableRelation | null> {
    const client = tx ?? this.prisma;
    const row = await client.relation.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row || row.status !== "ACTIVE") return null;

    const now = new Date();
    const updated = await client.relation.update({
      where: { id },
      data: { status: "REVERSED", reversedAt: now, updatedAt: now },
    });
    return rowToRelation(updated);
  }

  /**
   * Read seam — fetch a canonical relation by deterministic id, case-scoped.
   */
  async findById(
    id: string,
    filter: { caseId: string },
  ): Promise<DurableRelation | null> {
    const row = await this.prisma.relation.findFirst({
      where: { id, caseId: filter.caseId },
    });
    return row ? rowToRelation(row) : null;
  }

  /**
   * Read seam — List canonical relations within a case (ACCEPTED/authority
   * outcome), plus the canonical entities for the projection boundary.
   */
  async listByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<DurableRelation[]> {
    const rows = await this.prisma.relation.findMany({
      where: { caseId, investigationId: filter.investigationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToRelation(row));
  }

  /**
   * Read seam — ACTIVE canonical relations for a case (the Graphology projection
   * input). REVERSED relations are excluded: the graph models only living
   * relations.
   */
  async listActiveByCase(
    caseId: string,
    filter: { investigationId: string },
  ): Promise<DurableRelation[]> {
    const rows = await this.prisma.relation.findMany({
      where: {
        caseId,
        investigationId: filter.investigationId,
        status: "ACTIVE",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToRelation(row));
  }

  /**
   * Seed the initial ORIGINAL assertion on a freshly materialized canonical
   * relation (M-A12 item A). Called in the same transaction as createVersion
   * so `revisionAtVersionNumber` is the version that first materialized this
   * relation. Idempotent — if assertions are already populated (reused), no-op.
   */
  async seedOriginalAssertion(
    id: string,
    filter: { caseId: string },
    validityInterval: TemporalInterval,
    context: { readonly revisionAtVersionNumber: number },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const row = await client.relation.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row) return;
    const existing = parseTemporalAssertions(row.temporalAssertions);
    if (existing.length > 0) return; // already seeded (reused path)

    const assertion: TemporalAssertion = {
      id: `assertion:${id}:1`,
      relationId: id,
      kind: "ORIGINAL",
      validityInterval,
      revisionAtVersionNumber: context.revisionAtVersionNumber,
    };
    await client.relation.update({
      where: { id },
      data: { temporalAssertions: toJson([assertion]) },
    });
  }

  /**
   * Amended-validity authority boundary for a canonical relation (M-A12 item A).
   *
   * APPENDS a new AMENDMENT assertion to `temporalAssertions` (never overwrites
   * or deletes the original). Overwrites the persisted `validityInterval` column
   * with the correction's domain interval (current-valid interval, so ActiveMQ
   * consumers and graph projection don't need to compute it). The ORIGINAL
   * assertion is preserved in `temporalAssertions` for historical reconstruction.
   *
   * `revisionAtVersionNumber` MUST be provided by the caller (it is the graph
   * revision where this correction became known — always part of a same-tx
   * createVersion call).
   *
   * Case-scoped; returns null when not found / not ACTIVE.
   */
  async amendValidity(
    id: string,
    filter: { caseId: string },
    newInterval: TemporalInterval,
    context: {
      readonly revisionAtVersionNumber: number;
      readonly supersedesAssertionId: string;
      readonly provenance?: Record<string, unknown>;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DurableRelation | null> {
    const client = tx ?? this.prisma;
    const row = await client.relation.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row || row.status !== "ACTIVE") return null;

    const existing = parseTemporalAssertions(row.temporalAssertions);
    const amendmentAssertion: TemporalAssertion = {
      id: `assertion:${id}:${existing.length + 1}`,
      relationId: id,
      kind: "AMENDMENT",
      validityInterval: newInterval,
      provenance: context.provenance,
      supersedesAssertionId: context.supersedesAssertionId,
      revisionAtVersionNumber: context.revisionAtVersionNumber,
    };
    const updatedAssertions = [...existing, amendmentAssertion];

    const now = new Date();
    const updated = await client.relation.update({
      where: { id },
      data: {
        validityInterval: toJson(newInterval),
        temporalAssertions: toJson(updatedAssertions),
        updatedAt: now,
      },
    });
    return rowToRelation(updated);
  }
}

export const relationStore = new RelationStore();