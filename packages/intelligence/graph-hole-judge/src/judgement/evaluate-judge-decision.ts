// ============================================================================
// Graph-Hole Judge — deterministic acceptance evaluation (5A-PR9 hardening)
//
// The production-hardening decision gate determines, from a supplied judge
// result and PR8/PR5 facts, whether a model ACCEPT verdict is SUFFICIENT for
// acceptance. The LLM is a PROPOSER of a structured quality assessment; this
// deterministic policy is the DECIDER.
//
//   knowledge: The model's verdict is never authoritative on its own. The
//   authoritative acceptance condition is the deterministic conjunction:
//     PR8 valid  AND  candidate qualified  AND  all six dimensions present
//     AND  hard floors pass  AND  quality floors pass
//     AND  feature-computed overall score passes
//     AND  verdict === ACCEPT
//   Any failing conjunct makes the final decision NON_ACCEPTING.
//
//   Aggregates: the feature computes every score it uses. No model-supplied
//   overallScore/acceptanceScore/finalScore/confidenceOfAcceptance is ever
//   trusted (the schema carries none; this layer would reject them anyway).
//
//   Defensive structure: this layer re-enforces its own invariants and does
//   NOT assume the runtime or schema is honest — exactly six canonical
//   dimensions, one of each, no unknown names, every score finite and in
//   [0,1]. Structural violations fail the gate with machine-readable reasons.
//
//   Determinism: pure function of its inputs. No I/O, no clock, no AI, no
//   side effects. Iteration order is a fixed canonical (name-sorted) order for
//   byte-equivalent output; the overall score is computed in that order.
//
// Policy version: GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION = 'v2'. This is a
// SUPERSEDING addition over the v1 transition table (v1 verdict-only
// semantics are unchanged for NON_ACCEPTING / no-op / terminal paths).
// ============================================================================

import type { GraphHoleJudgeDimension } from '../contracts/judge-v1.js';
import type { GraphHoleJudgeDimensionName } from '../contracts/judge-v1.js';
import type { GraphHoleJudgeVerdict } from '../contracts/judge-v1.js';
import {
  GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
} from '../contracts/judge-policy.js';

// ============================================================================
// Frozen v2 acceptance policy
// ============================================================================

/** Hard (integrity-critical) dimension floors — all are REQUIRED to pass. */
export const HARD_FLOOR = {
  EVIDENCE_GROUNDING: 0.70, //   hard: cited evidence really present in context
  EPISTEMIC_DISCIPLINE: 0.90, // hard: no forbidden epistemic claims
  UNCERTAINTY_CALIBRATION: 0.70, // hard: stated uncertainty matches evidence
} as const;

/** Quality (excellence) dimension floors — all are REQUIRED to pass. */
export const QUALITY_FLOOR = {
  REASONING_COHERENCE: 0.60, //   quality: reasoning follows the evidence
  GAP_ASSESSMENT_QUALITY: 0.60, // quality: gap assessment is grounded
  ALTERNATIVE_COVERAGE: 0.60, //  quality: alternatives weighed where ambiguous
} as const;

/** Feature-computed overall-score floor; the model cannot supply this. */
export const OVERALL_MIN_SCORE = 0.70;

/**
 * Dimension weights for the feature-computed overall score. Fixed, frozen,
 * and guaranteed to sum to exactly 1.00. The feature computes
 * Σ(score_i × weight_i); the model's own aggregate is never trusted.
 */
export const DIMENSION_WEIGHT = {
  EVIDENCE_GROUNDING: 0.25,
  REASONING_COHERENCE: 0.15,
  EPISTEMIC_DISCIPLINE: 0.20,
  UNCERTAINTY_CALIBRATION: 0.15,
  GAP_ASSESSMENT_QUALITY: 0.15,
  ALTERNATIVE_COVERAGE: 0.10,
} as const;

/** Tiny tolerance for the overall-score floor comparison (FP determinism). */
export const OVERALL_MIN_SCORE_EPSILON = 1e-9;

