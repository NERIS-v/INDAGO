// ============================================================================
// PR16 unit-test fixtures (hand-built, closed-world)
//
// Builds deterministic ErSplitExplanationInput packages. The `gapClassification`
// side is produced by the REAL PR14 classifier (`classifyGap`), so the
// generator's context binding is exercised against genuine PR14 output — and
// the hole candidate, region, nodes, edges, observations and hypothesis
// context mirror the certified PR14/PR15 test vector shapes.
// ============================================================================

import type {
  EventTime,
  GraphEdge,
  GraphNode,
  GraphHoleType,
  Observation,
  ObservedTime,
  Provenance,
  QualifiedGraphHoleCandidate,
  RawGraphHoleCandidate,
  RelationType,
  StructuralBasis,
  TemporalInterval,
  EntityMentionCandidate,
  CandidatePair,
  EntityHypothesis,
  CompetingExplanationSet,
} from '@indago/contracts';
import { classifyGap } from '@indago/gap-classification';
import type { GraphHoleRegion, RegionLimitationCode, RegionStatus } from '@indago/graph-hole-region';
import type {
  AtomicRelationshipHypothesis,
  HypothesisContext,
  HypothesisGroup,
} from '@indago/hypothesis-context';
import type { GapClassificationInput } from '@indago/gap-classification';
import type { ErSplitExplanationInput } from '../src/index.js';

export const INVESTIGATION_ID = '550e8400-e29b-41d4-a716-446655440000';
export const CASE_ID = '550e8400-e29b-41d4-a716-446655440001';
export const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
export const REGION_ID = 'region-deterministic-sha-1';
export const CANDIDATE_A = 'candidate-sha-a';
export const NODE_A = '550e8400-e29b-41d4-a716-446655440003';
export const NODE_B = '550e8400-e29b-41d4-a716-446655440004';
export const NODE_C = '550e8400-e29b-41d4-a716-446655440015';
export const ENTITY_A = '550e8400-e29b-41d4-a716-446655440005';
export const ENTITY_B = '550e8400-e29b-41d4-a716-446655440006';
export const ENTITY_C = '550e8400-e29b-41d4-a716-446655440007';
export const SOURCE_ID = '550e8400-e29b-41d4-a716-446655440008';
export const SOURCE_2 = '550e8400-e29b-41d4-a716-44665544000d';
export const EVIDENCE_ID = '550e8400-e29b-41d4-a716-44665544000e';

// ER universe: mention candidates + pair + hypotheses.
export const CAND_A = '550e8400-e29b-41d4-a716-446655440100';
export const CAND_B = '550e8400-e29b-41d4-a716-446655440101';
export const CAND_C = '550e8400-e29b-41d4-a716-446655440102';
export const CAND_D = '550e8400-e29b-41d4-a716-446655440103';
export const CAND_E = '550e8400-e29b-41d4-a716-446655440104';
export const PAIR_AB = '550e8400-e29b-41d4-a716-446655440200';
export const PAIR_CD = '550e8400-e29b-41d4-a716-446655440201';
export const PAIR_DE = '550e8400-e29b-41d4-a716-446655440202';
export const HYP_AB = '550e8400-e29b-41d4-a716-446655440300';

// Observations.
export const OBS_A = '550e8400-e29b-41d4-a716-446655440400';
export const OBS_B = '550e8400-e29b-41d4-a716-446655440401';
export const OBS_C = '550e8400-e29b-41d4-a716-446655440402';
export const OBS_D = '550e8400-e29b-41d4-a716-446655440403';
export const OBS_OTHER = '550e8400-e29b-41d4-a716-446655440404';

export const OBSERVED_AT: ObservedTime = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' };

const PROVENANCE: Provenance = { sourceId: SOURCE_ID, extractor: 'pr16-fixture.v1' };

export function eventTime(value: string): EventTime {
  return { value, precision: 'exact' };
}

