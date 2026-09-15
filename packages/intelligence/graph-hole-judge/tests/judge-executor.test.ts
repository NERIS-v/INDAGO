// ============================================================================
// Graph-Hole Judge — executor core tests (Phase 5A-PR9, task §11/§12/§13)
//
// Verifies the judge executor over the frozen closed-world contract:
//   - exactly ONE generateStructured call, feature-stamped identity + judgment
//     digest (judgedContextSha256 === analysis.contextSha256)
//   - deterministic dimension sorting by name regardless of model ordering
//   - request assembly: static system prompt + canonical payload user message
//   - authority enforcement (INPUT_AUTHORITY_MISMATCH /
//     INPUT_UNQUALIFIED_CANDIDATE) BEFORE any LLM call
//   - FAIL-CLOSED on invalid/absent structured results (no invented ACCEPT)
//   - untransformed AiRuntimeError propagation (no feature-level wrapping,
//     no silent retry)
//   - input immutability (deep-frozen inputs survive a successful judge)
// ============================================================================

import { describe, expect, it } from 'vitest';

import { AiRuntimeError } from '@indago/ai-agent-runtime';

import {
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
  GraphHoleJudgeError,
  judgeGraphHole,
} from '../src/index.js';
import { GRAPH_HOLE_JUDGE_SYSTEM_PROMPT } from '../src/prompts/judge-prompt.js';

import {
  buildJudgeInput,
  conformingStructuredResult,
  EXECUTION_METADATA,
  judgeV1,
  lastRequest,
  mockJudgeRuntime,
  SORTED_DIMENSIONS,
  structuredResult,
} from './fixtures.js';

const OTHER_ID = '00000000-0000-4000-0000-00000000ffff';

