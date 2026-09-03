// ============================================================================
// M-A06 Observation Persistence Store
//
// Single Prisma data-access boundary for durable Source / Evidence /
// Observation writes + the Observations read seam. Strict generated Prisma
// types only — no `any`, no `as any`, no `@ts-ignore`.
//
// Uniqueness / idempotency rules (mirror IngestionStore):
//   - Source.id @id                      → deterministic source key
//   - Evidence (investigationId, operationId, artifactId) @unique →
//       retry-safe evidence identity (evidenceId = SHA-256 of that triple)
//   - Observation.identityKey @unique    → exact-duplicate guard; createMany
//       skipDuplicates is the idempotent write (P2002-free by construction)
//
// Every read reassembles rows into the canonical ObservationSchema contract —
// there is no second, drifting "observation" shape in this codebase.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  ObservationSchema,
  type EventTime,
  type EvidenceType,
  type Observation,
  type SourceCatalog,
} from "@indago/contracts";
import { bytesToUuid4, computeContentHash } from "@indago/ingestion";
import { db } from "../db/prisma.js";

/**
 * Round-trip value into a JSON-safe Prisma Json input.
 * Strips `undefined` fields, which Prisma rejects in Json columns.
 */
function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

/**
 * Deterministic EvidenceId (edit #1): SHA-256 of the stable submission /
 * operation identity (`investigationId:operationId:artifactId`) mapped to a
 * UUID v4-shaped string. Retry-safe — the same (operation, artifact) always
 * yields the same evidence identity, so the durable Evidence row and every
 * observation referencing it stay stable across job retries.
 */
export async function deterministicEvidenceId(
  investigationId: string,
  operationId: string,
  artifactId: string,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(`${investigationId}:${operationId}:${artifactId}`),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}

export interface SourceWriteRecord {
  id: string;
  caseId: string;
  investigationId: string;
  catalog: SourceCatalog;
  declaredCatalog: string | undefined;
  name: string;
  description: string | undefined;
}

export interface EvidenceWriteRecord {
  id: string;
  investigationId: string;
  caseId: string;
  operationId: string;
  sourceId: string | undefined;
  sourceName: string;
  sourceDescription: string | undefined;
  evidenceType: EvidenceType;
  title: string;
  description: string | undefined;
  observedAt: EventTime | undefined;
  artifactId: string;
}

type ObservationRow = Prisma.ObservationGetPayload<Record<string, never>>;

// ----------------------------------------------------------------------------
// Evidence read projection (M-A06) — documented LOCAL shape, NOT EvidenceSchema.
//
// The platform persists a deliberately narrower Evidence row than the canonical
// EvidenceSchema contract (no strength / posture / provenance.extractor /
// entity / hypothesis links). Reassembly into the canonical shape would require
// fabricating those fields — which is forbidden. This is the honest read
// projection of what the platform actually knows about each persisted Evidence
// row. status is DERIVED server-side from durable state (an Evidence row
// exists → ingestion succeeded; observations exist → extraction completed).
// ----------------------------------------------------------------------------
export interface EvidenceProjection {
  id: string;
  caseId: string;
  investigationId: string;
  sourceId: string | null;
  sourceName: string;
  type: string;
  title: string;
  description: string | null;
  observedAt: EventTime | null;
  operationId: string;
  artifactId: string;
  observationCount: number;
  artifactIds: string[];
  sourceRef: string;
  status: "INGESTED" | "PROCESSED";
  createdAt: string;
}

type EvidenceProjectionRow = Prisma.EvidenceGetPayload<{
  include: { _count: { select: { observations: true } } };
}>;

