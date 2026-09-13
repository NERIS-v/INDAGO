// ============================================================================
// P-09 Case Persistence Store (case catalogue — dashboard)
//
// Single Prisma data-access boundary for durable Case rows + the case-list
// read seam. Strict generated Prisma types only — no `any`, no `as any`, no
// `@ts-ignore`.
//
// Lifecycle:
//   - Case.id is the canonical case ID (== InvestigationRun.caseId).
//   - ensureCase() is a create-or-nothing provision, fired when an
//     investigation run is created (POST /investigations/start) so the case
//     catalogue never lags a newly seen case boundary.
//   - reconcile() is a read-time backfill so pre-existing runs (e.g. any run
//     created before this model existed) surface immediately, idempotently.
//   - listCases() derives investigationIds / evidenceIds / entityIds at read
//     time from durable rows — never stored denormalized. entityIds is ALWAYS
//     [] (MA06 never creates entity links), matching Observation.entityIds.
//
// Every read reassembles rows into the canonical CaseSchema contract — there
// is no second, drifting "case" shape in this codebase.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import type { Case, CaseStatus } from "@indago/contracts";
import { db } from "../db/prisma.js";

/**
 * Standard assignee recorded for legacy rows backfilled by reconcile() where
 * no actor was present at first encounter. Persisted explicitly — reconciling
 * a row never falls back to a fabricated principal.
 */
const LEGACY_ASSIGNEE = "UNASSIGNED";

/**
 * Non-terminal run statuses that block a case deletion (a live pipeline owns
 * rows inside this case boundary; removing them mid-flight would orphan the
 * orchestration or silently strand ingest work).
 */
const ACTIVE_RUN_STATUSES = ["QUEUED", "INITIALIZING", "RUNNING", "PAUSED"];

/**
 * Outcome of deleteCase(), discriminated so the API boundary can map it to a
 * precise HTTP response (404 / 409 / 200) without stringly logic.
 */
export type DeleteCaseResult =
  | { outcome: "deleted"; caseId: string }
  | { outcome: "not_found"; caseId: string }
  | { outcome: "active_runs"; caseId: string };

