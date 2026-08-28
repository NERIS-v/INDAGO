// ============================================================================
// Ingestion Persistence Store
//
// Single Prisma data-access boundary for durable artifact / attempt / raw
// extraction persistence. Strict generated Prisma types only — no `any`,
// no `as any`, no `@ts-ignore`.
//
// Uniqueness rules:
//   - Artifact.contentHash @unique  → content-level dedup owner
//   - IngestionAttempt (investigationId, idempotencyKey) @unique → job-level dedup
//   - RawExtraction.attemptId @unique → immutable per attempt
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { IngestionError } from "@indago/contracts";
import { db } from "../db/prisma.js";

export interface ArtifactWriteRecord {
  id: string;
  contentHash: string;
  storagePath: string;
  detectedMimeType: string;
  declaredMimeType: string | undefined;
  originalFilename: string | undefined;
  contentSizeBytes: number;
  sourceType: string | undefined;
  sourceId: string | undefined;
  investigationId: string;
  caseId: string;
  operationId: string;
  correlationId: string;
  idempotencyKey: string;
  hashVerified: boolean;
  mimeVerified: boolean;
  providerMetadata: Record<string, unknown> | undefined;
}

export type AttemptStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export interface AttemptRevision {
  investigationId: string;
  caseId: string;
  idempotencyKey: string;
  operationId: string;
  correlationId: string;
  attemptNumber: number;
  status: AttemptStatus;
  sourceId: string | undefined;
  artifactId: string | undefined;
  parserId: string | undefined;
  parserVersion: string | undefined;
  format: string | undefined;
  error: IngestionError | undefined;
}

/**
 * Round-trip value into a JSON-safe Prisma Json input.
 * Strips `undefined` fields, which Prisma rejects in Json columns.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

/**
 * The `warnings` list travels in its own column and must NOT be embedded in
 * the `extraction` JSON (single source of truth). Strips it if present.
 */
function extractionForStore(extraction: unknown): Prisma.InputJsonValue {
  const body = toJson(extraction);
  if (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "warnings" in (body as Record<string, unknown>)
  ) {
    const { warnings: _removed, ...rest } = body as Record<string, unknown>;
    return rest as Prisma.InputJsonValue;
  }
  return body;
}

export class IngestionStore {
  /**
   * Constructor-injectable Prisma client. Defaults to the platform singleton;
   * integration tests inject a client bound to TEST_DATABASE_URL.
   */
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Upsert an artifact by content hash. Same contentHash always resolves
   * to the same row (and the same deterministic artifactId).
   */
  async upsertArtifact(record: ArtifactWriteRecord) {
    const data: Prisma.ArtifactUncheckedCreateInput = {
      id: record.id,
      contentHash: record.contentHash,
      storagePath: record.storagePath,
      detectedMimeType: record.detectedMimeType,
      declaredMimeType: record.declaredMimeType ?? null,
      originalFilename: record.originalFilename ?? null,
      contentSizeBytes: record.contentSizeBytes,
      sourceType: record.sourceType ?? null,
      sourceId: record.sourceId ?? null,
      investigationId: record.investigationId,
      caseId: record.caseId,
      operationId: record.operationId,
      correlationId: record.correlationId,
      idempotencyKey: record.idempotencyKey,
      hashVerified: record.hashVerified,
      mimeVerified: record.mimeVerified,
      providerMetadata:
        record.providerMetadata !== undefined
          ? (toJson(record.providerMetadata) as Prisma.InputJsonObject)
          : Prisma.JsonNull,
    };

    return this.prisma.artifact.upsert({
      where: { contentHash: record.contentHash },
      create: data,
      update: {
        investigationId: record.investigationId,
        caseId: record.caseId,
        operationId: record.operationId,
        correlationId: record.correlationId,
        idempotencyKey: record.idempotencyKey,
        sourceId: record.sourceId ?? null,
        sourceType: record.sourceType ?? null,
      },
    });
  }

  async findArtifactByContentHash(contentHash: string) {
    return this.prisma.artifact.findUnique({ where: { contentHash } });
  }

