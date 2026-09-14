// ============================================================================
// Graph-Hole Analysis test fixtures (Phase 5A-PR7)
//
// Deterministic fixtures for one qualified MISSING_EDGE candidate over a
// bounded region + PR3 hypothesis context. Every id is a stable version-4
// UUID derived from a small integer (identical to the graph-hole-region
// helper) so no clock or random state enters the tests.
//
// Scenario (base):
//   Case CASE, graph version GVS, region REGION, investigation INV.
//   Entities:      ENT_A (Alpha), ENT_B (Beta), ENT_C (Gamma)
//   Graph nodes:   NODE_A (Alpha), NODE_B (Beta), NODE_C (Gamma)
//   Graph edges:   EDGE_AB (A -communication-> B),  EDGE_BC (B -communication-> C)
//   Observations:  OBS_1..OBS_6 (support + one contradiction + noise)
//   Hypotheses:    RH_AB (A -communication-> B), RH_BC (B -communication-> C)
//   Candidate:     MISSING_EDGE between NODE_A and NODE_C (A -communication-> C
//                  expected but absent), qualified === true.
//
// Region temporal window covers candidate scope so temporalContextLimited is
// false on the base scenario.
// ============================================================================

import {
  DETECTION_POLICY_VERSION,
  GRAPH_HOLE_SCORING_POLICY_VERSION,
  type GraphEdge,
  type GraphNode,
  type Observation,
  type Provenance,
  type QualifiedGraphHoleCandidate,
  type RawGraphHoleCandidate,
  type TemporalInterval,
} from '@indago/contracts';
import type {
  GraphHoleRegion,
  RegionLimitationCode,
} from '@indago/graph-hole-region';
import {
  buildHypothesisContext,
  type HypothesisContext,
} from '@indago/hypothesis-context';

const HEX = '0123456789abcdef';

