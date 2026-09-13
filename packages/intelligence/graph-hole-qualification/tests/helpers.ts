// ============================================================================
// PR5 qualification test helpers (Phase 5A-PR5)
//
// Deterministic fixtures that satisfy the closed-world requirements of the
// qualification input: authority-matched case/graph, observation records for
// every supporting id, a hypothesis context covering every supporting id,
// and region-scope nodes/edges. Module-seeded monotonic ids keep expected
// values stable per-file and assertions byte-stable.
// ============================================================================

import type {
  GraphEdge,
  GraphNode,
  Provenance,
  RawGraphHoleCandidate,
  StructuralBasis,
  RelationType,
  TemporalInterval,
  GraphHoleType,
} from '@indago/contracts';
import type { GraphHoleRegion, RegionIdentityV1 } from '@indago/graph-hole-region';
import type {
  AtomicRelationshipHypothesis,
  HypothesisContext,
} from '@indago/hypothesis-context';
import type {
  QualificationInput,
  QualificationObservation,
} from '../src/types.js';

let seq = 0;

/** Deterministic, monotonic pseudo-uuid: 00000000-0000-4000-8000-<12-hex>. */
export function uuid(): string {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export const CASE_ID = uuid();
export const VERSION_ID = uuid();
export const INVESTIGATION_ID = uuid();

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

/** V1 support-unit key builder per Observation. */
export function mkObservation(
  id: string,
  overrides?: Partial<QualificationObservation> & { sourceId?: string },
): QualificationObservation {
  return {
    id,
    sourceId: overrides?.sourceId ?? uuid(),
    strength: 0.8,
    ...overrides,
  };
}

export function mkAtomic(
  derivedId: string,
  referenceEntityId: string,
  overrides?: Partial<AtomicRelationshipHypothesis>,
): AtomicRelationshipHypothesis {
  return {
    derivedId,
    hypothesisType: 'RELATION_HYPOTHESIS',
    subject: { type: 'canonical', entityId: referenceEntityId } as never,
    predicate: 'communication',
    object: { type: 'canonical', entityId: referenceEntityId } as never,
    referencedCanonicalEntityIds: [referenceEntityId],
    supportingObservations: [],
    contradictingObservations: [],
    contradictingHypothesisIds: [],
    evidenceSupport: 0.85,
    structuralRelevance: 0.6,
    provenance: { sourceId: uuid(), extractor: 'test-fixture' } as Provenance,
    temporalScope: null,
    graphVersion: VERSION_ID,
    ...overrides,
  };
}

export function mkHypothesisContext(
  atomics: readonly AtomicRelationshipHypothesis[],
  overrides?: Partial<HypothesisContext>,
): HypothesisContext {
  return {
    policyVersion: 'v1',
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    atomicOrder: { evidenceSupport: 'desc', structuralRelevance: 'desc', derivedHypothesisId: 'asc' },
    atomic: atomics,
    groups: [],
    accounting: {
      inputRelationHypotheses: atomics.length,
      inputEntityHypotheses: 0,
      atomicHypotheses: atomics.length,
      components: 0,
      groups: 0,
      truncatedGroups: 0,
      isolatedAtomics: 0,
      totalCanonicalNodesAcrossGroups: 0,
    },
    ...overrides,
  };
}

export function mkRegion(
  opts: {
    nodeIds?: readonly string[];
    edgeIds?: readonly string[];
    status?: 'SATURATED' | 'LIMITED' | 'DEGRADED';
    truncated?: boolean;
    temporalContext?: TemporalInterval | null;
  } = {},
): GraphHoleRegion {
  const nodeIds = [...(opts.nodeIds ?? [])].sort();
  const edgeIds = [...(opts.edgeIds ?? [])].sort();
  const identity: RegionIdentityV1 = {
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    seedObservationIds: [],
    nodeIds,
    edgeIds,
    regionPolicyVersion: 'v1',
    semanticRetrievalPolicyVersion: 'v1',
    ...(opts.temporalContext !== undefined ? { temporalContext: opts.temporalContext } : {}),
  } as RegionIdentityV1;

  return {
    regionId: uuid(),
    identity,
    status: opts.status ?? 'SATURATED',
    truncated: opts.truncated ?? false,
    limitations: [],
    maxExpansionRounds: 0,
    maxRegionNodes: 100,
    maxRegionEdges: 250,
    maxContextObservations: 100,
    expansionRounds: 0,
    seedObservationIds: [],
    resolvedSeedNodeIds: [],
    unresolvedSeedEntityIds: [],
    seedEdgeIds: [],
    nodeIds,
    edgeIds,
    roundRecords: [],
    semanticExpansion: { status: 'DISABLED', usedSemanticExpansion: false },
  } as unknown as GraphHoleRegion;
}

/** A candidate whose gap is N1—N2 while N3, N4 keep both N1 and N2 connected. */
export function mkCandidate(
  overrides?: Partial<RawGraphHoleCandidate>,
): RawGraphHoleCandidate {
  return {
    candidateId: uuid(),
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    regionId: uuid(),
    detectionPolicyVersion: 'v1',
    detectorType: 'MISSING_EDGE',
    nodeIds: [overrides?.nodeIds?.[0] ?? 'N1', overrides?.nodeIds?.[1] ?? 'N2'],
    observedEdgeIds: ['E31', 'E32', 'E41', 'E42'],
    expectedRelationshipType: 'communication' as RelationType,
    supportingHypothesisIds: ['A1', 'A2'],
    supportingObservationIds: ['O1', 'O2'],
    contradictingObservationIds: [],
    structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT' as StructuralBasis,
    detectorMetadata: {
      detectorType: 'MISSING_EDGE',
      pairEvaluations: 1,
      boundReached: false,
    },
    provenance: { sourceId: 'S1', extractor: 'graph-hole-detection.v1' } as Provenance,
    ...overrides,
  };
}

/** Default closed-world scenario that qualifies ONE candidate. */
export function qualifyingScenario(opts: {
  candidateOverrides?: Partial<RawGraphHoleCandidate>;
  edges?: readonly GraphEdge[];
  regions?: ReturnType<typeof mkRegion>;
} = {}): QualificationInput {
  const N1 = uuid();
  const N2 = uuid();
  const N3 = uuid();
  const N4 = uuid();
  const O1 = uuid();
  const O2 = uuid();

  const edges =
    opts.edges ?? [
      mkEdge(uuid(), N3, N1),
      mkEdge(uuid(), N3, N2),
      mkEdge(uuid(), N4, N1),
      mkEdge(uuid(), N4, N2),
    ];

  const candidate = mkCandidate({
    nodeIds: [N1, N2],
    observedEdgeIds: edges.map((e) => e.id),
    supportingObservationIds: [O1, O2],
    ...opts.candidateOverrides,
  });

  const region =
    opts.regions ??
    mkRegion({
      nodeIds: [N1, N2, N3, N4],
      edgeIds: edges.map((e) => e.id),
    });

  const atomics = [
    mkAtomic('A1', N1, { referencedCanonicalEntityIds: [N1, N2] }),
    mkAtomic('A2', N2, { referencedCanonicalEntityIds: [N1, N2] }),
  ];

  return {
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    region,
    nodes: [],
    edges,
    hypothesisContext: mkHypothesisContext(atomics),
    candidates: [candidate],
    observations: [mkObservation(O1), mkObservation(O2)],
    communities: undefined,
    enabledDetectors: undefined,
  };
}