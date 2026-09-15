// ============================================================================
// Graph-Hole Decision-State Contract (Phase 5A-PR9, production hardening)
//
// The DETERMINISTIC state-adjudication layer of PR9. The judge verdict is an
// INPUT to this layer, never the layer itself. Everything here is pure,
// versioned, and testable: no clock of-now, no LLM, no I/O, no persistence.
//
// Decision policy v2 (GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION = 'v2', a
// SUPERSEDING addition to the v1 transition table): an ACCEPT verdict is NEVER
// sufficient alone. The authoritative acceptance gate is the deterministic
// conjunction computed by `evaluateJudgeDecision`:
//   PR8 valid  AND  candidate qualified  AND  all six dimensions present
//   AND  hard floors pass  AND  quality floors pass
//   AND  feature-computed overall score passes  AND  verdict === ACCEPT
// Any failing conjunct → final NON_ACCEPTING with machine-readable
// `failureReasons`. The original GraphHoleJudgeV1 is never mutated.
//
// Semantics (safe-failure default — consequential state changes are reserved
// for human review, per the Phase-4 guidelines that human consequential state
// stays owned by the Lead authority):
//   - A NON_ACCEPTING decision NEVER auto-changes the persisted status. The
//     candidate must not proceed toward ACTIVE without human review.
//   - An ACCEPT verdict promotes a candidate toward ACTIVE ONLY when the full
//     deterministic gate passes AND through legal PR6 transitions
//     (canTransitionGraphHoleStatus). Terminal statuses (SUPERSEDED,
//     RESOLVED) are never re-entered; REJECTED and RESOLVED are never ENTERED
//     automatically by the judge.
//   - ACCEPT on an invalid analysis (validationValid === false) is an
//     invariant violation: the judge contract forbids it, and this layer
//     refuses to act on it (safety net).
// ============================================================================

import type {
  GraphHoleAssessmentType,
  GraphHolePersistenceStatus,
} from '@indago/contracts';
import { canTransitionGraphHoleStatus } from '@indago/contracts';

import type { GraphHoleJudgeDimension } from './judge-v1.js';
import type { GraphHoleJudgeVerdict } from './judge-v1.js';
import {
  GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
} from './judge-policy.js';
import { evaluateJudgeDecision } from '../judgement/evaluate-judge-decision.js';
import type { JudgeDecisionEvaluation } from '../judgement/evaluate-judge-decision.js';

/** Deterministic inputs to the decision adjudication. */
export interface GraphHoleDecisionInput {
  readonly candidateId: string;
  /** Current persisted status; null = this hole has never been persisted. */
  readonly currentStatus: GraphHolePersistenceStatus | null;
  /** Judge verdict; null = no judge assessment has been produced yet. */
  readonly judgeVerdict: GraphHoleJudgeVerdict | null;
  /** PR8 valid boolean (errorCount === 0). */
  readonly validationValid: boolean;
  /**
   * The judge's manifested dimension scores (v2 gate driver). Omitted/[] is
   * fail-closed: ACCEPT without all six dimensions is never accepted.
   */
  readonly judgeDimensions?: readonly GraphHoleJudgeDimension[];
  /** PR5 qualification; omitted defaults to false (fail-closed). */
  readonly candidateQualified?: boolean;
}

/** The deterministic decision resolution for one candidate. */
export interface GraphHoleDecisionResolution {
  readonly candidateId: string;
  /** The applied (next) status; null when no transition is warranted. */
  readonly nextStatus: GraphHolePersistenceStatus | null;
  /** Whether the adjudication applied a legal persistence transition. */
  readonly transitionApplied: boolean;
  /** The PR6 assessment type recorded alongside a transition, when one applies. */
  readonly assessmentType: GraphHoleAssessmentType | null;
  /** Deterministic invariant-violation messages; empty = no violations. */
  readonly invariantViolations: readonly string[];
  /**
   * The deterministic v2 acceptance evaluation (hard/quality floors, overall
   * score, pass/fail + machine-readable failure reasons). Feature-computed.
   */
  readonly evaluation: JudgeDecisionEvaluation;
  readonly decisionPolicyVersion: typeof GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION;
}