/** Stable version-4 UUID from a small integer (same helper as graph-hole-region fixtures). */
export function uuid(n: number): string {
  const hex = n.toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

// Identity -------------------------------------------------------------------

export const CASE = uuid(0x001f0001);
export const GVS = uuid(0x001f0002);
export const REGION = uuid(0x001f0003);
export const INV = uuid(0x001f0004);
export const OTHER_CASE = uuid(0x001f0005);
export const OTHER_GVS = uuid(0x001f0006);
export const OTHER_REGION = uuid(0x001f0007);

// Entities -------------------------------------------------------------------

export const ENT_A = uuid(0x10000001);
export const ENT_B = uuid(0x10000002);
export const ENT_C = uuid(0x10000003);

// Graph nodes / edges --------------------------------------------------------

export const NODE_A = uuid(0x20000001);
export const NODE_B = uuid(0x20000002);
export const NODE_C = uuid(0x20000003);

export const EDGE_AB = uuid(0x30000001);
export const EDGE_BC = uuid(0x30000002);

// Sources / evidence / observations -------------------------------------------

export const SRC_0 = uuid(0x90000000); // candidate provenance source
export const SRC_1 = uuid(0x90000001);
export const SRC_2 = uuid(0x90000002);
export const SRC_3 = uuid(0x90000003);
export const SRC_4 = uuid(0x90000004);
export const SRC_5 = uuid(0x90000005);
export const SRC_6 = uuid(0x90000006);

export const EV_1 = uuid(0x60000001);
export const EV_2 = uuid(0x60000002);
export const EV_3 = uuid(0x60000003);
export const EV_4 = uuid(0x60000004);
export const EV_5 = uuid(0x60000005);
export const EV_6 = uuid(0x60000006);

export const OBS_1 = uuid(0x40000001);
export const OBS_2 = uuid(0x40000002);
export const OBS_3 = uuid(0x40000003);
export const OBS_4 = uuid(0x40000004);
export const OBS_5 = uuid(0x40000005);
export const OBS_6 = uuid(0x40000006);

// Relation hypotheses ----------------------------------------------------------

export const RH_AB = uuid(0x70000001);
export const RH_BC = uuid(0x70000002);

// Candidate -------------------------------------------------------------------

export const CAND = uuid(0x80000001);

// Time helpers ----------------------------------------------------------------

const OBSERVED_AT = '2025-01-01T00:00:00.000Z' as const;

function eventTime(value: string): { value: string; precision: 'exact' } {
  return { value, precision: 'exact' };
}

export function temporalInterval(
  validFrom: string,
  validTo: string | undefined,
  semantics: 'observed' | 'inferred' | 'hypothesized' = 'observed',
): TemporalInterval {
  return {
    validFrom: eventTime(validFrom),
    ...(validTo !== undefined ? { validTo: eventTime(validTo) } : {}),
    precision: 'exact',
    semantics,
  };
}

export function observedTime(): { value: string; precision: 'exact' } {
  return { value: OBSERVED_AT, precision: 'exact' };
}

export function provenance(sourceId: string, extractor: string): Provenance {
  return { sourceId, extractor };
}

/** Region temporal analysis window (covers the candidate temporal scope). */
export const REGION_TEMPORAL_CONTEXT = temporalInterval(
  '2021-01-01T00:00:00.000Z',
  '2021-12-31T00:00:00.000Z',
  'observed',
);

/** Candidate's claimed temporal scope (inside the region window). */
export const CANDIDATE_TEMPORAL_SCOPE = temporalInterval(
  '2021-02-01T00:00:00.000Z',
  '2021-03-01T00:00:00.000Z',
  'hypothesized',
);

// Observation builder ----------------------------------------------------------

export interface ObservationOverrides {
  readonly id?: string;
  readonly entityIds?: readonly string[];
  readonly type?: Observation['type'];
  readonly content?: string;
  readonly evidenceId?: string;
  readonly sourceId?: string;
  readonly sourceContextId?: string;
}

export function observation(overrides?: ObservationOverrides): Observation {
  const {
    id = OBS_1,
    entityIds = [ENT_A, ENT_B],
    type = 'FACTUAL',
    content = 'Alpha and Beta attended the same conference in 2021.',
    evidenceId = EV_1,
    sourceId = SRC_1,
    sourceContextId = 'ctx-1',
  } = overrides ?? {};
  return {
    id,
    evidenceId,
    sourceId,
    type,
    content,
    entityIds: [...entityIds],
    candidateMentions: [],
    strength: 0.8,
    provenance: provenance(sourceId, 'observation-extractor.v1'),
    sourceContextId,
    createdAt: observedTime(),
    updatedAt: observedTime(),
  };
}

/** The standard observation set used by the base scenario. */
export function observations(): readonly Observation[] {
  return [
    observation({ id: OBS_1, entityIds: [ENT_A, ENT_B], type: 'FACTUAL', content: 'Alpha and Beta attended the same conference in 2021.', evidenceId: EV_1, sourceId: SRC_1, sourceContextId: 'ctx-1' }),
    observation({ id: OBS_2, entityIds: [ENT_B], type: 'TEMPORAL', content: 'Beta was in city X from 2021-02 to 2021-05.', evidenceId: EV_2, sourceId: SRC_2, sourceContextId: 'ctx-2' }),
    observation({ id: OBS_3, entityIds: [ENT_B, ENT_C], type: 'RELATIONAL', content: 'Beta and Gamma communicated frequently during 2021.', evidenceId: EV_3, sourceId: SRC_3, sourceContextId: 'ctx-3' }),
    observation({ id: OBS_4, entityIds: [ENT_A, ENT_C], type: 'RELATIONAL', content: 'Alpha and Gamma are documented as never having been in contact.', evidenceId: EV_4, sourceId: SRC_4, sourceContextId: 'ctx-4' }),
    observation({ id: OBS_5, entityIds: [ENT_C], type: 'FACTUAL', content: 'Gamma is the registered director of company Y.', evidenceId: EV_5, sourceId: SRC_5, sourceContextId: 'ctx-5' }),
    observation({ id: OBS_6, entityIds: [], type: 'OTHER', content: 'An unrelated personnel record entered the archive.', evidenceId: EV_6, sourceId: SRC_6, sourceContextId: 'ctx-6' }),
  ];
}

// Graph node / edge builders ---------------------------------------------------

export interface NodeOverrides {
  readonly id?: string;
  readonly entityId?: string;
  readonly label?: string;
}

export function graphNode(overrides?: NodeOverrides): GraphNode {
  const { id = NODE_A, entityId = ENT_A, label = 'Alpha' } = overrides ?? {};
  return {
    id,
    investigationId: INV,
    versionId: GVS,
    type: 'ENTITY',
    entityId,
    label,
    structuralImportance: 0.6,
    observationCount: 1,
    sourceCount: 1,
    createdAt: observedTime(),
    updatedAt: observedTime(),
  };
}

export interface EdgeOverrides {
  readonly id?: string;
  readonly sourceNodeId?: string;
  readonly targetNodeId?: string;
  readonly relationType?: string;
}

export function graphEdge(overrides?: EdgeOverrides): GraphEdge {
  const {
    id = EDGE_AB,
    sourceNodeId = NODE_A,
    targetNodeId = NODE_B,
    relationType = 'communication',
  } = overrides ?? {};
  return {
    id,
    investigationId: INV,
    versionId: GVS,
    sourceNodeId,
    targetNodeId,
    relationType,
    support: 0.8,
    structuralImportance: 0.6,
    directed: true,
    status: 'ACTIVE',
    observationCount: 1,
    sourceCount: 1,
    createdAt: observedTime(),
    updatedAt: observedTime(),
  };
}

// Relation-hypothesis builder (PR3 authoritative input) --------------------------

export interface RelationHypothesisOverrides {
  readonly id?: string;
  readonly sourceEntityId?: string;
  readonly targetEntityId?: string;
  readonly relationType?: string;
  readonly support?: number;
  readonly evidenceBasis?: readonly string[];
  readonly contradictions?: readonly string[];
  readonly strength?: number;
  readonly temporalInterval?: TemporalInterval;
}

export function relationHypothesis(overrides?: RelationHypothesisOverrides) {
  const {
    id = RH_AB,
    sourceEntityId = ENT_A,
    targetEntityId = ENT_B,
    relationType = 'communication',
    support = 0.8,
    evidenceBasis = [OBS_1, OBS_2],
    contradictions,
    strength = 0.6,
    temporalInterval = undefined,
  } = overrides ?? {};
  return {
    id,
    sourceEntityId,
    targetEntityId,
    relationType,
    support,
    evidenceBasis: [...evidenceBasis],
    ...(contradictions !== undefined ? { contradictions: [...contradictions] } : {}),
    ...(temporalInterval !== undefined ? { temporalInterval } : {}),
    directed: true,
    strength,
    status: 'PROPOSED' as const,
    provenance: provenance(SRC_0, 'relation-hypothesis.v1'),
    createdAt: observedTime(),
    updatedAt: observedTime(),
  };
}

/** The PR3 grouped hypothesis context for the base scenario. */
export function hypothesisContext(): HypothesisContext {
  return buildHypothesisContext({
    caseId: CASE,
    graphVersionId: GVS,
    relationHypotheses: [
      relationHypothesis({ id: RH_AB, sourceEntityId: ENT_A, targetEntityId: ENT_B, support: 0.8, evidenceBasis: [OBS_1, OBS_2], contradictions: [OBS_4], strength: 0.6, temporalInterval: CANDIDATE_TEMPORAL_SCOPE }),
      relationHypothesis({ id: RH_BC, sourceEntityId: ENT_B, targetEntityId: ENT_C, support: 0.7, evidenceBasis: [OBS_3], strength: 0.6 }),
    ],
  });
}

// Region fixture ---------------------------------------------------------------

export interface RegionOverrides {
  readonly status?: GraphHoleRegion['status'];
  readonly truncated?: boolean;
  readonly limitations?: readonly RegionLimitationCode[];
  readonly providerTruncated?: boolean;
  readonly temporalContext?: TemporalInterval | null;
}

export function region(overrides?: RegionOverrides): GraphHoleRegion {
  const {
    status = 'SATURATED',
    truncated = false,
    limitations = [],
    providerTruncated = false,
    temporalContext = REGION_TEMPORAL_CONTEXT,
  } = overrides ?? {};
  return {
    regionId: REGION,
    identity: {
      caseId: CASE,
      graphVersionId: GVS,
      ...(temporalContext !== null && temporalContext !== undefined
        ? { temporalContext }
        : {}),
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_A, NODE_B, NODE_C],
      edgeIds: [EDGE_AB, EDGE_BC],
      regionPolicyVersion: 'v1',
      semanticRetrievalPolicyVersion: 'v1',
    },
    status,
    truncated,
    limitations: [...limitations],
    maxExpansionRounds: 3,
    maxRegionNodes: 100,
    maxRegionEdges: 250,
    maxContextObservations: 150,
    expansionRounds: 2,
    seedObservationIds: [OBS_1],
    resolvedSeedNodeIds: [NODE_A],
    unresolvedSeedEntityIds: [],
    seedEdgeIds: [],
    nodeIds: [NODE_A, NODE_B, NODE_C],
    edgeIds: [EDGE_AB, EDGE_BC],
    roundRecords: [],
    semanticExpansion: {
      status: 'DISABLED',
      rounds: [],
      totalSemanticResults: 0,
      totalMappedNodes: 0,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated,
    },
  };
}