export function temporalInterval(from: string, to?: string): TemporalInterval {
  return {
    validFrom: eventTime(from),
    validTo: to ? eventTime(to) : undefined,
    precision: 'exact',
    semantics: 'observed',
  };
}

export function makeNode(id: string, entityId: string, label: string): GraphNode {
  return {
    id,
    investigationId: INVESTIGATION_ID,
    versionId: GRAPH_VERSION_ID,
    type: 'ENTITY',
    entityId,
    label,
    structuralImportance: 0.6,
    observationCount: 1,
    sourceCount: 1,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}

export const DEFAULT_NODES = [
  makeNode(NODE_A, ENTITY_A, 'Entity A'),
  makeNode(NODE_B, ENTITY_B, 'Entity B'),
];

export function makeObservation(
  id: string,
  opts: {
    entityIds?: readonly string[];
    type?: Observation['type'];
    eventTime?: EventTime;
    validityInterval?: TemporalInterval;
    sourceContextId?: string;
    sourceId?: string;
    createdAt?: ObservedTime;
  } = {},
): Observation {
  const created = opts.createdAt ?? OBSERVED_AT;
  return {
    id,
    evidenceId: EVIDENCE_ID,
    sourceId: opts.sourceId ?? SOURCE_ID,
    type: opts.type ?? 'RELATIONAL',
    content: `fixture observation ${id}`,
    entityIds: [...(opts.entityIds ?? [])],
    candidateMentions: [],
    strength: 0.8,
    provenance: PROVENANCE,
    eventTime: opts.eventTime,
    validityInterval: opts.validityInterval,
    sourceContextId: opts.sourceContextId,
    createdAt: created,
    updatedAt: created,
  };
}

export function makeEdge(from: string, to: string, relationType: RelationType): GraphEdge {
  return {
    id: `${from}:${to}`,
    investigationId: INVESTIGATION_ID,
    versionId: GRAPH_VERSION_ID,
    sourceNodeId: from,
    targetNodeId: to,
    relationType,
    status: 'CONFIRMED',
    strength: 0.8,
    sourceCount: 1,
    observationCount: 1,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}

export function makeAtomic(
  derivedId: string,
  opts: {
    hypothesisType?: AtomicRelationshipHypothesis['hypothesisType'];
    predicate?: string;
    referencedCanonicalEntityIds?: readonly string[];
    supportingObservations?: readonly string[];
    contradictingObservations?: readonly string[];
    contradictingHypothesisIds?: readonly string[];
  } = {},
): AtomicRelationshipHypothesis {
  return {
    derivedId,
    hypothesisType: opts.hypothesisType ?? 'RELATION_HYPOTHESIS',
    subject: { kind: 'canonical_entity', id: ENTITY_A },
    predicate: opts.predicate ?? 'communication',
    object: { kind: 'canonical_entity', id: ENTITY_B },
    referencedCanonicalEntityIds: [...(opts.referencedCanonicalEntityIds ?? [ENTITY_A, ENTITY_B])],
    supportingObservations: [...(opts.supportingObservations ?? [])],
    contradictingObservations: [...(opts.contradictingObservations ?? [])],
    contradictingHypothesisIds: [...(opts.contradictingHypothesisIds ?? [])],
    evidenceSupport: 0.7,
    structuralRelevance: 0.6,
    provenance: PROVENANCE,
    temporalScope: null,
    graphVersion: GRAPH_VERSION_ID,
  };
}

export function makeHypothesisContext(opts: {
  atomics?: readonly AtomicRelationshipHypothesis[];
  truncatedGroups?: number;
} = {}): HypothesisContext {
  const atomics = opts.atomics ?? [];
  const truncatedGroups = opts.truncatedGroups ?? 0;
  const groups: HypothesisGroup[] = atomics.length
    ? [{
        groupId: 'group-sha-1',
        componentId: 'component-sha-1',
        atomicHypotheses: atomics,
        sharedNodeIds: [NODE_A, NODE_B],
        canonicalEntityCount: 2,
        truncated: truncatedGroups > 0,
        truncatedReason: truncatedGroups > 0 ? 'ATOMIC_HYPOTHESES_CAP' : null,
        componentTotals: { atomicHypotheses: atomics.length },
      }]
    : [];
  return {
    policyVersion: 'v1',
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    atomicOrder: { evidenceSupport: 'desc', structuralRelevance: 'desc', derivedHypothesisId: 'asc' },
    atomic: atomics,
    groups,
    accounting: {
      inputRelationHypotheses: atomics.filter((a) => a.hypothesisType === 'RELATION_HYPOTHESIS').length,
      inputEntityHypotheses: atomics.filter((a) => a.hypothesisType === 'ENTITY_HYPOTHESIS').length,
      atomicHypotheses: atomics.length,
      components: groups.length,
      groups: groups.length,
      truncatedGroups,
      isolatedAtomics: 0,
      totalCanonicalNodesAcrossGroups: groups.length ? 2 : 0,
    },
  };
}

export interface CandidateOptions {
  candidateId?: string;
  holeType?: GraphHoleType;
  nodeIds?: readonly string[];
  expectedRelationshipType?: RelationType | null;
  temporalScope?: TemporalInterval;
  structuralBasis?: StructuralBasis;
  supportingHypothesisIds?: readonly string[];
  supportingObservationIds?: readonly string[];
  contradictingObservationIds?: readonly string[];
  structuralScore?: number;
  evidenceSupportScore?: number;
  expectedInformationValue?: number;
  significance?: number;
  independentSupportUnitIds?: readonly string[];
  regionStatus?: RegionStatus;
  qualified?: boolean;
}

export function makeCandidate(opts: CandidateOptions = {}): QualifiedGraphHoleCandidate {
  const raw: RawGraphHoleCandidate = {
    candidateId: opts.candidateId ?? CANDIDATE_A,
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    regionId: REGION_ID,
    detectionPolicyVersion: 'v1',
    detectorType: opts.holeType ?? 'MISSING_EDGE',
    nodeIds: [...(opts.nodeIds ?? [NODE_A, NODE_B])],
    observedEdgeIds: [],
    expectedRelationshipType:
      opts.expectedRelationshipType === undefined ? 'communication' : opts.expectedRelationshipType,
    temporalScope: opts.temporalScope,
    supportingHypothesisIds: [...(opts.supportingHypothesisIds ?? [])],
    supportingObservationIds: [...(opts.supportingObservationIds ?? [])],
    contradictingObservationIds: [...(opts.contradictingObservationIds ?? [])],
    structuralBasis: opts.structuralBasis ?? 'SHARED_HYPOTHESIS_CONTEXT',
    detectorMetadata: { detectorType: opts.holeType ?? 'MISSING_EDGE', pairEvaluations: 2, boundReached: false },
    provenance: PROVENANCE,
  };
  return {
    rawCandidate: raw,
    qualified: opts.qualified ?? true,
    failureReasons: [],
    structuralScore: opts.structuralScore ?? 0.5,
    evidenceSupportScore: opts.evidenceSupportScore ?? 0.6,
    expectedInformationValue: opts.expectedInformationValue ?? 0.3,
    significance: opts.significance ?? 0.3,
    independentSupportUnitIds: [...(opts.independentSupportUnitIds ?? [])],
    structuralComponents: { patternStrength: opts.structuralScore ?? 0.5 },
    scoreComponents: {
      evidenceSupport: { supportBreadth: 0, supportConsistency: 0.5, provenanceCompleteness: 0 },
      expectedInformationValue: { uncertaintyPotential: 0.5, hypothesisCoverage: 0, evidenceDiversity: 0 },
    },
    rankingKey: `rk:${raw.candidateId}`,
    regionStatus: opts.regionStatus ?? 'SATURATED',
    scoringPolicyVersion: 'v2',
  };
}

export interface RegionOptions {
  status?: RegionStatus;
  truncated?: boolean;
  limitations?: readonly RegionLimitationCode[];
  temporalContext?: TemporalInterval;
}

export function makeRegion(opts: RegionOptions = {}): GraphHoleRegion {
  return {
    regionId: REGION_ID,
    identity: {
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      temporalContext: opts.temporalContext,
      seedObservationIds: [],
      nodeIds: [NODE_A, NODE_B],
      edgeIds: [],
      regionPolicyVersion: 'v1',
      semanticRetrievalPolicyVersion: 'v1',
    },
    status: opts.status ?? 'SATURATED',
    truncated: opts.truncated ?? false,
    limitations: [...(opts.limitations ?? [])],
    maxExpansionRounds: 2,
    maxRegionNodes: 100,
    maxRegionEdges: 200,
    maxContextObservations: 50,
    expansionRounds: 0,
    seedObservationIds: [],
    resolvedSeedNodeIds: [],
    unresolvedSeedEntityIds: [],
    seedEdgeIds: [],
    nodeIds: [NODE_A, NODE_B],
    edgeIds: [],
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
      providerTruncated: false,
    },
  };
}

export interface InputOptions {
  candidate?: CandidateOptions;
  region?: RegionOptions;
  nodes?: readonly GraphNode[];
  edges?: readonly GraphEdge[];
  observations?: readonly Observation[];
  hypothesisContext?: HypothesisContext;
  candidateUniverse?: readonly EntityMentionCandidate[];
  candidatePairs?: readonly CandidatePair[];
  entityHypotheses?: readonly EntityHypothesis[];
  caseId?: string;
  graphVersionId?: string;
  classificationPolicyVersion?: GapClassificationInput['classificationPolicyVersion'];
}

export function makeInput(opts: InputOptions = {}): GapClassificationInput {
  return {
    caseId: opts.caseId ?? CASE_ID,
    graphVersionId: opts.graphVersionId ?? GRAPH_VERSION_ID,
    qualifiedCandidate: makeCandidate(opts.candidate),
    region: makeRegion(opts.region),
    nodes: [...(opts.nodes ?? DEFAULT_NODES)],
    edges: [...(opts.edges ?? [])],
    observations: [...(opts.observations ?? [])],
    hypothesisContext: opts.hypothesisContext ?? makeHypothesisContext(),
    classificationPolicyVersion: opts.classificationPolicyVersion ?? 'v1',
    computedAt: OBSERVED_AT,
  };
}

export function makeMentionCandidate(id: string, observationId: string): EntityMentionCandidate {
  return {
    id,
    observationId,
    text: `mention ${id}`,
    start: 0,
    end: 5,
    entityType: 'PERSON',
    extractionMethod: 'GAZETTEER_MATCH',
    canonicalMatchValue: `canonical:${id}`,
    provenance: PROVENANCE,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}

export function makePair(opts: {
  id: string;
  leftCandidateId: string;
  rightCandidateId: string;
  blockingPasses?: CandidatePair['blockingPasses'];
  caseId?: string;
}): CandidatePair {
  return {
    id: opts.id,
    caseId: opts.caseId ?? CASE_ID,
    leftCandidateId: opts.leftCandidateId,
    rightCandidateId: opts.rightCandidateId,
    blockingPasses: opts.blockingPasses ?? ['EXACT_STRONG_IDENTIFIER'],
    createdAt: OBSERVED_AT,
  };
}

export function makeEntityHypothesis(opts: {
  id: string;
  candidatePairId?: string;
  comparisonStatus?: EntityHypothesis['comparisonStatus'];
  score?: number;
  status?: EntityHypothesis['status'];
  supportingCandidateIds?: readonly string[];
  supportingObservationIds?: readonly string[];
  contradictingObservationIds?: readonly string[];
  caseId?: string;
}): EntityHypothesis {
  return {
    id: opts.id,
    caseId: opts.caseId ?? CASE_ID,
    candidatePairId: opts.candidatePairId,
    supportingCandidateIds: [...(opts.supportingCandidateIds ?? [])],
    comparisonStatus: opts.comparisonStatus ?? 'RESOLVED_MATCH',
    score: opts.score ?? 0.72,
    scoreModelVersion: 'ma09.v1',
    supportingObservationIds: [...(opts.supportingObservationIds ?? [])],
    contradictingObservationIds: [...(opts.contradictingObservationIds ?? [])],
    status: opts.status ?? 'PROPOSED',
    provenance: PROVENANCE,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}

/**
 * Default ER-split world: fragment-compatible A/B pair with distinct canonical
 * entities on opposite boundary nodes, strong-identifier blocking pass,
 * RESOLVED_MATCH hypothesis at 0.72 with overlapping temporal intervals.
 */
export const DEFAULT_ER_SPLIT_PARTS = (() => {
  const obsA = makeObservation(OBS_A, { entityIds: [ENTITY_A], validityInterval: temporalInterval('2020-01-01') });
  const obsB = makeObservation(OBS_B, { entityIds: [ENTITY_B], validityInterval: temporalInterval('2020-06-01') });
  const candA = makeMentionCandidate(CAND_A, OBS_A);
  const candB = makeMentionCandidate(CAND_B, OBS_B);
  const pair = makePair({ id: PAIR_AB, leftCandidateId: CAND_A, rightCandidateId: CAND_B });
  const hypothesis = makeEntityHypothesis({
    id: HYP_AB,
    candidatePairId: PAIR_AB,
    supportingCandidateIds: [CAND_A, CAND_B],
    supportingObservationIds: [OBS_A, OBS_B],
  });
  return { obsA, obsB, candA, candB, pair, hypothesis };
})();

export interface ErSplitOptions extends InputOptions {
  competingExplanationSet?: CompetingExplanationSet;
  erSplitPolicyVersion?: 'v1';
}

/** Build a PR16 input with the REAL PR14 classification for the same context. */
export function makeErSplitInput(opts: ErSplitOptions = {}): ErSplitExplanationInput {
  const dflt = DEFAULT_ER_SPLIT_PARTS;
  const observations = [...(opts.observations ?? [dflt.obsA, dflt.obsB])];
  const candidateUniverse = [...(opts.candidateUniverse ?? [dflt.candA, dflt.candB])];
  const candidatePairs = [...(opts.candidatePairs ?? [dflt.pair])];
  const entityHypotheses = [...(opts.entityHypotheses ?? [dflt.hypothesis])];
  const context = makeInput({
    candidate: opts.candidate,
    region: opts.region,
    nodes: opts.nodes,
    edges: opts.edges,
    observations,
    hypothesisContext: opts.hypothesisContext,
    caseId: opts.caseId,
    graphVersionId: opts.graphVersionId,
    classificationPolicyVersion: opts.classificationPolicyVersion,
  });
  return {
    context,
    gapClassification: classifyGap(context),
    competingExplanationSet: opts.competingExplanationSet,
    candidatePairs,
    entityHypotheses,
    candidateUniverse,
    erSplitPolicyVersion: opts.erSplitPolicyVersion ?? 'v1',
    computedAt: OBSERVED_AT,
  };
}

/** A PR15-consistent competing set with the real classification projection. */
export function makeCompetingSet(opts: {
  graphHoleId?: string;
  type?: CompetingExplanationSet['classification']['type'];
  status?: CompetingExplanationSet['classification']['status'];
  contextSha256?: string;
}): CompetingExplanationSet {
  const classification = classifyGap(makeInput());
  return {
    policyVersion: 'v1',
    graphHoleId: opts.graphHoleId ?? classification.graphHoleId,
    classification: {
      type: opts.type === undefined ? classification.type : opts.type,
      status: opts.status ?? classification.status,
      classificationPolicyVersion: 'v1',
    },
    contextSha256: opts.contextSha256 ?? 'a'.repeat(64),
    explanations: [],
    explanationCount: 0,
    truncated: false,
    generatedAt: OBSERVED_AT,
  } as unknown as CompetingExplanationSet;
}