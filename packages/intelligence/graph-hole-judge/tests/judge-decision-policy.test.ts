// ============================================================================
// Graph-Hole Judge — deterministic acceptance policy tests (5A-PR9 hardening)
//
// The LLM proposes a structured judgement; this deterministic v2 policy decides
// whether an ACCEPT verdict is SUFFICIENT. These tests pin:
//   § acceptance matrix — hard floors (EG 0.70 / ED 0.90 / UC 0.70), quality
//     floors (RC/GQ/AC 0.60), feature-computed overall floor (0.70)
//   § anti-gaming — ACCEPT is never sufficient alone; all-zeros/duplicates/
//     missing/unknown/NaN/out-of-range inputs are rejected; NON_ACCEPTING
//     verdicts are never overridden by perfect dimensions
//   § contradiction policy — PR8 ERROR gates before the judge; a retained
//     WARNING does not silence the gate and warning-only runs still gate
//   § determinism — dimension-order independence + byte-identical output
//   § immutability — the evaluation and the judge input are never mutated
// No random/property tests — every fixture is deterministic. No thresholds are
// compared with approximate equality: floats are compared with exact decimals;
// only the overall-score floor uses an explicit fixed epsilon.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  adjudicateGraphHoleDecision,
  DIMENSION_WEIGHT,
  evaluateJudgeDecision,
  GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
  HARD_FLOOR,
  JUDGE_FAILURE_REASON,
  OVERALL_MIN_SCORE,
  QUALITY_FLOOR,
  type GraphHoleJudgeDimension,
  type GraphHoleJudgeVerdict,
  type JudgeDecisionEvaluation,
} from '../src/index.js';

import {
  buildJudgeInput,
  conformingStructuredResult,
  contradictionIgnoredValidation,
  inputWithValidation,
  mockJudgeRuntime,
  pr8ErrorValidation,
} from './fixtures.js';
import { runJudgeDecision } from '../src/index.js';

type DimName = GraphHoleJudgeDimension['dimension'];

/** Default conforming dimension set (all floors + overall well above min). */
function dimensions(overrides: Partial<Record<DimName, number>> = {}): GraphHoleJudgeDimension[] {
  const base: Record<DimName, number> = {
    EVIDENCE_GROUNDING: 0.90,
    EPISTEMIC_DISCIPLINE: 1.0,
    UNCERTAINTY_CALIBRATION: 0.80,
    REASONING_COHERENCE: 0.80,
    GAP_ASSESSMENT_QUALITY: 0.80,
    ALTERNATIVE_COVERAGE: 0.70,
  };
  for (const [name, score] of Object.entries(overrides)) {
    base[name as DimName] = score;
  }
  return (Object.keys(base) as DimName[]).sort().map((dimension) => ({
    dimension,
    score: base[dimension],
    rationale: `fixture score for ${dimension}`,
  }));
}

function evaluate(
  input: Partial<{
    dimensions: GraphHoleJudgeDimension[];
    verdict: GraphHoleJudgeVerdict | null;
    validationValid: boolean;
    candidateQualified: boolean;
  }> = {},
): JudgeDecisionEvaluation {
  return evaluateJudgeDecision({
    dimensions: input.dimensions ?? dimensions(),
    verdict: input.verdict === undefined ? 'ACCEPT' : input.verdict,
    validationValid: input.validationValid ?? true,
    candidateQualified: input.candidateQualified ?? true,
  });
}

/**
 * Minimum all-floors-passing set: overall == 0.70 exactly.
 * EG .70(.175) + ED .90(.18) + UC .70(.105) + RC .60(.09) + GQ .60(.09) + AC .60(.06) = .70
 */
