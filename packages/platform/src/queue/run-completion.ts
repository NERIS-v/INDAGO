// ============================================================================
// Canonical Run Completion
//
// Deterministic, durable, idempotent terminal lifecycle step for the canonical
// evidence pipeline.
//
// BACKGROUND
//   The canonical handler (ingest-evidence.ts) drives a run CREATED → INGESTING
//   → NORMALIZING → ANALYZING and then rests there. Before this module there was
//   no ANALYZING → COMPLETED path at all. Completion is NOT automatic: a run
//   that has finished ingesting its current evidence must not silently jump to
//   COMPLETED (that would skip human review and forbid later evidence). Instead
//   an authorized caller invokes the explicit finalize action, which applies the
//   durable prerequisite check below and only then transitions the run.
//
// COMPLETION CONDITION (durable, not time- or queue-tail-based)
//   A run may reach COMPLETED only when:
//     1. It is currently in ANALYZING and is not PAUSED (human pause wins).
//     2. At least one IngestionAttempt exists for the investigation — the
//        submission boundary registers a QUEUED attempt for EVERY expected
//        evidence job BEFORE the job is enqueued (routes.ts), so the expected
//        work set is known up-front and does not depend on observing a
//        transient BullMQ queue tail.
//     3. No attempt is QUEUED, RUNNING or FAILED. Only a durable SUCCEEDED for
//        every expected attempt counts as done; a failed or in-flight job
//        BLOCKS completion (the run must surface the failure or wait, never
//        fabricate success).
//
// ATOMICITY
//   The transition itself is a single conditional UPDATE (`state = ANALYZING`)
//   so two workers racing to finalize the same run produce exactly one COMPLETED
//   row, one checkpoint and one audit record. Losers observe zero affected rows
//   and emit nothing.
//
// NOT DONE HERE (by contract): no AI, no graph projection, no lead generation,
// no auto-acceptance of any proposed hypothesis. Completion is a lifecycle fact,
// not a semantic judgement.
// ============================================================================

import { randomUUID } from "node:crypto";
import { DEFAULT_RUN_STATE_CONFIGURATION } from "@indago/contracts";
import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import { emitProgressEvent } from "../realtime/sse.js";

export interface CompletionCheck {
  complete: boolean;
  reason: string;
  attemptCount: number;
  pendingCount: number;
  failedCount: number;
}

/**
 * Pure-ish durable predicate: is there no canonical evidence work left for this
 * investigation? Reads the durable attempt registry only (no queue inspection,
 * no wall-clock, no fabricated state).
 */
export async function checkInvestigationAnalysisComplete(
  investigationId: string,
): Promise<CompletionCheck> {
  const attempts = await db.ingestionAttempt.findMany({
    where: { investigationId },
    select: { status: true },
  });

  const attemptCount = attempts.length;
  let pendingCount = 0;
  let failedCount = 0;
  for (const attempt of attempts) {
    if (attempt.status === "FAILED") failedCount += 1;
    // Anything that is not an explicit durable SUCCEEDED — QUEUED, RUNNING, or
    // any unrecognised status — counts as unfinished. Unknown work must never
    // be mistaken for done.
    else if (attempt.status !== "SUCCEEDED") pendingCount += 1;
  }

  if (attemptCount === 0) {
    return {
      complete: false,
      reason: "no expected evidence work registered for the investigation",
      attemptCount,
      pendingCount,
      failedCount,
    };
  }
  if (failedCount > 0) {
    return {
      complete: false,
      reason: `${failedCount} evidence attempt(s) permanently failed`,
      attemptCount,
      pendingCount,
      failedCount,
    };
  }
  if (pendingCount > 0) {
    return {
      complete: false,
      reason: `${pendingCount} evidence attempt(s) still queued or running`,
      attemptCount,
      pendingCount,
      failedCount,
    };
  }
  return {
    complete: true,
    reason: `all ${attemptCount} evidence attempt(s) durably succeeded`,
    attemptCount,
    pendingCount,
    failedCount,
  };
}

/**
 * Finalize a run to COMPLETED iff the durable completion condition holds.
 *
 * Invoked by the explicit, authorized finalize action (see routes.ts). Returns
 * true ONLY for the single call that actually applied the transition.
 */
export async function finalizeRunIfComplete(params: {
  runId: string;
  investigationId: string;
  actor?: string;
  reason?: string;
}): Promise<boolean> {
  const { runId, investigationId } = params;
  const actor = params.actor ?? "ORCHESTRATOR";

  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });

  // Human pause authority: a paused run never auto-completes. Resume re-enters
  // ANALYZING and the next successful job will finalize it.
  if (run.state !== "ANALYZING" || run.status === "PAUSED") {
    return false;
  }

  const transition = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
    (t) => t.from === "ANALYZING" && t.to === "COMPLETED",
  );
  if (!transition) {
    throw new Error(
      "Run-state contract has no ANALYZING -> COMPLETED transition; refusing to complete",
    );
  }

  const check = await checkInvestigationAnalysisComplete(investigationId);
  if (!check.complete) {
    return false;
  }

  // Single conditional UPDATE is the concurrency fence: exactly one caller can
  // observe count === 1.
  const updated = await db.investigationRun.updateMany({
    where: { id: runId, state: "ANALYZING", status: { not: "PAUSED" } },
    data: { state: "COMPLETED", status: "COMPLETED" },
  });
  if (updated.count !== 1) {
    return false;
  }

  const checkpointsCount = await db.agentCheckpoint.count({ where: { runId } });
  await db.agentCheckpoint.create({
    data: {
      runId,
      stepId: `step_${checkpointsCount}`,
      stateHash: randomUUID(),
      toolResults: {},
      timestamp: new Date(),
    },
  });

  emitProgressEvent(
    investigationId,
    "COMPLETED",
    `Investigation complete: ${check.reason}`,
    { runId },
  );

  await logAuditEvent({
    investigationId,
    action: "SYSTEM_ACTION",
    actor,
    targetType: "INVESTIGATION_RUN",
    targetId: runId,
    description:
      params.reason ??
      `Run completed (ANALYZING -> COMPLETED via ${transition.trigger}): ${check.reason}`,
  });

  return true;
}