/** Immutable no-op resolution (sentinel for safe defaults). */
function noOp(
  input: GraphHoleDecisionInput,
  evaluation: JudgeDecisionEvaluation,
  violations: readonly string[] = [],
): GraphHoleDecisionResolution {
  return {
    candidateId: input.candidateId,
    nextStatus: input.currentStatus,
    transitionApplied: false,
    assessmentType: null,
    invariantViolations: violations,
    evaluation,
    decisionPolicyVersion: GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
  };
}

/**
 * Adjudicate the judge verdict into a deterministic decision-state resolution.
 *
 * Runs the full v2 pipeline: evaluate the deterministic acceptance gate
 * (structure → dimension policy → overall score → hard floors → quality
 * floors → model verdict), then apply PR6 terminal-state/transition rules.
 * Pure: same input → byte-equivalent output. Never mutates or persists; the
 * caller (orchestrator) applies the resolution and calls
 * canTransitionGraphHoleStatus independently before persisting.
 */
export function adjudicateGraphHoleDecision(
  input: GraphHoleDecisionInput,
): GraphHoleDecisionResolution {
  const evaluation = evaluateJudgeDecision({
    dimensions: input.judgeDimensions ?? [],
    verdict: input.judgeVerdict,
    validationValid: input.validationValid,
    candidateQualified: input.candidateQualified ?? false,
  });

  if (input.judgeVerdict === null) {
    // No assessment produced: safe default, no transition.
    return noOp(input, evaluation);
  }

  if (input.judgeVerdict === 'NON_ACCEPTING') {
    // Safe default: no automatic status change. Human review is required.
    return noOp(input, evaluation);
  }

  // verdict === 'ACCEPT'
  if (input.validationValid !== true) {
    // PR8 ERROR with an ACCEPT verdict is an invariant violation: the judge
    // contract forbids it, and this layer refuses to act on it (safety net).
    // The machine-readable reason is also present in evaluation.failureReasons.
    return noOp(input, evaluation, [
      'Judge ACCEPT must not be issued when validation.valid is false (PR8 ERROR present)',
    ]);
  }

  if (evaluation.passed !== true) {
    // Deterministic gate failed (structure / hard floor / quality floor /
    // overall / qualification). Machine-readable reasons are carried in
    // `evaluation.failureReasons`. Judge result is never mutated.
    return noOp(input, evaluation);
  }

  if (input.currentStatus === null) {
    // Initial qualified persist of a judged-honest candidate.
    return {
      candidateId: input.candidateId,
      nextStatus: 'ACTIVE',
      transitionApplied: true,
      assessmentType: 'QUALIFICATION',
      invariantViolations: [],
      evaluation,
      decisionPolicyVersion: GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
    };
  }

  if (input.currentStatus === 'ACTIVE') {
    // Same-state re-assessment: append-only snapshot, no state change.
    return {
      candidateId: input.candidateId,
      nextStatus: 'ACTIVE',
      transitionApplied: false,
      assessmentType: 'REASSESSMENT',
      invariantViolations: [],
      evaluation,
      decisionPolicyVersion: GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
    };
  }

  if (input.currentStatus === 'REJECTED') {
    if (canTransitionGraphHoleStatus('REJECTED', 'ACTIVE')) {
      return {
        candidateId: input.candidateId,
        nextStatus: 'ACTIVE',
        transitionApplied: true,
        assessmentType: 'REVIVAL',
        invariantViolations: [],
        evaluation,
        decisionPolicyVersion: GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
      };
    }
    return noOp(input, evaluation, ['REJECTED → ACTIVE transition is not legal']);
  }

  // SUPERSEDED / RESOLVED are terminal in PR6 — never re-entered by the judge.
  return noOp(input, evaluation, [
    `Status "${input.currentStatus}" is terminal; the judge cannot re-enter it`,
  ]);
}