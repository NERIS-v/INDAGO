import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import {
  DEFAULT_RUN_STATE_CONFIGURATION,
  IngestionJobPayloadSchema,
  type InvestigationRunState,
} from "@indago/contracts";
import { validateClaim, ClaimGroundingError } from "../security/grounding.js";
import { emitProgressEvent } from "../realtime/sse.js"; // <-- Task 5: Added SSE Emitter

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL);
const workerConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const investigationQueue = new Queue("investigation-pipeline", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const investigationWorker = new Worker(
  "investigation-pipeline",
  async (job: Job) => {
    // I-PR2: Handle ingest-evidence jobs (canonical IngestionJobPayload)
    if (job.name === "ingest-evidence") {
      const parsed = IngestionJobPayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        // Malformed payload: extract investigationId via safe runtime checks.
        // No casts — use typeof guards to avoid type narrowing violations.
        const raw = job.data as unknown;
        const investigationId =
          typeof raw === "object" &&
          raw !== null &&
          "investigationId" in raw &&
          typeof (raw as Record<string, unknown>).investigationId === "string"
            ? String((raw as Record<string, unknown>).investigationId)
            : "unknown";

        // SYSTEM_ACTION: malformed queue message is a system anomaly,
        // not an ingestion-job lifecycle failure.
        await logAuditEvent({
          investigationId,
          action: "SYSTEM_ACTION",
          actor: "SYSTEM_WORKER",
          targetType: "SYSTEM",
          targetId: job.id ?? "unknown",
          description: `Malformed ingest-evidence payload: ${parsed.error.message}`,
        });
        throw new Error(`Malformed ingest-evidence payload: ${parsed.error.message}`);
      }

      // Valid payload received — log receipt, then return (no ingestion execution).
      // I-PR3 will implement the actual ingestion logic here.
      await logAuditEvent({
        investigationId: parsed.data.investigationId,
        action: "SYSTEM_ACTION",
        actor: "SYSTEM_WORKER",
        targetType: "INGESTION_JOB",
        targetId: job.id ?? "unknown",
        description: `Ingest-evidence job received (correlation: ${parsed.data.correlationId})`,
      });
      return;
    }

    // Existing investigation-pipeline handling
    const run = await db.investigationRun.findUniqueOrThrow({ where: { id: job.data.runId } });

    try {
      switch (run.state as InvestigationRunState) {
        case "CREATED": {
          await transitionState(run.id, "INGESTING", "PIPELINE_START");
          // Re-queue to immediately process the INGESTING step
          await investigationQueue.add("investigation-pipeline", { runId: run.id });
          break;
        }

        case "INGESTING": {
          console.log(`[Worker] Task 3: Ingesting case data for run ${run.id}...`);
          
          // Let the frontend know we are actively fetching data
          emitProgressEvent(run.investigationId, "INGESTING", "Fetching case data from Ingestion Service...");

          const context = (typeof run.contextData === "object" && run.contextData !== null)
            ? (run.contextData as Record<string, any>)
            : {};

          // Consume Tool Results
          let graphData;

          if (process.env.USE_MOCK_INGESTION === "true") {
            console.log(`[Worker] USE_MOCK_INGESTION is true. Using synthetic graph data.`);
            graphData = {
              nodes: [
                { id: "node-1", label: "Suspect", properties: { name: "Synthetic Entity A" } },
                { id: "node-2", label: "Bank Account", properties: { accountNumber: "XXXX-9021" } },
              ],
              edges: [
                { from: "node-1", to: "node-2", relation: "CONTROLS" },
              ],
            };
          } else {
            console.log(`[Worker] Fetching real data from Ingestion API...`);
            const targetUrl = process.env.INGESTION_SERVICE_URL || "http://localhost:8080";
            
            const response = await fetch(`${targetUrl}/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caseId: context.caseId }),
            });

            if (!response.ok) {
              throw new Error(`Ingestion service returned status ${response.status}`);
            }

            graphData = await response.json();
          }

          // Persist State
          await db.investigationRun.update({
            where: { id: run.id },
            data: {
              contextData: {
                ...context,
                graph: graphData,
                ingestedAt: new Date().toISOString(),
              },
            },
          });

          console.log(`[Worker] Task 4: Graph state successfully persisted for run ${run.id}`);
          // To send the graph payload to the frontend
          emitProgressEvent(run.investigationId, "GRAPH_READY", JSON.stringify(graphData));

          await transitionState(run.id, "NORMALIZING", "INGESTION_COMPLETE");
          // Re-queue to process the next state machine step
          await investigationQueue.add("investigation-pipeline", { runId: run.id });
          break;
        }

        case "NORMALIZING": {
          console.log(`[Worker] Task 3.5: Normalizing case data for run ${run.id}...`);
          emitProgressEvent(run.investigationId, "NORMALIZING", "Normalizing graph data format...");
          // For Phase 3 testing, we just pass straight through this step to keep the pipeline moving
          await transitionState(run.id, "ANALYZING", "NORMALIZATION_COMPLETE");
          await investigationQueue.add("investigation-pipeline", { runId: run.id });
          break;
        }

        case "ANALYZING": {
          // LLM & Agent Decision Logic
          const agentDecision = {
            proposedClaim: {
              text: "Found a hidden connection to Account Y.",
              referencedIds: ["valid_id_456"],
            },
          };

          const toolResult = { data: [{ id: "valid_id_456" }] };

          // G-A08: Claim Grounding Gate
          if (agentDecision.proposedClaim) {
            try {
              await validateClaim(
                run.investigationId,
                {
                  id: randomUUID(),
                  claimText: agentDecision.proposedClaim.text,
                  referencedIds: agentDecision.proposedClaim.referencedIds,
                },
                toolResult
              );
            } catch (error) {
              if (error instanceof ClaimGroundingError) {
                console.warn(`[GROUNDING FAILED] Agent hallucinated. Replanning run ${run.id}`);
                await investigationQueue.add(
                  "investigation-pipeline",
                  { runId: run.id },
                  { delay: 1000 }
                );
                return;
              }
              throw error;
            }
          }

          await transitionState(run.id, "DISCOVERING", "ANALYSIS_COMPLETE");
          break;
        }

        case "WAITING_FOR_EVIDENCE": {
          await db.investigationRun.update({
            where: { id: run.id },
            data: { status: "PAUSED" },
          });
          break;
        }
      }
    } catch (error: any) {
      console.error(`[Worker] Failed during state execution for run ${run.id}:`, error);
      
      // Let the frontend know there was a critical failure
      emitProgressEvent(run.investigationId, "FAILED", `Error: ${error.message}`);
      
      await db.investigationRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          contextData: {
            ...(typeof run.contextData === "object" && run.contextData !== null
              ? (run.contextData as Record<string, any>)
              : {}),
            lastError: error.message,
          },
        },
      });
      throw error;
    }
  },
  { connection: workerConnection }
);

async function transitionState(
  runId: string,
  newState: InvestigationRunState,
  trigger: string
) {
  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });

  const isValid = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.some(
    (t) => t.from === run.state && t.to === newState
  );

  if (!isValid) {
    throw new Error(`Invalid transition: ${run.state} -> ${newState}`);
  }

  // G-A05: Create Checkpoint
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

  // Broadcast state transition to the frontend
  emitProgressEvent(run.investigationId, newState, `System transitioned to ${newState} via ${trigger}`);

  await logAuditEvent({
    investigationId: run.investigationId,
    action: "SYSTEM_ACTION" as any,
    actor: "ORCHESTRATOR",
    targetType: "INVESTIGATION_RUN",
    targetId: runId,
    description: `State transition: ${run.state} -> ${newState} via ${trigger}`,
  });
}