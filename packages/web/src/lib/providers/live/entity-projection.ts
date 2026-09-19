// ============================================================================
// LIVE — EntityListItemDTO → canonical Entity projection
//
// The platform GET /investigations/:id/entities serializes a MINIMAL durable
// Entity row subset (entity-store.ts rowToEntity). This module projects the
// wire shape into the strict canonical EntitySchema:
//   - fields the endpoint exposes    → mapped verbatim (id, canonicalName,
//     status, observationIds, hypothesisIds, sourceIdentifiers, metadata);
//   - `investigationId` (nullable on the row) → backfilled from the workspace
//     identity the provider was resolved for;
//   - timestamps (plain ISO strings on this route) → ObservedTime
//     { value, precision: "exact" };
//   - canonical fields the platform model genuinely does NOT track →
//     schema-valid EMPTY equivalents, explicitly documented here:
//       evidenceIds / roleHypothesisIds are always [] because the platform
//       entity row has no evidence-level or role-level link columns — absence
//       is not fabricated data (same rule as the DurableLead blob defaults);
//   - `provenance` and `entityType` are dropped: the canonical EntitySchema
//     carries no provenance field, and entityType is a platform-only nullable
//     string with no canonical home.
//
// The result is parsed against EntitySchema: a persisted value that violates
// the canonical shape throws (ProviderError.validation at the provider
// boundary) rather than being silently normalized.
// ============================================================================

import { EntitySchema, type Entity } from "@indago/contracts";
import type { EntityListItemDTO } from "@/lib/api/types";

export interface EntityProjectionContext {
  /** Canonical investigation id the caller resolved to. */
  readonly investigationId: string;
}

export function projectEntityFromDto(
  dto: EntityListItemDTO,
  context: EntityProjectionContext,
): Entity {
  return EntitySchema.parse({
    id: dto.id,
    caseId: dto.caseId,
    investigationId: dto.investigationId ?? context.investigationId,
    canonicalName: dto.canonicalName,
    status: dto.status,
    observationIds: dto.observationIds,
    // The platform entity model tracks no evidence-level or role-level links
    // as of M-A10; the canonical Entity requires them, so they project to the
    // schema-valid EMPTY equivalent (absence, never fabricated data).
    evidenceIds: [],
    hypothesisIds: dto.hypothesisIds,
    roleHypothesisIds: [],
    sourceIdentifiers: Array.isArray(dto.sourceIdentifiers)
      ? dto.sourceIdentifiers
      : undefined,
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