  async findAttempt(investigationId: string, idempotencyKey: string) {
    return this.prisma.ingestionAttempt.findUnique({
      where: { investigationId_idempotencyKey: { investigationId, idempotencyKey } },
    });
  }

  /**
   * Upsert an attempt revision for the current BullMQ attempt.
   * Preserves the row identity across retries while advancing attemptNumber.
   */
  async upsertAttempt(rev: AttemptRevision) {
    const data: Prisma.IngestionAttemptUncheckedCreateInput = {
      investigationId: rev.investigationId,
      caseId: rev.caseId,
      idempotencyKey: rev.idempotencyKey,
      operationId: rev.operationId,
      correlationId: rev.correlationId,
      attemptNumber: rev.attemptNumber,
      status: rev.status,
      sourceId: rev.sourceId ?? null,
      artifactId: rev.artifactId ?? null,
      parserId: rev.parserId ?? null,
      parserVersion: rev.parserVersion ?? null,
      format: rev.format ?? null,
      error: rev.error ? (toJson(rev.error) as Prisma.InputJsonObject) : Prisma.JsonNull,
    };

    return this.prisma.ingestionAttempt.upsert({
      where: {
        investigationId_idempotencyKey: {
          investigationId: rev.investigationId,
          idempotencyKey: rev.idempotencyKey,
        },
      },
      create: data,
      update: {
        attemptNumber: rev.attemptNumber,
        status: rev.status,
        sourceId: rev.sourceId ?? null,
        artifactId: rev.artifactId ?? null,
        parserId: rev.parserId ?? null,
        parserVersion: rev.parserVersion ?? null,
        format: rev.format ?? null,
        error: rev.error ? (toJson(rev.error) as Prisma.InputJsonObject) : Prisma.JsonNull,
      },
    });
  }

  /**
   * Insert an immutable RawExtraction for a completed (succeeded) attempt.
   */
  async insertRawExtraction(params: {
    attemptId: string;
    artifactId: string;
    parserId: string;
    parserVersion: string;
    format: string;
    extraction: unknown;
    warnings: readonly unknown[] | undefined;
    extractedAt: string;
  }) {
    return this.prisma.rawExtraction.create({
      data: {
        attemptId: params.attemptId,
        artifactId: params.artifactId,
        parserId: params.parserId,
        parserVersion: params.parserVersion,
        format: params.format,
        extraction: extractionForStore(params.extraction),
        warnings:
          params.warnings !== undefined
            ? (toJson(params.warnings) as Prisma.InputJsonObject)
            : Prisma.JsonNull,
        extractedAt: new Date(params.extractedAt),
      },
    });
  }

  /**
   * Idempotent RawExtraction write for the re-entrant completion path.
   *
   * RawExtraction.attemptId is unique, so a worker retry triggered AFTER a
   * successful insert (e.g. a failure on the NORMALIZING transition or on the
   * audit step) must not re-insert. Returns the existing row when one is
   * already present — for both the pre-check and the P2002 race — so the
   * invariant "RawExtraction persisted + completion transition repeated →
   * safe no-op" holds with no duplicate row and no retry storm.
   */
  async ensureRawExtraction(params: {
    attemptId: string;
    artifactId: string;
    parserId: string;
    parserVersion: string;
    format: string;
    extraction: unknown;
    warnings: readonly unknown[] | undefined;
    extractedAt: string;
  }) {
    const existing = await this.prisma.rawExtraction.findUnique({
      where: { attemptId: params.attemptId },
    });
    if (existing) return existing;

    try {
      return await this.insertRawExtraction(params);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raced = await this.prisma.rawExtraction.findUnique({
          where: { attemptId: params.attemptId },
        });
        if (raced) return raced;
      }
      throw err;
    }
  }

  async findRawExtractionByAttempt(attemptId: string) {
    return this.prisma.rawExtraction.findUnique({ where: { attemptId } });
  }
}

export const ingestionStore = new IngestionStore();