export class CaseStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Provision a Case row for a case boundary (create-or-nothing). Idempotent:
   * subsequent calls leave the existing row untouched. title / status defaults
   * are platform-owned because the canonical CaseSchema requires them and no
   * case-creation/edit flow exists yet.
   */
  async ensureCase(caseId: string, assignedTo: string): Promise<void> {
    await this.prisma.case.upsert({
      where: { id: caseId },
      update: {},
      create: {
        id: caseId,
        title: `Case ${caseId}`,
        status: "OPEN",
        assignedTo,
      },
    });
  }

  /**
   * Read-time reconciliation: any caseId the platform has durable state for
   * (an InvestigationRun row) but that has no Case row yet is provisioned, so
   * pre-existing runs surface in the catalogue immediately. Idempotent.
   * Returns the number of Case rows created.
   */
  async reconcile(): Promise<number> {
    const runCaseIds = await this.prisma.investigationRun.findMany({
      select: { caseId: true },
      distinct: ["caseId"],
    });
    const existing = await this.prisma.case.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((c) => c.id));
    let created = 0;
    for (const { caseId } of runCaseIds) {
      if (caseId && !existingIds.has(caseId)) {
        await this.ensureCase(caseId, LEGACY_ASSIGNEE);
        created += 1;
      }
    }
    return created;
  }

  /**
   * Case-list read seam. Returns canonical CaseSchema objects assembled from
   * persisted Case rows + durable run/evidence rows. Never fabricates the
   * derived collections. investigationIds orders latest-run first — the
   * frontend CaseCard treats [0] as the primary investigation.
   */
  async listCases(): Promise<Case[]> {
    await this.reconcile();
    const [rows, runs, evidences] = await Promise.all([
      this.prisma.case.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
      this.prisma.investigationRun.findMany({
        select: { caseId: true, investigationId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.evidence.findMany({ select: { caseId: true, id: true } }),
    ]);

    const runsByCase = new Map<string, string[]>();
    for (const run of runs) {
      const ids = runsByCase.get(run.caseId) ?? [];
      ids.push(run.investigationId);
      runsByCase.set(run.caseId, ids);
    }

    const evidenceByCase = new Map<string, string[]>();
    for (const row of evidences) {
      const ids = evidenceByCase.get(row.caseId) ?? [];
      ids.push(row.id);
      evidenceByCase.set(row.caseId, ids);
    }

    return rows.map((row) => {
      const base: Case = {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        status: row.status as CaseStatus,
        assignedTo: row.assignedTo,
        createdAt: { value: row.createdAt.toISOString(), precision: "exact" },
        updatedAt: { value: row.updatedAt.toISOString(), precision: "exact" },
        investigationIds: runsByCase.get(row.id) ?? [],
        sourceIds: [],
        entityIds: [],
        evidenceIds: evidenceByCase.get(row.id) ?? [],
      };
      if (row.closedAt) {
        base.closedAt = { value: row.closedAt.toISOString(), precision: "exact" };
      }
      if (row.jurisdiction) {
        base.jurisdiction = row.jurisdiction;
      }
      return base;
    });
  }

  /**
   * Hard-delete a case boundary and every durable row scoped to it, in FK-safe
   * dependency order, inside one transaction. Refuses when the case still has
   * active (QUEUED/INITIALIZING/RUNNING/PAUSED) investigation runs — deleting
   * mid-pipeline would orphan the orchestrator's work.
   *
   * Artifacts are CASE-SCOPED AND CONTENT-ADDRESSED: one Artifact row per
   * (caseId, contentHash). IDs are (caseId, contentHash)-derived, so artifact
   * ids cannot collide across cases. Only artifacts with no remaining
   * Evidence/IngestionAttempt reference anywhere are deleted; any still-shared
   * row survives intact.
   */
  async deleteCase(caseId: string): Promise<DeleteCaseResult> {
    // The default interactive-transaction timeout is 5000 ms, which the full
    // delete (several round-trips over a remote/pooled Postgres) can exceed —
    // pass an explicit generous timeout so a slow-but-healthy run is not torn
    // down mid-delete.
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.case.findUnique({ where: { id: caseId } });
        if (!existing) return { outcome: "not_found", caseId };

        const activeRuns = await tx.investigationRun.count({
          where: { caseId, status: { in: ACTIVE_RUN_STATUSES } },
        });
        if (activeRuns > 0) return { outcome: "active_runs", caseId };

        // Candidate artifacts referenced by this case's own rows, before those
        // rows are removed.
        const [evidences, attempts] = await Promise.all([
          tx.evidence.findMany({
            where: { caseId },
            select: { artifactId: true },
          }),
          tx.ingestionAttempt.findMany({
            where: { caseId },
            select: { artifactId: true },
          }),
        ]);

        // Case-scoped rows, dependency-first. Evidence/IngestionAttempt
        // cascade their dependent rows (Observations, Raw/Normalized
        // extractions); InvestigationRun cascades checkpoints and tool
        // executions.
        await tx.observation.deleteMany({ where: { caseId } });
        await tx.evidence.deleteMany({ where: { caseId } });
        await tx.source.deleteMany({ where: { caseId } });
        await tx.ingestionAttempt.deleteMany({ where: { caseId } });
        await tx.investigationRun.deleteMany({ where: { caseId } });
        await tx.case.delete({ where: { id: caseId } });

        // Artifact GC: delete only content-addresses this deletion orphaned.
        const candidateIds = [
          ...new Set(
            [...evidences, ...attempts]
              .map((row) => row.artifactId)
              .filter((id): id is string => id !== null),
          ),
        ];
        if (candidateIds.length > 0) {
          const [keptEvidence, keptAttempts] = await Promise.all([
            tx.evidence.findMany({
              where: { artifactId: { in: candidateIds } },
              select: { artifactId: true },
            }),
            tx.ingestionAttempt.findMany({
              where: { artifactId: { in: candidateIds } },
              select: { artifactId: true },
            }),
          ]);
          const keep = new Set(
            [...keptEvidence, ...keptAttempts]
              .map((row) => row.artifactId)
              .filter((id): id is string => id !== null),
          );
          const removable = candidateIds.filter((id) => !keep.has(id));
          if (removable.length > 0) {
            await tx.artifact.deleteMany({ where: { id: { in: removable } } });
          }
        }
        return { outcome: "deleted", caseId };
      },
      { timeout: 30_000 },
    );
  }
}

export const caseStore = new CaseStore();