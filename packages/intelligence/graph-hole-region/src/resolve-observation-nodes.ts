// ============================================================================
// Seed observation → canonical graph node resolution (Phase 5A-PR1)
//
// The authoritative projected graph (M-A13 buildGraph) uses canonical EntityId
// as the graph node id. A seed observation carries canonical entityIds; the
// resolution is therefore DIRECT: an entityId is a resolvable node if and only
// if the graph contains that id. We never invent a node, never run identity
// resolution, and never guess entity→node mappings here (M-A09/M-A07 own
// that concern).
//
// Deterministic: observations are processed in ascending id order; resolved /
// unresolved id lists are deduplicated and sorted.
//
// `resolvedPerObservation` keeps the observation-level trace so later PRs can
// attribute region membership to seeds (traceability data, NOT identity).
// ============================================================================

export interface SeedObservation {
  readonly id: string;
  readonly entityIds: readonly string[];
}

export interface ObservationNodeResolution {
  readonly observationId: string;
  readonly resolvedNodeIds: readonly string[];
  readonly unresolvedEntityIds: readonly string[];
}

export interface SeedNodeResolution {
  readonly resolvedNodeIds: readonly string[];
  readonly unresolvedEntityIds: readonly string[];
  readonly resolvedPerObservation: readonly ObservationNodeResolution[];
}

/** Deterministic seed-node resolution against a case-scoped graph. */
export function resolveSeedNodeIds(
  observations: readonly SeedObservation[],
  hasNode: (nodeId: string) => boolean,
): SeedNodeResolution {
  const byObservation: ObservationNodeResolution[] = [...observations]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((observation) => {
      const entityIds = [...new Set(observation.entityIds)].sort();
      const resolved = entityIds.filter((id) => hasNode(id));
      const unresolved = entityIds.filter((id) => !hasNode(id));
      return {
        observationId: observation.id,
        resolvedNodeIds: resolved,
        unresolvedEntityIds: unresolved,
      };
    });

  const resolvedNodeIds = [...new Set(byObservation.flatMap((o) => o.resolvedNodeIds))].sort();
  const unresolvedEntityIds = [
    ...new Set(byObservation.flatMap((o) => o.unresolvedEntityIds)),
  ].sort();

  return { resolvedNodeIds, unresolvedEntityIds, resolvedPerObservation: byObservation };
}