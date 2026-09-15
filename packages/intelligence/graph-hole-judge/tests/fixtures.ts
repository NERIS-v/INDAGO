// ============================================================================
// Graph-Hole Judge — shared test fixtures (Phase 5A-PR9)
//
// Reuses the PR7/PR8 base scenario (MISSING_EDGE candidate A-C with
// supporting OBS_2/OBS_3 and contradicting OBS_4) so judge tests exercise the
// exact same closed-world data the analyst + validator were tested on. The
// validation verdict is produced by the REAL PR8 validator where possible;
// synthetic verdicts are used only where a specific PR8 finding code is
// required (gate Case C, contradiction-warning regression).
//
// The mock AiRuntime records every LLMRequest it receives and returns a
// caller-supplied structured result — determinism tests therefore measure the
// feature's own post-processing/serialization/stamping/adjudication, not live
// LLM behavior.
// ============================================================================

import type {
  AiRuntime,
  LLMExecutionMetadata,
  LLMRequest,
  LLMStructuredResult,
} from '@indago/ai-agent-runtime';
import type { GraphHoleAnalysisResult } from '@indago/graph-hole-analysis';
import { validateGraphHoleAnalysis } from '@indago/graph-hole-validation';

import type {
  GraphHoleAnalysisContextCompleteness,
  GraphHoleJudgeContextSummary,
  GraphHoleJudgeInput,
} from '../src/index.js';
import type { GraphHoleJudgeV1 } from '../src/index.js';
import { GraphHoleJudgeV1Schema } from '../src/index.js';
import { OBS_4 } from '../../graph-hole-analysis/tests/fixtures.js';

import {
  buildBaseScenario,
  validResult,
} from '../../graph-hole-validation/tests/fixtures.js';

// Re-export the shared scenario identity so tests can assert it.
export {
  buildBaseScenario,
  validResult,
} from '../../graph-hole-validation/tests/fixtures.js';
export { CASE, CAND, GVS, REGION, OBS_2, OBS_4 } from '../../graph-hole-analysis/tests/fixtures.js';

export type BaseScenario = ReturnType<typeof buildBaseScenario>;

/** Bounded context summary derived from the PR7 context (authoritative fields). */
export function contextSummaryOf(base: BaseScenario): GraphHoleJudgeContextSummary {
  const context = base.context;
  const completeness: GraphHoleAnalysisContextCompleteness = {
    semanticRetrievalTruncated: context.completeness.semanticRetrievalTruncated,
    regionLimited: context.completeness.regionLimited,
    observationContextLimited: context.completeness.observationContextLimited,
    hypothesisContextLimited: context.completeness.hypothesisContextLimited,
    hypothesisGroupingTruncated: context.completeness.hypothesisGroupingTruncated,
    temporalContextLimited: context.completeness.temporalContextLimited,
    contextBudgetLimited: context.completeness.contextBudgetLimited,
  };
  return {
    caseId: context.caseId,
    graphVersionId: context.graphVersionId,
    regionId: context.regionId,
    completeness,
    observationCount: context.observations.length,
    hypothesisCount: context.atomicHypotheses.length,
    groupCount: context.groups.length,
    structuralSignalCount: context.structuralSignals.length,
  };
}

/**
 * Build a fully wired legal judge input: the PR5 qualified candidate, the PR7
 * analysis result, the REAL PR8 validation verdict over (analysis, context,
 * serialized), and the derived context summary.
 */
export function buildJudgeInput(
  base: BaseScenario = buildBaseScenario(),
  analysisResult: GraphHoleAnalysisResult = validResult(base),
): GraphHoleJudgeInput {
  const validation = validateGraphHoleAnalysis(
    analysisResult,
    base.context,
    base.serialized,
  );
  return {
    candidate: base.sc.qualifiedCandidate,
    analysis: analysisResult,
    validation,
    contextSummary: contextSummaryOf(base),
  };
}

/** Wire an explicit validation verdict into an otherwise-legal input. */
export function inputWithValidation(
  validation: GraphHoleJudgeInput['validation'],
  base: BaseScenario = buildBaseScenario(),
  analysisResult: GraphHoleAnalysisResult = validResult(base),
): GraphHoleJudgeInput {
  return {
    candidate: base.sc.qualifiedCandidate,
    analysis: analysisResult,
    validation,
    contextSummary: contextSummaryOf(base),
  };
}

// ============================================================================
// Synthetic PR8 verdicts (used ONLY where a specific finding code is needed)
// ============================================================================

/** Case C gate verdict: one deterministic ERROR finding. */
export function pr8ErrorValidation(): GraphHoleJudgeInput['validation'] {
  return {
    valid: false,
    findings: [
      {
        code: 'INVALID_ANALYSIS_REFERENCE',
        severity: 'ERROR',
        path: 'analysis.supportingObservationIds[1]',
        referenceId: '00000000-0000-4b7f-0000-00000000ffff',
        message: 'Referenced observation id is not present in the supplied context.',
      },
    ],
    summary: { errorCount: 1, warningCount: 0, checkedCategories: 15 },
  };
}

/** Case B verdict: valid, with a retained CONTRADICTION_IGNORED WARNING. */
export function contradictionIgnoredValidation(): GraphHoleJudgeInput['validation'] {
  return {
    valid: true,
    findings: [
      {
        code: 'CONTRADICTION_IGNORED',
        severity: 'WARNING',
        path: 'analysis.missingRelationship.contradictingObservationIds',
        referenceId: OBS_4,
        message: 'A supplied contradiction is not addressed in the analysis.',
      },
    ],
    summary: { errorCount: 0, warningCount: 1, checkedCategories: 15 },
  };
}

