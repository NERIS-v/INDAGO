// ============================================================================
// Graph-Hole Validation test fixtures (Phase 5A-PR8)
//
// Deterministic fixtures: a valid GraphHoleAnalysisContext (built via PR7's
// buildGraphHoleAnalysisContext), a conforming GraphHoleAnalysisV1, and a
// stamped GraphHoleAnalysisResult. Tests mutate a copy to force each specific
// failure/edge case.
//
// The base scenario is the PR7 MISSING_EDGE candidate A-C over the region.
//   Supporting observations: OBS_2, OBS_3   Contradicting: OBS_4
//   Supporting hypotheses:   atomAB, atomBC
//
// Reuse: the deterministic PR7 test scenario (fixtures + scenario builder) is
// shared across both packages via relative import — PR8 validates PR7 output,
// so it exercises the exact authoritative input PR7 consumed. The context and
// its digest are rebuilt at runtime (never hard-coded).
// ============================================================================

import {
  buildGraphHoleAnalysisContext,
  canonicalStringify,
  GraphHoleAnalysisV1Schema,
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
  type GraphHoleAnalysisResult,
} from '@indago/graph-hole-analysis';
import {
  CASE,
  CAND,
  GVS,
  OBS_2,
  OBS_3,
  OBS_4,
  REGION,
  scenario,
} from '../../graph-hole-analysis/tests/fixtures.js';
import { sha256Hex } from '../src/sha256.js';

export {
  CASE,
  CAND,
  GVS,
  OBS_1,
  OBS_2,
  OBS_3,
  OBS_4,
  OBS_5,
  REGION,
  SRC_0,
  SRC_1,
  SRC_2,
  EDGE_AB,
  EDGE_BC,
  NODE_A,
  NODE_B,
  NODE_C,
  ENT_A,
  ENT_B,
  ENT_C,
} from '../../graph-hole-analysis/tests/fixtures.js';

/**
 * Re-serialize a modified context so that the serialized string stays
 * consistent with the context (required by the context binding check).
 * Uses the same PR7 canonical serialization contract: the profile is
 * the context with counts.serializedContextChars zeroed.
 */
export function reSerialize(context: ReturnType<typeof buildBaseScenario>['context']): string {
  return canonicalStringify({
    ...context,
    counts: { ...context.counts, serializedContextChars: 0 },
  });
}

/** Rebuild PR7's scenario + bounded context deterministically. */
export function buildBaseScenario() {
  const sc = scenario();
  const { context, serialized, contextSha256 } = buildGraphHoleAnalysisContext({
    caseId: sc.caseId,
    graphVersionId: sc.graphVersionId,
    qualifiedCandidate: sc.qualifiedCandidate,
    region: sc.region,
    nodes: sc.nodes,
    edges: sc.edges,
    observations: sc.observations,
    hypothesisContext: sc.hypothesisContext,
    communities: sc.communities,
  });
  return { sc, context, serialized, contextSha256 };
}

/** Build a validated (parses through Zod) analysis payload over the scenario. */
export function validAnalysis(base: ReturnType<typeof buildBaseScenario>) {
  const { sc } = base;
  const payload = {
    candidateAssessment: 'WEAKLY_SUPPORTED',
    missingRelationship: {
      expectedRelationshipType: 'communication',
      direction: 'SOURCE_TO_TARGET',
      assessment: 'CONSISTENT_WITH_GAP',
      supportingObservationIds: [OBS_2],
      contradictingObservationIds: [OBS_4],
      supportingHypothesisIds: [sc.atomAB, sc.atomBC],
      groupedHypothesisId: null,
    },
    supportingObservationIds: [OBS_2, OBS_3],
    contradictingObservationIds: [OBS_4],
    supportingHypothesisIds: [sc.atomAB],
    groupedHypothesisId: null,
    alternativeExplanations: [],
    reasoning: [
      {
        id: 'R1',
        kind: 'STRUCTURAL_SIGNAL',
        statement: 'The supplied graph is a chain with no direct edge between its endpoints.',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        referencedHypothesisIds: [sc.atomAB],
      },
      {
        id: 'R2',
        kind: 'HYPOTHESIS',
        statement: 'Two grouped atomics jointly cover the expected direct relationship.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [sc.atomAB, sc.atomBC],
      },
    ],
    recommendedEvidence: [
      {
        evidenceType: 'COMMUNICATION',
        rationale: 'Direct records would confirm or rule out the expected contact.',
        supportingObservationIds: [OBS_2],
      },
    ],
    uncertainty: {
      rating: 'MEDIUM',
      note: 'Sparse independent observations.',
    },
    warnings: [
      { code: 'EVIDENCE_SPARSE', message: 'Few independent observations.' },
      { code: 'CONTRADICTIONS_PRESENT', message: 'Supplied context contains an explicit contradiction.' },
    ],
  };
  return GraphHoleAnalysisV1Schema.parse(payload);
}

/** A fully-stamped GraphHoleAnalysisResult tied to the base context. */
export function validResult(
  base: ReturnType<typeof buildBaseScenario>,
  analysisOverrides?: Partial<Record<string, unknown>>,
): GraphHoleAnalysisResult {
  const analysis = validAnalysis(base);
  return {
    analysis: {
      ...analysis,
      ...(analysisOverrides ?? {}),
    } as GraphHoleAnalysisResult['analysis'],
    candidateId: CAND,
    caseId: CASE,
    graphVersionId: GVS,
    regionId: REGION,
    analysisPolicyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
    schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
    contextSha256: base.contextSha256,
    execution: {
      requestId: 'req-0000-0000',
      provider: 'ollama',
      model: 'test-model',
      runtimePolicyVersion: 'v2',
      promptVersion: 'graph-hole-analysis-v1',
      schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
      policyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
      latencyMs: 5,
      retryCount: 0,
      finishReason: 'stop',
      inputTokens: 50,
      outputTokens: 90,
      totalTokens: 140,
    },
  };
}

/**
 * Produce a valid result whose contextSha256 matches a re-serialized
 * (modified) context. Used by tests that mutate the context and need
 * the result's digest to stay consistent.
 */
export function validResultForSerialized(
  base: ReturnType<typeof buildBaseScenario>,
  serialized: string,
  analysisOverrides?: Partial<Record<string, unknown>>,
): GraphHoleAnalysisResult {
  const analysis = validAnalysis(base);
  return {
    analysis: {
      ...analysis,
      ...(analysisOverrides ?? {}),
    } as GraphHoleAnalysisResult['analysis'],
    candidateId: CAND,
    caseId: CASE,
    graphVersionId: GVS,
    regionId: REGION,
    analysisPolicyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
    schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
    contextSha256: sha256Hex(serialized),
    execution: {
      requestId: 'req-0000-0000',
      provider: 'ollama',
      model: 'test-model',
      runtimePolicyVersion: 'v2',
      promptVersion: 'graph-hole-analysis-v1',
      schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
      policyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
      latencyMs: 5,
      retryCount: 0,
      finishReason: 'stop',
      inputTokens: 50,
      outputTokens: 90,
      totalTokens: 140,
    },
  };
}