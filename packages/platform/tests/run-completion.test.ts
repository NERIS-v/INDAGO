import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkInvestigationAnalysisComplete,
  finalizeRunIfComplete,
} from "../src/queue/run-completion.js";
import { db } from "../src/db/prisma.js";
import { logAuditEvent } from "../src/audit/logger.js";
import { emitProgressEvent } from "../src/realtime/sse.js";

// ============================================================================
// PR-26: canonical run completion
//
// The completion condition must be durable, truthful and concurrency-safe:
//   - no expected work registered          → never complete
//   - any QUEUED / RUNNING / FAILED attempt → never complete
//   - all SUCCEEDED                         → complete exactly once
//   - a PAUSED run                          → never auto-complete
//   - a racing loser (updateMany count 0)   → no duplicate audit/checkpoint/SSE
// ============================================================================

vi.mock("../src/db/prisma.js", () => ({
  db: {
    investigationRun: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    ingestionAttempt: { findMany: vi.fn() },
    agentCheckpoint: { count: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../src/audit/logger.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("../src/realtime/sse.js", () => ({
  emitProgressEvent: vi.fn(),
}));

const findUniqueOrThrow = db.investigationRun.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const updateMany = db.investigationRun.updateMany as unknown as ReturnType<typeof vi.fn>;
const attemptFindMany = db.ingestionAttempt.findMany as unknown as ReturnType<typeof vi.fn>;
const checkpointCount = db.agentCheckpoint.count as unknown as ReturnType<typeof vi.fn>;
const checkpointCreate = db.agentCheckpoint.create as unknown as ReturnType<typeof vi.fn>;
const audit = logAuditEvent as unknown as ReturnType<typeof vi.fn>;
const emit = emitProgressEvent as unknown as ReturnType<typeof vi.fn>;

const SUCCEEDED = { status: "SUCCEEDED" };

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueOrThrow.mockResolvedValue({
    id: "run-1",
    investigationId: "inv-1",
    state: "ANALYZING",
    status: "RUNNING",
  });
  updateMany.mockResolvedValue({ count: 1 });
  attemptFindMany.mockResolvedValue([SUCCEEDED]);
  checkpointCount.mockResolvedValue(3);
  checkpointCreate.mockResolvedValue({ id: "cp-3" });
  audit.mockResolvedValue({ id: "audit-1" });
});

describe("checkInvestigationAnalysisComplete", () => {
  it("declines when no expected work is registered", async () => {
    attemptFindMany.mockResolvedValue([]);
    const r = await checkInvestigationAnalysisComplete("inv-1");
    expect(r.complete).toBe(false);
    expect(r.attemptCount).toBe(0);
  });

  it.each(["QUEUED", "RUNNING", "FAILED"])(
    "declines while a %s attempt exists",
    async (status) => {
      attemptFindMany.mockResolvedValue([SUCCEEDED, { status }]);
      const r = await checkInvestigationAnalysisComplete("inv-1");
      expect(r.complete).toBe(false);
    },
  );

  it("accepts only when every attempt durably succeeded", async () => {
    attemptFindMany.mockResolvedValue([SUCCEEDED, SUCCEEDED, SUCCEEDED]);
    const r = await checkInvestigationAnalysisComplete("inv-1");
    expect(r.complete).toBe(true);
    expect(r.attemptCount).toBe(3);
    expect(r.failedCount).toBe(0);
    expect(r.pendingCount).toBe(0);
  });
});

describe("finalizeRunIfComplete", () => {
  it("completes exactly once: guarded update, checkpoint, audit, SSE", async () => {
    const applied = await finalizeRunIfComplete({
      runId: "run-1",
      investigationId: "inv-1",
    });

    expect(applied).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", state: "ANALYZING", status: { not: "PAUSED" } },
      data: { state: "COMPLETED", status: "COMPLETED" },
    });
    expect(checkpointCreate).toHaveBeenCalledTimes(1);
    expect(checkpointCreate.mock.calls[0][0].data.stepId).toBe("step_3");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SYSTEM_ACTION",
        targetId: "run-1",
        description: expect.stringContaining("ANALYZING -> COMPLETED"),
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      "inv-1",
      "COMPLETED",
      expect.any(String),
      expect.objectContaining({ runId: "run-1" }),
    );
  });

  it("does not complete a run that is no longer ANALYZING", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: "run-1",
      investigationId: "inv-1",
      state: "COMPLETED",
      status: "COMPLETED",
    });
    const applied = await finalizeRunIfComplete({
      runId: "run-1",
      investigationId: "inv-1",
    });
    expect(applied).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("respects human pause authority", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: "run-1",
      investigationId: "inv-1",
      state: "ANALYZING",
      status: "PAUSED",
    });
    const applied = await finalizeRunIfComplete({
      runId: "run-1",
      investigationId: "inv-1",
    });
    expect(applied).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("declines when work is still pending", async () => {
    attemptFindMany.mockResolvedValue([SUCCEEDED, { status: "QUEUED" }]);
    const applied = await finalizeRunIfComplete({
      runId: "run-1",
      investigationId: "inv-1",
    });
    expect(applied).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("declines after a permanent failure (never fabricates success)", async () => {
    attemptFindMany.mockResolvedValue([SUCCEEDED, { status: "FAILED" }]);
    const applied = await finalizeRunIfComplete({
      runId: "run-1",
      investigationId: "inv-1",
    });
    expect(applied).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op for a concurrent loser (updateMany count 0)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const applied = await finalizeRunIfComplete({
      runId: "run-1",
      investigationId: "inv-1",
    });
    expect(applied).toBe(false);
    expect(checkpointCreate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