// ============================================================================
// Judge output fixtures (the mock "model" response)
// ============================================================================

/**
 * A conforming GraphHoleJudgeV1. Deliberately returned with dimensions in a
 * NON-canonical order so executor tests can prove the feature re-sorts them
 * deterministically by dimension name.
 */
const SHUFFLED_DIMENSIONS: GraphHoleJudgeV1['dimensions'] = [
  { dimension: 'UNCERTAINTY_CALIBRATION', score: 0.8, rationale: 'Uncertainty matches sparse evidence.' },
  { dimension: 'EVIDENCE_GROUNDING', score: 0.9, rationale: 'Cited observations are in the supplied context.' },
  { dimension: 'ALTERNATIVE_COVERAGE', score: 0.6, rationale: 'Candidate alternatives are weighed.' },
  { dimension: 'GAP_ASSESSMENT_QUALITY', score: 0.8, rationale: 'Gap assessment is grounded.' },
  { dimension: 'REASONING_COHERENCE', score: 0.7, rationale: 'Reasoning follows the supplied evidence.' },
  { dimension: 'EPISTEMIC_DISCIPLINE', score: 1, rationale: 'No forbidden epistemic claims.' },
];

/** Expected canonical (sorted-by-name) dimension order after feature stamping. */
export const SORTED_DIMENSIONS: readonly GraphHoleJudgeV1['dimensions'][number][] = [
  { dimension: 'ALTERNATIVE_COVERAGE', score: 0.6, rationale: 'Candidate alternatives are weighed.' },
  { dimension: 'EPISTEMIC_DISCIPLINE', score: 1, rationale: 'No forbidden epistemic claims.' },
  { dimension: 'EVIDENCE_GROUNDING', score: 0.9, rationale: 'Cited observations are in the supplied context.' },
  { dimension: 'GAP_ASSESSMENT_QUALITY', score: 0.8, rationale: 'Gap assessment is grounded.' },
  { dimension: 'REASONING_COHERENCE', score: 0.7, rationale: 'Reasoning follows the supplied evidence.' },
  { dimension: 'UNCERTAINTY_CALIBRATION', score: 0.8, rationale: 'Uncertainty matches sparse evidence.' },
];

export function judgeV1(overrides: Partial<GraphHoleJudgeV1> = {}): GraphHoleJudgeV1 {
  return {
    verdict: 'ACCEPT',
    dimensions: SHUFFLED_DIMENSIONS.map((d) => ({ ...d })),
    rationale: 'The analysis is well-grounded over the supplied validated context.',
    ...overrides,
  };
}

export function structuredResult(
  judge: GraphHoleJudgeV1,
  metadata: LLMExecutionMetadata = EXECUTION_METADATA,
): LLMStructuredResult<GraphHoleJudgeV1> {
  return { data: judge, rawText: '', metadata };
}

/** Stable, safe runtime metadata (no clock, no randomness). */
export const EXECUTION_METADATA: LLMExecutionMetadata = {
  runtimePolicyVersion: 'v2',
  provider: 'ollama',
  model: 'test-model',
  requestId: 'test-request-pr9-1',
  promptVersion: 'graph-hole-judge-v1',
  schemaVersion: 'graph-hole-judge-v1',
  policyVersion: 'v1',
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:01.000Z',
  latencyMs: 1000,
  finishReason: 'stop',
  retryCount: 0,
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
};

/** A minimal in-memory AiRuntime double that records requests. */
export interface MockJudgeRuntime {
  readonly runtime: AiRuntime;
  readonly requests: LLMRequest[];
  readonly result: LLMStructuredResult<GraphHoleJudgeV1>;
}

/** Seed the judge schema once so the mock result is provably conforming. */
export function conformingStructuredResult(
  verdict: 'ACCEPT' | 'NON_ACCEPTING' = 'ACCEPT',
): LLMStructuredResult<GraphHoleJudgeV1> {
  return structuredResult(GraphHoleJudgeV1Schema.parse(judgeV1({ verdict })));
}

export function mockJudgeRuntime(
  result: LLMStructuredResult<GraphHoleJudgeV1> = conformingStructuredResult(),
): MockJudgeRuntime {
  const requests: LLMRequest[] = [];
  const generateStructured = async (
    request: LLMRequest,
    _schema: unknown,
  ): Promise<LLMStructuredResult<GraphHoleJudgeV1>> => {
    requests.push(request);
    return result;
  };
  const runtime = {
    config: {},
    provider: {} as never,
    capabilities: {
      generate: true,
      generateStructured: true,
      structuredOutput: true,
      nativeJsonSchema: true,
      healthCheck: true,
    },
    generate: async () => {
      throw new Error('mock: generate() must not be called by the judge');
    },
    generateStructured,
    healthCheck: async () => ({ ok: true }),
  } as unknown as AiRuntime;
  return { runtime, requests, result };
}

/** Snapshot the request the executor sent (system prompt + canonical payload). */
export function lastRequest(mock: MockJudgeRuntime): LLMRequest {
  if (mock.requests.length !== 1) {
    throw new Error(`expected exactly one judge request, got ${mock.requests.length}`);
  }
  return mock.requests[0];
}