import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import { DEFAULT_RUN_STATE_CONFIGURATION, type InvestigationRunState } from "@indago/contracts";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export const investigationQueue = new Queue("investigation-pipeline", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  }
});

export const investigationWorker = new Worker(
  "investigation-pipeline",
  async (job: Job<{ runId: string }>) => {
    const run = await db.investigationRun.findUniqueOrThrow({ where: { id: job.data.runId } });

    try {
      // Execute the State Machine mapped from Mayur's Contracts
      switch (run.state as InvestigationRunState) {
        case "CREATED":
          await transitionState(run.id, "INGESTING", "PIPELINE_START");
          // Dispatch ingestion tasks here
          break;

        case "INGESTING":
          await transitionState(run.id, "NORMALIZING", "INGESTION_COMPLETE");
          break;

        case "ANALYZING":
          // Run agent planner, execute graph tools, detect holes

          await transitionState(run.id, "DISCOVERING", "ANALYSIS_COMPLETE");
          break;

        case "WAITING_FOR_EVIDENCE":
          // Paused state. UI will trigger RESUME when evidence arrives.
          await db.investigationRun.update({
            where: { id: run.id },
            data: { status: "PAUSED" }
          });
          break;
      }
    } catch (error: any) {
      await db.investigationRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: error.message }
      });
      throw error; // Let BullMQ handle retry backoff
    }
  },
  { connection }
);

async function transitionState(runId: string, newState: InvestigationRunState, trigger: string) {
  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });
  
  // 1. Verify Transition is valid according to V7 Contracts
  const isValid = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.some(
    t => t.from === run.state && t.to === newState
  );

  if (!isValid) throw new Error(`Invalid transition: ${run.state} -> ${newState}`);

  // 2. G-A05: Create Checkpoint before moving forward
  const checkpointsCount = await db.agentCheckpoint.count({ where: { runId } });
  await db.agentCheckpoint.create({
    data: {
      runId,
      stage: run.state,
      stageIndex: checkpointsCount,
      stateSnapshot: run.contextData as any
    }
  });

  // 3. Mutate State
  await db.investigationRun.update({
    where: { id: runId },
    data: { state: newState, status: "RUNNING" }
  });

  await logAuditEvent({
    investigationId: run.investigationId,
    action: "SYSTEM_ACTION" as any,
    actor: "ORCHESTRATOR",
    targetType: "INVESTIGATION_RUN",
    targetId: runId,
    description: `State transition: ${run.state} -> ${newState} via ${trigger}`
  });
}