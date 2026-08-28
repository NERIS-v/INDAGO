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
import { emitProgressEvent } from "../realtime/sse.js";

// Ingestion & Extraction Services
import {
  ArtifactAcquisitionService,
  HttpArtifactFetcher,
  InMemoryArtifactStorage,
  ExtractionService,
  createDefaultParserRegistry,
  createTesseractOcrProvider,
} from "@indago/ingestion";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL);
const workerConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Initialize Shared Storage & Services for Ingestion Pipeline
const sharedStorage = new InMemoryArtifactStorage();
const parserRegistry = createDefaultParserRegistry();
const ocrProvider = createTesseractOcrProvider();

const acquisitionService = new ArtifactAcquisitionService({
  fetcher: new HttpArtifactFetcher(),
  storage: sharedStorage,
  acquisitionConfig: {
    maxArtifactSizeBytes: 50 * 1024 * 1024, // 50MB limit
    fetchTimeoutMs: 30000,
  },
});

const extractionService = new ExtractionService(
  sharedStorage,
  parserRegistry,
  { ocrProvider }
);

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

    // 1. INGEST-EVIDENCE JOB HANDLER (M-PR1 -> M-PR2 -> M-PR3)
    if (job.name === "ingest-evidence") {
      const parsed = IngestionJobPayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        const raw = job.data as unknown;
        const investigationId =
          typeof raw === "object" &&
          raw !== null &&
          "investigationId" in raw &&
          typeof (raw as Record<string, unknown>).investigationId === "string"
            ? String((raw as Record<string, unknown>).investigationId)
            : "unknown";

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

      const payload = parsed.data;
      console.log(`\n======================================================`);
      console.log(`[Worker] 📥 Ingesting Evidence: "${payload.evidenceTitle}"`);
      console.log(`[Worker] URL: ${payload.artifactReference.url}`);
      console.log(`======================================================`);

      emitProgressEvent(
        payload.investigationId,
        "INGESTING",
        `Acquiring artifact for "${payload.evidenceTitle}"...`
      );

      // Step A: Acquire Artifact (M-PR1)
      const acquireResult = await acquisitionService.acquire(
        payload.artifactReference,
        {
          sourceId: randomUUID(),
          operationId: payload.operationId,
        }
      );

      if (!acquireResult.ok) {
        console.error(`[Worker] ❌ Acquisition failed:`, acquireResult.error);
        emitProgressEvent(payload.investigationId, "FAILED", `Acquisition failed: ${acquireResult.error.message}`);
        throw new Error(acquireResult.error.message);
      }

      console.log(`[Worker] ✅ Artifact Acquired: ${acquireResult.artifact.artifactId} (${acquireResult.artifact.detectedMimeType})`);
      emitProgressEvent(
        payload.investigationId,
        "NORMALIZING",
        `Classifying & extracting content from ${acquireResult.artifact.originalFilename ?? "document"}...`
      );

      // Step B: Raw Extraction (M-PR2 Routing -> M-PR3 Extraction)
      const extractionResult = await extractionService.extract(acquireResult.artifact);

      if (!extractionResult.ok) {
        console.error(`[Worker] ❌ Extraction failed:`, extractionResult.error);
        emitProgressEvent(payload.investigationId, "FAILED", `Extraction failed: ${extractionResult.error.message}`);
        throw new Error(extractionResult.error.message);
      }

      // Step C: Display Extracted Content in Console
      console.log(`\n----------------- [EXTRACTION RESULT] -----------------`);
      console.log(`Format:          ${extractionResult.extraction.format}`);
      console.log(`Extracted At:    ${extractionResult.extraction.extractedAt}`);
      console.log(`Content Preview:\n`);
      console.dir(extractionResult.extraction, { depth: 4, colors: true });
      console.log(`-------------------------------------------------------\n`);

      emitProgressEvent(
        payload.investigationId,
        "ANALYZING",
        `Extraction complete for ${acquireResult.artifact.originalFilename ?? "document"}.`
      );

      await logAuditEvent({
        investigationId: payload.investigationId,
        action: "EVIDENCE_INGESTED",
        actor: "INGESTION_PIPELINE",
        targetType: "EVIDENCE",
        targetId: acquireResult.artifact.artifactId,
        description: `Successfully extracted ${extractionResult.extraction.format} content for ${payload.evidenceTitle}`,
      });

      return;
    }

    // 2. INVESTIGATION RUN STATE MACHINE PIPELINE
    const run = await db.investigationRun.findUniqueOrThrow({ where: { id: job.data.runId } });

    try {
      switch (run.state as InvestigationRunState) {
        case "CREATED": {
          await transitionState(run.id, "INGESTING", "PIPELINE_START");
          // Re-queue explicitly commented out per intended user flow
          // await investigationQueue.add("investigation-pipeline", { runId: run.id });
          break;
        }

        case "INGESTING": {
          console.log(`[Worker] Task 3: Ingesting case data for run ${run.id}...`);
          emitProgressEvent(run.investigationId, "INGESTING", "Fetching case data from Ingestion Service...");

          const context = (typeof run.contextData === "object" && run.contextData !== null)
            ? (run.contextData as Record<string, any>)
            : {};

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
          emitProgressEvent(run.investigationId, "GRAPH_READY", JSON.stringify(graphData));

          await transitionState(run.id, "NORMALIZING", "INGESTION_COMPLETE");
          await investigationQueue.add("investigation-pipeline", { runId: run.id });
          break;
        }

        case "NORMALIZING": {
          console.log(`[Worker] Task 3.5: Normalizing case data for run ${run.id}...`);
          emitProgressEvent(run.investigationId, "NORMALIZING", "Normalizing graph data format...");
          
          await transitionState(run.id, "ANALYZING", "NORMALIZATION_COMPLETE");
          await investigationQueue.add("investigation-pipeline", { runId: run.id });
          break;
        }

        case "ANALYZING": {
          const agentDecision = {
            proposedClaim: {
              text: "Found a hidden connection to Account Y.",
              referencedIds: ["valid_id_456"],
            },
          };

          const toolResult = { data: [{ id: "valid_id_456" }] };

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
    action: "SYSTEM_ACTION" as any,
    actor: "ORCHESTRATOR",
    targetType: "INVESTIGATION_RUN",
    targetId: runId,
    description: `State transition: ${run.state} -> ${newState} via ${trigger}`,
  });
}