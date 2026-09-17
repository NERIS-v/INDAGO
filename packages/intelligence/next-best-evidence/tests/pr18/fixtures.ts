// ============================================================================
// PR18 test fixtures (Phase 5A)
//
// Builds a deterministic closed-world package that produces a REAL non-empty
// PR14 classification, REAL PR15 competing explanations, a REAL PR16 ER-split
// set and a REAL PR17 candidate set — then feeds the real PR17 output into the
// PR18 candidate-driven selector. The full PR14->PR15->PR16->PR17->PR18 chain
// is exercised with the actual production generators, never mocks.
// ============================================================================

import type {
  EntityHypothesis,
  EventTime,
  GraphEdge,
  GraphNode,
  Observation,
  ObservedTime,
  Provenance,
  QualifiedGraphHoleCandidate,
  RawGraphHoleCandidate,
  RelationType,
  TemporalInterval,
  EntityMentionCandidate,
  CandidatePair,
  CompetingExplanationSet,
} from '@indago/contracts';
import { classifyGap } from '@indago/gap-classification';
import type { GapClassificationInput, GapClassificationResult } from '@indago/gap-classification';
import { generateCompetingExplanations } from '@indago/competing-explanations';
import { generateErSplitExplanations } from '@indago/entity-split-analysis';
import type {
  ErSplitExplanationInput,
  ErSplitExplanationSet,
} from '@indago/entity-split-analysis';
import { generateCandidateEvidenceRequests } from '@indago/evidence-request-generation';
import type { CandidateEvidenceRequest } from '@indago/evidence-request-generation';
import type { CandidateUtilityContext, CandidateEvidenceSelectionInput } from '../../src/pr18/types.js';

export const INVESTIGATION_ID = '550e8400-e29b-41d4-a716-44665544000f';
export const CASE_ID = '550e8400-e29b-41d4-a716-446655440001';
export const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
export const GAP_ID = '550e8400-e29b-41d4-a716-446655440500';
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

export const OBSERVED_AT: ObservedTime = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' };

const PROVENANCE: Provenance = { sourceId: SOURCE_ID, extractor: 'pr18-fixture.v1' };