function minimalPass(): GraphHoleJudgeDimension[] {
  return dimensions({
    EVIDENCE_GROUNDING: 0.70,
    EPISTEMIC_DISCIPLINE: 0.90,
    UNCERTAINTY_CALIBRATION: 0.70,
    REASONING_COHERENCE: 0.60,
    GAP_ASSESSMENT_QUALITY: 0.60,
    ALTERNATIVE_COVERAGE: 0.60,
  });
}

describe('v2 acceptance policy (frozen floors + weights)', () => {
  it('freezes the expected decision policy version v2', () => {
    expect(GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION).toBe('v2');
    expect(evaluate().decisionPolicyVersion).toBe('v2');
  });

  it('freezes hard and quality floors at the documented values', () => {
    expect(HARD_FLOOR.EVIDENCE_GROUNDING).toBe(0.70);
    expect(HARD_FLOOR.EPISTEMIC_DISCIPLINE).toBe(0.90);
    expect(HARD_FLOOR.UNCERTAINTY_CALIBRATION).toBe(0.70);
    expect(QUALITY_FLOOR.REASONING_COHERENCE).toBe(0.60);
    expect(QUALITY_FLOOR.GAP_ASSESSMENT_QUALITY).toBe(0.60);
    expect(QUALITY_FLOOR.ALTERNATIVE_COVERAGE).toBe(0.60);
    expect(OVERALL_MIN_SCORE).toBe(0.70);
  });

  it('freezes weights that sum to exactly 1.00', () => {
    const total = Object.values(DIMENSION_WEIGHT).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 12);
  });
});

