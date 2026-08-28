// ============================================================================
// Run-State Transitions
//
// Guarded transitions backed by the canonical DEFAULT_RUN_STATE_CONFIGURATION
// from @indago/contracts. One authoritative lifecycle for InvestigationRun.state.
//
//   transitionState              — cross-checked, checkpointer, audited transition
//   transitionRunToIngesting     — CREATED → INGESTING (skips if already past)
//   transitionRunToNormalizing   — INGESTING → NORMALIZING (skips if already past)
//   transitionRunToPermanentFailure — terminal FAILED (only after retry exhaustion)
// ============================================================================

import { randomUUID } from "node:crypto";
import {
  DEFAULT_RUN_STATE_CONFIGURATION,
  type InvestigationRunState,
} from "@indago/contracts";
import { logAuditEvent } from "../audit/logger.js";
import { db } from "../db/prisma.js";
import { emitProgressEvent } from "../realtime/sse.js";

export async function transitionState(
  runId: string,
  newState: InvestigationRunState,
  trigger: string,
) {
  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });

  const isValid = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.some(
    (t) => t.from === run.state && t.to === newState,
  );

  if (!isValid) {
    throw new Error(`Invalid transition: ${run.state} -> ${newState}`);
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

  await db.investigationRun.update({
    where: { id: runId },
    data: { state: newState, status: "RUNNING" },
  });

  emitProgressEvent(run.investigationId, newState, `System transitioned to ${newState} via ${trigger}`);

  await logAuditEvent({
    investigationId: run.investigationId,
    action: "SYSTEM_ACTION",
    actor: "ORCHESTRATOR",
    targetType: "INVESTIGATION_RUN",
    targetId: runId,
    description: `State transition: ${run.state} -> ${newState} via ${trigger}`,
  });
}

export async function transitionRunToIngesting(runId: string) {
  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.state === "CREATED") {
    await transitionState(runId, "INGESTING", "EVIDENCE_ACQUISITION_START");
  }
}

export async function transitionRunToNormalizing(runId: string) {
  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.state === "INGESTING") {
    await transitionState(runId, "NORMALIZING", "INGESTION_COMPLETE");
  }
}

/**
 * Terminal failure transition. Only invoked after retries are exhausted or
 * for a non-retryable error. Moves the run to FAILED/FAILED and records the
 * reason. If the run's current state has no valid FAILED path (e.g. already
 * completed), the run is not regressed — the reason is recorded on the row.
 */
export async function transitionRunToPermanentFailure(runId: string, reason: string) {
  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });

  const isValid = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.some(
    (t) => t.from === run.state && t.to === "FAILED",
  );

  if (!isValid) {
    await db.investigationRun.update({
      where: { id: runId },
      data: { error: reason },
    });
    emitProgressEvent(run.investigationId, "FAILED", `Failure recorded (${run.state}): ${reason}`);
    return;
  }

  await db.investigationRun.update({
    where: { id: runId },
    data: { state: "FAILED", status: "FAILED", error: reason },
  });

  emitProgressEvent(run.investigationId, "FAILED", reason);

  await logAuditEvent({
    investigationId: run.investigationId,
    action: "SYSTEM_ACTION",
    actor: "INGESTION_PIPELINE",
    targetType: "INVESTIGATION_RUN",
    targetId: runId,
    description: `Run failed permanently (INGESTION_PERMANENT_FAILURE): ${reason}`,
  });
}