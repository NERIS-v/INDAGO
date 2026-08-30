import { Queue, Worker, UnrecoverableError, type Job } from "bullmq";
import Redis from "ioredis";
import { logAuditEvent } from "../audit/logger.js";
import {
  handleIngestEvidenceJob,
  extractInvestigationIdFromJobData,
} from "./ingest-evidence.js";
import { handleLegacyRunStateJob } from "./legacy-pipeline.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// Overridable so tests can claim a dedicated queue: a concurrently-running dev
// worker must never consume test jobs from the shared default queue.
const QUEUE_NAME =
  process.env.INVESTIGATION_QUEUE_NAME ?? "investigation-pipeline";
const connection = new Redis(REDIS_URL);
const workerConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const investigationQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

/**
 * Single worker, two job families:
 *
 *   ingest-evidence        → durable canonical evidence ingestion
 *                            (ingest-evidence.ts)
 *   anything else          → legacy run-state pipeline, active only when
 *                            LEGACY_PIPELINE_ENABLED=true (legacy-pipeline.ts)
 */
export const investigationWorker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    if (job.name === "ingest-evidence") {
      return handleIngestEvidenceJob(job);
    }
    return handleLegacyRunStateJob(job);
  },
  { connection: workerConnection },
);

// Canonical job-failure audit. INGESTION_JOB_FAILED fires exactly once per
// ingest-evidence job: BullMQ fires "failed" on EVERY attempt, but only the
// terminal failure (retries exhausted or an unrecoverable error) is audited.
// Intermediate retryable failures are recorded as durable FAILED attempts by
// the handler and merely rethrown back into BullMQ.
investigationWorker.on("failed", async (job: Job | undefined, err: Error) => {
  if (job === undefined || job.name !== "ingest-evidence") return;

  const configuredAttempts = job.opts.attempts ?? 1;
  const exhausted = job.attemptsMade >= configuredAttempts;
  const unrecoverable = err instanceof UnrecoverableError;
  if (!exhausted && !unrecoverable) return;

  try {
    await logAuditEvent({
      investigationId: extractInvestigationIdFromJobData(job.data),
      action: "INGESTION_JOB_FAILED",
      actor: "INGESTION_PIPELINE",
      targetType: "EVIDENCE",
      targetId: job.id ?? "unknown",
      description: `Ingest job failed after ${job.attemptsMade} attempt(s): ${err.message}`,
    });
  } catch (inner) {
    console.error("Failed to audit job failure:", inner);
  }
});