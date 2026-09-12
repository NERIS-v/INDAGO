// ============================================================================
// P4 — Lead persistence store
//
// Single Prisma data-access boundary for the Lead / LeadEvidenceLink /
// LeadEvent tables. Mirrors the discipline already established by
// EntityStore / RelationStore / TemporalStateChangeStore in this package:
//
//   - Idempotent writes: Lead.id is a DETERMINISTIC UUID (see
//     @indago/lead-generation's deterministicLeadId) derived from the
//     originating candidate. A re-generation pass over an UNCHANGED
//     candidate converges to the same row rather than creating a duplicate
//     — and, like EntityStore's PRESERVED_LIFECYCLE_STATUSES, an existing
//     Lead's human-facing fields (status, assignedTo, evidence links) are
//     NEVER reset by a later generation pass. upsertDraft only CREATES; it
//     never overwrites an existing lead.
//   - No arbitrary status transitions: transitionStatus is guarded by
//     LEAD_STATUS_TRANSITIONS (contracts/domain/lead.ts) — an illegal
//     transition throws rather than silently clamping.
//   - Append-only provenance: every material change to a Lead is recorded
//     as a LeadEvent with an application-allocated, per-lead monotonic
//     `sequence` (max(existing)+1 inside a transaction, mirroring
//     TemporalStateChangeStore), with a bounded retry on a genuine P2002
//     race rather than silently dropping the event.
// ============================================================================

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { db } from "../db/prisma.js";
import {
  LEAD_STATUS_TRANSITIONS,
  type Lead,
  type LeadStatus,
  type LeadDraft,
  type LeadEvidenceVerdict,
} from "@indago/contracts";

function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

function toStringArray(value: Prisma.JsonValue): string[] {
  if (value === null || typeof value !== "object" || !Array.isArray(value)) return [];
  return (value as unknown[]).filter((v): v is string => typeof v === "string");
}

export interface DurableLead {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly title: string;
  readonly description: string;
  readonly status: LeadStatus;
  readonly priority: Lead["priority"];
  readonly confidence: number;
  readonly posture: Lead["posture"];
  readonly relatedEntityIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly relatedEvidenceIds: readonly string[];
  readonly gapIds: readonly string[];
  readonly sourceCandidateType: Lead["sourceCandidateType"];
  readonly sourceCandidateKey: string;
  readonly sourceCandidateSnapshot: unknown;
  readonly alternativeExplanations: unknown;
  readonly provenance: unknown;
  readonly assignedTo: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly closedAt: Date | null;
}

export interface DurableLeadEvidenceLink {
  readonly id: string;
  readonly leadId: string;
  readonly observationId: string;
  readonly verdict: LeadEvidenceVerdict;
  readonly rationale: string | null;
  readonly addedBy: string;
  readonly createdAt: Date;
}

export interface DurableLeadEvent {
  readonly id: string;
  readonly leadId: string;
  readonly caseId: string;
  readonly eventType: string;
  readonly actor: string;
  readonly payload: unknown;
  readonly sequence: number;
  readonly createdAt: Date;
}

type LeadRow = Prisma.LeadGetPayload<Record<string, never>>;
type LeadEvidenceLinkRow = Prisma.LeadEvidenceLinkGetPayload<Record<string, never>>;
type LeadEventRow = Prisma.LeadEventGetPayload<Record<string, never>>;