const CANONICAL_DIMENSIONS: readonly GraphHoleJudgeDimensionName[] = [
  'ALTERNATIVE_COVERAGE',
  'EPISTEMIC_DISCIPLINE',
  'EVIDENCE_GROUNDING',
  'GAP_ASSESSMENT_QUALITY',
  'REASONING_COHERENCE',
  'UNCERTAINTY_CALIBRATION',
];

// ============================================================================
// Machine-readable failure reasons (closed)
// ============================================================================

/**
 * Closed vocabulary of deterministic acceptance-failure reasons. The 5A-PR9
 * hardening names the twelve canonical reasons; JUDGE_DIMENSION_UNKNOWN and
 * JUDGE_DIMENSION_INVALID_SCORE are added for the judge-integrity protective
 * invariants ("no unknown dimension", "no NaN / non-finite / out-of-range
 * score") that the decision layer must re-enforce independently of the schema.
 */
export const JUDGE_FAILURE_REASON = {
  JUDGE_DIMENSION_MISSING: 'JUDGE_DIMENSION_MISSING',
  JUDGE_DIMENSION_DUPLICATE: 'JUDGE_DIMENSION_DUPLICATE',
  JUDGE_DIMENSION_UNKNOWN: 'JUDGE_DIMENSION_UNKNOWN',
  JUDGE_DIMENSION_INVALID_SCORE: 'JUDGE_DIMENSION_INVALID_SCORE',
  JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR: 'JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR',
  JUDGE_EPISTEMIC_DISCIPLINE_BELOW_FLOOR: 'JUDGE_EPISTEMIC_DISCIPLINE_BELOW_FLOOR',
  JUDGE_UNCERTAINTY_CALIBRATION_BELOW_FLOOR: 'JUDGE_UNCERTAINTY_CALIBRATION_BELOW_FLOOR',
  JUDGE_REASONING_COHERENCE_BELOW_FLOOR: 'JUDGE_REASONING_COHERENCE_BELOW_FLOOR',
  JUDGE_GAP_ASSESSMENT_BELOW_FLOOR: 'JUDGE_GAP_ASSESSMENT_BELOW_FLOOR',
  JUDGE_ALTERNATIVE_COVERAGE_BELOW_FLOOR: 'JUDGE_ALTERNATIVE_COVERAGE_BELOW_FLOOR',
  JUDGE_OVERALL_SCORE_BELOW_FLOOR: 'JUDGE_OVERALL_SCORE_BELOW_FLOOR',
  JUDGE_VERDICT_NON_ACCEPTING: 'JUDGE_VERDICT_NON_ACCEPTING',
  JUDGE_VALIDATION_ERROR: 'JUDGE_VALIDATION_ERROR',
  JUDGE_CANDIDATE_NOT_QUALIFIED: 'JUDGE_CANDIDATE_NOT_QUALIFIED',
} as const;
export type GraphHoleJudgeFailureReason =
  (typeof JUDGE_FAILURE_REASON)[keyof typeof JUDGE_FAILURE_REASON];

// ============================================================================
// Evaluation types
// ============================================================================

/** One dimension with its gate metadata as evaluated by the policy. */
export interface GraphHoleJudgeDimensionScoreEval {
  readonly dimension: GraphHoleJudgeDimensionName;
  readonly score: number;
  readonly weight: number;
  /** This dimension's acceptance floor (hard or quality); null = none. */
  readonly floor: number | null;
  /** Whether score is at/above its own floor. */
  readonly floorPassed: boolean;
}

/** One hard-floor check (feature-computed, exact decimals, >= semantics). */
export interface GraphHoleJudgeFloorCheck {
  readonly dimension: GraphHoleJudgeDimensionName;
  readonly score: number;
  readonly floor: number;
  readonly passed: boolean;
}

