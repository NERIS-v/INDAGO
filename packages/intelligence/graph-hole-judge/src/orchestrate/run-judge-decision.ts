// ============================================================================
// Graph-Hole Judge Orchestration (Phase 5A-PR9) — PR8 gate + v2 adjudication
//
// runJudgeDecision wires the two authoritative layers of PR9:
//   1. The PR8 gate — the judge is NEVER called over an analysis with any PR8
//      ERROR (validation.valid !== true). Case A (no findings) and Case B
//      (warnings only, valid === true) run the judge normally; the validation
//      verdict stays visible in the result. Case C (any ERROR) is gated:
//      the judge is not invoked, and the decision resolves deterministically
//      to the safe default (no transition, no acceptance). Severity is never
//      re-interpreted: ERROR means gated, WARNING means not gated.
//   2. adjudicateGraphHoleDecision — the PURE authority over the next status.
//      Under decision-policy v2 it consumes the judge verdict + the judged
//      dimension scores + PR8 valid boolean + PR5 qualification and returns
//      the deterministic resolution (dimension-gated; ACCEPT alone is never
//      sufficient). The judge verdict and dimensions are INPUTS to this layer;
//      the orchestrator applies whatever the frozen decision state returns.
//      No other code ever transitions.
//
// Safe failure: any judge/runtime rejection propagates; no decision result is
// emitted, so no accidental ACCEPT is possible. When gated, judgeVerdict is
// null and adjudication no-ops (nextStatus === currentStatus, no transition).
// ============================================================================

import type { GraphHolePersistenceStatus } from '@indago/contracts';

import type { GraphHoleJudgeInput } from '../contracts/judge-input.js';
import { adjudicateGraphHoleDecision } from '../contracts/decision-state.js';
import type {
  GraphHoleDecisionResolution,
} from '../contracts/decision-state.js';
import type { GraphHoleJudgeResult } from '../contracts/judge-result.js';
import type { ValidatedGraphHoleAnalysis } from '@indago/graph-hole-validation';
import type { AiRuntime } from '@indago/ai-agent-runtime';
import { judgeGraphHole } from '../judgement/judge-executor.js';

/** The only legal reason the judge may be skipped. */
export const JUDGE_GATE_REASON = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
export type JudgeGateReason =
  (typeof JUDGE_GATE_REASON)[keyof typeof JUDGE_GATE_REASON];

export interface RunJudgeDecisionParams {
  /** The closed-world judge input (candidate + analysis + validation + summary). */
  readonly input: GraphHoleJudgeInput;
  /** Current persisted status; null = this hole has never been persisted. */
  readonly currentStatus: GraphHolePersistenceStatus | null;
  /** The AI runtime used only when the PR8 gate passes. */
  readonly runtime: AiRuntime;
}

/** The PR9 decision result: gate outcome + judge result + adjudicated state. */
export interface GraphHoleJudgeDecision {
  /** True when the judge was actually invoked (no PR8 ERROR). */
  readonly judgeInvoked: boolean;
  /** Non-null exactly when the judge was skipped. */
  readonly gatedReason: JudgeGateReason | null;
  /** The judge result; null when gated or when no verdict was produced. */
  readonly judgeResult: GraphHoleJudgeResult | null;
  /** The PR8 verdict, always visible (warnings retained for Case B audit). */
  readonly validation: ValidatedGraphHoleAnalysis;
  /** Deterministic v2-gated adjudication over verdict + judged dimensions. */
  readonly resolution: GraphHoleDecisionResolution;
}

/**
 * Run the PR9 judge + decision pipeline over ONE candidate.
 *
 * Gate: validation.valid must be true. On any PR8 ERROR the judge is NOT called
 * and the resolution is the frozen safe default. On success the verdict + the
 * judged dimensions flow into adjudicateGraphHoleDecision and the returned
 * resolution is authoritative. An AiRuntime rejection propagates (fail-closed:
 * no resolution is produced).
 */
export async function runJudgeDecision(
  params: RunJudgeDecisionParams,
): Promise<GraphHoleJudgeDecision> {
  const { input, currentStatus, runtime } = params;
  const validation = input.validation;
  const candidateQualified = input.candidate.qualified === true;

  if (validation.valid !== true) {
    return {
      judgeInvoked: false,
      gatedReason: JUDGE_GATE_REASON.VALIDATION_ERROR,
      judgeResult: null,
      validation,
      resolution: adjudicateGraphHoleDecision({
        candidateId: input.analysis.candidateId,
        currentStatus,
        judgeVerdict: null,
        judgeDimensions: [],
        candidateQualified,
        validationValid: false,
      }),
    };
  }

  const judgeResult = await judgeGraphHole({ input, runtime });

  return {
    judgeInvoked: true,
    gatedReason: null,
    judgeResult,
    validation,
    resolution: adjudicateGraphHoleDecision({
      candidateId: input.analysis.candidateId,
      currentStatus,
      judgeVerdict: judgeResult.judge.verdict,
      judgeDimensions: judgeResult.judge.dimensions,
      candidateQualified,
      validationValid: true,
    }),
  };
}