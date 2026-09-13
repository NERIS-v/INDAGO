// ============================================================================
// P4-PR3 — RunStateMachine
//
// Prisma-backed enforcement of the investigation run state machine already
// frozen in @indago/contracts (DEFAULT_RUN_STATE_CONFIGURATION).
//   - "Implement human-review state" — REVIEW_REQUIRED entry/exit runtime.
//   - "Add pause/resume behavior" — a real resume trigger (previously PAUSED
//     was only reachable via queue/recovery.ts's circuit-breaker escalation,
//     with no way back).
//   - Feeds "Stream analysis progress to UI".
//
// TWO-COLUMN MODEL:
//   InvestigationRun.state  — pipeline STAGE (CREATED..COMPLETED, the
//                              contract this file enforces).
//   InvestigationRun.status — execution STATUS (QUEUED/RUNNING/PAUSED/...).
// Pausing does NOT change `state` — the contract's resumeTransitions rule
// ("pause preserves the immediately previous resumable run state") is
// satisfied for free by simply not touching `state` while flipping
// `status` to PAUSED, exactly as queue/recovery.ts's escalateToHuman
// already does for the circuit-breaker path. This service adds a general,
// human-invokable pause/resume alongside that automated path — it does not
// replace or refactor escalateToHuman, so existing tested behavior is
// untouched.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import { emitProgressEvent } from "../realtime/sse.js";
import type { InvestigationRunState } from "@indago/contracts";
import {
  isLegalTransition,
  isLegalResumeTarget,
  canEnterReviewRequired,
  reviewResolutionTarget,
  isTerminalState,
  type ReviewResolutionOutcome,
} from "./run-state-transitions.js";

export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Investigation run not found: ${runId}`);
    this.name = "RunNotFoundError";
  }
}

export class IllegalRunStateTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Illegal investigation run state transition: ${from} -> ${to}`);
    this.name = "IllegalRunStateTransitionError";
  }
}

export class RunNotPausedError extends Error {
  constructor(runId: string, actualStatus: string) {
    super(`Investigation run ${runId} is not PAUSED (status=${actualStatus}) — cannot resume`);
    this.name = "RunNotPausedError";
  }
}

export class RunNotInReviewError extends Error {
  constructor(runId: string, actualState: string) {
    super(`Investigation run ${runId} is not in REVIEW_REQUIRED (state=${actualState})`);
    this.name = "RunNotInReviewError";
  }
}

export class RunAlreadyTerminalError extends Error {
  constructor(runId: string, state: string) {
    super(`Investigation run ${runId} is already in a terminal state (${state}) — cannot pause`);
    this.name = "RunAlreadyTerminalError";
  }
}

export interface RunSnapshot {
  readonly id: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly status: string;
  readonly state: InvestigationRunState;
  readonly currentStage: string | null;
}

function toSnapshot(row: { id: string; investigationId: string; caseId: string; status: string; state: string; currentStage: string | null }): RunSnapshot {
  return {
    id: row.id,
    investigationId: row.investigationId,
    caseId: row.caseId,
    status: row.status,
    state: row.state as InvestigationRunState,
    currentStage: row.currentStage,
  };
}

export class RunStateMachine {
  constructor(private readonly prisma: PrismaClient = db) {}

  private async getRunOrThrow(runId: string): Promise<RunSnapshot> {
    const row = await this.prisma.investigationRun.findUnique({ where: { id: runId } });
    if (!row) throw new RunNotFoundError(runId);
    return toSnapshot(row);
  }

  /**
   * Ordinary pipeline-stage transition, guarded by DEFAULT_RUN_STATE_CONFIGURATION.
   * Throws IllegalRunStateTransitionError rather than clamping — callers that
   * want a non-throwing "is this legal right now" check should consult
   * run-state-transitions.ts directly first (see tryEnterReviewRequired below
   * for that pattern).
   */
  async transitionState(
    runId: string,
    params: { toState: InvestigationRunState; actor: string; reason?: string },
  ): Promise<RunSnapshot> {
    const run = await this.getRunOrThrow(runId);
    if (!isLegalTransition(run.state, params.toState)) {
      throw new IllegalRunStateTransitionError(run.state, params.toState);
    }
    const updated = await this.prisma.investigationRun.update({
      where: { id: runId },
      data: { state: params.toState },
    });
    emitProgressEvent(run.investigationId, params.toState, params.reason ?? `State transitioned to ${params.toState}`, {
      runId,
    });
    return toSnapshot(updated);
  }

