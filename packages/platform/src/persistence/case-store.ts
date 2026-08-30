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
}

export const caseStore = new CaseStore();