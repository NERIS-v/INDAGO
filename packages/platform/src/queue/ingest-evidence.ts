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
//  12. Normalize → persist NormalizedExtraction   (attemptId-keyed, idempotent)
//  13. Audit NORMALIZATION_STORED  (forward path only; skipped for re-entrant)
//  14. Transition run → ANALYZING  + audit NORMALIZATION_COMPLETED (only when
//                                  the transition actually applied)
//
// Failures: retryable → record attempt FAILED and rethrow (BullMQ retries);
// retry-exhausted or non-retryable → attempt FAILED + run → FAILED, rethrow.
// INGESTION_JOB_FAILED is audited exactly once per job by the worker's
// "failed" event listener.
//
// RE-ENTRANT COMPLETION: the completion path is idempotent. If a late failure
// (e.g. on the NORMALIZING transition, the audit step, or the ANALYZING
// completion) triggers a retry AFTER the RawExtraction was persisted, the
// retry rehydrates the stored row, skips extract/normalize re-computations it
// can prove are stale/no-ops, and drives the run through to ANALYZING — no
// duplicate RawExtraction / NormalizedExtraction, no re-acquisition, no retry
// storm, and no run left NORMALIZING with valid extraction data. New evidence
// jobs for a FAILED / CANCELLED / COMPLETED run are rejected before any work.
// ============================================================================

import { UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import {
  IngestionJobPayloadSchema,
  LexicalStatisticsSchema,
  NormalizationConfigSchema,
  NormalizedFieldSchema,
  QualityMetadataSchema,
  type IngestionError,
  type IngestionJobPayload,
  type NormalizedExtraction,
  type Observation,
  type EntityMentionCandidate,
  type CandidatePair,
  type EntityHypothesis,
  EntityHypothesisSchema,
} from "@indago/contracts";
import {
  buildObservationIdentityKey,
  buildEntityMentionIdentityKey,
  buildCandidatePairIdentityKey,
  blockCandidates,
  deterministicArtifactIdForCase,
  deterministicSourceId,
  extractEntityMentions,
  extractObservations,
  finalizeCandidatePair,
  finalizeEntityMention,
  finalizeObservation,
  NORMALIZER_ID,
  NORMALIZER_VERSION,
  parseStoredRawExtraction,
  type GazetteerEntry,
  type RawExtraction,
} from "@indago/ingestion";
import {
  buildEntityHypothesisIdentityKey,
  compareCandidates,
  deterministicEntityHypothesisId,
} from "@indago/entity-resolution";
import {
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
  RELATION_PROPOSAL_THRESHOLD,
  resolveRelationsForCase,
  type RelationResolution,
} from "@indago/relation-resolution";
import { logAuditEvent } from "../audit/logger.js";
import { Prisma } from "@prisma/client";
import { db } from "../db/prisma.js";
import { ingestionStore } from "../persistence/ingestion-store.js";
import {
  deterministicEvidenceId,
  observationStore,
} from "../persistence/observation-store.js";
import { entityMentionStore } from "../persistence/entity-mention-store.js";
import { candidatePairStore } from "../persistence/candidate-pair-store.js";
import { entityHypothesisStore } from "../persistence/entity-hypothesis-store.js";
import { entityStore } from "../persistence/entity-store.js";
import { relationHypothesisStore } from "../persistence/relation-hypothesis-store.js";
import { graphVersionStore } from "../persistence/graph-version-store.js";
import { temporalStateChangeStore } from "../persistence/temporal-state-change-store.js";
import {
  TemporalValidationError,
  validateEventTime,
  validateTemporalInterval,
  assertValidTemporalInterval,
} from "../temporal/interval-validation.js";
import { deriveValidityInterval } from "../temporal/interval-aggregation.js";
import { emitObservationExtracted, emitProgressEvent } from "../realtime/sse.js";
import {
  acquisitionService,
  extractionService,
  normalizationService,
} from "./ingest-deps.js";
import {
  transitionRunToIngesting,
  transitionRunToNormalizing,
  transitionRunToAnalyzing,
  transitionRunToPermanentFailure,
} from "./transitions.js";
import {
  newEvidenceTrigger,
  newObservationTrigger,
  publishCaseChange,
} from "../reassessment/publish-case-change.js";

/**
 * PR12 producer: enqueue a reassessment change for a NEW_EVIDENCE /
 * NEW_OBSERVATION trigger. There is nothing to reassess before the first graph
 * version exists, so a missing ACTIVE version is a healthy no-op (bounded
 * work). Fire-and-forget: a producer failure must never fail ingestion.
 */
async function publishReassessmentChange(input: {
  caseId: string;
  investigationId: string | undefined;
  graphVersionId: string;
  trigger: Parameters<typeof publishCaseChange>[0]["trigger"];
}): Promise<void> {
  try {
    await publishCaseChange({
      caseId: input.caseId,
      graphVersionId: input.graphVersionId,
      trigger: input.trigger,
    });
  } catch (error) {
    emitProgressEvent(
      input.investigationId ?? "unknown",
      "ANALYZING",
      `PR12 reassessment change not enqueued (${input.trigger.triggerType}); will be retried on the next write to the case`,
      { operationId: input.caseId },
    );
    // eslint-disable-next-line no-console
    console.error("PR12 publishCaseChange failed", error);
  }
}

async function activeGraphVersionId(caseId: string): Promise<string | null> {
  const version = await graphVersionStore.latestActiveByCase(caseId, {});
  return version ? version.id : null;
}

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
  // NORMALIZING transition, the audit step, or the ANALYZING completion), do
  // NOT re-acquire/re-extract. Rehydrate the stored row and drive the run
  // through normalization completion to ANALYZING (idempotent — see
  // completeNormalization below). A corrupt stored row is a permanent failure.
  const alreadyExtracted = await ingestionStore.findRawExtractionByAttempt(
    attempt.id,
  );
  if (alreadyExtracted) {
    let raw: RawExtraction;
    try {
      raw = parseStoredRawExtraction({
        attemptId: alreadyExtracted.attemptId,
        artifactId: alreadyExtracted.artifactId,
        parserId: alreadyExtracted.parserId,
        parserVersion: alreadyExtracted.parserVersion,
        format: alreadyExtracted.format,
        extraction: alreadyExtracted.extraction,
        warnings: alreadyExtracted.warnings,
        extractedAt: alreadyExtracted.extractedAt,
      });
    } catch (cause) {
      await failNormalizationPermanently({
        payload,
        runId,
        attemptId: attempt.id,
        artifactId: alreadyExtracted.artifactId,
        cause,
      });
      return;
    }
    await completeNormalization({
      payload,
      runId,
      attemptId: attempt.id,
      caseId: run.caseId,
      artifactId: alreadyExtracted.artifactId,
      raw,
    });

    // A BullMQ retry that lands here re-established the attempt as RUNNING
    // (step 3) but takes the re-entrant branch — the forward-path SUCCEEDED
    // upsert (step 8/9) is NOT reached. Re-affirm the durable conclusion so a
    // completed job ALWAYS leaves its attempt row SUCCEEDED, regardless of how
    // many retries preceded it. Preserve the provenance fields a prior
    // successful pass already recorded.
    const current = await ingestionStore.findAttempt(
      payload.investigationId,
      payload.idempotencyKey,
    );
    await ingestionStore.upsertAttempt({
      investigationId: payload.investigationId,
      caseId: run.caseId,
      idempotencyKey: payload.idempotencyKey,
      operationId: payload.operationId,
      correlationId: payload.correlationId,
      attemptNumber,
      status: "SUCCEEDED",
      sourceId: current?.sourceId ?? alreadyExtracted.artifactId,
      artifactId: alreadyExtracted.artifactId,
      parserId: alreadyExtracted.parserId,
      parserVersion: alreadyExtracted.parserVersion,
      format: alreadyExtracted.format,
      error: undefined,
    });
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

  // Artifact identity is CASE-SCOPED: the deterministic id is derived from
  // (caseId, contentHash), not the content hash alone, so the same bytes
  // ingested under a different case resolve to a distinct artifact row and
  // cannot clobber another case's provenance. The acquisition envelope keeps
  // its content-level id, but every durable reference downstream uses the
  // case-scoped id.
  const artifactId = await deterministicArtifactIdForCase(run.caseId, artifact.contentHash);
  const caseScopedArtifact = { ...artifact, artifactId };

  // ---- 6. Persist artifact (case-scoped content-addressed upsert)
  const persistedArtifact = await ingestionStore.upsertArtifact({
    id: artifactId,
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
  const extractionResult = await extractionService.extract(caseScopedArtifact);

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
    artifactId,
    parserId: extraction.parserId,
    parserVersion: extraction.parserVersion,
    format: extraction.format,
    error: undefined,
  });

  // Idempotent insert: re-entrant retries (belt-and-braces for the re-entrancy
  // gate above) treat an already-persisted RawExtraction as complete.
  await ingestionStore.ensureRawExtraction({
    attemptId: attempt.id,
    artifactId,
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
    targetId: artifactId,
    description: `Durably ingested ${extraction.format} content for ${payload.evidenceTitle} (attempt ${attemptNumber}, case ${run.caseId})`,
  });

  // ---- 12-14. Normalize → persist → complete to ANALYZING
  await completeNormalization({
    payload,
    runId,
    attemptId: attempt.id,
    caseId: run.caseId,
    artifactId,
    raw: extraction,
  });
}

/**
 * Rebuild a NormalizedExtraction from its persisted row (M-A05 re-entrancy).
 *
 * The write path persists EVERY NormalizedExtractionSchema field, so this is a
 * faithful, total reconstruction — never a recomputation.
 *
 * Validation is scoped to the JSON content columns (config / canonicalFields /
 * quality / lexicalStatistics) — the only columns that can carry tampered or
 * corrupt serialized data. Identity/version strings are typed DB columns that
 * were already validated at write time and are passed through untouched, so a
 * strict full-object re-parse (which would re-validate ids) is NOT applied.
 * Zod .strict() on the content columns makes a corrupt stored row surface as
 * a permanent failure here (mirrors the RawExtraction rehydration doctrine).
 */
function rehydrateStoredNormalized(
  row: Prisma.NormalizedExtractionGetPayload<Record<string, never>>,
): NormalizedExtraction {
  const config = NormalizationConfigSchema.parse(row.config);
  const canonicalFields = z.array(NormalizedFieldSchema).parse(row.canonicalFields);
  const quality = QualityMetadataSchema.parse(row.quality);
  const lexicalStatistics = LexicalStatisticsSchema.parse(row.lexicalStatistics);

  return {
    attemptId: row.attemptId,
    artifactId: row.artifactId,
    investigationId: row.investigationId,
    caseId: row.caseId,
    normalizerId: row.normalizerId,
    normalizerVersion: row.normalizerVersion,
    config,
    canonicalFields,
    quality,
    lexicalStatistics,
  };
}

/**
 * M-A05 normalization completion — forward and re-entrant paths.
 *
 * Idempotent end-to-end:
 *   - NormalizedExtraction is attemptId-keyed, so a re-entry that already
 *     wrote the normalized row skips BOTH the (pure) normalize recomputation
 *     and the NORMALIZATION_STORED audit (append-only log stays single-value).
 *   - transitionRunToAnalyzing reports whether THIS call applied NORMALIZING →
 *     ANALYZING; NORMALIZATION_COMPLETED is audited only when it did. A re-entry
 *     whose run is already ANALYZING must not audit a second COMPLETED event.
 *
 * DB failures propagate as retryable errors (BullMQ retries). A permanent
 * failure during the pure normalize step is terminal — see
 * failNormalizationPermanently.
 */
async function completeNormalization(params: {
  payload: IngestionJobPayload;
  runId: string;
  attemptId: string;
  caseId: string;
  artifactId: string;
  raw: RawExtraction;
}): Promise<void> {
  const { payload, runId, attemptId, caseId, artifactId, raw } = params;

  const existing =
    await ingestionStore.findNormalizedExtractionByAttempt(attemptId);

  // M-A05 re-entrancy invariant: when the normalized row already exists we
  // NEVER re-run the (pure) normalizer — we rehydrate the persisted row. The
  // InputJsonObject columns were an exact serialization of a NormalizedExtraction
  // that already passed schema validation at write time, and they cover every
  // field of the contract (nothing is lost, so recomputation is unnecessary).
  // A corrupt stored row surfaces here as a permanent failure. MA06 consumes
  // whatever value is durable — freshly computed on the forward pass,
  // rehydrated on the re-entry.
  let normalized: NormalizedExtraction;
  if (existing) {
    try {
      normalized = rehydrateStoredNormalized(existing);
    } catch (cause) {
      await failNormalizationPermanently({
        payload,
        runId,
        attemptId,
        artifactId,
        cause,
      });
      return;
    }
  } else {
    try {
      normalized = normalizationService.normalize(raw, {
        attemptId,
        investigationId: payload.investigationId,
        caseId,
      });
    } catch (cause) {
      await failNormalizationPermanently({
        payload,
        runId,
        attemptId,
        artifactId,
        cause,
      });
      return;
    }

    await ingestionStore.upsertNormalizedExtractionByAttempt(normalized);

    await logAuditEvent({
      investigationId: payload.investigationId,
      action: "NORMALIZATION_STORED",
      actor: "NORMALIZATION_PIPELINE",
      targetType: "EVIDENCE",
      targetId: artifactId,
      description: `Stored NormalizedExtraction for ${artifactId} via ${NORMALIZER_ID} ${NORMALIZER_VERSION}`,
    });
  }

  // ---- M-A06: extract + persist durable observations (idempotent slot).
  // Runs after the normalized output is durable and BEFORE the run moves to
  // ANALYZING — the extraction boundary is fully persisted first.
  await completeMA06({
    payload,
    runId,
    attemptId,
    caseId,
    artifactId,
    raw,
    normalized,
  });

  // ---- M-A07: extract + persist entity-like mention candidates (idempotent).
  // Runs after the MA06 observations are durable — every candidate is grounded
  // to an Observation → Evidence → Artifact provenance chain. Purely
  // deterministic; M-A07 NEVER writes canonical Entity rows.
  await completeMA07({
    payload,
    runId,
    attemptId,
    caseId,
    artifactId,
    raw,
    normalized,
  });

  // ---- M-A08: generate candidate pairs over the case-scoped comparison
  // universe (idempotent, per-pair). Runs after the MA07 candidates are
  // durable. Blocking produces a pre-resolution COMPARISON UNIVERSE — it
  // NEVER resolves identities, assigns EntityId, or computes a ResolutionScore.
  await completeMA08({
    payload,
    runId,
    caseId,
    artifactId,
  });

  // ---- M-A09: resolve durable candidate pairs into reversible PROPOSED
  // EntityHypotheses (idempotent, per-pair). Runs after the MA08 CandidatePairs
  // are durable. Reads ONLY durable CandidatePair + EntityMentionCandidate rows
  // — it never re-runs MA07/MA08, never parses artifacts, never calls OCR, and
  // never fabricates a canonical Entity. A high deterministic score maps to a
  // PROPOSED hypothesis (never auto-ACCEPTED); low-signal and contradictory
  // pairs produce no durable proposition.
  await completeMA09({
    payload,
    runId,
    caseId,
  });

  // ---- M-A10: resolve source-grounded relations over the CANONICAL entity
  // universe (idempotent, per-relation). Runs after MA09's propositions and
  // any M-A09.5 canonical-entity materialization. Reads ONLY durable canonical
  // Entity + Observation rows — it never re-runs MA06/MA07/MA08/MA09, never
  // parses artifacts, and never fabricates an EntityId (M-A10 consumes real
  // canonical EntityIds downstream of the M-A09.5 decision boundary). When no
  // canonical entities have been accepted yet, this is a truthful no-op — the
  // machine NEVER auto-accepts an entity or a relation.
  await completeMA10({
    payload,
    runId,
    caseId,
  });

  // Re-entrancy can arrive while the run is still INGESTING (the NORMALIZING
  // transition itself failed on a prior pass). Walk the ladder INGESTING →
  // NORMALIZING (skip-if-past), then NORMALIZING → ANALYZING below — so a
  // re-entry always leaves the run in ANALYZING, never stranded mid-ingest.
  await transitionRunToNormalizing(runId);

  const didTransition = await transitionRunToAnalyzing(runId);
  if (didTransition) {
    await logAuditEvent({
      investigationId: payload.investigationId,
      action: "NORMALIZATION_COMPLETED",
      actor: "NORMALIZATION_PIPELINE",
      targetType: "EVIDENCE",
      targetId: artifactId,
      description: `Normalization complete for ${artifactId} via ${NORMALIZER_ID} ${NORMALIZER_VERSION}; run moved to ANALYZING`,
    });
    emitProgressEvent(
      payload.investigationId,
      "ANALYZING",
      `Normalization complete for ${artifactId}; run is now ANALYZING.`,
      {
        operationId: payload.operationId,
        correlationId: payload.correlationId,
        runId,
        artifactId,
      },
    );
  }
}

/**
 * M-A06 durable observation extraction.
 *
 * Idempotent end-to-end (mirrors completeNormalization):
 *   - Source/Evidence rows are upserted by deterministic identity — retries
 *     never duplicate them.
 *   - The pure extraction is computed only when the evidence has no durable
 *     observations yet; createMany skipDuplicates makes the write a safe
 *     no-op under a concurrent/retried pass.
 *   - OBSERVATION_EXTRACTED is audited (and the typed SSE frame emitted) ONLY
 *     when rows were actually inserted — the append-only audit log stays
 *     single-value and no observation content is ever broadcast.
 *
 * Faithful to the locked design:
 *   - evidenceId includes the stable operation identity (edit #1).
 *   - invalid client source catalog has ALREADY been resolved to MANUAL by the
 *     queue producer (sourceCatalog validated); declaredSourceCatalog preserves
 *     the original declaration on the Source row for audit (edit #3).
 *   - locationRef/observedAt/provenance are never fabricated; exact locations
 *     live on Observation.provenance (edit #2).
 */
async function completeMA06(params: {
  payload: IngestionJobPayload;
  runId: string;
  attemptId: string;
  caseId: string;
  artifactId: string;
  raw: RawExtraction;
  normalized: NormalizedExtraction;
}): Promise<void> {
  const { payload, runId, caseId, artifactId, raw, normalized } = params;
  const investigationId = payload.investigationId;

  // Same deterministic source seed the acquisition step used (stable across
  // retries) — one Source row per (investigation, fileKey).
  const sourceId = await deterministicSourceId(
    `${investigationId}:${extractFileKey(payload)}`,
  );

  const evidenceId = await deterministicEvidenceId(
    investigationId,
    payload.operationId,
    artifactId,
  );

  // 1. Durable Source (idempotent). Catalog is already platform-validated;
  //    the raw declaration (if any) is preserved verbatim (edit #3).
  await observationStore.upsertSource({
    id: sourceId,
    caseId,
    investigationId,
    catalog: payload.sourceCatalog,
    declaredCatalog: payload.declaredSourceCatalog,
    name: payload.sourceName,
    description: payload.sourceDescription,
  });

  // 2. Durable Evidence (idempotent, retry-safe identity).
  await observationStore.upsertEvidence({
    id: evidenceId,
    investigationId,
    caseId,
    operationId: payload.operationId,
    sourceId,
    sourceName: payload.sourceName,
    sourceDescription: payload.sourceDescription,
    evidenceType: payload.evidenceType,
    title: payload.evidenceTitle,
    description: payload.evidenceDescription,
    observedAt: payload.observedAt,
    artifactId,
  });

  // PR12 producer (EVIDENCE_AFFECTING): the durable evidence itself is a
  // reassessment trigger. Resolved against the ACTIVE graph version; skipped
  // before any graph version exists.
  const evidenceVersionId = await activeGraphVersionId(caseId);
  if (evidenceVersionId !== null && payload.observedAt?.precision === "exact") {
    await publishReassessmentChange({
      caseId,
      investigationId,
      graphVersionId: evidenceVersionId,
      trigger: newEvidenceTrigger({
        caseId,
        evidenceId,
        computedAt: { value: payload.observedAt.value, precision: "exact" },
      }),
    });
  }

  // 3. Observations — only extract when none durable yet.
  const existing = await observationStore.countObservationsByEvidence(evidenceId);
  if (existing > 0) {
    emitProgressEvent(
      investigationId,
      "ANALYZING",
      `Observations already durable for evidence ${evidenceId}; skipping re-extraction (${existing} present).`,
      {
        operationId: payload.operationId,
        correlationId: payload.correlationId,
        runId,
        artifactId,
      },
    );
    return;
  }

  const extracted = await extractObservations({
    raw,
    normalized,
    evidenceId,
    sourceId,
  });

  const nowIso = new Date().toISOString();
  const entries: { identityKey: string; observation: Observation }[] = [];
  for (const draft of extracted.observations) {
    const observation = await finalizeObservation({ draft, nowIso });

    // M-A12 WS-2 hardening: temporal fields on a finalized observation must be
    // valid before they reach durable storage / append-only temporal history —
    // fail loudly on a contradiction rather than persist it.
    const eventTimeResult = validateEventTime(observation.eventTime);
    if (!eventTimeResult.valid) {
      throw new TemporalValidationError(eventTimeResult.errors);
    }
    const intervalResult = validateTemporalInterval(observation.validityInterval);
    if (!intervalResult.valid) {
      throw new TemporalValidationError(intervalResult.errors);
    }

    entries.push({
      identityKey: buildObservationIdentityKey({
        evidenceId: observation.evidenceId,
        sourceId: observation.sourceId,
        locationKey: draft.locationKey,
        type: observation.type,
        canonicalContent: observation.content,
      }),
      observation,
    });
  }

  const { created } = await observationStore.ensureObservations(entries, {
    investigationId,
    caseId,
  });
  if (created === 0) return; // a concurrent pass already made this durable

  // PR12 producer (EVIDENCE_AFFECTING): a NEW_OBSERVATION trigger per durable
  // observation. Deduped by deterministic change identity, so re-publishing
  // entries from a concurrent pass is a harmless no-op.
  const observationVersionId = await activeGraphVersionId(caseId);
  if (observationVersionId !== null) {
    for (const entry of entries) {
      if (entry.observation.observedAt?.precision !== "exact") continue;
      await publishReassessmentChange({
        caseId,
        investigationId,
        graphVersionId: observationVersionId,
        trigger: newObservationTrigger({
          caseId,
          observationId: entry.observation.id,
          observedAt: { value: entry.observation.observedAt.value, precision: "exact" },
        }),
      });
    }
  }

  // 4a. M-A12-D6: append immutable temporal history for each observation
  //     created THIS pass. recordChange is idempotent (deterministic id), so a
  //     retry converges to the same rows without duplicating history. Domain
  //     event time / validity / provenance are propagated when present; never
  //     fabricated. Graph versioning is deferred to PR2 (no snapshot here).
  for (const entry of entries) {
    await temporalStateChangeStore.recordChange({
      caseId,
      investigationId,
      entityType: "OBSERVATION",
      entityId: entry.observation.id,
      stateType: "CREATED",
      ...(entry.observation.eventTime !== undefined
        ? { eventTime: entry.observation.eventTime }
        : {}),
      ...(entry.observation.validityInterval !== undefined
        ? { validityInterval: entry.observation.validityInterval }
        : {}),
      provenance: entry.observation.provenance,
      ingestedAt: new Date(nowIso),
    });
  }

  // 4. Audit exactly once, only after rows are durable.
  await logAuditEvent({
    investigationId,
    action: "OBSERVATION_EXTRACTED",
    actor: "OBSERVATION_PIPELINE",
    targetType: "OBSERVATION",
    targetId: evidenceId,
    description: `Extracted ${created} observation(s) from evidence ${evidenceId} (source ${sourceId}, catalog ${payload.sourceCatalog}, case ${caseId})`,
  });

  // 5. Typed frame — metadata only, no observation content (edit #4).
  emitObservationExtracted({
    investigationId,
    caseId,
    evidenceId,
    sourceId,
    observationIds: entries.map((e) => e.observation.id),
  });
}

/**
 * M-A07 durable entity-like mention candidate extraction.
 *
 * Idempotent end-to-end (mirrors completeMA06):
 *   - Candidates are grounded to the durable MA06 Observations read back from
 *     the store — same observationId → same identityKey → never duplicated.
 *   - The pure extraction is computed only when the evidence has no durable
 *     candidates yet; createMany skipDuplicates makes the write a safe no-op
 *     under a concurrent/retried pass.
 *   - ENTITY_MENTION_EXTRACTED is audited ONLY when rows were actually
 *     inserted — the append-only audit log stays single-value and no mention
 *     content is ever broadcast.
 *
 * M-A07 boundary (enforced):
 *   - extracts entity-like mentions only — NEVER writes canonical Entity rows.
 *   - NEVER assigns EntityId / ResolutionScore.
 *   - provenance is inherited verbatim from each Observation (never
 *     fabricated); entityType may be NULL (explicit uncertainty).
 */
async function completeMA07(params: {
  payload: IngestionJobPayload;
  runId: string;
  attemptId: string;
  caseId: string;
  artifactId: string;
  raw: RawExtraction;
  normalized: NormalizedExtraction;
}): Promise<void> {
  const { payload, runId, caseId, artifactId } = params;
  const investigationId = payload.investigationId;

  // M-A07 consumes the MA06 Observation output (the source-supported
  // assertions), grounded via the same deterministic EvidenceId MA06 used.
  const evidenceId = await deterministicEvidenceId(
    investigationId,
    payload.operationId,
    artifactId,
  );

  // 1. Read the durable MA06 observations for this evidence. Candidates are
  //    grounded to these observations — never to raw text.
  const observations = await observationStore.listObservations({
    investigationId,
    caseId,
    evidenceId,
  });
  if (observations.length === 0) return; // nothing to ground mentions to

  // 2. Only extract when none are durable yet (idempotent slot). M-A07 is a
  //    pure downstream consumer: it reads observations, never mutates them.
  const observationIds = observations.map((o) => o.id);
  const alreadyDurable = await entityMentionStore.countByObservationIds(observationIds);
  if (alreadyDurable > 0) {
    emitProgressEvent(
      investigationId,
      "ANALYZING",
      `Entity mention candidates already durable for evidence ${artifactId}; skipping re-extraction.`,
      {
        operationId: payload.operationId,
        correlationId: payload.correlationId,
        runId,
        artifactId,
      },
    );
    return;
  }

  // 3. Pure, deterministic extraction (no clock, no I/O). The optional
  //    case-scoped identity roster (PR-31) is mapped 1:1 into gazetteer
  //    entries — GAZETTEER_MATCH candidates only. No roster in the payload ⇒
  //    empty gazetteer (pattern/contextual/heuristic only), exactly like the
  //    pre-roster pipeline. ENTITY_MENTION_BOUNDS caps output.
  const rosterEntries: GazetteerEntry[] = (payload.identityRoster ?? []).map(
    (entry) => ({
      token: entry.text,
      entityType: entry.entityType,
    }),
  );
  const nowIso = new Date().toISOString();
  const candidateEntries: {
    identityKey: string;
    candidate: EntityMentionCandidate;
  }[] = [];
  for (const observation of observations) {
    const { drafts } = await extractEntityMentions(observation, {
      gazetteerEntries: rosterEntries,
    });
    for (const draft of drafts) {
      const candidate = await finalizeEntityMention({ draft, nowIso });
      candidateEntries.push({
        identityKey: buildEntityMentionIdentityKey({
          observationId: draft.observationId,
          start: draft.start,
          end: draft.end,
          entityType: draft.entityType,
          canonicalMatchValue: draft.canonicalMatchValue,
        }),
        candidate,
      });
    }
  }
  if (candidateEntries.length === 0) return; // no entity-like mentions found

  // 4. Idempotent durable write (skipDuplicates). Audit only when inserted.
  const { created } = await entityMentionStore.ensureEntityMentions(candidateEntries, {
    investigationId,
    caseId,
  });
  if (created === 0) return; // a concurrent pass already made this durable

  // Audit exactly once, only after rows are durable. Metadata only — no
  // mention content is ever audited or broadcast.
  await logAuditEvent({
    investigationId,
    action: "ENTITY_MENTION_EXTRACTED",
    actor: "ENTITY_MENTION_PIPELINE",
    targetType: "OBSERVATION",
    targetId: artifactId,
    description: `Extracted ${created} entity mention candidate(s) from evidence ${artifactId} (case ${caseId})`,
  });
}

/**
 * M-A08 case-scoped multi-pass blocking → CandidatePair generation.
 *
 * Blocking answers "which candidates are WORTH comparing", never "are these the
 * same entity" — this stage performs NO resolution (M-A09). It produces an
 * unordered, same-case, deterministic CandidatePair universe from the durable
 * M-A07 candidates.
 *
 * Case-wide universe (not per-evidence): a candidate pair is meaningful across
 * the whole case, so the engine reads ALL durable candidates for the case and
 * blocks them together. This is safe to run for every evidence because the
 * write is PER-PAIR idempotent:
 *
 *   - Pair.identityKey @unique + createMany skipDuplicates → a retry/concurrent
 *     pass adds only pairs that did not already exist. There is DELIBERATELY
 *     NO whole-batch "already has pairs → skip" gate (the M-A07 L-2 partial
 *     failure lesson fixed): if pair A persists and pair B fails, a retry
 *     creates only B and leaves A untouched.
 *
 * M-A08 boundary (enforced):
 *   - PURE input: only durable EntityMentionCandidate rows are read.
 *   - NEVER re-runs MA07, NEVER consumes raw Observation.candidateMentions.
 *   - NEVER writes Entity/EntityHypothesis rows, assigns EntityId, or computes
 *     ResolutionScore.
 *   - No ML/LLM/embeddings/fuzzy similarity — three deterministic rule passes
 *     unioned. No cross-case pairing (v1 is same-case only).
 */
async function completeMA08(params: {
  payload: IngestionJobPayload;
  runId: string;
  caseId: string;
  artifactId: string;
}): Promise<void> {
  const { payload, runId, caseId, artifactId } = params;
  const investigationId = payload.investigationId;

  // 1. Case-wide comparison universe: every durable M-A07 candidate in the case.
  const candidates = await entityMentionStore.listByCase(caseId, { investigationId });
  if (candidates.length < 2) return; // a pair requires at least two candidates

  const nowIso = new Date().toISOString();

  // 2. Pure, deterministic blocking (no clock, no I/O, no resolution).
  const { drafts, metrics } = blockCandidates(
    { candidates, caseId, investigationId },
    {}, // default config: same-observation pairs excluded
  );
  if (drafts.length === 0) return; // nothing worth comparing yet

  // 3. Finalize → per-pair identityKey → idempotent write (partial-retry safe).
  const entries: { identityKey: string; pair: CandidatePair }[] = [];
  for (const draft of drafts) {
    const pair = await finalizeCandidatePair({ draft, nowIso });
    entries.push({
      identityKey: buildCandidatePairIdentityKey({
        caseId: pair.caseId,
        leftCandidateId: pair.leftCandidateId,
        rightCandidateId: pair.rightCandidateId,
      }),
      pair,
    });
  }

  const { created } = await candidatePairStore.ensureCandidatePairs(entries);

  emitProgressEvent(
    investigationId,
    "ANALYZING",
    `Blocking generated ${created} new candidate pair(s) for case ${caseId} (${metrics.uniquePairsAfterUnion} total in universe, ${metrics.blocksGenerated} blocks, ${metrics.blocksSkippedOversized} oversized skipped).`,
    {
      operationId: payload.operationId,
      correlationId: payload.correlationId,
      runId,
      artifactId,
    },
  );

  // Audit exactly once, only when pairs were actually inserted. Metadata only —
  // no pair content is ever audited or broadcast.
  if (created > 0) {
    await logAuditEvent({
      investigationId,
      action: "CANDIDATE_PAIR_GENERATED",
      actor: "CANDIDATE_PAIR_PIPELINE",
      targetType: "CANDIDATE_PAIR",
      targetId: caseId,
      description: `Generated ${created} candidate pair(s) for case ${caseId} (universe ${metrics.uniquePairsAfterUnion}, blocks ${metrics.blocksGenerated}, oversized skipped ${metrics.blocksSkippedOversized})`,
    });
  }
}

/**
 * Map a pure-engine CandidateResolution + its CasePair + candidate provenance
 * into a durable EntityHypothesis (v1 Candidate↔Candidate contract).
 *
 * This is a pure mapping — it does NOT compute, re-weight, or infer. The score,
 * comparisonStatus, scoreModelVersion, supportingObservationIds and
 * contradictingObservationIds arrive verbatim from the pure engine. In v1 the
 * hypothesis predicate is candidatePairId; entityId / resolvedEntityId stay
 * absent (no canonical Entity fabrication).
 *
 * HYPOTHESIS IDENTITY: deterministic — candidatePairId + scoreModelVersion →
 * SHA-256 → stable UUID (id) with the identical canonical key (identityKey).
 * The SAME pair under the SAME model converges to ONE logical hypothesis.
 *
 * Provenance is inherited from the in-pair candidates (never fabricated):
 * sourceId/artifactId come from the left candidate's provenance; derivedFrom
 * is the union of the pair's observation ids. This preserves the chain
 * hypothesis → candidatePair → candidates → observations.
 */
function candidateResolutionToHypothesis(params: {
  resolution: import("@indago/contracts").CandidateResolution;
  pair: CandidatePair;
  leftCandidate: EntityMentionCandidate;
  id: string;
  nowIso: string;
}): EntityHypothesis {
  const { resolution, pair, leftCandidate, id, nowIso } = params;
  const derivedFrom = Array.from(
    new Set(
      [...resolution.supportingObservationIds, ...resolution.contradictingObservationIds],
    ),
  ).slice(0, resolution.supportingObservationIds.length + resolution.contradictingObservationIds.length);
  return EntityHypothesisSchema.parse({
    id,
    caseId: pair.caseId,
    ...(pair.investigationId !== undefined ? { investigationId: pair.investigationId } : {}),
    candidatePairId: pair.id,
    supportingCandidateIds: [pair.leftCandidateId, pair.rightCandidateId],
    comparisonStatus: resolution.comparisonStatus,
    score: resolution.score,
    scoreModelVersion: resolution.scoreModelVersion,
    supportingObservationIds: resolution.supportingObservationIds,
    contradictingObservationIds: resolution.contradictingObservationIds,
    status: resolution.status,
    provenance: {
      sourceId: leftCandidate.provenance.sourceId,
      ...(leftCandidate.provenance.artifactId !== undefined
        ? { artifactId: leftCandidate.provenance.artifactId }
        : {}),
      ...(derivedFrom.length > 0 ? { derivedFrom } : {}),
      extractor: "indago:resolution:engine",
      extractionMethod: resolution.scoreModelVersion,
    },
    createdAt: { value: nowIso, precision: "exact" },
    updatedAt: { value: nowIso, precision: "exact" },
  });
}

/**
 * M-A09 durable candidate↔candidate resolution → reversible hypothesis.
 *
 * Consumes the DURABLE CandidatePair universe (M-A08) and the DURABLE
 * EntityMentionCandidate rows (M-A07) for the case. It does NOT recreate
 * candidates/pairs, parse artifacts, call OCR, or normalize raw data.
 *
 * Idempotency / partial-retry semantics (the M-A07 L-2 lesson):
 *   - PER-PAIR processing — there is deliberately NO "case already resolved →
 *     skip all" gate. Pair A with an existing hypothesis is skipped; Pair B
 *     without one is processed. A retry after a partial failure recovers only
 *     the missing hypotheses.
 *   - Each write is idempotent: identityKey @unique + store lifecycle
 *     preservation guarantee one logical hypothesis per
 *     (candidatePairId, scoreModelVersion), and an existing ACCEPTED /
 *     REJECTED / REVERSED hypothesis is never reset to PROPOSED.
 *
 * Boundary (enforced):
 *   - Only pairs whose resolution PROPOSES (status PROPOSED) become durable
 *     EntityHypotheses — a low-signal (UNRESOLVED) or contradictory
 *     (CONTRADICTED) pair records no durable positive proposition.
 *   - Never creates a canonical Entity, never merges/splits, never assigns
 *     entityId/resolvedEntityId, never resolves across cases (v1 is same-case).
 */
async function completeMA09(params: {
  payload: IngestionJobPayload;
  runId: string;
  caseId: string;
}): Promise<void> {
  const { payload, runId, caseId } = params;
  const investigationId = payload.investigationId;

  // 1. Case-scoped durable comparison universe (never re-derived).
  const candidates = await entityMentionStore.listByCase(caseId, { investigationId });
  if (candidates.length < 2) return;
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const pairs = await candidatePairStore.listByCase(caseId, { investigationId });
  if (pairs.length === 0) return;

  const nowIso = new Date().toISOString();
  let proposedEvents = 0;

  // 2. Per-pair deterministic resolution — partial-failure safe.
  for (const pair of pairs) {
    // Validate consistency before touching anything for this pair.
    const leftCandidate = candidateById.get(pair.leftCandidateId);
    const rightCandidate = candidateById.get(pair.rightCandidateId);
    if (!leftCandidate || !rightCandidate) {
      // Typed, contained failure — do not contaminate the rest of the batch.
      await logAuditEvent({
        investigationId,
        action: "SYSTEM_ACTION",
        actor: "ENTITY_RESOLUTION_PIPELINE",
        targetType: "CANDIDATE_PAIR",
        targetId: pair.id,
        description: `M-A09 skipped candidate pair ${pair.id}: one or both durable candidates missing (left=${pair.leftCandidateId}, right=${pair.rightCandidateId})`,
      });
      continue;
    }
    if (leftCandidate.id === rightCandidate.id) continue; // self-pair, never resolvable
    // Case-scoping is enforced by construction: both candidates and the pair
    // were loaded via case-scoped store queries (listByCase(caseId, ...)), so a
    // pair can never reach a candidate from a different case here.

    const { candidateResolution, proposed: isProposed } = await compareCandidates({
      pair,
      leftCandidate,
      rightCandidate,
    });
    if (!isProposed || candidateResolution.status !== "PROPOSED") {
      // UNRESOLVED / CONTRADICTED → no durable positive proposition.
      continue;
    }

    // 3. Deterministic identity — same pair + same model ⇒ one logical row.
    const scoreModelVersion = candidateResolution.scoreModelVersion;
    const identityKey = buildEntityHypothesisIdentityKey({
      candidatePairId: pair.id,
      scoreModelVersion,
    });
    const id = await deterministicEntityHypothesisId({
      candidatePairId: pair.id,
      scoreModelVersion,
    });

    const hypothesis = candidateResolutionToHypothesis({
      resolution: candidateResolution,
      pair,
      leftCandidate,
      id,
      nowIso,
    });

    // 4. Durable-state-first: persist the row BEFORE emitting any audit event.
    const result = await entityHypothesisStore.upsertHypothesis({
      identityKey,
      hypothesis,
    });

    // 5. Audit ONLY after the durable row exists, with the ACTUAL hypothesis id
    //    as the target. On a preserved authority state the row already exists
    //    and only machine fields refreshed — audit only when a fresh proposal
    //    actually landed to keep the append-only event single-valued.
    if (!result.preservedExisting && result.reusedExisting === false) {
      proposedEvents += 1;
      await logAuditEvent({
        investigationId,
        action: "ENTITY_RESOLUTION_PROPOSED",
        actor: "ENTITY_RESOLUTION_PIPELINE",
        targetType: "SYSTEM",
        targetId: hypothesis.id,
        description: `Proposed entity identity hypothesis ${hypothesis.id} (case ${caseId}, pair ${pair.id}, score ${candidateResolution.score}, model ${scoreModelVersion})`,
      });
    }
  }

  emitProgressEvent(
    investigationId,
    "ANALYZING",
    `Entity resolution proposed ${proposedEvents} hypothesis(es) for case ${caseId}.`,
    {
      operationId: payload.operationId,
      correlationId: payload.correlationId,
      runId,
    },
  );
}

/**
 * Map a pure-engine RelationResolution into the durable RelationHypothesis
 * store input (v1 canonical-entity↔canonical-entity contract).
 *
 * Pure mapping — no scoring, no re-weighting, no inference. support,
 * evidenceBasis, contradictions, evidenceCount, evidenceStrength, source and
 * temporal coverage, and scoreModelVersion arrive verbatim from the engine.
 *
 * IDENTITY: deterministic — sourceEntityId + targetEntityId + relationType +
 * scoreModelVersion → SHA-256 → stable UUID (id) with the identical canonical
 * key (identityKey). Canonical ordering (source < target) is inherited from
 * the engine's buildRelationHypothesisIdentityKey. Same entity pair + same
 * type + same model ⇒ ONE logical hypothesis across passes/workers.
 *
 * ENTITY-ID BOUNDARY: sourceEntityId/targetEntityId ARE canonical EntityIds
 * (downstream of the M-A09.5 decision boundary). A mention id / candidate pair
 * id is NEVER substituted here.
 *
 * Provenance is derived from the FIRST supporting observation's chain (never
 * fabricated from graph structure): sourceId/artifactId/derivedFrom trace the
 * supported relation back to source-grounded observations.
 */
function relationResolutionToHypothesisInput(params: {
  resolution: RelationResolution;
  id: string;
  identityKey: string;
  caseId: string;
  investigationId?: string;
  sourceId: string | undefined;
  artifactId: string | undefined;
  derivedFrom: readonly string[];
  validityInterval?: unknown;
}): import("../persistence/relation-hypothesis-store.js").RelationHypothesisInput {
  const { resolution, id, identityKey, caseId, investigationId, sourceId, artifactId, derivedFrom } = params;
  return {
    id,
    identityKey,
    caseId,
    investigationId,
    sourceEntityId: resolution.sourceEntityId,
    targetEntityId: resolution.targetEntityId,
    relationType: resolution.relationType,
    support: resolution.support,
    evidenceBasis: resolution.evidenceBasis,
    contradictions: resolution.contradictions,
    status: "PROPOSED",
    scoreModelVersion: resolution.scoreModelVersion,
    evidenceCount: resolution.evidenceCount,
    evidenceStrength: resolution.evidenceStrength,
    sourceCoverage: resolution.sourceCoverage,
    temporalCoverage: resolution.temporalCoverage,
    directed: resolution.directed,
    provenance: {
      ...(sourceId !== undefined ? { sourceId } : {}),
      ...(artifactId !== undefined ? { artifactId } : {}),
      ...(derivedFrom.length > 0 ? { derivedFrom: [...derivedFrom] } : {}),
      extractor: "indago:relation-resolution:engine",
      extractionMethod: resolution.scoreModelVersion,
    },
    ...(params.validityInterval !== undefined
      ? { validityInterval: params.validityInterval }
      : {}),
  };
}

/**
 * M-A10 durable canonical-entity relation resolution → reversible hypothesis.
 *
 * Consumes DURABLE canonical Entity rows (M-A09.5) + DURABLE Observations
 * (M-A06) for the case. The engine's resolveRelationsForCase detects
 * source-grounded co-occurrence pairs, classifies the relation type, and
 * settles scoring model v1. The platform maps each result into a durable
 * RelationHypothesis row via the store's lifecycle-preserving upsert.
 *
 * Source-grounded only: a relation is created ONLY from explicit observation
 * co-occurrence — never from graph proximity, never from a blind all-pairs
 * sweep.
 *
 * Idempotency / partial-retry (the M-A07 L-2 lesson):
 *   - PER-RELATION processing — no "case already resolved → skip all" gate.
 *     Each write is idempotent (identityKey @unique) and lifecycle-preserving:
 *     an existing ACCEPTED / REJECTED / REVERSED relation is never reset to
 *     PROPOSED.
 *   - RELATION_RESOLUTION_PROPOSED is audited ONLY when a fresh PROPOSED row
 *     actually landed (append-only event stays single-valued).
 *
 * High score → PROPOSED only; the machine NEVER auto-accepts a relation.
 *
 * Boundary (enforced):
 *   - Only PROPOSED resolutions become durable rows (REJECTED / low-signal /
 *     hard-contradiction resolutions record no positive proposition, exactly
 *     like MA09).
 *   - Never creates canonical Entities, never merges/splits, never writes a
 *     mention/pair id as a canonical EntityId, resolves same-case only.
 */
async function completeMA10(params: {
  payload: IngestionJobPayload;
  runId: string;
  caseId: string;
}): Promise<void> {
  const { payload, runId, caseId } = params;
  const investigationId = payload.investigationId;

  // 1. Case-scoped canonical entity universe (never re-derived, never
  //    fabricated). listByCaseWithObservations excludes ARCHIVED entities and
  //    carries each entity's linked observationIds — the exact M-A10 input.
  const entities = await entityStore.listByCaseWithObservations(caseId, {
    investigationId,
  });
  if (entities.length < 2) {
    // Fewer than two canonical entities — no relation can be grounded. A
    // truthful no-op: the machine never invents a relation from nothing.
    return;
  }

  // 2. Case-scoped observations (bounded by the engine's hard cap).
  const observations = await observationStore.listObservations({
    investigationId,
    caseId,
  });
  if (observations.length === 0) return;

  // 3. Build the engine input. EntityEvidence carries the canonical EntityId +
  //    its linked observationIds — the engine derives every signal from these.
  const entityEvidence = entities.map((e) => ({
    id: e.id,
    observationIds: e.observationIds,
  }));

  // 4a. Explicit contradiction provenance: carry the observation IDs the
  //     durable store has already recorded as contradicting any relation in
  //     this case. This is real, persisted evidence (never mere absence) that
  //     flows back through the engine so the −0.25 hardContradiction weight is
  //     applied consistently across re-runs.
  const explicitContradictions = new Set<string>();
  for (const existing of await relationHypothesisStore.listByCase(caseId, {
    investigationId,
  })) {
    for (const obsId of existing.contradictions) {
      explicitContradictions.add(obsId);
    }
  }

  // 4. Pure, deterministic resolution over the whole case.
  const { resolutions, metrics } = resolveRelationsForCase({
    caseId,
    investigationId,
    observations,
    entities: entityEvidence,
    explicitContradictions,
  });

  let proposedEvents = 0;

  // 5. Per-relation durable write — partial-failure safe, lifecycle-preserving.
  for (const resolution of resolutions) {
    // Only a PROPOSED, above-threshold resolution becomes a durable positive
    // proposition (mirrors MA09: UNRESOLVED/CONTRADICTED → no row).
    if (resolution.support < RELATION_PROPOSAL_THRESHOLD) continue;

    // Deterministic identity — same entity pair + type + model ⇒ one row.
    const identityKey = buildRelationHypothesisIdentityKey({
      sourceEntityId: resolution.sourceEntityId,
      targetEntityId: resolution.targetEntityId,
      relationType: resolution.relationType,
      directed: resolution.directed,
      scoreModelVersion: resolution.scoreModelVersion,
    });
    const id = await deterministicRelationHypothesisId({
      sourceEntityId: resolution.sourceEntityId,
      targetEntityId: resolution.targetEntityId,
      relationType: resolution.relationType,
      directed: resolution.directed,
      scoreModelVersion: resolution.scoreModelVersion,
    });

    // Provenance grounding: first supporting observation's source/artifact.
    let sourceId: string | undefined;
    let artifactId: string | undefined;
    const firstObsId = resolution.evidenceBasis[0];
    const firstObs = firstObsId
      ? observations.find((o) => o.id === firstObsId)
      : undefined;
    if (firstObs) {
      sourceId = firstObs.sourceId;
      artifactId = firstObs.provenance?.artifactId;
    }

    // M-A12 WS-3: derive the proposed relation's closed validity interval from
    // the REAL observed event instants of its supporting observations
    // (min..max). Never fabricated: when no supporting observation carries an
    // explicit parseable instant the interval is simply omitted — a truthfully
    // un-validated relation, never an invented temporal boundary.
    const supportingObs = resolution.evidenceBasis
      .map((obsId) => observations.find((o) => o.id === obsId))
      .filter((o): o is Observation => o !== undefined);
    const validityInterval = deriveValidityInterval(supportingObs);
    if (validityInterval !== undefined) {
      // M-A12 WS-2 guard: the aggregation is constructed from parseable,
      // ordered instants so this always passes — but fail loudly rather than
      // ever persist a malformed interval.
      assertValidTemporalInterval(validityInterval);
    }

    const input = relationResolutionToHypothesisInput({
      resolution,
      id,
      identityKey,
      caseId,
      investigationId,
      sourceId,
      artifactId,
      derivedFrom: resolution.evidenceBasis,
      ...(validityInterval !== undefined ? { validityInterval } : {}),
    });

    // 6. Durable-state-first: persist the row BEFORE any audit event.
    const result = await relationHypothesisStore.upsertHypothesis(input);

    // 7. Audit ONLY after the durable row exists, with the ACTUAL hypothesis id
    //    as the target. On a preserved authority state the row already exists
    //    and only machine fields refreshed — audit only when a fresh PROPOSED
    //    row actually landed.
    if (!result.preservedExisting && result.reusedExisting === false) {
      proposedEvents += 1;
      await logAuditEvent({
        investigationId,
        action: "RELATION_RESOLUTION_PROPOSED",
        actor: "RELATION_RESOLUTION_PIPELINE",
        targetType: "RELATION_HYPOTHESIS",
        targetId: result.hypothesis.id,
        description: `Proposed relation hypothesis ${result.hypothesis.id} (case ${caseId}, ${resolution.sourceEntityId} → ${resolution.targetEntityId}, type ${resolution.relationType}, support ${resolution.support}, model ${resolution.scoreModelVersion})`,
      });
    }
  }

  emitProgressEvent(
    investigationId,
    "ANALYZING",
    `Relation resolution considered ${metrics.pairsConsidered} pair(s), proposed ${proposedEvents} hypothesis(es), near-miss ${metrics.nearMisses} below-threshold grounded pair(s) for case ${caseId}.`,
    {
      operationId: payload.operationId,
      correlationId: payload.correlationId,
      runId,
    },
  );
}

/**
 * Permanent normalization failure. The pure normalize/rehydrate step proved
 * unsatisfiable (e.g. corrupt stored RawExtraction or a contract violation) —
 * never retried, never re-attempted. The successful extraction attempt is
 * left truthful (SUCCEEDED); the RUN is terminal-failed and the failure is
 * audited exactly once. Throws an UnrecoverableError so BullMQ stops.
 */
async function failNormalizationPermanently(params: {
  payload: IngestionJobPayload;
  runId: string;
  attemptId: string;
  artifactId: string;
  cause: unknown;
}): Promise<void> {
  const { payload, runId, attemptId, artifactId, cause } = params;
  const message = cause instanceof Error ? cause.message : String(cause);

  await logAuditEvent({
    investigationId: payload.investigationId,
    action: "NORMALIZATION_FAILED",
    actor: "NORMALIZATION_PIPELINE",
    targetType: "EVIDENCE",
    targetId: artifactId,
    description: `Normalization failed permanently for ${artifactId} (attempt ${attemptId}): ${message}`,
  });

  await transitionRunToPermanentFailure(
    runId,
    `NORMALIZATION_FAILED: ${message}`,
  );

  throw new UnrecoverableError(`NORMALIZATION_FAILED: ${message}`);
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