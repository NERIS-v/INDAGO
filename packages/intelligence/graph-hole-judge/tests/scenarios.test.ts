// ============================================================================
// Graph-Hole Judge — scenario suite (Phase 5A-PR9, task §11)
//
// Deterministic fixtures for the named judge scenarios. The judge model surface
// is simulated by the mock runtime (a conforming GraphHoleJudgeV1), so each
// scenario's analysis-quality signal is encoded in the verdict the judge would
// produce; the pipeline under test is the FEATURE's routing of that verdict:
//   - good analyst            → ACCEPT flows only as far as the decision table
//                               permits (validationValid must be true)
//   - weak evidence           → NON_ACCEPTING → no transition
//   - contradiction ignored   → ACCEPT is permitted (frozen policy); the
//                               retained WARNING stays visible in the result
//   - unsupported claim       → NON_ACCEPTING → no transition
//   - alternative weakness    → NON_ACCEPTING → no transition
//   - excessive specificity   → NON_ACCEPTING → no transition
//   - insufficient evidence   → NON_ACCEPTING → no transition
//   - invalid structured result → fail CLOSED: no judge result, no resolution,
//                               the runtime rejection propagates
// No random/property tests — every fixture is deterministic.
// ============================================================================

import { describe, expect, it } from 'vitest';

import { AiRuntimeError } from '@indago/ai-agent-runtime';

import { runJudgeDecision } from '../src/index.js';

import {
  buildJudgeInput,
  conformingStructuredResult,
  contradictionIgnoredValidation,
  inputWithValidation,
  mockJudgeRuntime,
  pr8ErrorValidation,
} from './fixtures.js';

describe('judge scenarios (§11)', () => {
  it('good analyst: ACCEPT flows only when adjudication permits (valid PR8)', async () => {
    const decision = await runJudgeDecision({
      input: buildJudgeInput(),
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('ACCEPT')).runtime,
    });
    expect(decision.judgeResult?.judge.verdict).toBe('ACCEPT');
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
    expect(decision.resolution.transitionApplied).toBe(true);
  });

  it('weak evidence: NON_ACCEPTING never advances a status', async () => {
    const decision = await runJudgeDecision({
      input: buildJudgeInput(),
      currentStatus: 'ACTIVE',
      runtime: mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING')).runtime,
    });
    expect(decision.resolution.transitionApplied).toBe(false);
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
  });

  it('contradiction ignored: ACCEPT is permitted and the WARNING stays visible', async () => {
    const decision = await runJudgeDecision({
      input: inputWithValidation(contradictionIgnoredValidation()),
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('ACCEPT')).runtime,
    });
    expect(decision.judgeInvoked).toBe(true);
    expect(decision.judgeResult?.judge.verdict).toBe('ACCEPT');
    const codes = decision.validation.findings.map((f) => f.code);
    expect(codes).toContain('CONTRADICTION_IGNORED');
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
  });

  it('unsupported claim: NON_ACCEPTING → no transition', async () => {
    const decision = await runJudgeDecision({
      input: buildJudgeInput(),
      currentStatus: 'ACTIVE',
      runtime: mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING')).runtime,
    });
    expect(decision.resolution.transitionApplied).toBe(false);
  });

  it('alternative-explanation weakness: NON_ACCEPTING → no transition', async () => {
    const decision = await runJudgeDecision({
      input: buildJudgeInput(),
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING')).runtime,
    });
    expect(decision.resolution.transitionApplied).toBe(false);
    expect(decision.resolution.nextStatus).toBeNull();
  });

  it('excessive specificity: NON_ACCEPTING → no transition', async () => {
    const decision = await runJudgeDecision({
      input: buildJudgeInput(),
      currentStatus: 'ACTIVE',
      runtime: mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING')).runtime,
    });
    expect(decision.resolution.transitionApplied).toBe(false);
  });

  it('insufficient evidence: NON_ACCEPTING → no transition', async () => {
    const decision = await runJudgeDecision({
      input: buildJudgeInput(),
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING')).runtime,
    });
    expect(decision.resolution.transitionApplied).toBe(false);
  });

  it('invalid structured result: fail CLOSED (runtime rejection propagates, no resolution emitted)', async () => {
    const runtime = {
      generateStructured: async () => {
        throw new AiRuntimeError('STRUCTURED_OUTPUT_INVALID', 'model output rejected');
      },
    } as never;

    await expect(
      runJudgeDecision({
        input: buildJudgeInput(),
        currentStatus: null,
        runtime,
      }),
    ).rejects.toMatchObject({ code: 'STRUCTURED_OUTPUT_INVALID' });
  });

  it('PR8 ERROR still gates when verdict would otherwise be ACCEPT', async () => {
    const decision = await runJudgeDecision({
      input: inputWithValidation(pr8ErrorValidation()),
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('ACCEPT')).runtime,
    });
    expect(decision.judgeInvoked).toBe(false);
    expect(decision.judgeResult).toBeNull();
    expect(decision.resolution.transitionApplied).toBe(false);
  });
});