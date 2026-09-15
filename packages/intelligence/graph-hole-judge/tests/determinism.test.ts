// ============================================================================
// Graph-Hole Judge — determinism tests (Phase 5A-PR9, task §12)
//
// identical input + policy + mock runtime response → byte-equivalent
// post-processing: the user payload is canonical (canonicalStringify), the
// stamped judge is sorted by dimension name, the execution envelope is mapped
// deterministically, Zod validation and adjudication are pure. No live LLM
// calls, no randomness, no clock dependence.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  adjudicateGraphHoleDecision,
  buildJudgePayload,
  judgeGraphHole,
} from '../src/index.js';

import {
  buildJudgeInput,
  conformingStructuredResult,
  EXECUTION_METADATA,
  judgeV1,
  mockJudgeRuntime,
  structuredResult,
} from './fixtures.js';

describe('graph-hole judge determinism', () => {
  it('produces a byte-identical user payload for identical inputs', () => {
    const input = buildJudgeInput();
    const p1 = buildJudgePayload(input);
    const p2 = buildJudgePayload(input);
    expect(p2).toBe(p1);
  });

  it('produces byte-equivalent stamped judge + execution for a repeated mock response', async () => {
    const input = buildJudgeInput();
    const run1 = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));
    const run2 = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const result1 = await judgeGraphHole({ input, runtime: run1.runtime });
    const result2 = await judgeGraphHole({ input, runtime: run2.runtime });

    expect(JSON.stringify(result1.judge)).toBe(JSON.stringify(result2.judge));
    expect(JSON.stringify(result1.execution)).toBe(JSON.stringify(result2.execution));
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it('is independent of model dimension ordering after stamping', async () => {
    const input = buildJudgeInput();
    // Two structurally identical judges differing only in dimension ORDER.
    const dims = judgeV1().dimensions;
    const forward = structuredResult(judgeV1(), EXECUTION_METADATA);
    const backward = structuredResult(
      // Deliberately inverted ordering of the same objects.
      { ...judgeV1(), dimensions: [...dims].reverse() },
      EXECUTION_METADATA,
    );

    const a = await judgeGraphHole({ input, runtime: mockJudgeRuntime(forward).runtime });
    const b = await judgeGraphHole({ input, runtime: mockJudgeRuntime(backward).runtime });

    expect(a.judge.dimensions).toEqual(b.judge.dimensions);
    expect(JSON.stringify(a.judge)).toBe(JSON.stringify(b.judge));
  });

  it('adjudication is a pure function of (status, verdict, valid, dimensions, qualified)', () => {
    const judge = judgeV1();
    const input = {
      candidateId: 'cand-1',
      currentStatus: 'ACTIVE' as const,
      judgeVerdict: 'ACCEPT' as const,
      validationValid: true,
      judgeDimensions: judge.dimensions,
      candidateQualified: true,
    };
    const r1 = adjudicateGraphHoleDecision(input);
    const r2 = adjudicateGraphHoleDecision(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.evaluation.passed).toBe(true);
    // ACTIVE + ACCEPT is a stepping-stone reassessment, not a transition.
    expect(r1.assessmentType).toBe('REASSESSMENT');
  });
});