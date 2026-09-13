// ============================================================================
// PR4 detection test helpers (Phase 5A-PR4)
//
// Deterministic, reusable fixtures that satisfy the closed-world assumptions
// of the detection context: authority-matched case/graph, observation→source
// records for every referenced observation, and scoped nodes/edges. All ids
// are stable within a test file (module-seeded monotonic counter) so expected
// values can be hard-coded per-file and byte-stable assertions hold.
// ============================================================================

import type {
  EntityHypothesis,
  GraphEdge,
  GraphNode,
  ObservationId,
  Provenance,
  RelationHypothesis,
  SourceId,
  TemporalInterval,
} from '@indago/contracts';
import type { GraphHoleRegion, RegionIdentityV1 } from '@indago/graph-hole-region';
import type { DetectionObservation, DetectionInput } from '../src/types.js';

let seq = 0;

/** Deterministic, monotonic pseudo-uuid: 00000000-0000-4000-8000-<12-hex>. */
export function uuid(): string {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

// ---------------------------------------------------------------------------
// Stable case/version constants (fresh per module import)
// ---------------------------------------------------------------------------

export const CASE_ID = uuid();
export const VERSION_ID = uuid();
export const INVESTIGATION_ID = uuid();

// ---------------------------------------------------------------------------
// Record builders
// ---------------------------------------------------------------------------

const NOW: { value: string; precision: 'exact' } = {
  value: '2025-01-01T00:00:00.000Z',
  precision: 'exact',
};

export function mkNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return {
    id,
    investigationId: INVESTIGATION_ID,
    versionId: VERSION_ID,
    type: 'ENTITY',
    label: id,
    structuralImportance: 0.5,
    observationCount: 1,
    sourceCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function mkEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  overrides?: Partial<GraphEdge>,
): GraphEdge {
  return {
    id,
    investigationId: INVESTIGATION_ID,
    versionId: VERSION_ID,
    sourceNodeId,
    targetNodeId,
    relationType: 'communication',
    support: 0.8,
    structuralImportance: 0.5,
    directed: true,
    status: 'ACTIVE',
    observationCount: 1,
    sourceCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function mkRelationHypothesis(
  id: string,
  sourceEntityId: string,
  targetEntityId: string,
  overrides?: Partial<RelationHypothesis>,
): RelationHypothesis {
  return {
    id,
    sourceEntityId,
    targetEntityId,
    relationType: 'communication',
    evidenceBasis: [],
    support: 0.9,
    strength: 0.7,
    provenance: { sourceId: uuid(), extractor: 'test-fixture' } as Provenance,
    ...overrides,
  } as RelationHypothesis;
}

export function mkEntityHypothesis(
  id: string,
  refs: readonly string[],
  overrides?: Partial<EntityHypothesis>,
): EntityHypothesis {
  const [entityId, resolvedEntityId] = refs;
  return {
    id,
    score: 0.6,
    supportingObservationIds: [],
    provenance: { sourceId: uuid(), extractor: 'test-fixture' } as Provenance,
    ...(entityId !== undefined ? { entityId } : {}),
    ...(resolvedEntityId !== undefined ? { resolvedEntityId } : {}),
    ...overrides,
  } as EntityHypothesis;
}

export function mkRegion(
  opts: {
    nodeIds?: readonly string[];
    edgeIds?: readonly string[];
    seedObservationIds?: readonly string[];
    resolvedSeedNodeIds?: readonly string[];
    truncated?: boolean;
    regionId?: string;
  } = {},
): GraphHoleRegion {
  const nodeIds = [...(opts.nodeIds ?? [])].sort();
  const edgeIds = [...(opts.edgeIds ?? [])].sort();
  const seedObservationIds = [...(opts.seedObservationIds ?? [])].sort();
  const resolvedSeedNodeIds = [...(opts.resolvedSeedNodeIds ?? [])].sort();

  const identity: RegionIdentityV1 = {
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    seedObservationIds,
    nodeIds,
    edgeIds,
    regionPolicyVersion: 'v1',
    semanticRetrievalPolicyVersion: 'v1',
  } as RegionIdentityV1;

  return {
    regionId: opts.regionId ?? uuid(),
    identity,
    status: 'SATURATED',
    truncated: opts.truncated ?? false,
    limitations: [],
    maxExpansionRounds: 0,
    maxRegionNodes: 100,
    maxRegionEdges: 250,
    maxContextObservations: 100,
    expansionRounds: 0,
    seedObservationIds,
    resolvedSeedNodeIds,
    unresolvedSeedEntityIds: [],
    seedEdgeIds: [],
    nodeIds,
    edgeIds,
    roundRecords: [],
    semanticExpansion: { status: 'DISABLED', usedSemanticExpansion: false },
  } as unknown as GraphHoleRegion;
}

export function obs(id: string, sourceId: string): DetectionObservation {
  return { id, sourceId };
}

export function obsSources(
  ids: readonly string[],
  sourceId: string,
): DetectionObservation[] {
  return ids.map((id) => ({ id, sourceId }));
}

export const NULL_WINDOW: TemporalInterval = {
  validFrom: { value: '1970-01-01', precision: 'day' },
  precision: 'day',
  semantics: 'observed',
};

// ---------------------------------------------------------------------------
// Base input builder
// ---------------------------------------------------------------------------

export function baseInput(
  overrides: Partial<DetectionInput> & {
    region?: GraphHoleRegion;
    nodes?: readonly GraphNode[];
    edges?: readonly GraphEdge[];
    observations?: readonly DetectionObservation[];
  } = {},
): DetectionInput {
  const nodes = overrides.nodes ?? [];
  const edges = overrides.edges ?? [];
  const observations = overrides.observations ?? [];
  return {
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    temporalContext: NULL_WINDOW,
    region:
      overrides.region ??
      mkRegion({
        nodeIds: nodes.map((n) => n.id),
        edgeIds: edges.map((e) => e.id),
      }),
    nodes,
    edges,
    observations,
    ...('relationHypotheses' in overrides
      ? { relationHypotheses: overrides.relationHypotheses }
      : {}),
    ...('entityHypotheses' in overrides
      ? { entityHypotheses: overrides.entityHypotheses }
      : {}),
    ...('communities' in overrides ? { communities: overrides.communities } : {}),
    ...('enabledDetectors' in overrides
      ? { enabledDetectors: overrides.enabledDetectors }
      : {}),
  };
}