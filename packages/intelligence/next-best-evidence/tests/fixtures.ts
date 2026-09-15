// ============================================================================
// Next-Best-Evidence Runtime — Test Fixtures (Phase 5A-PR10)
//
// Deterministic, closed-world gap inputs for the PR10 tests. UUIDs are fixed
// (deterministic across runs). Fixture objects exercise the runtime surfaces,
// not a "true" upstream pipeline — upstream production shapes are preserved via
// the imported contract types; object literals are cast to those types so the
// tests focus on PR10 behavior.
// ============================================================================

import type { QualifiedGraphHoleCandidate } from '@indago/contracts';
import type { GraphHoleAnalysisV1, RecommendedEvidence } from '@indago/graph-hole-analysis';
import type { GraphHoleDecisionResolution } from '@indago/graph-hole-judge';
import type { ValidatedGraphHoleAnalysis } from '@indago/graph-hole-validation';
import type {
  NextBestEvidenceGapInput,
  Pr10AtomicHypothesis,
  Pr10Observation,
} from '../src/types.js';

export const INVESTIGATION_ID = '11111111-1111-4111-8111-111111111111';
export const GAP_ID = '22222222-2222-4222-8222-222222222222';
export const CASE_ID = '33333333-3333-4333-8333-333333333333';
export const GRAPH_VERSION_ID = '44444444-4444-4444-8444-444444444444';
export const SOURCE_ID = 'dddddddd-dddd-4ddd-8ddd-dddd00000001';
export const NODE_ID = 'eeeeeeee-eeee-4eee-8eee-eeee00000001';

/** Canonical hypothesis UUIDs (the competing explanations). */
export const H1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaa00000001';
export const H2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaa00000002';
export const H3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaa00000003';
export const H4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaa00000004';
/** Invented hypothesis UUID — never present in the bounded context. */
export const INVENTED_H = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa999';

/** Observation UUIDs present in the bounded context. */
export const OBS1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbb00000001';
export const OBS2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbb00000002';
export const OBS3 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbb00000003';
/** Invented observation UUID — never present in the bounded context. */
export const INVENTED_OBS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbb00000099';

export const EVIDENCE_IDS = [
  'cccccccc-cccc-4ccc-8ccc-cccc00000001',
  'cccccccc-cccc-4ccc-8ccc-cccc00000002',
  'cccccccc-cccc-4ccc-8ccc-cccc00000003',
] as const;

export function relDerived(uuid: string): string {
  return `atomic:RELATION_HYPOTHESIS:${uuid}`;
}
export function entDerived(uuid: string): string {
  return `atomic:ENTITY_HYPOTHESIS:${uuid}`;
}

export const DEFAULT_COMPETING_DERIVED = [relDerived(H1), relDerived(H2), relDerived(H3)];

// ============================================================================
// Upstream producers (fixture-shaped)
// ============================================================================

export function rawCandidateFixture(candidateId = 'cand-1'): QualifiedGraphHoleCandidate {
  return {
    rawCandidate: {
      candidateId,
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionId: 'region-1',
      detectionPolicyVersion: 'v1',
      detectorType: 'MISSING_EDGE',
      nodeIds: [NODE_ID],
      observedEdgeIds: [],
      expectedRelationshipType: null,
      supportingHypothesisIds: DEFAULT_COMPETING_DERIVED,
      supportingObservationIds: [],
      contradictingObservationIds: [],
      structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
      detectorMetadata: { detectorType: 'MISSING_EDGE', pairEvaluations: 3, boundReached: false },
      provenance: { sourceId: SOURCE_ID, extractor: 'graph-hole-detection.v1' },
    },
    qualified: true,
    failureReasons: [],
    structuralScore: 0.8,
    evidenceSupportScore: 0.7,
    expectedInformationValue: 0.6,
    significance: 0.5,
    independentSupportUnitIds: [],
    structuralComponents: { patternStrength: 0.8, connectivitySupport: 0.7 },
    scoreComponents: {
      evidenceSupport: { supportBreadth: 0.5, supportConsistency: 0.5, provenanceCompleteness: 0.5 },
      expectedInformationValue: { uncertaintyPotential: 0.5, hypothesisCoverage: 0.5, evidenceDiversity: 0.5 },
    },
    rankingKey: 'rank-cand-1',
    regionStatus: 'SATURATED',
  } as unknown as QualifiedGraphHoleCandidate;
}