function et(value: string): EventTime {
  return { value, precision: 'exact' };
}
function ti(from: string, to?: string): TemporalInterval {
  return {
    validFrom: et(from),
    validTo: to ? et(to) : undefined,
    precision: 'exact',
    semantics: 'observed',
  };
}
function node(id: string, entityId: string, label: string): GraphNode {
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
function obs(id: string, entityIds: readonly string[], validity?: TemporalInterval): Observation {
  return {
    id,
    evidenceId: EVIDENCE_ID,
    sourceId: SOURCE_ID,
    type: 'RELATIONAL',
    content: `fixture ${id}`,
    entityIds: [...entityIds],
    candidateMentions: [],
    strength: 0.8,
    provenance: PROVENANCE,
    validityInterval: validity,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}
function atomic(
  derivedId: string,
  supportingObservations: readonly string[] = [],
  contradictingObservations: readonly string[] = [],
): NonNullable<ReturnType<typeof makeInput>['hypothesisContext']['atomic'][number]> {
  return {
    derivedId,
    hypothesisType: 'RELATION_HYPOTHESIS',
    subject: { kind: 'canonical_entity', id: ENTITY_A },
    predicate: 'communication',
    object: { kind: 'canonical_entity', id: ENTITY_B },
    referencedCanonicalEntityIds: [ENTITY_A, ENTITY_B],
    supportingObservations,
    contradictingObservations,
    contradictingHypothesisIds: [],
    evidenceSupport: 0.7,
    structuralRelevance: 0.6,
    provenance: PROVENANCE,
    temporalScope: null,
    graphVersion: GRAPH_VERSION_ID,
  };
}
function candidate(opts: { nodeIds?: string[]; expectedRelationshipType?: string } = {}): QualifiedGraphHoleCandidate {
  const raw: RawGraphHoleCandidate = {
    candidateId: CANDIDATE_A,
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    regionId: REGION_ID,
    detectionPolicyVersion: 'v1',
    detectorType: 'MISSING_EDGE',
    nodeIds: [...(opts.nodeIds ?? [NODE_A, NODE_B])],
    observedEdgeIds: [],
    expectedRelationshipType: opts.expectedRelationshipType ?? 'communication',
    supportingHypothesisIds: [],
    supportingObservationIds: [],
    contradictingObservationIds: [],
    structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
    detectorMetadata: { detectorType: 'MISSING_EDGE', pairEvaluations: 2, boundReached: false },
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
    rankingKey: 'rk:' + CANDIDATE_A,
    regionStatus: 'SATURATED',
    scoringPolicyVersion: 'v2',
  };
}
function region(): GapClassificationInput['region'] {
  return {
    regionId: REGION_ID,
    identity: {
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      seedObservationIds: [],
      nodeIds: [NODE_A, NODE_B],
      edgeIds: [],
      regionPolicyVersion: 'v1',
      semanticRetrievalPolicyVersion: 'v1',
    },
    status: 'SATURATED',
    truncated: false,
    limitations: [],
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
export function makeInput(opts: { observations?: Observation[]; atomics?: ReturnType<typeof atomic>[]; caseId?: string; graphVersionId?: string } = {}): GapClassificationInput {
  const atomics = opts.atomics ?? [atomic(`atomic:RELATION_HYPOTHESIS:${HYP_AB}`, [OBS_A, OBS_B])];
  return {
    caseId: opts.caseId ?? CASE_ID,
    graphVersionId: opts.graphVersionId ?? GRAPH_VERSION_ID,
    qualifiedCandidate: candidate(),
    region: region(),
    nodes: [node(NODE_A, ENTITY_A, 'A'), node(NODE_B, ENTITY_B, 'B')],
    edges: [],
    observations: opts.observations ?? [obs(OBS_A, [ENTITY_A], ti('2020-01-01')), obs(OBS_B, [ENTITY_B], ti('2020-06-01'))],
    hypothesisContext: {
      policyVersion: 'v1',
      caseId: opts.caseId ?? CASE_ID,
      graphVersionId: opts.graphVersionId ?? GRAPH_VERSION_ID,
      atomicOrder: { evidenceSupport: 'desc', structuralRelevance: 'desc', derivedHypothesisId: 'asc' },
      atomic: atomics,
      groups: atomics.length
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
        : [],
      accounting: {
        inputRelationHypotheses: atomics.filter((a) => a.hypothesisType === 'RELATION_HYPOTHESIS').length,
        inputEntityHypotheses: atomics.filter((a) => a.hypothesisType === 'ENTITY_HYPOTHESIS').length,
        atomicHypotheses: atomics.length,
        components: atomics.length ? 1 : 0,
        groups: atomics.length ? 1 : 0,
        truncatedGroups: 0,
        isolatedAtomics: 0,
        totalCanonicalNodesAcrossGroups: atomics.length ? 2 : 0,
      },
    },
    classificationPolicyVersion: 'v1',
    computedAt: OBSERVED_AT,
  };
}

export interface Chain {
  context: GapClassificationInput;
  gapClassification: GapClassificationResult;
  competingExplanationSet: CompetingExplanationSet;
  erSplit: { input: ErSplitExplanationInput; set: ErSplitExplanationSet };
  candidates: CandidateEvidenceRequest[];
  contextFor18: CandidateUtilityContext;
}

function mention(id: string, observationId: string): EntityMentionCandidate {
  return {
    id,
    observationId,
    text: 'mention ' + id,
    start: 0,
    end: 5,
    entityType: 'PERSON',
    extractionMethod: 'GAZETTEER_MATCH',
    canonicalMatchValue: 'canonical:' + id,
    provenance: PROVENANCE,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}
function pair(o: { id: string; leftCandidateId: string; rightCandidateId: string }): CandidatePair {
  return {
    id: o.id,
    caseId: CASE_ID,
    leftCandidateId: o.leftCandidateId,
    rightCandidateId: o.rightCandidateId,
    blockingPasses: ['EXACT_STRONG_IDENTIFIER'],
    createdAt: OBSERVED_AT,
  };
}
function hyp(o: { id: string; candidatePairId?: string; supportingCandidateIds?: string[]; supportingObservationIds?: string[] }): EntityHypothesis {
  return {
    id: o.id,
    caseId: CASE_ID,
    candidatePairId: o.candidatePairId,
    supportingCandidateIds: [...(o.supportingCandidateIds ?? [])],
    comparisonStatus: 'RESOLVED_MATCH',
    score: 0.72,
    scoreModelVersion: 'ma09.v1',
    supportingObservationIds: [...(o.supportingObservationIds ?? [])],
    contradictingObservationIds: [],
    status: 'PROPOSED',
    provenance: PROVENANCE,
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
  };
}

/**
 * Build the real PR14->PR15->PR16->PR17->PR18 chain over one closed-world
 * package (default world: PR14 CONFIDENT, 2 PR15 explanations, 1 PR16 SUPPORTED).
 */
export function makeChain(opts: { observations?: Observation[]; caseId?: string; graphVersionId?: string } = {}): Chain {
  const context = makeInput(opts);
  const gapClassification = classifyGap(context);
  const competingExplanationSet = generateCompetingExplanations({
    context,
    gapClassification,
    competingExplanationPolicyVersion: 'v1',
    computedAt: OBSERVED_AT,
  });
  const erInput: ErSplitExplanationInput = {
    context,
    gapClassification,
    competingExplanationSet,
    candidatePairs: [pair({ id: PAIR_AB, leftCandidateId: CAND_A, rightCandidateId: CAND_B })],
    entityHypotheses: [hyp({ id: HYP_AB, candidatePairId: PAIR_AB, supportingCandidateIds: [CAND_A, CAND_B], supportingObservationIds: [OBS_A, OBS_B] })],
    candidateUniverse: [mention(CAND_A, OBS_A), mention(CAND_B, OBS_B)],
    erSplitPolicyVersion: 'v1',
    computedAt: OBSERVED_AT,
  };
  const erSplit = { input: erInput, set: generateErSplitExplanations(erInput) };

  const pr17 = generateCandidateEvidenceRequests({
    gapId: GAP_ID,
    context,
    gapClassification,
    competingExplanationSet,
    erSplit,
    policyVersion: 'v1',
    computedAt: OBSERVED_AT,
  });

  const representedExplanations = [
    ...competingExplanationSet.explanations.map((e) => ({
      supportingHypothesisIds: e.supportingHypothesisIds,
      contradictingHypothesisIds: e.contradictingHypothesisIds,
      temporalScope: e.temporalScope,
    })),
    ...erSplit.set.explanations.map((e) => ({
      supportingHypothesisIds: e.hypothesisId ? [`atomic:ENTITY_HYPOTHESIS:${e.hypothesisId}`] : [],
      contradictingHypothesisIds: [],
      temporalScope: null,
    })),
  ];
  const representedExplanationIds = [
    ...competingExplanationSet.explanations.map((e) => e.explanationId),
    ...erSplit.set.explanations.map((e) => e.explanationId),
  ];

  const contextFor18: CandidateUtilityContext = {
    gapTemporalScope: context.qualifiedCandidate.rawCandidate.temporalScope ?? null,
    gapExpectationDerivedIds: context.qualifiedCandidate.rawCandidate.supportingHypothesisIds,
    representedExplanations,
    representedExplanationIds,
    observations: context.observations,
  };

  return { context, gapClassification, competingExplanationSet, erSplit, candidates: pr17.candidateRequests, contextFor18 };
}

export function makePr18Input(opts: { observations?: Observation[]; caseId?: string; graphVersionId?: string } = {}): CandidateEvidenceSelectionInput {
  const chain = makeChain(opts);
  return {
    investigationId: INVESTIGATION_ID,
    gapId: GAP_ID,
    candidateRequests: chain.candidates,
    context: chain.contextFor18,
    policyVersion: 'v1',
    computedAt: OBSERVED_AT,
  };
}