// Candidate fixture ------------------------------------------------------------

export interface CandidateOverrides {
  readonly qualified?: boolean;
  readonly supportingObservationIds?: readonly string[];
  readonly contradictingObservationIds?: readonly string[];
  readonly supportingHypothesisIds?: readonly string[];
  readonly temporalScope?: TemporalInterval | null;
}

/** The raw PR5 candidate identity for the A-C communication missing edge. */
export function rawCandidate(overrides?: CandidateOverrides): RawGraphHoleCandidate {
  const {
    supportingObservationIds = [OBS_2, OBS_3],
    contradictingObservationIds = [OBS_4],
    supportingHypothesisIds = [
      `atomic:RELATION_HYPOTHESIS:${RH_AB}`,
      `atomic:RELATION_HYPOTHESIS:${RH_BC}`,
    ],
    temporalScope = CANDIDATE_TEMPORAL_SCOPE,
  } = overrides ?? {};
  return {
    candidateId: CAND,
    caseId: CASE,
    graphVersionId: GVS,
    regionId: REGION,
    detectionPolicyVersion: DETECTION_POLICY_VERSION,
    detectorType: 'MISSING_EDGE',
    nodeIds: [NODE_A, NODE_C],
    observedEdgeIds: [],
    expectedRelationshipType: 'communication',
    temporalScope: temporalScope ?? undefined,
    supportingHypothesisIds: [...supportingHypothesisIds],
    supportingObservationIds: [...supportingObservationIds],
    contradictingObservationIds: [...contradictingObservationIds],
    structuralBasis: 'HYPOTHESIS_REFERENCED_NODE',
    detectorMetadata: {
      detectorType: 'MISSING_EDGE',
      pairEvaluations: 3,
      boundReached: false,
    },
    provenance: provenance(SRC_0, 'graph-hole-detection.v1'),
  };
}