  /**
   * Human-invoked pause: freezes execution status without disturbing the
   * pipeline stage (`state`), so resume() can return to exactly where
   * execution left off. Distinct from queue/recovery.ts's escalateToHuman
   * (system circuit-breaker path) — this is for an operator choosing to
   * pause a healthy run, not a failure response.
   */
  async pause(runId: string, params: { actor: string; reason: string }): Promise<RunSnapshot> {
    const run = await this.getRunOrThrow(runId);
    if (isTerminalState(run.state)) {
      throw new RunAlreadyTerminalError(runId, run.state);
    }
    const updated = await this.prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const row = await tx.investigationRun.update({
        where: { id: runId },
        data: { status: "PAUSED" },
      });
      await logAuditEvent({
        investigationId: run.investigationId,
        action: "RUN_PAUSED",
        actor: params.actor,
        targetType: "INVESTIGATION_RUN",
        targetId: runId,
        description: params.reason,
      });
      return row;
    });
    emitProgressEvent(run.investigationId, run.state, `Run paused: ${params.reason}`, { runId });
    return toSnapshot(updated);
  }

  /**
   * Resume a PAUSED run. Requires status === PAUSED, and validates the
   * frozen `state` is a legal resume target per the contract's
   * resumeTransitions (defense in depth — in the current schema `state` is
   * never mutated by pause(), so this should always hold, but a run paused
   * by some other historical path is checked rather than assumed safe).
   */
  async resume(runId: string, params: { actor: string }): Promise<RunSnapshot> {
    const run = await this.getRunOrThrow(runId);
    if (run.status !== "PAUSED") {
      throw new RunNotPausedError(runId, run.status);
    }
    if (!isLegalResumeTarget(run.state)) {
      throw new IllegalRunStateTransitionError("PAUSED", `resume-to:${run.state}`);
    }
    const updated = await this.prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const row = await tx.investigationRun.update({
        where: { id: runId },
        data: { status: "RUNNING" },
      });
      await logAuditEvent({
        investigationId: run.investigationId,
        action: "RUN_RESUMED",
        actor: params.actor,
        targetType: "INVESTIGATION_RUN",
        targetId: runId,
        description: `Resumed to pipeline stage ${run.state}`,
      });
      return row;
    });
    emitProgressEvent(run.investigationId, run.state, `Run resumed at ${run.state}`, { runId });
    return toSnapshot(updated);
  }

  /**
   * Force-enter REVIEW_REQUIRED. Throws if the current stage has no legal
   * REVIEW_REQUIRED edge (only DISCOVERING and REASSESSING do, per contract).
   */
  async enterReviewRequired(runId: string, params: { actor: string; reason: string }): Promise<RunSnapshot> {
    const snapshot = await this.transitionState(runId, { toState: "REVIEW_REQUIRED", actor: params.actor, reason: params.reason });
    await logAuditEvent({
      investigationId: snapshot.investigationId,
      action: "REVIEW_REQUIRED_ENTERED",
      actor: params.actor,
      targetType: "INVESTIGATION_RUN",
      targetId: runId,
      description: params.reason,
    });
    return snapshot;
  }

  /**
   * Best-effort variant for automated callers (e.g. LeadRuntime after a
   * CRITICAL-priority lead is generated): returns false instead of throwing
   * when the current stage has no legal REVIEW_REQUIRED edge, so lead
   * generation never fails just because the run happens to be in a stage
   * (e.g. INGESTING) that can't transition to review right now.
   */
  async tryEnterReviewRequired(runId: string, params: { actor: string; reason: string }): Promise<RunSnapshot | null> {
    const run = await this.getRunOrThrow(runId);
    if (!canEnterReviewRequired(run.state)) return null;
    return this.enterReviewRequired(runId, params);
  }

  /**
   * Human resolution of REVIEW_REQUIRED: APPROVED -> COMPLETED, or
   * NEEDS_EVIDENCE -> WAITING_FOR_EVIDENCE (both contract-defined edges).
   */
  async resolveReview(
    runId: string,
    params: { outcome: ReviewResolutionOutcome; actor: string; notes?: string },
  ): Promise<RunSnapshot> {
    const run = await this.getRunOrThrow(runId);
    if (run.state !== "REVIEW_REQUIRED") {
      throw new RunNotInReviewError(runId, run.state);
    }
    const toState = reviewResolutionTarget(params.outcome);
    const snapshot = await this.transitionState(runId, {
      toState,
      actor: params.actor,
      reason: params.notes ?? `Review resolved: ${params.outcome}`,
    });
    await logAuditEvent({
      investigationId: snapshot.investigationId,
      action: "REVIEW_COMPLETED",
      actor: params.actor,
      targetType: "INVESTIGATION_RUN",
      targetId: runId,
      description: params.notes ?? `Review resolved: ${params.outcome} -> ${toState}`,
    });
    return snapshot;
  }
}

export const runStateMachine = new RunStateMachine();