describe('judgeGraphHole (executor)', () => {
  it('issues exactly one generateStructured call and stamps feature identity', async () => {
    const input = buildJudgeInput();
    const mock = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const result = await judgeGraphHole({ input, runtime: mock.runtime });

    expect(mock.requests).toHaveLength(1);
    expect(result.candidateId).toBe(input.analysis.candidateId);
    expect(result.caseId).toBe(input.analysis.caseId);
    expect(result.graphVersionId).toBe(input.analysis.graphVersionId);
    expect(result.regionId).toBe(input.analysis.regionId);
    expect(result.judgedContextSha256).toBe(input.analysis.contextSha256);
    expect(result.judgePolicyVersion).toBe(GRAPH_HOLE_JUDGE_POLICY_VERSION);
    expect(result.judgeSchemaVersion).toBe(GRAPH_HOLE_JUDGE_SCHEMA_VERSION);
    expect(result.execution.requestId).toBe(EXECUTION_METADATA.requestId);
    expect(result.execution.provider).toBe('ollama');
    expect(result.execution.finishReason).toBe('stop');
  });

  it('sorts dimensions by name regardless of model ordering (deterministic stamp)', async () => {
    // judgeV1() ships dimensions in a deliberately non-canonical order.
    expect(judgeV1().dimensions.map((d) => d.dimension)).not.toEqual(
      SORTED_DIMENSIONS.map((d) => d.dimension),
    );

    const mock = mockJudgeRuntime(conformingStructuredResult());
    const result = await judgeGraphHole({
      input: buildJudgeInput(),
      runtime: mock.runtime,
    });

    expect(result.judge.dimensions).toEqual(SORTED_DIMENSIONS);
  });

  it('sends the static system prompt + canonical payload as messages[0]/[1]', async () => {
    const input = buildJudgeInput();
    const mock = mockJudgeRuntime(conformingStructuredResult());
    await judgeGraphHole({ input, runtime: mock.runtime });

    const request = lastRequest(mock);
    expect(request.messages).toHaveLength(2);
    expect(request.messages?.[0]).toEqual({
      role: 'system',
      content: GRAPH_HOLE_JUDGE_SYSTEM_PROMPT,
    });
    expect(request.messages?.[1]?.role).toBe('user');

    const payload = JSON.parse(String(request.messages?.[1]?.content)) as Record<string, unknown>;
    expect(payload.judgedContextSha256).toBe(input.analysis.contextSha256);
    expect((payload.validation as { valid: boolean }).valid).toBe(true);
    expect((payload.candidate as { candidateId: string }).candidateId).toBe(
      input.analysis.candidateId,
    );
  });

  it('uses the frozen judge policy/schema/prompt version fields on the request', async () => {
    const mock = mockJudgeRuntime(conformingStructuredResult());
    await judgeGraphHole({ input: buildJudgeInput(), runtime: mock.runtime });

    const request = lastRequest(mock);
    expect(request.policyVersion).toBe(GRAPH_HOLE_JUDGE_POLICY_VERSION);
    expect(request.schemaVersion).toBe(GRAPH_HOLE_JUDGE_SCHEMA_VERSION);
  });

  it('rejects an unqualified candidate before any LLM call (INPUT_UNQUALIFIED_CANDIDATE)', async () => {
    const base = buildJudgeInput();
    const mock = mockJudgeRuntime(conformingStructuredResult());
    const input = { ...base, candidate: { ...base.candidate, qualified: false } };

    let caught: unknown;
    try {
      await judgeGraphHole({ input, runtime: mock.runtime });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GraphHoleJudgeError);
    expect((caught as GraphHoleJudgeError).code).toBe('INPUT_UNQUALIFIED_CANDIDATE');
    expect(mock.requests).toHaveLength(0);
  });

  it('rejects an authority mismatch before any LLM call (INPUT_AUTHORITY_MISMATCH)', async () => {
    const base = buildJudgeInput();
    const mock = mockJudgeRuntime(conformingStructuredResult());
    const input = { ...base, analysis: { ...base.analysis, candidateId: OTHER_ID } };

    let caught: unknown;
    try {
      await judgeGraphHole({ input, runtime: mock.runtime });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GraphHoleJudgeError);
    expect((caught as GraphHoleJudgeError).code).toBe('INPUT_AUTHORITY_MISMATCH');
    expect(mock.requests).toHaveLength(0);
  });

  it('fails closed on an invalid structured result (no invented ACCEPT)', async () => {
    // The runtime is authoritative for schema validation: an invalid payload
    // must surface as a runtime STRUCTURED_OUTPUT_INVALID rejection, and the
    // judge must NOT fabricate a result, verdict, or decision from it.
    const mock = mockJudgeRuntime(
      structuredResult(judgeV1({ verdict: 'NOT_A_VERDICT' as 'ACCEPT' })),
    );
    // Stub the runtime to behave like a real one: invalid schema → throw.
    const runtime = {
      ...(mock.runtime as Record<string, unknown>),
      generateStructured: async () => {
        throw new AiRuntimeError('STRUCTURED_OUTPUT_INVALID', 'schema mismatch');
      },
    } as never;

    await expect(
      judgeGraphHole({ input: buildJudgeInput(), runtime }),
    ).rejects.toMatchObject({ code: 'STRUCTURED_OUTPUT_INVALID' });
  });

  it('propagates runtime provider errors untransformed (no feature-level wrapping, no retry)', async () => {
    const input = buildJudgeInput();
    const mock = mockJudgeRuntime(conformingStructuredResult());
    const runtime = {
      ...(mock.runtime as Record<string, unknown>),
      generateStructured: async () => {
        throw new AiRuntimeError('RATE_LIMITED', 'upstream limited');
      },
    } as never;

    await expect(judgeGraphHole({ input, runtime })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(mock.requests).toHaveLength(0);
  });

  it('passes a NON_ACCEPTING verdict through unchanged', async () => {
    const mock = mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING'));
    const result = await judgeGraphHole({
      input: buildJudgeInput(),
      runtime: mock.runtime,
    });
    expect(result.judge.verdict).toBe('NON_ACCEPTING');
    expect(result.judge.dimensions).toEqual(SORTED_DIMENSIONS);
  });

  it('never mutates its input (deep-frozen inputs survive a successful judge)', async () => {
    const frozen = deepFreeze(buildJudgeInput());
    const mock = mockJudgeRuntime(conformingStructuredResult());

    const result = await judgeGraphHole({ input: frozen, runtime: mock.runtime });
    expect(result.judge.verdict).toBe('ACCEPT');
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}