// PR5 qualification-consistency note (final audit):
// significance is DERIVED by PR5, never caller-supplied (graph-hole-qualification
// orchestrate.ts calls deriveSignificance(structural, evidence, eiv) with the
// frozen SIGNIFICANCE_WEIGHTS 0.60/0.25/0.15). With the declared components
// below that yields 0.60*0.8 + 0.25*0.7 + 0.15*0.85 = 0.7825 (round6/clamp01
// preserve the value). 0.7825 >= MIN_SIGNIFICANCE 0.70 and structuralScore 0.8 >=
// MIN_STRUCTURAL_SCORE 0.70, so `qualified === true` is a genuine PR5 verdict.
// The `rankingKey` is scenario shorthand (NOT the byte-stable '|'-token PR5 key);
// it is decorative here and never consumed by PR7.
export function qualifiedCandidate(overrides?: CandidateOverrides): QualifiedGraphHoleCandidate {
  const raw = rawCandidate(overrides);
  return {
    rawCandidate: raw,
    qualified: overrides?.qualified ?? true,
    failureReasons: [],
    structuralScore: 0.8,
    evidenceSupportScore: 0.7,
    expectedInformationValue: 0.85,
    significance: 0.7825,
    independentSupportUnitIds: ['sourceContext:ctx-1', 'sourceContext:ctx-2', 'sourceContext:ctx-3'],
    structuralComponents: { patternStrength: 0.8, contextualSupport: 0.7 },
    scoreComponents: {
      evidenceSupport: { supportBreadth: 0.75, supportConsistency: 1, provenanceCompleteness: 1 },
      expectedInformationValue: {
        uncertaintyPotential: 1,
        hypothesisCoverage: 0.5,
        evidenceDiversity: 0.75,
      },
    },
    rankingKey: '0.80:0.70:0.85:0.7825:comms',
    regionStatus: 'SATURATED',
    scoringPolicyVersion: GRAPH_HOLE_SCORING_POLICY_VERSION,
  };
}

// Complete input ---------------------------------------------------------------

export interface Scenario {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly region: GraphHoleRegion;
  readonly qualifiedCandidate: QualifiedGraphHoleCandidate;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly observations: readonly Observation[];
  readonly hypothesisContext: HypothesisContext;
  readonly communities: ReadonlyMap<string, string>;
  /** Atomic derived ids of the two relation hypotheses (known-good refs). */
  readonly atomAB: string;
  readonly atomBC: string;
}

/**
 * A fully-formed, authoritative input for the base scenario. Tests mutate a
 * copy of this scenario when they need a specific failure/edge case.
 */
export function scenario(): Scenario {
  const hypothesis = hypothesisContext();
  const atomAB = `atomic:RELATION_HYPOTHESIS:${RH_AB}`;
  const atomBC = `atomic:RELATION_HYPOTHESIS:${RH_BC}`;
  return {
    caseId: CASE,
    graphVersionId: GVS,
    region: region(),
    qualifiedCandidate: qualifiedCandidate(),
    nodes: [graphNode(), graphNode({ id: NODE_B, entityId: ENT_B, label: 'Beta' }), graphNode({ id: NODE_C, entityId: ENT_C, label: 'Gamma' })],
    edges: [graphEdge(), graphEdge({ id: EDGE_BC, sourceNodeId: NODE_B, targetNodeId: NODE_C })],
    observations: observations(),
    hypothesisContext: hypothesis,
    communities: new Map([
      [NODE_A, uuid(0xa0000001)],
      [NODE_B, uuid(0xa0000001)],
      [NODE_C, uuid(0xa0000002)],
    ]),
    atomAB,
    atomBC,
  };
}