function rowToLead(row: LeadRow): DurableLead {
  return {
    id: row.id,
    caseId: row.caseId,
    investigationId: row.investigationId,
    title: row.title,
    description: row.description,
    status: row.status as LeadStatus,
    priority: row.priority as Lead["priority"],
    confidence: row.confidence,
    posture: row.posture as Lead["posture"],
    relatedEntityIds: toStringArray(row.relatedEntityIds),
    supportingObservationIds: toStringArray(row.supportingObservationIds),
    contradictingObservationIds: toStringArray(row.contradictingObservationIds),
    relatedEvidenceIds: toStringArray(row.relatedEvidenceIds),
    gapIds: toStringArray(row.gapIds),
    sourceCandidateType: row.sourceCandidateType as Lead["sourceCandidateType"],
    sourceCandidateKey: row.sourceCandidateKey,
    sourceCandidateSnapshot: row.sourceCandidateSnapshot,
    alternativeExplanations: row.alternativeExplanations,
    provenance: row.provenance,
    assignedTo: row.assignedTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

function rowToEvidenceLink(row: LeadEvidenceLinkRow): DurableLeadEvidenceLink {
  return {
    id: row.id,
    leadId: row.leadId,
    observationId: row.observationId,
    verdict: row.verdict as LeadEvidenceVerdict,
    rationale: row.rationale,
    addedBy: row.addedBy,
    createdAt: row.createdAt,
  };
}

function rowToEvent(row: LeadEventRow): DurableLeadEvent {
  return {
    id: row.id,
    leadId: row.leadId,
    caseId: row.caseId,
    eventType: row.eventType,
    actor: row.actor,
    payload: row.payload,
    sequence: row.sequence,
    createdAt: row.createdAt,
  };
}

export class IllegalLeadStatusTransitionError extends Error {
  constructor(from: LeadStatus, to: LeadStatus) {
    super(`Illegal lead status transition: ${from} -> ${to}`);
    this.name = "IllegalLeadStatusTransitionError";
  }
}

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead not found: ${leadId}`);
    this.name = "LeadNotFoundError";
  }
}

const MAX_EVENT_APPEND_RETRIES = 3;

export class LeadStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Append a LeadEvent with an application-allocated, per-lead monotonic
   * sequence (max(existing)+1), retrying a bounded number of times on a
   * genuine P2002 race on (leadId, sequence) rather than silently dropping
   * the event or throwing on a benign concurrent-append race.
   */
  private async appendEvent(
    tx: Prisma.TransactionClient,
    params: { leadId: string; caseId: string; eventType: string; actor: string; payload: unknown },
  ): Promise<LeadEventRow> {
    for (let attempt = 0; attempt < MAX_EVENT_APPEND_RETRIES; attempt++) {
      const agg = await tx.leadEvent.aggregate({
        where: { leadId: params.leadId },
        _max: { sequence: true },
      });
      const nextSequence = (agg._max.sequence ?? 0) + 1;
      try {
        return await tx.leadEvent.create({
          data: {
            leadId: params.leadId,
            caseId: params.caseId,
            eventType: params.eventType,
            actor: params.actor,
            payload: toJson(params.payload),
            sequence: nextSequence,
          },
        });
      } catch (err: unknown) {
        const isUniqueViolation =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isUniqueViolation || attempt === MAX_EVENT_APPEND_RETRIES - 1) throw err;
        // Another writer took this sequence number concurrently — retry with
        // a freshly read max() rather than failing the whole operation.
      }
    }
    throw new Error("appendEvent: exhausted retries");
  }

  /**
   * Create a Lead from a LeadDraft if one with this deterministic id does
   * not already exist. NEVER overwrites an existing lead — a re-generation
   * pass over an unchanged candidate is expected to be a safe no-op that
   * preserves any human review already recorded against the lead.
   */
  async upsertDraft(
    draft: LeadDraft,
    params: { investigationId: string | null; actor: string },
  ): Promise<{ lead: DurableLead; created: boolean }> {
    const existing = await this.prisma.lead.findUnique({ where: { id: draft.id } });
    if (existing) {
      return { lead: rowToLead(existing), created: false };
    }

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.lead.create({
        data: {
          id: draft.id,
          caseId: draft.caseId,
          investigationId: params.investigationId,
          title: draft.title,
          description: draft.description,
          status: "NEW",
          priority: draft.priority,
          confidence: draft.confidence,
          posture: draft.posture,
          relatedEntityIds: toJson(draft.relatedEntityIds),
          supportingObservationIds: toJson(draft.supportingObservationIds),
          contradictingObservationIds: toJson(draft.contradictingObservationIds),
          relatedEvidenceIds: toJson(draft.relatedEvidenceIds),
          gapIds: toJson([]),
          sourceCandidateType: draft.sourceCandidateType,
          sourceCandidateKey: draft.sourceCandidateKey,
          sourceCandidateSnapshot: toJson(draft.sourceCandidateSnapshot),
          alternativeExplanations: toJson(draft.alternativeExplanations),
          provenance: toJson(draft.provenance),
        },
      });
      await this.appendEvent(tx, {
        leadId: row.id,
        caseId: row.caseId,
        eventType: "LEAD_CREATED",
        actor: params.actor,
        payload: { sourceCandidateType: draft.sourceCandidateType, sourceCandidateKey: draft.sourceCandidateKey },
      });
      return row;
    });

    return { lead: rowToLead(result), created: true };
  }

  async findById(id: string, filter: { caseId: string }): Promise<DurableLead | null> {
    const row = await this.prisma.lead.findFirst({ where: { id, caseId: filter.caseId } });
    return row ? rowToLead(row) : null;
  }

  async listByCase(
    caseId: string,
    filter: { status?: LeadStatus } = {},
  ): Promise<DurableLead[]> {
    const rows = await this.prisma.lead.findMany({
      where: { caseId, ...(filter.status ? { status: filter.status } : {}) },
      orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
    });
    return rows.map(rowToLead);
  }

  /**
   * Transition a lead's status, enforcing LEAD_STATUS_TRANSITIONS. Throws
   * IllegalLeadStatusTransitionError rather than clamping to a "closest
   * legal" state — a caller attempting an illegal transition has a bug that
   * should surface, not be silently papered over.
   */
  async transitionStatus(
    id: string,
    params: { caseId: string; toStatus: LeadStatus; actor: string },
  ): Promise<DurableLead> {
    const existing = await this.findById(id, { caseId: params.caseId });
    if (!existing) throw new LeadNotFoundError(id);

    const legalNextStates = LEAD_STATUS_TRANSITIONS[existing.status];
    if (!legalNextStates.includes(params.toStatus)) {
      throw new IllegalLeadStatusTransitionError(existing.status, params.toStatus);
    }

    const terminal: ReadonlySet<LeadStatus> = new Set(["PROMOTED", "REJECTED", "STALE"]);
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.lead.update({
        where: { id },
        data: {
          status: params.toStatus,
          closedAt: terminal.has(params.toStatus) ? new Date() : undefined,
        },
      });
      await this.appendEvent(tx, {
        leadId: id,
        caseId: params.caseId,
        eventType: "STATUS_CHANGED",
        actor: params.actor,
        payload: { from: existing.status, to: params.toStatus },
      });
      return row;
    });

    return rowToLead(result);
  }

  /**
   * Attach an evidence FOR/AGAINST verdict. Idempotent: re-attaching the
   * same (leadId, observationId, verdict) is a safe no-op (the unique
   * constraint on LeadEvidenceLink absorbs the retry) — the denormalized
   * id array on Lead is only appended to, never duplicated.
   */
  async attachEvidence(
    id: string,
    params: {
      caseId: string;
      observationId: string;
      verdict: LeadEvidenceVerdict;
      rationale?: string;
      actor: string;
    },
  ): Promise<{ lead: DurableLead; link: DurableLeadEvidenceLink; created: boolean }> {
    const existing = await this.findById(id, { caseId: params.caseId });
    if (!existing) throw new LeadNotFoundError(id);

    const existingLink = await this.prisma.leadEvidenceLink.findFirst({
      where: { leadId: id, observationId: params.observationId, verdict: params.verdict },
    });
    if (existingLink) {
      return { lead: existing, link: rowToEvidenceLink(existingLink), created: false };
    }

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const link = await tx.leadEvidenceLink.create({
        data: {
          leadId: id,
          observationId: params.observationId,
          verdict: params.verdict,
          rationale: params.rationale ?? null,
          addedBy: params.actor,
        },
      });

      const supportKey = params.verdict === "FOR" ? "supportingObservationIds" : "contradictingObservationIds";
      const currentIds = params.verdict === "FOR" ? existing.supportingObservationIds : existing.contradictingObservationIds;
      const nextIds = currentIds.includes(params.observationId) ? currentIds : [...currentIds, params.observationId];

      const row = await tx.lead.update({
        where: { id },
        data: { [supportKey]: toJson(nextIds) },
      });

      await this.appendEvent(tx, {
        leadId: id,
        caseId: params.caseId,
        eventType: "EVIDENCE_ATTACHED",
        actor: params.actor,
        payload: { observationId: params.observationId, verdict: params.verdict },
      });

      return { row, link };
    });

    return { lead: rowToLead(result.row), link: rowToEvidenceLink(result.link), created: true };
  }

  async listEvidence(id: string): Promise<DurableLeadEvidenceLink[]> {
    const rows = await this.prisma.leadEvidenceLink.findMany({
      where: { leadId: id },
      orderBy: [{ createdAt: "asc" }],
    });
    return rows.map(rowToEvidenceLink);
  }

  /**
   * Full append-only provenance trail for a lead, in deterministic replay
   * order (sequence ascending) — the "Persist lead provenance" P4 surface.
   */
  async listEvents(id: string): Promise<DurableLeadEvent[]> {
    const rows = await this.prisma.leadEvent.findMany({
      where: { leadId: id },
      orderBy: [{ sequence: "asc" }],
    });
    return rows.map(rowToEvent);
  }
}

export const leadStore = new LeadStore();