/** The deterministic acceptance evaluation of one judge result. */
export interface JudgeDecisionEvaluation {
  readonly verdict: GraphHoleJudgeVerdict | null;
  /** Canonical (name-sorted) per-dimension score/floor/weight metadata. */
  readonly dimensionScores: readonly GraphHoleJudgeDimensionScoreEval[];
  /** Hard-floor checks over the three integrity-critical dimensions. */
  readonly hardFloorChecks: readonly GraphHoleJudgeFloorCheck[];
  /** Quality-floor checks over the three excellence dimensions. */
  readonly qualityFloorChecks: readonly GraphHoleJudgeFloorCheck[];
  /** Feature-computed Σ(score×weight); null when structure is invalid. */
  readonly overallScore: number | null;
  /** True only when EVERY conjunct of the v2 acceptance gate holds. */
  readonly passed: boolean;
  /** Machine-readable reasons; empty exactly when passed. */
  readonly failureReasons: readonly GraphHoleJudgeFailureReason[];
  readonly decisionPolicyVersion: typeof GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION;
}

/** Pure inputs the gate consumes (PR9-frozen types, no I/O). */
export interface EvaluateJudgeDecisionInput {
  /** The judge's manifested dimensions; [] when none were produced. */
  readonly dimensions: readonly GraphHoleJudgeDimension[];
  /** The categorical judge verdict (null = no assessment produced). */
  readonly verdict: GraphHoleJudgeVerdict | null;
  /** PR8 valid boolean (errorCount === 0). */
  readonly validationValid: boolean;
  /** PR5 qualification (qualified === true). */
  readonly candidateQualified: boolean;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Deterministically evaluate the acceptance gate over one judge result.
 *
 * Pure: identical inputs → byte-equivalent output. Never calls the model,
 * never reads the model's own aggregates, never mutates the judge record —
 * the caller preserves the original GraphHoleJudgeV1 for audit. The verdict
 * ACCEPT passes only this layer's full conjunction; any failure yields a
 * NON_ACCEPTING result with closed, machine-readable reason(s).
 */
export function evaluateJudgeDecision(
  input: EvaluateJudgeDecisionInput,
): JudgeDecisionEvaluation {
  const reasons: GraphHoleJudgeFailureReason[] = [];

  if (!input.candidateQualified) reasons.push(JUDGE_FAILURE_REASON.JUDGE_CANDIDATE_NOT_QUALIFIED);
  if (!input.validationValid) reasons.push(JUDGE_FAILURE_REASON.JUDGE_VALIDATION_ERROR);
  if (input.verdict === 'NON_ACCEPTING') {
    reasons.push(JUDGE_FAILURE_REASON.JUDGE_VERDICT_NON_ACCEPTING);
  }

  // ---- Defensive structure validation (independent of the schema) ----
  const scores = new Map<GraphHoleJudgeDimensionName, number>();
  const seen = new Set<GraphHoleJudgeDimensionName>();
  let structureValid = true;

  for (const dimension of input.dimensions) {
    if (!CANONICAL_DIMENSIONS.includes(dimension.dimension)) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_UNKNOWN);
      structureValid = false;
      continue;
    }
    if (seen.has(dimension.dimension)) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_DUPLICATE);
      structureValid = false;
      continue;
    }
    seen.add(dimension.dimension);
    if (
      typeof dimension.score !== 'number'
      || !Number.isFinite(dimension.score)
      || dimension.score < 0
      || dimension.score > 1
    ) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_INVALID_SCORE);
      structureValid = false;
      continue;
    }
    scores.set(dimension.dimension, dimension.score);
  }

  for (const dimension of CANONICAL_DIMENSIONS) {
    if (!scores.has(dimension)) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_DIMENSION_MISSING);
      structureValid = false;
    }
  }

  // ---- Gate evaluation (only over a structure-conforming dimension set) ----
  let dimensionScores: readonly GraphHoleJudgeDimensionScoreEval[] = [];
  let hardFloorChecks: readonly GraphHoleJudgeFloorCheck[] = [];
  let qualityFloorChecks: readonly GraphHoleJudgeFloorCheck[] = [];
  let overallScore: number | null = null;

  if (structureValid) {
    dimensionScores = CANONICAL_DIMENSIONS.map((dimension) => {
      const score = scores.get(dimension)!;
      const weight = DIMENSION_WEIGHT[dimension];
      const hardFloor = (Object.keys(HARD_FLOOR) as GraphHoleJudgeDimensionName[]).includes(dimension)
        ? HARD_FLOOR[dimension as keyof typeof HARD_FLOOR]
        : null;
      const qualityFloor = (Object.keys(QUALITY_FLOOR) as GraphHoleJudgeDimensionName[]).includes(dimension)
        ? QUALITY_FLOOR[dimension as keyof typeof QUALITY_FLOOR]
        : null;
      const floor = hardFloor ?? qualityFloor;
      return deepFreeze({
        dimension,
        score,
        weight,
        floor,
        floorPassed: floor === null ? true : score >= floor,
      });
    });

    hardFloorChecks = (Object.keys(HARD_FLOOR) as GraphHoleJudgeDimensionName[])
      .map((dimension) => {
        const score = scores.get(dimension)!;
        const floor = HARD_FLOOR[dimension as keyof typeof HARD_FLOOR];
        return deepFreeze({ dimension, score, floor, passed: score >= floor });
      });
    qualityFloorChecks = (Object.keys(QUALITY_FLOOR) as GraphHoleJudgeDimensionName[])
      .map((dimension) => {
        const score = scores.get(dimension)!;
        const floor = QUALITY_FLOOR[dimension as keyof typeof QUALITY_FLOOR];
        return deepFreeze({ dimension, score, floor, passed: score >= floor });
      });

    // Feature-computed aggregate, fixed canonical order (deterministic).
    let total = 0;
    for (const dimension of CANONICAL_DIMENSIONS) {
      total += scores.get(dimension)! * DIMENSION_WEIGHT[dimension];
    }
    overallScore = total;

    // Per-dimension floor failure reasons (fixed report order, exact `>=`
    // semantics — a score at exactly the floor passes).
    if (scores.get('EVIDENCE_GROUNDING')! < HARD_FLOOR.EVIDENCE_GROUNDING) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR);
    }
    if (scores.get('EPISTEMIC_DISCIPLINE')! < HARD_FLOOR.EPISTEMIC_DISCIPLINE) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_EPISTEMIC_DISCIPLINE_BELOW_FLOOR);
    }
    if (scores.get('UNCERTAINTY_CALIBRATION')! < HARD_FLOOR.UNCERTAINTY_CALIBRATION) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_UNCERTAINTY_CALIBRATION_BELOW_FLOOR);
    }
    if (scores.get('REASONING_COHERENCE')! < QUALITY_FLOOR.REASONING_COHERENCE) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_REASONING_COHERENCE_BELOW_FLOOR);
    }
    if (scores.get('GAP_ASSESSMENT_QUALITY')! < QUALITY_FLOOR.GAP_ASSESSMENT_QUALITY) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_GAP_ASSESSMENT_BELOW_FLOOR);
    }
    if (scores.get('ALTERNATIVE_COVERAGE')! < QUALITY_FLOOR.ALTERNATIVE_COVERAGE) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_ALTERNATIVE_COVERAGE_BELOW_FLOOR);
    }

    if (overallScore < OVERALL_MIN_SCORE - OVERALL_MIN_SCORE_EPSILON) {
      reasons.push(JUDGE_FAILURE_REASON.JUDGE_OVERALL_SCORE_BELOW_FLOOR);
    }
  }

  return deepFreeze({
    verdict: input.verdict,
    dimensionScores,
    hardFloorChecks,
    qualityFloorChecks,
    overallScore,
    passed: input.verdict === 'ACCEPT' && reasons.length === 0,
    failureReasons: reasons,
    decisionPolicyVersion: GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
  });
}