describe('acceptance matrix (§16)', () => {
  it('all hard + quality floors pass and overall is feature-computed', () => {
    const r = evaluate();
    expect(r.passed).toBe(true);
    expect(r.failureReasons).toEqual([]);
    expect(r.overallScore).toBeCloseTo(
      0.90 * 0.25 + 0.80 * 0.15 + 1.0 * 0.20 + 0.80 * 0.15 + 0.80 * 0.15 + 0.70 * 0.10,
      12,
    );
    // Feature-computed aggregate — the model never supplies an overallScore.
    expect(r.hardFloorChecks).toHaveLength(3);
    expect(r.qualityFloorChecks).toHaveLength(3);
  });

  it('minimum floors boundary: all at-floor → passes (>= semantics)', () => {
    const r = evaluate({ dimensions: minimalPass() });
    expect(r.passed).toBe(true);
    expect(r.overallScore).toBeGreaterThanOrEqual(0.70);
  });

  it('EVIDENCE_GROUNDING just below 0.70 fails the hard floor', () => {
    const r = evaluate({ dimensions: dimensions({ EVIDENCE_GROUNDING: 0.69 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR);
    expect(r.failureReasons).not.toContain(JUDGE_FAILURE_REASON.JUDGE_EPISTEMIC_DISCIPLINE_BELOW_FLOOR);
  });

  it('EPISTEMIC_DISCIPLINE just below 0.90 fails the hard floor', () => {
    const r = evaluate({ dimensions: dimensions({ EPISTEMIC_DISCIPLINE: 0.89 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_EPISTEMIC_DISCIPLINE_BELOW_FLOOR);
  });

  it('UNCERTAINTY_CALIBRATION just below 0.70 fails the hard floor', () => {
    const r = evaluate({ dimensions: dimensions({ UNCERTAINTY_CALIBRATION: 0.69 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_UNCERTAINTY_CALIBRATION_BELOW_FLOOR);
  });

  it('REASONING_COHERENCE just below 0.60 fails the quality floor', () => {
    const r = evaluate({ dimensions: dimensions({ REASONING_COHERENCE: 0.59 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_REASONING_COHERENCE_BELOW_FLOOR);
  });

  it('GAP_ASSESSMENT_QUALITY just below 0.60 fails the quality floor', () => {
    const r = evaluate({ dimensions: dimensions({ GAP_ASSESSMENT_QUALITY: 0.59 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_GAP_ASSESSMENT_BELOW_FLOOR);
  });

  it('ALTERNATIVE_COVERAGE just below 0.60 fails the quality floor', () => {
    const r = evaluate({ dimensions: dimensions({ ALTERNATIVE_COVERAGE: 0.59 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_ALTERNATIVE_COVERAGE_BELOW_FLOOR);
  });

  it('overall score below 0.70 fails even when reported with valid dims', () => {
    // A single catastrophic dimension (EG 0.0) both fails its hard floor and
    // drags the feature-computed overall below the 0.70 floor.
    const r = evaluate({ dimensions: dimensions({ EVIDENCE_GROUNDING: 0 }) });
    expect(r.overallScore).toBeLessThan(0.70);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_OVERALL_SCORE_BELOW_FLOOR);
    expect(r.passed).toBe(false);
  });
});

describe('anti-gaming (§16)', () => {
  it('five strong dimensions + one catastrophic dimension → blocked', () => {
    const r = evaluate({ dimensions: dimensions({ ALTERNATIVE_COVERAGE: 0.05 }) });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_ALTERNATIVE_COVERAGE_BELOW_FLOOR);
  });

  it('all-zero scores + ACCEPT → blocked on every gate', () => {
    const r = evaluate({
      dimensions: dimensions({
        EVIDENCE_GROUNDING: 0, EPISTEMIC_DISCIPLINE: 0, UNCERTAINTY_CALIBRATION: 0,
        REASONING_COHERENCE: 0, GAP_ASSESSMENT_QUALITY: 0, ALTERNATIVE_COVERAGE: 0,
      }),
    });
    expect(r.passed).toBe(false);
    expect(r.overallScore).toBe(0);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_EPISTEMIC_DISCIPLINE_BELOW_FLOOR);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_OVERALL_SCORE_BELOW_FLOOR);
  });

  it('all-ones + NON_ACCEPTING verdict → verdict reason, never converted', () => {
    const r = evaluate({
      dimensions: dimensions({
        EVIDENCE_GROUNDING: 1, EPISTEMIC_DISCIPLINE: 1, UNCERTAINTY_CALIBRATION: 1,
        REASONING_COHERENCE: 1, GAP_ASSESSMENT_QUALITY: 1, ALTERNATIVE_COVERAGE: 1,
      }),
      verdict: 'NON_ACCEPTING',
    });
    expect(r.passed).toBe(false);
    expect(r.overallScore).toBe(1);
    expect(r.failureReasons).toEqual([JUDGE_FAILURE_REASON.JUDGE_VERDICT_NON_ACCEPTING]);
  });

  it('duplicate dimension → JUDGE_DIMENSION_DUPLICATE, structurally invalid', () => {
    const dup = dimensions({ EVIDENCE_GROUNDING: 0.9 });
    dup.push({ dimension: 'EVIDENCE_GROUNDING', score: 0.95, rationale: 'duplicate gimmick' });
    const r = evaluate({ dimensions: dup });
    expect(r.overallScore).toBeNull();
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_DUPLICATE);
    expect(r.passed).toBe(false);
  });

  it('missing dimension → JUDGE_DIMENSION_MISSING, structurally invalid', () => {
    const subset = dimensions().filter((d) => d.dimension !== 'ALTERNATIVE_COVERAGE');
    const r = evaluate({ dimensions: subset });
    expect(r.overallScore).toBeNull();
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_MISSING);
    expect(r.passed).toBe(false);
  });

  it('unknown dimension name → JUDGE_DIMENSION_UNKNOWN, structurally invalid', () => {
    const unknown = dimensions();
    unknown.push({ dimension: 'WEIGHTED_OVERALL' as DimName, score: 1, rationale: 'gimmick' });
    const r = evaluate({ dimensions: unknown });
    expect(r.overallScore).toBeNull();
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_UNKNOWN);
    expect(r.passed).toBe(false);
  });

  it('NaN dimension score → JUDGE_DIMENSION_INVALID_SCORE (defensive)', () => {
    const bad = dimensions();
    bad[0] = { ...bad[0], score: Number.NaN };
    const r = evaluate({ dimensions: bad });
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_INVALID_SCORE);
    expect(r.overallScore).toBeNull();
    expect(r.passed).toBe(false);
  });

  it('non-finite dimension score → JUDGE_DIMENSION_INVALID_SCORE (defensive)', () => {
    const bad = dimensions();
    bad[0] = { ...bad[0], score: Number.POSITIVE_INFINITY };
    const r = evaluate({ dimensions: bad });
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_INVALID_SCORE);
    expect(r.passed).toBe(false);
  });

  it('out-of-range dimension score → JUDGE_DIMENSION_INVALID_SCORE (defensive)', () => {
    const bad = dimensions();
    bad[0] = { ...bad[0], score: 1.5 };
    const r = evaluate({ dimensions: bad });
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_INVALID_SCORE);
    expect(r.passed).toBe(false);
  });
});

describe('verdict / validation / qualification gates (§8/§10)', () => {
  it('ACCEPT requires validationValid === true (PR8 ERROR gates acceptance)', () => {
    const r = evaluate({ validationValid: false });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_VALIDATION_ERROR);
  });

  it('ACCEPT requires a qualified candidate', () => {
    const r = evaluate({ candidateQualified: false });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_CANDIDATE_NOT_QUALIFIED);
  });

  it('null verdict is never accepted even with perfect dimensions', () => {
    const r = evaluate({ verdict: null });
    expect(r.passed).toBe(false);
  });

  it('contradiction WARNING does not silence the gate (validation valid, warning retained)', async () => {
    const input = inputWithValidation(contradictionIgnoredValidation());
    const decision = await runJudgeDecision({
      input,
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('ACCEPT')).runtime,
    });
    // Warning-only run: judge invoked, gate passes on conforming dimensions.
    expect(decision.judgeInvoked).toBe(true);
    expect(decision.validation.findings.some((f) => f.code === 'CONTRADICTION_IGNORED')).toBe(true);
    expect(decision.resolution.evaluation.passed).toBe(true);
    expect(decision.resolution.nextStatus).toBe('ACTIVE');
  });

  it('PR8 ERROR → judge not invoked, but the deterministic gate still evaluates', async () => {
    const input = inputWithValidation(pr8ErrorValidation());
    const decision = await runJudgeDecision({
      input,
      currentStatus: null,
      runtime: mockJudgeRuntime(conformingStructuredResult('ACCEPT')).runtime,
    });
    expect(decision.judgeInvoked).toBe(false);
    expect(decision.gatedReason).toBe('VALIDATION_ERROR');
    expect(decision.resolution.evaluation.passed).toBe(false);
    expect(decision.resolution.evaluation.failureReasons).toContain(
      JUDGE_FAILURE_REASON.JUDGE_VALIDATION_ERROR,
    );
    expect(decision.resolution.nextStatus).toBeNull();
    expect(decision.resolution.transitionApplied).toBe(false);
  });
});

describe('determinism (§16)', () => {
  it('is independent of dimension input order (canonical iteration)', () => {
    const set = dimensions({ ALTERNATIVE_COVERAGE: 0.62, EPISTEMIC_DISCIPLINE: 0.95 });
    const shuffled = [...set].reverse();
    const a = evaluate({ dimensions: set });
    const b = evaluate({ dimensions: shuffled });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces byte-identical evaluation across identical calls', () => {
    const r1 = evaluate();
    const r2 = evaluate();
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe('immutability (§16)', () => {
  it('deep-freezes the evaluation (no mutation by callers)', () => {
    const r = evaluate();
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.failureReasons)).toBe(true);
    expect(Object.isFrozen(r.dimensionScores)).toBe(true);
    expect(Object.isFrozen(r.hardFloorChecks)).toBe(true);
    expect(Object.isFrozen(r.qualityFloorChecks)).toBe(true);
  });

  it('adjudication never mutates the judge result (original preserved for audit)', () => {
    const input = buildJudgeInput();
    const judged = dimensions();
    const snapshot = JSON.stringify(judged);
    const resolution = adjudicateGraphHoleDecision({
      candidateId: 'cand-1',
      currentStatus: null,
      judgeVerdict: 'ACCEPT',
      judgeDimensions: judged,
      candidateQualified: true,
      validationValid: true,
    });
    expect(JSON.stringify(judged)).toBe(snapshot);
    expect(resolution.evaluation.passed).toBe(true);
    expect(resolution.nextStatus).toBe('ACTIVE');
  });
});

describe('v2 adjudication integration (§8/§14)', () => {
  it('ACCEPT + all gates pass → ACTIVE / QUALIFICATION', () => {
    const r = adjudicateGraphHoleDecision({
      candidateId: 'cand-1',
      currentStatus: null,
      judgeVerdict: 'ACCEPT',
      judgeDimensions: dimensions(),
      candidateQualified: true,
      validationValid: true,
    });
    expect(r.nextStatus).toBe('ACTIVE');
    expect(r.transitionApplied).toBe(true);
    expect(r.assessmentType).toBe('QUALIFICATION');
    expect(r.evaluation.passed).toBe(true);
  });

  it('ACCEPT + a dimension threshold fails → final NON_ACCEPTING with machine-readable reason', () => {
    const r = adjudicateGraphHoleDecision({
      candidateId: 'cand-1',
      currentStatus: null,
      judgeVerdict: 'ACCEPT',
      judgeDimensions: dimensions({ EVIDENCE_GROUNDING: 0.69 }),
      candidateQualified: true,
      validationValid: true,
    });
    expect(r.transitionApplied).toBe(false);
    expect(r.nextStatus).toBeNull();
    expect(r.evaluation.passed).toBe(false);
    expect(r.evaluation.failureReasons).toContain(
      JUDGE_FAILURE_REASON.JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR,
    );
    // Never converts to REJECTED / RESOLVED.
    expect(r.nextStatus).not.toBe('REJECTED');
    expect(r.nextStatus).not.toBe('RESOLVED');
  });

  it('NON_ACCEPTING stays non-accepting even with perfect dimensions', () => {
    const r = adjudicateGraphHoleDecision({
      candidateId: 'cand-1',
      currentStatus: 'ACTIVE',
      judgeVerdict: 'NON_ACCEPTING',
      judgeDimensions: dimensions(),
      candidateQualified: true,
      validationValid: true,
    });
    expect(r.transitionApplied).toBe(false);
    expect(r.nextStatus).toBe('ACTIVE');
    expect(r.evaluation.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_VERDICT_NON_ACCEPTING);
  });

  it('ACCEPT without judge dimensions is fail-closed (structure gate)', () => {
    const r = adjudicateGraphHoleDecision({
      candidateId: 'cand-1',
      currentStatus: null,
      judgeVerdict: 'ACCEPT',
      validationValid: true,
    });
    expect(r.transitionApplied).toBe(false);
    expect(r.evaluation.failureReasons).toContain(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_MISSING);
  });
});

describe('boundary epsilon (§16)', () => {
  it('overall exactly at 0.70 passes (>= with explicit fixed epsilon)', () => {
    const r = evaluate({ dimensions: minimalPass() });
    expect(r.overallScore).toBeGreaterThanOrEqual(0.70 - 1e-9);
    expect(r.passed).toBe(true);
  });

  it('hard-floor boundary uses exact decimal semantics (not approximate)', () => {
    expect(HARD_FLOOR.EVIDENCE_GROUNDING >= 0.70).toBe(true);
    expect(HARD_FLOOR.EPISTEMIC_DISCIPLINE >= 0.90).toBe(true);
  });
});