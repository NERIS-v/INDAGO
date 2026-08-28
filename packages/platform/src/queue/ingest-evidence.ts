// ============================================================================
// Durable Ingest-Evidence Job Handler
//
// Canonical evidence ingestion path. One route into @indago/ingestion.
//
// Flow (each step durable):
//   1. Validate job payload        (strict IngestionJobPayloadSchema)
//   2. Resolve run + cross-check source-of-truth caseId
//   3. Establish attempt RUNNING   (IngestionAttempt, attemptNumber = retries+1)
//   4. Transition run CREATED → INGESTING
//   5. Acquire artifact            (deterministic sourceId, hash-verified)
//   6. Persist artifact            (Artifact upsert by contentHash → artifactId)
//   7. Classify → route → extract  (RawExtraction with provenance)
//   8. Persist RawExtraction       (immutable per attempt)
//   9. Mark attempt SUCCEEDED
//  10. Transition run → NORMALIZING
//  11. Audit EVIDENCE_INGESTED     (ONLY after all persistence succeeded)
//
// Failures: retryable → record attempt FAILED and rethrow (BullMQ retries);
// retry-exhausted or non-retryable → attempt FAILED + run → FAILED, rethrow.
// INGESTION_JOB_FAILED is audited exactly once per job by the worker's
// "failed" event listener.
//
// RE-ENTRANT COMPLETION: the completion path is idempotent. If a late failure
// (e.g. on the NORMALIZING transition or the audit step) triggers a retry
// AFTER the RawExtraction was persisted, the retry detects the existing
// RawExtraction and short-circuits to the (no-op) completion transition —
// no duplicate RawExtraction, no re-acquisition, no retry storm, and no run
// left INGESTING with valid extraction data. New evidence jobs for a
// FAILED / CANCELLED / COMPLETED run are rejected before any work.
// ============================================================================

import { UnrecoverableError, type Job } from "bullmq";
import {
  IngestionJobPayloadSchema,
  type IngestionError,
  type IngestionJobPayload,
} from "@indago/contracts";
import { deterministicSourceId } from "@indago/ingestion";
import { logAuditEvent } from "../audit/logger.js";
import { db } from "../db/prisma.js";
import { ingestionStore } from "../persistence/ingestion-store.js";
import { emitProgressEvent } from "../realtime/sse.js";
import { acquisitionService, extractionService } from "./ingest-deps.js";
import {
  transitionRunToIngesting,
  transitionRunToNormalizing,
  transitionRunToPermanentFailure,
} from "./transitions.js";

export function extractInvestigationIdFromJobData(data: unknown): string {
  if (typeof data === "object" && data !== null && "investigationId" in data) {
    const candidate = (data as Record<string, unknown>).investigationId;
    if (typeof candidate === "string") return candidate;
  }
  return "unknown";
}

/**
 * Runs that can no longer accept evidence. New evidence jobs for a terminal
 * run are rejected BEFORE any acquisition/persistence work (Unrecoverable —
 * never retried, never re-acquired).
 */
const TERMINAL_RUN_STATUSES = new Set(["FAILED", "CANCELLED", "COMPLETED"]);