export class ObservationStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Upsert a Source row. Same deterministic sourceId always resolves to the
   * same row. catalog is the platform-VALIDATED SourceCatalog value;
   * declaredCatalog preserves the original (possibly invalid) client
   * declaration verbatim so any MANUAL fallback is auditable.
   */
  async upsertSource(record: SourceWriteRecord) {
    const data: Prisma.SourceUncheckedCreateInput = {
      id: record.id,
      caseId: record.caseId,
      investigationId: record.investigationId,
      catalog: record.catalog,
      declaredCatalog: record.declaredCatalog ?? null,
      name: record.name,
      description: record.description ?? null,
    };

    return this.prisma.source.upsert({
      where: { id: record.id },
      create: data,
      update: {
        catalog: record.catalog,
        declaredCatalog: record.declaredCatalog ?? null,
        name: record.name,
        description: record.description ?? null,
      },
    });
  }

  /**
   * Upsert an Evidence row. Keyed on the (investigationId, operationId,
   * artifactId) triple — the same submission batch never duplicates.
   */
  async upsertEvidence(record: EvidenceWriteRecord) {
    const data: Prisma.EvidenceUncheckedCreateInput = {
      id: record.id,
      investigationId: record.investigationId,
      caseId: record.caseId,
      operationId: record.operationId,
      sourceId: record.sourceId ?? null,
      sourceName: record.sourceName,
      sourceDescription: record.sourceDescription ?? null,
      evidenceType: record.evidenceType,
      title: record.title,
      description: record.description ?? null,
      observedAt:
        record.observedAt !== undefined
          ? (toJson(record.observedAt) as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      artifactId: record.artifactId,
    };

    return this.prisma.evidence.upsert({
      where: {
        investigationId_operationId_artifactId: {
          investigationId: record.investigationId,
          operationId: record.operationId,
          artifactId: record.artifactId,
        },
      },
      create: data,
      update: {
        sourceId: record.sourceId ?? null,
        sourceName: record.sourceName,
        sourceDescription: record.sourceDescription ?? null,
        title: record.title,
        description: record.description ?? null,
        observedAt:
          record.observedAt !== undefined
            ? (toJson(record.observedAt) as Prisma.InputJsonObject)
            : Prisma.JsonNull,
      },
    });
  }

  async countObservationsByEvidence(evidenceId: string) {
    return this.prisma.observation.count({ where: { evidenceId } });
  }

  /**
   * Idempotent observation write. Observation.identityKey is unique, so a
   * retried MA06 pass (or a concurrent one) can never duplicate a row —
   * `skipDuplicates` makes the race a safe no-op. Returns the number of rows
   * THIS call actually inserted; callers audit OBSERVATION_EXTRACTED only when
   * created > 0 (append-only audit stays single-value).
   *
   * identityKey for each entry is the versioned canonical representation built
   * by the MA06 queue pipeline via @indago/ingestion buildObservationIdentityKey
   * — this store never derives identity, it only persists it (single source).
   */
  async ensureObservations(
    entries: readonly { readonly identityKey: string; readonly observation: Observation }[],
    context: { investigationId: string; caseId: string },
  ): Promise<{ created: number }> {
    if (entries.length === 0) return { created: 0 };

    const data = entries.map(({ identityKey, observation: o }) => ({
      id: o.id,
      identityKey,
      evidenceId: o.evidenceId,
      sourceId: o.sourceId,
      investigationId: context.investigationId,
      caseId: context.caseId,
      type: o.type,
      content: o.content,
      strength: o.strength,
      candidateMentions: toJson(o.candidateMentions) as Prisma.InputJsonArray,
      provenance: toJson(o.provenance) as Prisma.InputJsonObject,
      observedAt:
        o.observedAt !== undefined
          ? (toJson(o.observedAt) as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      eventTime:
        o.eventTime !== undefined
          ? (toJson(o.eventTime) as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      sourceContextId: o.sourceContextId ?? null,
      validityInterval:
        o.validityInterval !== undefined
          ? (toJson(o.validityInterval) as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      entityIds: toJson(o.entityIds) as Prisma.InputJsonArray,
    }));

    const result = await this.prisma.observation.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: result.count };
  }

  /**
   * Read seam — list observations within authorization boundaries. caseId is
   * resolved SERVER-SIDE by the caller routes (never from the client). Rows
   * are reassembled and schema-validated; an invalid row surfaces loudly
   * rather than being silently dropped.
   */
  async listObservations(filter: {
    investigationId: string;
    caseId?: string;
    evidenceId?: string;
  }): Promise<Observation[]> {
    const rows = await this.prisma.observation.findMany({
      where: {
        evidenceId: filter.evidenceId,
        investigationId: filter.investigationId,
        caseId: filter.caseId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => this.rowToObservation(row));
  }

  /**
   * Read seam — list Evidence rows within authorization boundaries. Mirrors
   * listObservations: caseId is resolved SERVER-SIDE by the caller routes.
   * Returns the documented EvidenceProjection shape (never fabricated into the
   * canonical EvidenceSchema). Ordered oldest → newest so the page renders the
   * intake sequence as it happened.
   */
  async listEvidenceByInvestigation(filter: {
    investigationId: string;
    caseId?: string;
  }): Promise<EvidenceProjection[]> {
    const rows = await this.prisma.evidence.findMany({
      where: {
        investigationId: filter.investigationId,
        caseId: filter.caseId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        _count: { select: { observations: true } },
      },
    });
    return rows.map((row) => this.rowToEvidenceProjection(row));
  }

  private rowToEvidenceProjection(row: EvidenceProjectionRow): EvidenceProjection {
    return {
      id: row.id,
      caseId: row.caseId,
      investigationId: row.investigationId,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      type: row.evidenceType,
      title: row.title,
      description: row.description,
      observedAt: (row.observedAt ?? null) as EventTime | null,
      operationId: row.operationId,
      artifactId: row.artifactId,
      observationCount: row._count.observations,
      artifactIds: row.artifactId ? [row.artifactId] : [],
      sourceRef: row.sourceName,
      status: row._count.observations > 0 ? "PROCESSED" : "INGESTED",
      createdAt: row.createdAt.toISOString(),
    };
  }

  private rowToObservation(row: ObservationRow): Observation {
    return ObservationSchema.parse({
      id: row.id,
      evidenceId: row.evidenceId,
      sourceId: row.sourceId,
      type: row.type,
      content: row.content,
      entityIds: row.entityIds,
      candidateMentions: row.candidateMentions,
      strength: row.strength,
      provenance: row.provenance,
      ...(row.observedAt !== null && row.observedAt !== undefined
        ? { observedAt: row.observedAt }
        : {}),
      ...(row.eventTime !== null && row.eventTime !== undefined
        ? { eventTime: row.eventTime }
        : {}),
      ...(row.sourceContextId !== null && row.sourceContextId !== undefined
        ? { sourceContextId: row.sourceContextId }
        : {}),
      ...(row.validityInterval !== null && row.validityInterval !== undefined
        ? { validityInterval: row.validityInterval }
        : {}),
      createdAt: { value: row.createdAt.toISOString(), precision: "exact" },
      updatedAt: { value: row.createdAt.toISOString(), precision: "exact" },
    });
  }
}

export const observationStore = new ObservationStore();