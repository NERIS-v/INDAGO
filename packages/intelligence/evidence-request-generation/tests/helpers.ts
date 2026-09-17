// ============================================================================
// PR17 unit-test fixtures (hand-built, closed-world)
//
// Builds a deterministic closed-world package that produces a REAL non-empty
// PR14 classification, REAL PR15 competing explanations and a REAL PR16
// ER-split set (the default world yields 2 PR15 explanations + 1 PR16 SUPPORTED
// explanation). PR17 tests exercise the certified chain through the real
// generators, not mocks.
// ============================================================================

import type {
  EntityHypothesis,
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
} from '@indago/contracts';
import { classifyGap } from '@indago/gap-classification';
import type {
  GapClassificationInput,
  GapClassificationResult,
} from '@indago/gap-classification';
import { generateCompetingExplanations } from '@indago/competing-explanations';
import type { CompetingExplanationSet } from '@indago/contracts';
import { generateErSplitExplanations } from '@indago/entity-split-analysis';
import type {
  ErSplitExplanationInput,
  ErSplitExplanationSet,
} from '@indago/entity-split-analysis';
import type { AtomicRelationshipHypothesis, HypothesisContext, HypothesisGroup } from '@indago/hypothesis-context';
import type { GraphHoleRegion, RegionLimitationCode, RegionStatus } from '@indago/graph-hole-region';

import type { EvidenceRequestGenerationInput } from '../src/index.js';

export const INVESTIGATION_ID = '550e8400-e29b-41d4-a716-446655440000';
export const CASE_ID = '550e8400-e29b-41d4-a716-446655440001';
export const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
export const REGION_ID = 'region-deterministic-sha-1';
export const CANDIDATE_A = 'candidate-sha-a';
export const NODE_A = '550e8400-e29b-41d4-a716-446655440003';
export const NODE_B = '550e8400-e29b-41d4-a716-446655440004';
export const ENTITY_A = '550e8400-e29b-41d4-a716-446655440005';
export const ENTITY_B = '550e8400-e29b-41d4-a716-446655440006';
export const SOURCE_ID = '550e8400-e29b-41d4-a716-446655440008';
export const EVIDENCE_ID = '550e8400-e29b-41d4-a716-44665544000e';
export const CAND_A = '550e8400-e29b-41d4-a716-446655440100';
export const CAND_B = '550e8400-e29b-41d4-a716-446655440101';
export const PAIR_AB = '550e8400-e29b-41d4-a716-446655440200';
export const HYP_AB = '550e8400-e29b-41d4-a716-446655440300';
export const OBS_A = '550e8400-e29b-41d4-a716-446655440400';
export const OBS_B = '550e8400-e29b-41d4-a716-446655440401';
export const GAP_ID = '550e8400-e29b-41d4-a716-446655440500';

export const OBSERVED_AT: ObservedTime = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' };

const PROVENANCE: Provenance = { sourceId: SOURCE_ID, extractor: 'pr17-fixture.v1' };

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
    createdAt?: ObservedTime;
  } = {},
): Observation {
  const created = opts.createdAt ?? OBSERVED_AT;
  return {
    id,
    evidenceId: EVIDENCE_ID,
    sourceId: SOURCE_ID,
    type: opts.type ?? 'RELATIONAL',
    content: `fixture observation ${id}`,
    entityIds: [...(opts.entityIds ?? [])],
    candidateMentions: [],
    strength: 0.8,
    provenance: PROVENANCE,
    eventTime: opts.eventTime,
    validityInterval: opts.validityInterval,
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
} = {}): HypothesisContext {
  const atomics = opts.atomics ?? [];
  const groups: HypothesisGroup[] = atomics.length
    ? [{
        groupId: 'group-sha-1',
        componentId: 'component-sha-1',
        atomicHypotheses: atomics,
        sharedNodeIds: [NODE_A, NODE_B],
        canonicalEntityCount: 2,
        truncated: false,
        truncatedReason: null,
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
      truncatedGroups: 0,
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
    qualified: true,
    failureReasons: [],
    structuralScore: 0.5,
    evidenceSupportScore: 0.6,
    expectedInformationValue: 0.3,
    significance: 0.3,
    independentSupportUnitIds: [],
    structuralComponents: { patternStrength: 0.5 },
    scoreComponents: {
      evidenceSupport: { supportBreadth: 0, supportConsistency: 0.5, provenanceCompleteness: 0 },
      expectedInformationValue: { uncertaintyPotential: 0.5, hypothesisCoverage: 0, evidenceDiversity: 0 },
    },
    rankingKey: `rk:${raw.candidateId}`,
    regionStatus: 'SATURATED',
    scoringPolicyVersion: 'v2',
  };
}

export interface RegionOptions {
  status?: RegionStatus;
  temporalContext?: TemporalInterval;
  limitations?: readonly RegionLimitationCode[];
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
    truncated: false,
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
  caseId?: string;
  graphVersionId?: string;
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
    classificationPolicyVersion: 'v1',
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
}): CandidatePair {
  return {
    id: opts.id,
    caseId: CASE_ID,
    leftCandidateId: opts.leftCandidateId,
    rightCandidateId: opts.rightCandidateId,
    blockingPasses: ['EXACT_STRONG_IDENTIFIER'],
    createdAt: OBSERVED_AT,
  };
}