export async function handleIngestEvidenceJob(job: Job): Promise<void> {
  const parsed = IngestionJobPayloadSchema.safeParse(job.data);

  if (!parsed.success) {
    const investigationId = extractInvestigationIdFromJobData(job.data);

    await logAuditEvent({
      investigationId,
      action: "SYSTEM_ACTION",
      actor: "SYSTEM_WORKER",
      targetType: "SYSTEM",
      targetId: job.id ?? "unknown",
      description: `Malformed ingest-evidence payload: ${parsed.error.message}`,
    });
    throw new UnrecoverableError(`Malformed ingest-evidence payload: ${parsed.error.message}`);
  }

  const payload = parsed.data;
  const attemptNumber = job.attemptsMade + 1;

  // ---- 2. Resolve run from the authoritative Prisma lifecycle
  const run = await db.investigationRun.findFirst({
    where: { investigationId: payload.investigationId },
    orderBy: { createdAt: "desc" },
  });

  if (!run) {
    await logAuditEvent({
      investigationId: payload.investigationId,
      action: "SYSTEM_ACTION",
      actor: "SYSTEM_WORKER",
      targetType: "SYSTEM",
      targetId: job.id ?? "unknown",
      description: `Ingest-evidence job for unknown investigation ${payload.investigationId}`,
    });
    throw new UnrecoverableError(`Investigation not found: ${payload.investigationId}`);
  }

  // The run's caseId is the single source of truth. A mismatched queue payload
  // is an integrity violation — this job must not proceed.
  if (run.caseId !== payload.caseId) {
    await ingestionStore.upsertAttempt({
      investigationId: payload.investigationId,
      caseId: run.caseId,
      idempotencyKey: payload.idempotencyKey,
      operationId: payload.operationId,
      correlationId: payload.correlationId,
      attemptNumber,
      status: "FAILED",
      sourceId: undefined,
      artifactId: undefined,
      parserId: undefined,
      parserVersion: undefined,
      format: undefined,
      error: {
        category: "UNKNOWN",
        code: "CASE_ID_MISMATCH",
        message: `Queue caseId ${payload.caseId} does not match run caseId ${run.caseId}`,
        retryable: false,
        timestamp: new Date().toISOString(),
      },
    });
    throw new UnrecoverableError(`CASE_ID_MISMATCH: queue caseId does not match run caseId`);
  }

  // ---- 2b. Terminal-run guard.
  // A FAILED / CANCELLED / COMPLETED run cannot accept new evidence. Refuse
  // before any attempt write or acquisition. UnrecoverableError is NOT
  // retried, and no state transition is attempted — the run is already
  // terminal, so the authoritative row and ALL SSE output stay truthful.
  if (TERMINAL_RUN_STATUSES.has(run.status)) {
    throw new UnrecoverableError(
      `RUN_TERMINAL: investigation ${payload.investigationId} is ${run.status}/${run.state}; refusing to ingest new evidence`,
    );
  }

  const runId = run.id;
  const correlate = {
    operationId: payload.operationId,
    correlationId: payload.correlationId,
    runId,
  };

  // ---- 3. Establish the durable attempt (RUNNING for this retry)
  const attempt = await ingestionStore.upsertAttempt({
    investigationId: payload.investigationId,
    caseId: run.caseId,
    idempotencyKey: payload.idempotencyKey,
    operationId: payload.operationId,
    correlationId: payload.correlationId,
    attemptNumber,
    status: "RUNNING",
    sourceId: undefined,
    artifactId: undefined,
    parserId: undefined,
    parserVersion: undefined,
    format: undefined,
    error: undefined,
  });

  // ---- 3b. Re-entrancy gate. If a previous pass of this exact attempt
  // already durably persisted the RawExtraction (a late failure on the
  // NORMALIZING transition or the audit step), do NOT re-acquire/re-extract.
  // Copying the progress, we simply recognize the completed state and leave —
  // the completion transition is a safe no-op for a run already past
  // INGESTING (transitions.ts). This closes the post-success retry wedge.
  const alreadyExtracted = await ingestionStore.findRawExtractionByAttempt(
    attempt.id,
  );
  if (alreadyExtracted) {
    await transitionRunToNormalizing(runId);
    return;
  }

  // ---- 4. Drive the run lifecycle
  await transitionRunToIngesting(runId);

  emitProgressEvent(
    payload.investigationId,
    "INGESTING",
    `Acquiring artifact for "${payload.evidenceTitle}"...`,
    correlate,
  );

  // Deterministic source identity (stable across retries, no fabricated UUIDs).
  const sourceSeed = `${payload.investigationId}:${extractFileKey(payload)}`;
  const sourceId = await deterministicSourceId(sourceSeed);

  // ---- 5. Acquire (fetch → hash → verify → store)
  const acquireResult = await acquisitionService.acquire(payload.artifactReference, {
    sourceId,
    investigationId: payload.investigationId,
    operationId: payload.operationId,
  });

  if (!acquireResult.ok) {
    await onIngestionError({ job, payload, runId, error: acquireResult.error });
    return;
  }

  const artifact = acquireResult.artifact;

  // ---- 6. Persist artifact (content-addressed upsert)
  const persistedArtifact = await ingestionStore.upsertArtifact({
    id: artifact.artifactId,
    contentHash: artifact.contentHash,
    storagePath: artifact.storagePath,
    detectedMimeType: artifact.detectedMimeType,
    declaredMimeType: artifact.declaredMimeType,
    originalFilename: artifact.originalFilename,
    contentSizeBytes: artifact.contentSizeBytes,
    sourceType: extractSourceType(payload),
    sourceId,
    investigationId: payload.investigationId,
    caseId: run.caseId,
    operationId: payload.operationId,
    correlationId: payload.correlationId,
    idempotencyKey: payload.idempotencyKey,
    hashVerified: artifact.hashVerified,
    mimeVerified: artifact.mimeVerified,
    providerMetadata: artifact.providerMetadata,
  });

  // The run is still INGESTING at this point: the progress `state` must mirror
  // the authoritative InvestigationRun.state (transition to NORMALIZING happens
  // only after the RawExtraction is durably persisted below).
  emitProgressEvent(
    payload.investigationId,
    "INGESTING",
    `Classifying & extracting content from ${artifact.originalFilename ?? "document"}...`,
    { ...correlate, artifactId: persistedArtifact.id },
  );

  // ---- 7. Classify → route → extract
  const extractionResult = await extractionService.extract(artifact);

  if (!extractionResult.ok) {
    await onIngestionError({ job, payload, runId, error: extractionResult.error });
    return;
  }

  const extraction = extractionResult.extraction;

  // ---- 8/9. Persist RawExtraction + mark attempt SUCCEEDED (immutable per attempt)
  await ingestionStore.upsertAttempt({
    investigationId: payload.investigationId,
    caseId: run.caseId,
    idempotencyKey: payload.idempotencyKey,
    operationId: payload.operationId,
    correlationId: payload.correlationId,
    attemptNumber,
    status: "SUCCEEDED",
    sourceId,
    artifactId: artifact.artifactId,
    parserId: extraction.parserId,
    parserVersion: extraction.parserVersion,
    format: extraction.format,
    error: undefined,
  });

  // Idempotent insert: re-entrant retries (belt-and-braces for the re-entrancy
  // gate above) treat an already-persisted RawExtraction as complete.
  await ingestionStore.ensureRawExtraction({
    attemptId: attempt.id,
    artifactId: artifact.artifactId,
    parserId: extraction.parserId,
    parserVersion: extraction.parserVersion,
    format: extraction.format,
    extraction,
    warnings: extraction.warnings,
    extractedAt: extraction.extractedAt,
  });

  // ---- 10. Run lifecycle → NORMALIZING
  await transitionRunToNormalizing(runId);

  // ---- 11. Audit ONLY after persistence succeeded
  await logAuditEvent({
    investigationId: payload.investigationId,
    action: "EVIDENCE_INGESTED",
    actor: "INGESTION_PIPELINE",
    targetType: "EVIDENCE",
    targetId: artifact.artifactId,
    description: `Durably ingested ${extraction.format} content for ${payload.evidenceTitle} (attempt ${attemptNumber}, case ${run.caseId})`,
  });

  emitProgressEvent(
    payload.investigationId,
    "NORMALIZING",
    `Extraction complete and persisted for ${artifact.originalFilename ?? "document"}.`,
    { ...correlate, artifactId: artifact.artifactId },
  );
}

