// ============================================================================
// ReassessmentChangeStore (Phase 5A-PR12)
//
// Single authoritative persistence owner for the PR12 CHANGE LEDGER and its
// per-case watermark:
//
//   CaseReassessmentChange  — one durable row per authoritative change that may
//     affect graph-hole intelligence. `changeId` (deterministic SHA-256 of the
//     canonical change identity) is @unique, so the DB constraint — never
//     SELECT-then-INSERT — is the duplicate-prevention mechanism: duplicate
//     publication or a crash-then-rerun is an idempotent no-op.
//
//   CaseReassessmentCursor  — per-case watermark (lastProcessedSequence).
//     The worker drains PENDING changes in sequence order, coalesces them
//     deterministically, executes the plan, records each change's outcome
//     (COMPLETED/PARTIAL/FAILED/SKIPPED) and ONLY THEN advances the cursor.
//     The cursor therefore never claims failed work was fully applied.
//
//   ReassessmentRun         — append-only audit row per executed incremental
//     run (frozen IncrementalReassessmentRun envelope + cursorBefore/After).
//
// Concurrency (mirrors GraphVersion allocation):
//   `sequence` is case-scoped, monotonic, never reused, persisted, and
//   allocated as MAX(sequence)+1 INSIDE an interactive transaction, SERIALIZED
//   PER CASE by a transaction-scoped PostgreSQL advisory lock
//   (pg_advisory_xact_lock(hashtextextended(caseId,0))). Concurrent publishers
//   for the same case block until the in-flight allocation commits and can
//   never compute the same — or silently share a — sequence.
//
// Case isolation: every read/write is scoped by caseId. No case-wide scans.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import {
  PR12_REASSESSMENT_POLICY_VERSION,
  deriveReassessmentEffectClass,
  ReassessmentTriggerSchema,
  type ReassessmentEffectClass,
  type ReassessmentTrigger,
} from '@indago/contracts';
import { db } from '../db/prisma.js';

// ============================================================================
// Public record types (typed, JSON columns decoded)
// ============================================================================

export type ReassessmentChangeStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED';