export function analysisFixture(
  recommendedEvidence: readonly RecommendedEvidence[],
  options: { alternativeDerivedIds?: readonly string[] } = {},
): GraphHoleAnalysisV1 {
  const altIds = options.alternativeDerivedIds ?? [relDerived(H3)];
  return {
    candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
    missingRelationship: {
      expectedRelationshipType: null,
      direction: 'UNKNOWN',
      assessment: 'CONSISTENT_WITH_GAP',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      supportingHypothesisIds: [relDerived(H1), relDerived(H2)],
      groupedHypothesisId: null,
    },
    supportingObservationIds: [],
    contradictingObservationIds: [],
    supportingHypothesisIds: [relDerived(H1), relDerived(H2)],
    groupedHypothesisId: null,
    alternativeExplanations: [...altIds].map((id) => ({
      title: 'alternative explanation',
      description: 'A competing plausible interpretation.',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      referencedHypothesisIds: [id],
      uncertainty: 0.6,
    })),
    reasoning: [
      {
        id: 'R1',
        kind: 'STRUCTURAL_SIGNAL',
        statement: 'Expected relationship is missing.',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ],
    recommendedEvidence: recommendedEvidence.map((r) => ({ ...r })),
    uncertainty: { rating: 'MEDIUM', note: null },
    warnings: [],
  } as unknown as GraphHoleAnalysisV1;
}

export function validatedFixture(valid = true): ValidatedGraphHoleAnalysis {
  return {
    valid,
    findings: valid ? [] : [{ code: 'INVALID_ANALYSIS_REFERENCE' as const, severity: 'ERROR' as const, path: 'recommendedEvidence[0]', message: 'bad reference' }],
    summary: { errorCount: valid ? 0 : 1, warningCount: 0, checkedCategories: 3 },
  };
}

export function decisionFixture(overrides: {
  passed?: boolean;
  nextStatus?: string;
} = {}): GraphHoleDecisionResolution {
  return {
    candidateId: 'cand-1',
    nextStatus: overrides.nextStatus ?? 'ACTIVE',
    transitionApplied: true,
    assessmentType: 'QUALIFICATION',
    invariantViolations: [],
    evaluation: {
      verdict: 'ACCEPT',
      dimensionScores: [],
      hardFloorChecks: [],
      qualityFloorChecks: [],
      overallScore: 1,
      passed: overrides.passed ?? true,
      failureReasons: [],
      decisionPolicyVersion: 'v2',
    },
    decisionPolicyVersion: 'v2',
  } as unknown as GraphHoleDecisionResolution;
}

export function atomicsFixture(
  overrides: Partial<Pr10AtomicHypothesis> = {},
): Pr10AtomicHypothesis[] {
  const base: Pr10AtomicHypothesis[] = [
    { derivedId: relDerived(H1), supportingObservationIds: [OBS1], contradictingObservationIds: [], temporalScope: null },
    { derivedId: relDerived(H2), supportingObservationIds: [], contradictingObservationIds: [], temporalScope: null },
    { derivedId: relDerived(H3), supportingObservationIds: [OBS2], contradictingObservationIds: [], temporalScope: null },
  ];
  if (Object.keys(overrides).length > 0) {
    return base.map((atomic) => ({ ...atomic, ...overrides }));
  }
  return base;
}

export function observationsFixture(): Pr10Observation[] {
  return [
    { id: OBS1, evidenceId: EVIDENCE_IDS[0] },
    { id: OBS2, evidenceId: EVIDENCE_IDS[1] },
    { id: OBS3, evidenceId: EVIDENCE_IDS[2] },
  ];
}

/** A convenience factory for one recommended-evidence record. */
export function recommendation(
  evidenceType: 'DOCUMENT' | 'RECORD' | 'TESTIMONY' | 'PHYSICAL' | 'DIGITAL' | 'FINANCIAL' | 'COMMUNICATION' | 'OTHER',
  discriminatesAmongIds: readonly string[],
  options: { rationale?: string; supportingObservationIds?: readonly string[] } = {},
): RecommendedEvidence {
  return {
    evidenceType,
    rationale: options.rationale ?? 'Advisory rationale for requesting this evidence.',
    supportingObservationIds: options.supportingObservationIds ?? [OBS1],
    discriminatesAmongIds: [...discriminatesAmongIds],
  };
}

export function gapInput(
  overrides: Partial<NextBestEvidenceGapInput> = {},
): NextBestEvidenceGapInput {
  return {
    gapId: GAP_ID,
    candidate: rawCandidateFixture(),
    analysis: analysisFixture([]),
    validation: validatedFixture(),
    decision: decisionFixture(),
    hypothesisContext: atomicsFixture(),
    observations: observationsFixture(),
    ...overrides,
  } as NextBestEvidenceGapInput;
}