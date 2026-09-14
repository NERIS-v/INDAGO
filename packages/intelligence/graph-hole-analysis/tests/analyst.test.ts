// ============================================================================
// Graph-Hole Analysis — analyst + runtime integration tests (Phase 5A-PR7)
//
// End-to-end: buildGraphHoleAnalysisContext → analyzeGraphHole → real
// @indago/ai-agent-runtime (Ollama, fetch-stubbed). Verifies the exact request
// body the provider receives: default-model resolution, the converted
// provider-native JSON Schema (no $ref/$defs), the system prompt as message[0],
// and the serialized context as message[1]. Also verifies identity stamping,
// execution metadata mapping, and untransformed error propagation.
// ============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAiRuntime,
  DEFAULT_AI_BUDGETS,
  AiRuntimeError,
  type AiConfig,
} from '@indago/ai-agent-runtime';

import {
  analyzeGraphHole,
  buildGraphHoleAnalysisContext,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
} from '../src/index.js';
import { GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT } from '../src/prompts/system-prompt.js';
import { CASE, CAND, GVS, OBS_2, REGION, scenario } from './fixtures.js';

function runtimeConfig(defaultModel: string): AiConfig {
  return {
    provider: 'ollama',
    defaultModel,
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-key',
      defaultModel,
      timeoutMs: 5_000,
    },
    ollama: { baseUrl: 'http://localhost:11434', defaultModel, timeoutMs: 5_000 },
    budgets: DEFAULT_AI_BUDGETS,
    policyVersion: 'v2',
  };
}

function ollamaChat(content: string) {
  return new Response(
    JSON.stringify({
      model: 'llama3.2',
      message: { role: 'assistant', content },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 5,
      eval_count: 7,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** A fully conforming GraphHoleAnalysisV1 whose references exist in the base context. */
function validAnalysisPayload(sc: { atomAB: string; atomBC: string }): string {
  return JSON.stringify({
    candidateAssessment: 'WEAKLY_SUPPORTED',
    missingRelationship: {
      expectedRelationshipType: 'communication',
      direction: 'SOURCE_TO_TARGET',
      assessment: 'CONSISTENT_WITH_GAP',
      supportingObservationIds: [OBS_2],
      contradictingObservationIds: [],
      supportingHypothesisIds: [sc.atomAB, sc.atomBC],
      groupedHypothesisId: null,
    },
    supportingObservationIds: [OBS_2],
    contradictingObservationIds: [],
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
        referencedHypothesisIds: [],
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
        evidenceType: 'communication-records',
        rationale: 'Direct records would confirm or rule out the expected contact.',
        supportingObservationIds: [OBS_2],
      },
    ],
    uncertainty: {
      rating: 'MEDIUM',
      note: 'Sparse independent observations.',
    },
    warnings: [{ code: 'EVIDENCE_SPARSE', message: 'Few independent observations.' }],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeGraphHole (runtime integration)', () => {
  it('sends the exact provider request body (model, schema, system prompt, serialized context)', async () => {
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

    const mock = vi
      .fn()
      .mockResolvedValue(ollamaChat(validAnalysisPayload(sc)));
    vi.stubGlobal('fetch', mock);

    const runtime = createAiRuntime(runtimeConfig('llama3.2'));
    const result = await analyzeGraphHole({
      context,
      serializedContext: serialized,
      contextSha256,
      candidateId: sc.qualifiedCandidate.rawCandidate.candidateId,
      caseId: sc.caseId,
      graphVersionId: sc.graphVersionId,
      regionId: sc.region.regionId,
      runtime,
    });

    // Exactly one provider call, to Ollama /api/chat.
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    // Default model resolved by the runtime (feature never names a model).
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);

    // Messages: system prompt first, serialized context second — EXACT.
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([
      { role: 'system', content: GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: serialized },
    ]);

    // Provider-native converted schema: no $ref/$defs, strict object, and
    // every top-level property declared.
    const format = body.format as Record<string, unknown>;
    expect(format['$ref']).toBeUndefined();
    expect(format['$defs']).toBeUndefined();
    expect(format['definitions']).toBeUndefined();
    expect(format.type).toBe('object');
    expect(format.additionalProperties).toBe(false);
    const properties = format.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'candidateAssessment',
        'missingRelationship',
        'reasoning',
        'uncertainty',
        'warnings',
      ]),
    );

    // Result: identity stamped by the feature (never echoed by the model),
    // digest passed through, schema/policy versions frozen.
    expect(result.analysis.candidateAssessment).toBe('WEAKLY_SUPPORTED');
    expect(result.candidateId).toBe(CAND);
    expect(result.caseId).toBe(CASE);
    expect(result.graphVersionId).toBe(GVS);
    expect(result.regionId).toBe(REGION);
    expect(result.contextSha256).toBe(contextSha256);
    expect(result.schemaVersion).toBe(GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION);
    expect(result.analysisPolicyVersion).toBe(GRAPH_HOLE_ANALYSIS_POLICY_VERSION);

    // Execution metadata mapped from the runtime.
    expect(result.execution.provider).toBe('ollama');
    expect(result.execution.model).toBe('llama3.2');
    expect(result.execution.finishReason).toBe('stop');
    expect(result.execution.inputTokens).toBe(5);
    expect(result.execution.outputTokens).toBe(7);
    expect(result.execution.totalTokens).toBe(12);
    expect(result.execution.schemaVersion).toBe(GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION);
  });

  it('propagates runtime provider errors untransformed (no feature-level wrapping)', async () => {
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
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 503 })));
    const runtime = createAiRuntime(runtimeConfig('llama3.2'));

    await expect(
      analyzeGraphHole({
        context,
        serializedContext: serialized,
        contextSha256,
        candidateId: CAND,
        caseId: CASE,
        graphVersionId: GVS,
        regionId: REGION,
        runtime,
      }),
    ).rejects.toBeInstanceOf(AiRuntimeError);
  });
});