import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import { realtimeEvents } from "../realtime/sse.js";

/**
 * Escalates investigation to human review.
 * Triggered when safe recovery is impossible (e.g., exhausted retries or continuous semantic failures).
 */
export async function escalateToHuman(
  investigationId: string,
  runId: string,
  failureReason: string
) {
  return await db.$transaction(async (tx) => {
    // 1. Transition to safe PAUSED state
    const run = await tx.investigationRun.update({
      where: { id: runId },
      data: {
        status: "PAUSED",
        currentStage: "HUMAN_ESCALATION",
        error: failureReason
      }
    });

    // 2. Append to tamper-evident audit trail
    await logAuditEvent({
      investigationId,
      action: "HUMAN_ESCALATION_TRIGGERED" as any,
      actor: "SYSTEM_CIRCUIT_BREAKER",
      targetType: "INVESTIGATION_RUN",
      targetId: runId,
      description: `Safe recovery impossible. Escalated to human review. Reason: ${failureReason}`
    });

    // 3. Broadcast alert to UI
    realtimeEvents.emit("progress", {
      investigationId,
      type: "ALERT",
      message: "Agent execution paused. Human review required.",
      runState: run.state,
      error: failureReason
    });

    return run;
  });
}