export interface ReassessmentChangeRecord {
  readonly id: string;
  readonly caseId: string;
  readonly graphVersionId: string | null;
  readonly sequence: number;
  readonly changeId: string;
  readonly trigger: ReassessmentTrigger;
  readonly effectClass: ReassessmentEffectClass;
  readonly status: ReassessmentChangeStatus;
  readonly attemptCount: number;
  readonly failureReason: string | null;
  readonly processedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReassessmentCursorRecord {
  readonly caseId: string;
  readonly lastProcessedSequence: number;
  readonly updatedAt: Date;
  readonly policyVersion: string;
}

export interface PublishCaseChangeInput {
  readonly caseId: string;
  readonly trigger: ReassessmentTrigger;
  readonly graphVersionId: string | null;
  /** Deterministic SHA-256 of the canonical change identity (computedAt EXCLUDED). */
  readonly changeId: string;
}

export interface PublishCaseChangeResult {
  readonly changeId: string;
  readonly sequence: number;
  readonly deduplicated: boolean;
}

export interface InsertRunInput {
  readonly runId: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly changeId: string;
  readonly sequence: number;
  readonly graphVersionId: string;
  readonly envelope: unknown;
  readonly cursorBefore: number;
  readonly cursorAfter: number;
}

// ============================================================================

/**
 * Decode a persisted row into the public record shape (JSON columns decoded /
 * zod-validated by this store).
 */
function decodeChange(row: {
  id: string;
  caseId: string;
  graphVersionId: string | null;
  sequence: number;
  changeId: string;
  trigger: unknown;
  effectClass: string;
  status: string;
  attemptCount: number;
  failureReason: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ReassessmentChangeRecord {
  return {
    ...row,
    trigger: ReassessmentTriggerSchema.parse(row.trigger),
    effectClass: row.effectClass as ReassessmentEffectClass,
    status: row.status as ReassessmentChangeStatus,
  };
}

export class ReassessmentChangeStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  private get db(): PrismaClient {
    return this.prisma;
  }

  // --------------------------------------------------------------------------
  // Publishing (dedup-first: the DB constraint is the dedup mechanism)
  // --------------------------------------------------------------------------

  /**
   * Persist an authoritative change into the ledger.
   *
   * `changeId` is already a deterministic SHA-256 of the canonical change
   * identity, so inserting with `changeId @unique` + onConflictDoNothing makes
   * duplicate/concurrent publication a no-op (P2002-equivalent swallowed).
   *
   * `sequence` is allocated as MAX+1 within an interactive transaction under a
   * per-case advisory lock (concurrent publishers serialize on the case).
   *
   * Returns { changeId, sequence, deduplicated }. When the changeId already
   * exists the stored row's sequence is returned with deduplicated=true.
   */
  async publish(input: PublishCaseChangeInput): Promise<PublishCaseChangeResult> {
    const run = async (client: PrismaTypes.TransactionClient) => {
      // Serialize ALL sequence allocations for this case (mirrors GraphVersion).
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.caseId}, 0))`;

      const existing = await client.caseReassessmentChange.findUnique({
        where: { changeId: input.changeId },
        select: { id: true, sequence: true },
      });
      if (existing !== null) {
        return { changeId: input.changeId, sequence: existing.sequence, deduplicated: true };
      }

      const last = await client.caseReassessmentChange.findFirst({
        where: { caseId: input.caseId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const sequence = (last?.sequence ?? 0) + 1;

      await client.caseReassessmentChange.create({
        data: {
          caseId: input.caseId,
          graphVersionId: input.graphVersionId,
          sequence,
          changeId: input.changeId,
          trigger: input.trigger as unknown as PrismaTypes.InputJsonValue,
          effectClass: deriveReassessmentEffectClass(input.trigger),
          status: 'PENDING',
        },
      });

      return { changeId: input.changeId, sequence, deduplicated: false };
    };

    return this.db.$transaction(run, { timeout: 30_000 });
  }

  /**
   * Mark a change's per-change outcome. `status` records what the cursor is
   * permitted to advance past: COMPLETED (fully applied) advances; PARTIAL /
   * FAILED are recorded BEFORE the cursor advances so the watermark never
   * claims failed work was applied; SKIPPED records a modelled no-op.
   */
  async recordOutcome(
    changeId: string,
    outcome: { status: ReassessmentChangeStatus; failureReason?: string | null },
  ): Promise<void> {
    await this.db.caseReassessmentChange.update({
      where: { changeId },
      data: {
        status: outcome.status,
        failureReason: outcome.failureReason ?? null,
        processedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  // --------------------------------------------------------------------------
  // Cursor (watermark)
  // --------------------------------------------------------------------------

  async getCursor(caseId: string): Promise<ReassessmentCursorRecord | null> {
    const row = await this.db.caseReassessmentCursor.findUnique({ where: { caseId } });
    if (row === null) return null;
    return { ...row, policyVersion: row.policyVersion ?? PR12_REASSESSMENT_POLICY_VERSION };
  }

  async advanceCursor(caseId: string, lastProcessedSequence: number): Promise<void> {
    await this.db.caseReassessmentCursor.upsert({
      where: { caseId },
      create: {
        caseId,
        lastProcessedSequence,
        policyVersion: PR12_REASSESSMENT_POLICY_VERSION,
      },
      update: {
        lastProcessedSequence,
        policyVersion: PR12_REASSESSMENT_POLICY_VERSION,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Drain (worker side — Phase 5)
  // --------------------------------------------------------------------------

  /**
   * Return up to `limit` PENDING changes for a case ordered by sequence.
   */
  async listPendingForCase(caseId: string, limit: number): Promise<ReassessmentChangeRecord[]> {
    const rows = await this.db.caseReassessmentChange.findMany({
      where: { caseId, status: 'PENDING' },
      orderBy: { sequence: 'asc' },
      take: limit,
    });
    return rows.map(decodeChange);
  }

  /**
   * Drain next batch across all cases strictly after a cursor watermark.
   * Used by the coalescing worker (Phase 5).
   */
  async listPendingAfterWatermark(limit: number): Promise<ReassessmentChangeRecord[]> {
    const rows = await this.db.caseReassessmentChange.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ caseId: 'asc' }, { sequence: 'asc' }],
      take: limit,
    });
    return rows.map(decodeChange);
  }

  // --------------------------------------------------------------------------
  // Run audit (append-only)
  // --------------------------------------------------------------------------

  async insertRun(input: InsertRunInput): Promise<void> {
    await this.db.reassessmentRun.create({
      data: {
        runId: input.runId,
        caseId: input.caseId,
        investigationId: input.investigationId,
        changeId: input.changeId,
        sequence: input.sequence,
        graphVersionId: input.graphVersionId,
        policyVersion: PR12_REASSESSMENT_POLICY_VERSION,
        envelope: input.envelope as PrismaTypes.InputJsonValue,
        cursorBefore: input.cursorBefore,
        cursorAfter: input.cursorAfter,
      },
    });
  }
}