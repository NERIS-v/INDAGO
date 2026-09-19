// ============================================================================
// LIVE — RelationHypothesisDTO → canonical RelationHypothesis projection
//
// The platform GET /investigations/:id/relations serializes durable
// RelationHypothesis rows directly (relation-hypothesis-store.ts
// rowToRelationHypothesis). This module projects the wire shape into the
// strict canonical RelationHypothesisSchema:
//   - fields the endpoint exposes    → mapped verbatim (sourceEntityId,
//     targetEntityId, relationType, support, evidenceBasis, contradictions,
//     directed, status);
//   - `validityInterval` (the platform's column name — NOT the canonical
//     `temporalInterval`) → mapped to canonical `temporalInterval`;
//   - `strength` is intentionally OMITTED: the canonical field is structural
//     ("Graph-theoretic importance of this edge, NOT relationship quality"),
//     while the platform's `evidenceStrength` is relationship quality. Mapping
//     one onto the other would be a semantic lie.
//   - caseId / investigationId / scoreModelVersion / evidenceCount /
//     sourceCoverage / temporalCoverage are not part of the canonical
//     RelationHypothesisSchema and are dropped;
//   - timestamps (plain ISO strings on this route) → ObservedTime
//     { value, precision: "exact" };
//   - provenance / metadata / temporalInterval are carried verbatim when they
//     are plain objects and omitted otherwise — a persisted value that
//     violates the canonical shape throws (ProviderError.validation at the
//     provider boundary) rather than being silently normalized.
// ============================================================================

import {
  RelationHypothesisSchema,
  type RelationHypothesis,
} from "@indago/contracts";
import type { RelationHypothesisDTO } from "@/lib/api/types";

export function projectRelationFromDto(
  dto: RelationHypothesisDTO,
): RelationHypothesis {
  return RelationHypothesisSchema.parse({
    id: dto.id,
    sourceEntityId: dto.sourceEntityId,
    targetEntityId: dto.targetEntityId,
    relationType: dto.relationType,
    support: dto.support,
    evidenceBasis: dto.evidenceBasis,
    contradictions: dto.contradictions,
    temporalInterval: isPlainRecord(dto.validityInterval)
      ? dto.validityInterval
      : undefined,
    directed: dto.directed,
    status: dto.status,
    provenance: dto.provenance,
    metadata: isPlainRecord(dto.metadata) ? dto.metadata : undefined,
    createdAt: { value: dto.createdAt, precision: "exact" },
    updatedAt: { value: dto.updatedAt, precision: "exact" },
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}