export function makeEntityHypothesis(opts: {
  id: string;
  candidatePairId?: string;
  supportingCandidateIds?: readonly string[];
  supportingObservationIds?: readonly string[];
}): EntityHypothesis {
  return {
    id: opts.id,
    caseId: CASE_ID,
    candidatePairId: opts.candidatePairId,
    supportingCandidateIds: [...(opts.supportingCandidateIds ?? [])],
    comparisonStatus: 'RESOLVED_MATCH',
    score: 0.72,
    scoreModelVersion: 'ma09.v1',
    supportingObservationIds: [...(opts.supportingObservationIds ?? [])],
    contradictingObservationIds: [],
    status: 'PROPOSED',
    provenance: PROVENANCE,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}

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

export interface WorldOptions extends InputOptions {
  includeErSplit?: boolean;
}

/**
 * The REAL certified chain over one closed-world package: context +
 * gapClassification (classifyGap) + competingExplanationSet
 * (generateCompetingExplanations) + erSplit input+set
 * (generateErSplitExplanations). Returns everything a PR17 input needs.
 */
export function makeWorld(opts: WorldOptions = {}): {
  context: GapClassificationInput;
  gapClassification: GapClassificationResult;
  competingExplanationSet: CompetingExplanationSet;
  erSplit?: { input: ErSplitExplanationInput; set: ErSplitExplanationSet };
} {
  const dflt = DEFAULT_ER_SPLIT_PARTS;
  const context = makeInput({
    candidate: opts.candidate,
    region: opts.region,
    nodes: opts.nodes,
    edges: opts.edges,
    observations: opts.observations ?? [dflt.obsA, dflt.obsB],
    hypothesisContext: opts.hypothesisContext,
    caseId: opts.caseId,
    graphVersionId: opts.graphVersionId,
  });
  const gapClassification = classifyGap(context);
  const competingExplanationSet = generateCompetingExplanations({
    context,
    gapClassification,
    competingExplanationPolicyVersion: 'v1',
    computedAt: OBSERVED_AT,
  });
  const out: ReturnType<typeof makeWorld> = { context, gapClassification, competingExplanationSet };
  if (opts.includeErSplit !== false) {
    const input: ErSplitExplanationInput = {
      context,
      gapClassification,
      competingExplanationSet,
      candidatePairs: [dflt.pair],
      entityHypotheses: [dflt.hypothesis],
      candidateUniverse: [dflt.candA, dflt.candB],
      erSplitPolicyVersion: 'v1',
      computedAt: OBSERVED_AT,
    };
    out.erSplit = { input, set: generateErSplitExplanations(input) };
  }
  return out;
}

export interface Pr17Options extends WorldOptions {
  gapId?: string;
  includeErSplit?: boolean;
}

/** A complete, valid PR17 input over the real chain (default world). */
export function makePr17Input(opts: Pr17Options = {}): EvidenceRequestGenerationInput {
  const world = makeWorld(opts);
  return {
    gapId: opts.gapId ?? GAP_ID,
    context: world.context,
    gapClassification: world.gapClassification,
    competingExplanationSet: world.competingExplanationSet,
    erSplit: world.erSplit,
    policyVersion: 'v1',
    computedAt: OBSERVED_AT,
  };
}