// ============================================================================
// TargetedReblockRunStore (Phase 5A-PR11)
//
// Single authoritative persistence boundary for targeted-reblock run records.
// Responsibility: make a targeted reblock execution durable + idempotent so an
// identical re-run converges to ONE record and history stays traceable.
//
// The store NEVER runs blocking / resolution and NEVER derives identity: it
// receives an already-derivable TargetedReblockResult (@indago/targeted-
// reblocking) and persists the bounded run facts. Only the case authority is
// enforced here (the run identity's region reference must match the caller
// case) — every other invariant is enforced in the pure core.
//
// Idempotency: the row is guarded by identityKey @unique plus runId @unique;
// writes go through createMany({ skipDuplicates: true }) inside an interactive
// transaction, so the DB constraint — never SELECT-then-INSERT — is the
// duplicate-prevention mechanism (mirroring GraphHoleRegionAnalysisStore).
//
// Boundedness: only the bounded run facts (identity, accounting, counts,
// provenance, truncation flag) are persisted — never the candidate graph (the
// canonical run identity content-addresses the selected candidate universe).
// ============================================================================

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  TargetedReblockRunRecordSchema,
  type TargetedReblockCounts,
  type TargetedReblockResult,
  type TargetedReblockRunRecord,
} from '@indago/contracts';
import { TargetedReblockError } from '@indago/targeted-reblocking';
import { db } from '../db/prisma.js';

/**
 * Round-trip value into a JSON-safe Prisma Json input. Strips `undefined`
 * fields, which Prisma rejects in Json columns.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

type TargetedReblockRunRow = Prisma.TargetedReblockRunGetPayload<Record<string, never>>;

function toRecord(row: TargetedReblockRunRow): TargetedReblockRunRecord {
  return TargetedReblockRunRecordSchema.parse({
    id: row.id,
    runId: row.runId,
    identityKey: row.identityKey,
    caseId: row.caseId,
    ...(row.investigationId !== null ? { investigationId: row.investigationId } : {}),
    graphVersionId: row.graphVersionId,
    regionId: row.regionId,
    regionPolicyVersion: row.regionPolicyVersion,
    policyVersion: row.policyVersion,
    requestedAt: row.requestedAt.toISOString(),
    accounting: row.accounting,
    counts: row.counts,
    provenance: row.provenance,
    truncated: row.truncated,
    createdAt: row.createdAt.toISOString(),
  });
}

export interface PersistRunInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly investigationId?: string;
  readonly result: TargetedReblockResult;
  readonly counts: TargetedReblockCounts;
  readonly requestedAt: string;
}

export class TargetedReblockRunStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /** The canonical persisted run identity for a result. */
  runIdentityKey(result: TargetedReblockResult): string {
    return result.identityKey;
  }

  /**
   * Idempotent run persist. Repeated/concurrent invocation of the same logical
   * targeted reblock (same selected universe, same policies) converges to ONE
   * authoritative record.
   */
  async persistRun(
    input: PersistRunInput,
  ): Promise<{ created: boolean; record: TargetedReblockRunRecord }> {
    const { caseId, result } = input;
    if (result.accounting.regionReference.caseId !== caseId) {
      throw new TargetedReblockError(
        'AUTHORITY_MISMATCH',
        `Cannot persist targeted reblock run for case ${result.accounting.regionReference.caseId} under case ${caseId}`,
      );
    }
    if (result.accounting.regionReference.graphVersionId !== input.graphVersionId) {
      throw new TargetedReblockError(
        'AUTHORITY_MISMATCH',
        `Cannot persist targeted reblock run for graphVersion ${result.accounting.regionReference.graphVersionId} under graphVersion ${input.graphVersionId}`,
      );
    }

    const truncated =
      result.accounting.regionObservationBoundReached ||
      result.accounting.candidateBoundReached ||
      result.accounting.pairsTruncated;

    const data = {
      runId: result.runId,
      identityKey: result.identityKey,
      caseId,
      investigationId: input.investigationId ?? null,
      graphVersionId: input.graphVersionId,
      regionId: result.accounting.regionReference.regionId,
      regionPolicyVersion: result.accounting.regionReference.regionPolicyVersion,
      policyVersion: result.accounting.policyVersion,
      requestedAt: new Date(input.requestedAt),
      accounting: toJson(result.accounting) as Prisma.InputJsonObject,
      counts: toJson(input.counts) as Prisma.InputJsonObject,
      provenance: toJson(result.provenance) as Prisma.InputJsonObject,
      truncated,
    };

    return this.prisma.$transaction(
      async (tx) => {
        const insert = await tx.targetedReblockRun.createMany({
          data,
          skipDuplicates: true,
        });
        const row = await tx.targetedReblockRun.findUnique({
          where: { identityKey: result.identityKey },
        });
        if (!row) {
          throw new Error(
            `TargetedReblockRunStore: run row vanished immediately after persist (${result.identityKey})`,
          );
        }
        return { created: insert.count > 0, record: toRecord(row) };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
  }

  /**
   * No-repeat lookup — the durable run record for a content-addressed runId or
   * null when no such run exists in the case.
   */
  async findByRunId(
    runId: string,
    filter: { caseId: string },
  ): Promise<TargetedReblockRunRecord | null> {
    const row = await this.prisma.targetedReblockRun.findFirst({
      where: { runId, caseId: filter.caseId },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Operational guard — number of distinct targeted-reblock runs already
   * durable for a (case, region, policy version) identity family. Used by the
   * service to enforce MAX_OPERATIONS_PER_VERSION (bounded repeats).
   */
  async countRunsForRegionVersion(input: {
    caseId: string;
    regionId: string;
    regionPolicyVersion: string;
    policyVersion: string;
  }): Promise<number> {
    return this.prisma.targetedReblockRun.count({
      where: {
        caseId: input.caseId,
        regionId: input.regionId,
        regionPolicyVersion: input.regionPolicyVersion,
        policyVersion: input.policyVersion,
      },
    });
  }
}

/** Convenience singleton bound to the platform Prisma client. */
export const targetedReblockRunStore = new TargetedReblockRunStore();