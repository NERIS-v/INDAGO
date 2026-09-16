// ============================================================================
// LIVE — DurableLead DTO → canonical Lead projection
//
// The platform lead routes serialize DurableLead rows directly (dates as ISO
// strings; status/priority as the canonical unions; sourceCandidateSnapshot /
// alternativeExplanations / provenance as opaque JSON blobs carried verbatim).
//
// This module projects the wire shape into the strict canonical LeadSchema:
//   - fields the endpoint exposes → mapped verbatim;
//   - `investigationId` (nullable on the row) → backfilled from the workspace
//     identity the provider was resolved for;
//   - JSON blobs → validated by the canonical zod schemas at this boundary;
//     undefined/null blobs project to their schema-valid EMPTY equivalents
//     (`{}` / `[]`) because the platform genuinely stored nothing there —
//     absence is not fabricated data;
//   - timestamps (ISO strings) → ObservedTime { value, precision: "exact" }.
//
// The result is parsed against LeadSchema: a persisted value that violates the
// canonical shape throws a typed ProviderError.validation at the provider
// boundary rather than being silently normalized.
// ============================================================================

import { LeadSchema, LeadEvidenceLinkSchema, type Lead, type LeadEvidenceLink } from "@indago/contracts";
import type { DurableLeadDTO, DurableLeadEvidenceLinkDTO } from "@/lib/api/types";

export interface LeadProjectionContext {
  /** Canonical investigation id the caller resolved to. */
  readonly investigationId: string;
}

export function projectLeadFromDto(
  dto: DurableLeadDTO,
  context: LeadProjectionContext,
): Lead {
  const snapshot = isPlainRecord(dto.sourceCandidateSnapshot)
    ? dto.sourceCandidateSnapshot
    : {};
  const alternatives = Array.isArray(dto.alternativeExplanations)
    ? dto.alternativeExplanations
    : [];

  return LeadSchema.parse({
    id: dto.id,
    investigationId: dto.investigationId ?? context.investigationId,
    caseId: dto.caseId,
    title: dto.title,
    description: dto.description,
    status: dto.status,
    priority: dto.priority,
    confidence: dto.confidence,
    posture: dto.posture,
    relatedEntityIds: dto.relatedEntityIds,
    supportingObservationIds: dto.supportingObservationIds,
    contradictingObservationIds: dto.contradictingObservationIds,
    relatedEvidenceIds: dto.relatedEvidenceIds,
    gapIds: dto.gapIds,
    sourceCandidateType: dto.sourceCandidateType,
    sourceCandidateKey: dto.sourceCandidateKey,
    sourceCandidateSnapshot: snapshot,
    alternativeExplanations: alternatives,
    assignedTo: dto.assignedTo ?? undefined,
    provenance: dto.provenance,
    createdAt: { value: dto.createdAt, precision: "exact" },
    updatedAt: { value: dto.updatedAt, precision: "exact" },
    closedAt: dto.closedAt
      ? { value: dto.closedAt, precision: "exact" }
      : undefined,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/** Project a persisted evidence link row into the canonical LeadEvidenceLink. */
export function projectLeadEvidenceLinkFromDto(
  dto: DurableLeadEvidenceLinkDTO,
): LeadEvidenceLink {
  return LeadEvidenceLinkSchema.parse({
    id: dto.id,
    leadId: dto.leadId,
    observationId: dto.observationId,
    verdict: dto.verdict,
    rationale: dto.rationale ?? undefined,
    addedBy: dto.addedBy,
    createdAt: { value: dto.createdAt, precision: "exact" },
  });
}