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
  async materializeRelation(
    input: MaterializeRelationInput,
  ): Promise<MaterializeRelationResult> {
    const { id, relationKey } = input;
    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.relation.findUnique({
        where: { relationKey },
      });
      if (!existing) {
        try {
          const created = await tx.relation.create({
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
          const raced = await tx.relation.findUnique({ where: { relationKey } });
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
  ): Promise<DurableRelation | null> {
    const row = await this.prisma.relation.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row || row.status !== "ACTIVE") return null;

    const now = new Date();
    const updated = await this.prisma.relation.update({
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
}

export const relationStore = new RelationStore();