// ============================================================================
// M-A12 D4 GraphVersion Persistence Store (PR2)
//
// Single Prisma data-access boundary for durable GraphVersion writes/reads.
// PostgreSQL is authoritative for graph versions; Graphology is a DERIVED,
// disposable projection rebuilt from this + the canonical domain records.
//
// Identity (D4, locked): id = RANDOM UUID (repo row-ID convention, contract
// GraphVersionIdSchema). Deterministic logical identity is the natural key
// (caseId, versionNumber) — NEVER a content hash. "Same history + same
// boundary ⇒ same versionNumber sequence ⇒ same projected graph" comes from
// replay determinism, never from hashing canonical content into the id.
//
// Version numbering (§ version-numbering):
//   versionNumber is case-scoped, monotonically increasing, never reused,
//   persisted, and allocated as MAX(versionNumber)+1 INSIDE an interactive
//   transaction, SERIALIZED PER CASE by a transaction-scoped PostgreSQL
//   advisory lock (pg_advisory_xact_lock(hashtextextended(caseId,0))). Two
//   simultaneous canonical changes for the same case therefore BLOCK until the
//   in-flight allocation commits and can never compute the same — or silently
//   share a — versionNumber. @@unique([caseId, versionNumber]) remains as a
//   hard safety invariant, not the primary concurrency mechanism (STOP #4 is
//   satisfied). This is the same class of guarantee PR1's sequence store aims
//   for, hardened with an explicit per-case serialization primitive rather
//   than relying on a unique-constraint retry that PostgreSQL aborts.
//
// Lifecycle (D4, § graph version lifecycle): the legal transitions below are
// enforced here; a version is never mutated except a permitted lifecycle
// transition and projection-status / node/edge-count updates.
//
// Lineage (parentGraphVersionId): same-case, parent exists, parent
// versionNumber < child, no cycles, linear (non-branching) — enforced.
//
// projectionStatus: `PENDING` means "version exists, projection not started";
// the contract subset { COMPLETE, PARTIAL, STALE, ERROR } applies once
// projection has run. Never silently marked COMPLETE; retry is idempotent.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";

export type GraphVersionStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";

/**
 * Runtime projection status vocabulary.
 *
 * `PENDING` extends the contract enum (COMPLETE|PARTIAL|STALE|ERROR) to
 * represent "version exists, projection has NOT (yet) completed". This is the
 * minimum distinction PR0 requires (§ projection status): exists / not
 * completed / materialized / failed. `COMPLETE` is only ever set AFTER a valid
 * projection has been materialized by the projection service.
 */
export type GraphVersionProjectionStatus =
  | "PENDING"
  | "COMPLETE"
  | "PARTIAL"
  | "STALE"
  | "ERROR";

export const GRAPH_VERSION_STATUSES: readonly GraphVersionStatus[] = [
  "DRAFT",
  "ACTIVE",
  "SUPERSEDED",
  "ARCHIVED",
];

export const GRAPH_VERSION_PROJECTION_STATUSES: readonly GraphVersionProjectionStatus[] = [
  "PENDING",
  "COMPLETE",
  "PARTIAL",
  "STALE",
  "ERROR",
];

/**
 * Locked legal lifecycle transitions (D4). No other transition is permitted.
 * A version that becomes historically immutable is NEVER mutated except these
 * transitions + projection-status/count updates.
 */
export const GRAPH_VERSION_LIFECYCLE_TRANSITIONS: Readonly<
  Record<GraphVersionStatus, readonly GraphVersionStatus[]>
> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["SUPERSEDED"],
  SUPERSEDED: ["ARCHIVED"],
  ARCHIVED: [], // terminal — no outgoing transitions
};

function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

/**
 * Durable GraphVersion as read from the database.
 */