/**
 * Record a durable FAILED attempt. Retryable errors rethrow for BullMQ to
 * retry; the run is only terminal-failed after retry exhaustion.
 */
async function onIngestionError(params: {
  job: Job;
  payload: IngestionJobPayload;
  runId: string;
  error: IngestionError;
}): Promise<void> {
  const { job, payload, runId, error } = params;
  const attemptNumber = job.attemptsMade + 1;

  await ingestionStore.upsertAttempt({
    investigationId: payload.investigationId,
    caseId: payload.caseId,
    idempotencyKey: payload.idempotencyKey,
    operationId: payload.operationId,
    correlationId: payload.correlationId,
    attemptNumber,
    status: "FAILED",
    sourceId: error.sourceId,
    artifactId: undefined,
    parserId: undefined,
    parserVersion: undefined,
    format: undefined,
    error,
  });

  const configuredAttempts = job.opts.attempts ?? 3;
  const retriesExhausted = attemptNumber >= configuredAttempts;
  const terminal = !error.retryable || retriesExhausted;

  // Progress `state` always mirrors the authoritative InvestigationRun.state.
  // A retryable attempt that will be retried leaves the run INGESTING, so the
  // frame claims INGESTING (a retry notice). Terminal failure is driven — and
  // emitted — by transitionRunToPermanentFailure once the run actually reached
  // FAILED, so no FAILED frame is emitted here (avoids a duplicate).

  if (!terminal) {
    emitProgressEvent(
      payload.investigationId,
      "INGESTING",
      `Ingestion attempt ${attemptNumber} failed (${error.code}); retrying…`,
      {
        operationId: payload.operationId,
        correlationId: payload.correlationId,
        runId,
      },
    );
  }

  if (terminal) {
    await transitionRunToPermanentFailure(runId, `${error.code}: ${error.message}`);
  }

  if (terminal) {
    throw new UnrecoverableError(`${error.code}: ${error.message}`);
  }
  throw new Error(`${error.code}: ${error.message}`);
}

/**
 * Provider file key if present, else the source seed from the reference.
 * Never empty given a validated payload.
 */
function extractFileKey(payload: IngestionJobPayload): string {
  const provider = payload.artifactReference.providerMetadata;
  if (provider !== undefined && typeof provider.fileKey === "string" && provider.fileKey.length > 0) {
    return provider.fileKey;
  }
  return payload.artifactReference.originalFilename ?? payload.artifactReference.url;
}

function extractSourceType(payload: IngestionJobPayload): string | undefined {
  return payload.artifactReference.sourceType ?? undefined;
}