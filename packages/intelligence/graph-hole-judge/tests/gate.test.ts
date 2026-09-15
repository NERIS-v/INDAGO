// ============================================================================
// Graph-Hole Judge — orchestration gate tests (Phase 5A-PR9, task §5/§6)
//
// The PR8 gate (Cases A/B/C):
//   Case A — valid, no findings            → judge runs normally
//   Case B — valid, warnings only          → judge runs normally, warnings stay
//                                             visible in the returned validation
//   Case C — any ERROR                     → judge is NOT invoked; decision
//                                             resolves to the deterministic
//                                             non-accepting safe default
//   Severity is never re-interpreted: ERROR → gate, WARNING → proceed.
//
// Contradiction-warning regression (§6): a retained CONTRADICTION_IGNORED
// WARNING must not silently block the judge; it must be exposed in the
// decision result (never removed/rewritten), and the judge verdict ACCEPT
// remains legal under the frozen policy (adjudication authority decides).
// ============================================================================

import { describe, expect, it, vi } from 'vitest';

import {
  JUDGE_GATE_REASON,
  runJudgeDecision,
} from '../src/index.js';

import {
  buildJudgeInput,
  conformingStructuredResult,
  contradictionIgnoredValidation,
  inputWithValidation,
  mockJudgeRuntime,
  pr8ErrorValidation,
} from './fixtures.js';

describe('runJudgeDecision (PR8 gate + adjudication)', () => {
  it('Case A: valid with no findings → judge invoked, resolution from verdict', async () => {
    const input = buildJudgeInput();
    const runRuntime = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const decision = await runJudgeDecision({
      input,
      currentStatus: null,
      runtime: runRuntime.runtime,
    });

    expect(decision.judgeInvoked).toBe(true);
    expect(decision.gatedReason).toBeNull();
    expect(decision.judgeResult?.judge.verdict).toBe('ACCEPT');
    expect(decision.validation.valid).toBe(true);
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
    expect(decision.resolution.transitionApplied).toBe(true);
    expect(runRuntime.requests).toHaveLength(1);
  });

  it('Case B: warnings only (valid=true) → judge invoked, warnings remain visible', async () => {
    const input = inputWithValidation(contradictionIgnoredValidation());
    const runRuntime = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const decision = await runJudgeDecision({
      input,
      currentStatus: null,
      runtime: runRuntime.runtime,
    });

    expect(decision.judgeInvoked).toBe(true);
    expect(decision.gatedReason).toBeNull();
    expect(decision.validation.findings.some((f) => f.code === 'CONTRADICTION_IGNORED')).toBe(true);
    // The warning is NOT stripped from the audit surface.
    expect(decision.validation.summary.warningCount).toBe(1);
    expect(runRuntime.requests).toHaveLength(1);
  });

  it('Case C: any PR8 ERROR → judge NOT invoked, deterministic non-accepting', async () => {
    const input = inputWithValidation(pr8ErrorValidation());
    const spyRuntime = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const decision = await runJudgeDecision({
      input,
      currentStatus: null,
      runtime: spyRuntime.runtime,
    });

    expect(decision.judgeInvoked).toBe(false);
    expect(decision.gatedReason).toBe(JUDGE_GATE_REASON.VALIDATION_ERROR);
    expect(decision.judgeResult).toBeNull();
    // The judge must not be called unnecessarily.
    expect(spyRuntime.requests).toHaveLength(0);
    // Safe default: no transition, no acceptance, no auto-REJECTED.
    expect(decision.resolution.transitionApplied).toBe(false);
    expect(decision.resolution.nextStatus).toBeNull();
    expect(decision.resolution.invariantViolations).toEqual([]);
  });

  it('Case C: gated even when ANOTHER finding is a warning (severity is not re-interpreted)', async () => {
    const validation = pr8ErrorValidation();
    const gated = {
      ...validation,
      findings: [
        ...validation.findings,
        {
          code: 'CONTRADICTION_IGNORED' as const,
          severity: 'WARNING' as const,
          path: 'analysis.missingRelationship.contradictingObservationIds',
          message: 'retained warning',
        },
      ],
      summary: { errorCount: 1, warningCount: 1, checkedCategories: 15 },
    };
    const input = inputWithValidation(gated);
    const spyRuntime = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const decision = await runJudgeDecision({
      input,
      currentStatus: null,
      runtime: spyRuntime.runtime,
    });

    expect(decision.gatedReason).toBe(JUDGE_GATE_REASON.VALIDATION_ERROR);
    expect(decision.judgeInvoked).toBe(false);
    expect(decision.validation.findings.some((f) => f.severity === 'WARNING')).toBe(true);
    expect(spyRuntime.requests).toHaveLength(0);
  });

  it('safe-failure default: a NON_ACCEPTING verdict never auto-changes a persisted status', async () => {
    const input = buildJudgeInput();
    const runRuntime = mockJudgeRuntime(conformingStructuredResult('NON_ACCEPTING'));

    const decision = await runJudgeDecision({
      input,
      currentStatus: 'ACTIVE',
      runtime: runRuntime.runtime,
    });

    expect(decision.judgeInvoked).toBe(true);
    expect(decision.resolution.transitionApplied).toBe(false);
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
    expect(decision.resolution.assessmentType).toBeNull();
  });

  it('adjudication is the sole authority: ACCEPT verdict + valid PR8 → legal transition', async () => {
    const input = buildJudgeInput();
    const runRuntime = mockJudgeRuntime(conformingStructuredResult('ACCEPT'));

    const decision = await runJudgeDecision({
      input,
      currentStatus: 'REJECTED',
      runtime: runRuntime.runtime,
    });

    // REJECTED → ACTIVE is the only legal revival path; the judge verdict
    // merely feeds the decision table.
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
    expect(decision.resolution.assessmentType).toBe('REVIVAL');
    expect(decision.resolution.transitionApplied).toBe(true);
  });

  it('gates before the LLM call (spy used above): ARRANGE-VERIFY no extra judge call', () => {
    // Explicit guard: a failed valid check must not reach the runtime at all.
    const input = inputWithValidation(pr8ErrorValidation());
    const generateStructured = vi.fn();
    const runtime = {
      generateStructured,
    } as never;
    return runJudgeDecision({
      input,
      currentStatus: null,
      runtime,
    }).then((decision: unknown) => {
      expect((decision as { judgeInvoked: boolean }).judgeInvoked).toBe(false);
      expect(generateStructured).not.toHaveBeenCalled();
    });
  });
});