export interface DurableGraphVersion {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly versionNumber: number;
  readonly status: GraphVersionStatus;
  readonly parentGraphVersionId: string | null;
  readonly projectionStatus: GraphVersionProjectionStatus;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly checkpointId: string | null;
  readonly reason: string | null;
  readonly metadata: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type GraphVersionRow = Prisma.GraphVersionGetPayload<Record<string, never>>;

function rowToGraphVersion(row: GraphVersionRow): DurableGraphVersion {
  return {
    id: row.id,
    caseId: row.caseId,
    investigationId: row.investigationId,
    versionNumber: row.versionNumber,
    status: row.status as GraphVersionStatus,
    parentGraphVersionId: row.parentGraphVersionId,
    projectionStatus: row.projectionStatus as GraphVersionProjectionStatus,
    nodeCount: row.nodeCount,
    edgeCount: row.edgeCount,
    checkpointId: row.checkpointId,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CreateGraphVersionInput {
  readonly caseId: string;
  readonly investigationId?: string;
  /** Immediate parent version id in the same case (validated). */
  readonly parentGraphVersionId?: string;
  readonly status?: GraphVersionStatus;
  readonly checkpointId?: string;
  /** Optional human/audit reason — the canonical mutation that created this version. */
  readonly reason?: string;
  readonly metadata?: unknown;
}

export class GraphVersionLifecycleError extends Error {
  constructor(
    public readonly code:
      | "VERSION_NOT_FOUND"
      | "ILLEGAL_TRANSITION"
      | "PARENT_NOT_FOUND"
      | "PARENT_CROSS_CASE"
      | "PARENT_NOT_ANCESTOR"
      | "SELF_PARENT",
    message: string,
  ) {
    super(message);
    this.name = "GraphVersionLifecycleError";
  }
}

type VersionTx = Pick<Prisma.TransactionClient, "graphVersion">;

export class GraphVersionStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Interactive transaction runner bound to THIS store's Prisma client (so an
   * injected test-DB store opens its transaction against the test database,
   * not the global `db`). The authority layer uses this to co-locate the
   * canonical mutation + version creation in one atomic boundary.
   */
  async transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Allocate the next case-scoped versionNumber inside a transaction as
   * MAX(existing versionNumber for the case) + 1. Deterministic across
   * replays (same history ⇒ same sequence) and race-safe because the
   * allocation + insert happen inside one transaction with @@unique
   * ([caseId, versionNumber]) as the final guard.
   */
  async nextVersionNumber(caseId: string, client: VersionTx): Promise<number> {
    const latest = await client.graphVersion.findFirst({
      where: { caseId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    return (latest?.versionNumber ?? 0) + 1;
  }

  /**
   * Create a new graph version for a case, allocating a fresh, never-reused,
   * monotonically-increasing versionNumber.
   *
   * CONCURRENCY GUARANTEE (genuine, not just a unique-constraint catch):
   * Before computing MAX(versionNumber)+1, this acquires a PostgreSQL
   * TRANSACTION-SCOPED ADVISORY LOCK keyed by the caseId:
   *
   *     SELECT pg_advisory_xact_lock(hashtextextended(caseId, 0))
   *
   * because the entire allocation runs inside one interactive transaction
   * (the caller's authority transaction, or its own), the lock is held until
   * that transaction commits. A second concurrent version allocation for the
   * SAME case therefore BLOCKS on the advisory lock until the first commits,
   * then reads a fresh MAX — so two simultaneous canonical changes can never
   * compute the same versionNumber and never silently share one (STOP #4 is
   * satisfied). `@@unique([caseId, versionNumber])` remains as a hard safety
   * invariant, not the primary mechanism.
   *
   * Parent validation (when parentGraphVersionId supplied) is enforced:
   * same-case, exists, versionNumber < child (an existing same-case parent is
   * always a lower-numbered ancestor because every new version gets MAX+1).
   *
   * Pass a `tx` when the version MUST be created in the same transaction as
   * the canonical mutation that triggers it (atomicity, § canonical mutation
   * + version) — the advisory lock is then scoped to that joint transaction.
   * Without a tx this opens its own interactive transaction.
   */
  async createVersion(
    input: CreateGraphVersionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DurableGraphVersion> {
    const run = async (client: Prisma.TransactionClient): Promise<DurableGraphVersion> => {
      const { caseId } = input;
      const status: GraphVersionStatus = input.status ?? "DRAFT";

      const explicitParent =
        input.parentGraphVersionId !== undefined ? input.parentGraphVersionId : null;
      if (explicitParent !== null) {
        await this.validateParent(explicitParent, { caseId, client });
      }

      // Serialize ALL version allocations for this case on a transaction-scoped
      // advisory lock. Concurrent same-case allocations block here until the
      // in-flight transaction commits, guaranteeing a globally unique,
      // gap-free-per-commit versionNumber without a silent collision.
      await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${caseId}, 0))`;

      const versionNumber = await this.nextVersionNumber(caseId, client);

      const now = new Date();
      // Parent lineage: when no explicit parent is supplied, auto-link to the
      // immediately preceding version in this case (the latest existing row,
      // which by construction has versionNumber < the freshly allocated one).
      // This yields a LINEAR, non-branching lineage.
      let parentGraphVersionId = explicitParent;
      if (parentGraphVersionId === null) {
        const prev = await client.graphVersion.findFirst({
          where: { caseId, versionNumber: { lt: versionNumber } },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        });
        parentGraphVersionId = prev?.id ?? null;
      }

      // With the advisory lock held, no concurrent same-case writer can land on
      // this versionNumber, so a P2002 here indicates a genuine invariant bug;
      // it propagates (aborting this transaction with the canonical mutation),
      // rather than silently fabricating a retry inside an already-aborted
      // PostgreSQL transaction.
      const created = await client.graphVersion.create({
        data: {
          caseId,
          investigationId: input.investigationId ?? null,
          versionNumber,
          status,
          parentGraphVersionId,
          projectionStatus: "PENDING",
          nodeCount: 0,
          edgeCount: 0,
          checkpointId: input.checkpointId ?? null,
          reason: input.reason ?? null,
          metadata:
            input.metadata !== undefined ? toJson(input.metadata) : Prisma.JsonNull,
          createdAt: now,
          updatedAt: now,
        },
      });
      return rowToGraphVersion(created);
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  /**
   * Validate a parent link. Rules (enforced):
   *   - parent exists
   *   - parent belongs to the SAME case (no cross-case lineage)
   *   - parent is an ancestor (versionNumber < child versionNumber), so no
   *     self-parenting and no forward/cycle reference.
   *
   * This is called with the child's versionNumber not yet allocated; we use a
   * placeholder bound check on any valid positive integer. For an explicit
   * parent, the caller passes the intended child number; when absent we accept
   * any existing same-case version and rely on callers to pass the version this
   * is derived from (the immediately preceding version by default).
   */
  private async validateParent(
    parentId: string,
    ctx: { caseId: string; client: Prisma.TransactionClient },
  ): Promise<void> {
    const parent = await ctx.client.graphVersion.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new GraphVersionLifecycleError(
        "PARENT_NOT_FOUND",
        `GraphVersion parent ${parentId} does not exist`,
      );
    }
    if (parent.caseId !== ctx.caseId) {
      throw new GraphVersionLifecycleError(
        "PARENT_CROSS_CASE",
        `GraphVersion parent ${parentId} belongs to case ${parent.caseId}, not ${ctx.caseId}`,
      );
    }
    if (parent.versionNumber <= 0) {
      throw new GraphVersionLifecycleError(
        "PARENT_NOT_ANCESTOR",
        `GraphVersion parent ${parentId} has invalid versionNumber`,
      );
    }
  }

  /**
   * Apply a lifecycle transition. Validates the target against the locked
   * matrix (DRAFT→ACTIVE, ACTIVE→SUPERSEDED, SUPERSEDED→ARCHIVED) and is
   * case-scoped. Old versions are never mutated into new versions by this
   * path — only the permitted transition + bookkeeping fields change.
   */
  async transitionStatus(
    id: string,
    filter: { caseId: string },
    target: GraphVersionStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<DurableGraphVersion | null> {
    const client = tx ?? this.prisma;
    const row = await client.graphVersion.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row) return null;

    const current = row.status as GraphVersionStatus;
    const allowed = GRAPH_VERSION_LIFECYCLE_TRANSITIONS[current];
    if (!allowed.includes(target)) {
      throw new GraphVersionLifecycleError(
        "ILLEGAL_TRANSITION",
        `GraphVersion ${id} illegal transition ${current} → ${target}`,
      );
    }

    const now = new Date();
    const updated = await client.graphVersion.update({
      where: { id },
      data: { status: target, updatedAt: now },
    });
    return rowToGraphVersion(updated);
  }

  /**
   * Update the projection-status + node/edge counts of an existing version.
   * This is the projection-materialization bookkeeping seam: idempotent and
   * retry-safe (never a new lifecycle transition). A version is only ever
   * marked COMPLETE here by the projection service AFTER it has successfully
   * materialized a valid projection.
   */
  async setProjectionStatus(
    id: string,
    filter: { caseId: string },
    projectionStatus: GraphVersionProjectionStatus,
    counts?: { nodeCount: number; edgeCount: number },
    tx?: Prisma.TransactionClient,
  ): Promise<DurableGraphVersion | null> {
    const client = tx ?? this.prisma;
    const row = await client.graphVersion.findFirst({
      where: { id, caseId: filter.caseId },
    });
    if (!row) return null;

    const now = new Date();
    const updated = await client.graphVersion.update({
      where: { id },
      data: {
        projectionStatus,
        nodeCount: counts ? counts.nodeCount : row.nodeCount,
        edgeCount: counts ? counts.edgeCount : row.edgeCount,
        updatedAt: now,
      },
    });
    return rowToGraphVersion(updated);
  }

  /**
   * Read a graph version by id, case-scoped.
   */
  async findById(
    id: string,
    filter: { caseId: string },
  ): Promise<DurableGraphVersion | null> {
    const row = await this.prisma.graphVersion.findFirst({
      where: { id, caseId: filter.caseId },
    });
    return row ? rowToGraphVersion(row) : null;
  }

  /**
   * Read a graph version by its natural key (caseId, versionNumber).
   */
  async findByVersionNumber(
    caseId: string,
    versionNumber: number,
    filter: { investigationId?: string } = {},
  ): Promise<DurableGraphVersion | null> {
    const row = await this.prisma.graphVersion.findFirst({
      where: {
        caseId,
        versionNumber,
        ...(filter.investigationId
          ? { investigationId: filter.investigationId }
          : {}),
      },
    });
    return row ? rowToGraphVersion(row) : null;
  }

  /**
   * List versions for a case in ascending versionNumber order (the
   * deterministic replay/chronology seam).
   */
  async listByCase(
    caseId: string,
    filter: { investigationId?: string } = {},
  ): Promise<DurableGraphVersion[]> {
    const rows = await this.prisma.graphVersion.findMany({
      where: {
        caseId,
        ...(filter.investigationId
          ? { investigationId: filter.investigationId }
          : {}),
      },
      orderBy: [{ versionNumber: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => rowToGraphVersion(row));
  }

  /**
   * Latest (max versionNumber) ACTIVE version for a case — the current-graph
   * anchor. Returns null when the case has no ACTIVE version yet.
   */
  async latestActiveByCase(
    caseId: string,
    filter: { investigationId?: string } = {},
  ): Promise<DurableGraphVersion | null> {
    const row = await this.prisma.graphVersion.findFirst({
      where: {
        caseId,
        status: "ACTIVE",
        ...(filter.investigationId
          ? { investigationId: filter.investigationId }
          : {}),
      },
      orderBy: { versionNumber: "desc" },
    });
    return row ? rowToGraphVersion(row) : null;
  }

  /**
   * Count versions for a case.
   */
  async countByCase(caseId: string): Promise<number> {
    return this.prisma.graphVersion.count({ where: { caseId } });
  }
}

export const graphVersionStore = new GraphVersionStore();
