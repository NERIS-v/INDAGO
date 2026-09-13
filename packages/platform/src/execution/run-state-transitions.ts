// ============================================================================
// P4-PR3 — Investigation run state transition logic (pure, DB-free)
//
// This module ONLY consults @indago/contracts' DEFAULT_RUN_STATE_CONFIGURATION
// — the state machine's SHAPE lives entirely in the contract (already
// complete, frozen at Phase 1), this file just gives runtime callers a typed,
// tested way to ask it questions. No I/O, no persistence, no randomness —
// mirrors the discipline of @indago/lead-generation and
// @indago/graphology-projection's candidate detectors.
//
// "Platform never invents evidence/execution semantics" (dev plan rule 7):
// the legal transition graph is not redefined here, only queried.
// ============================================================================

import {
  DEFAULT_RUN_STATE_CONFIGURATION,
  type InvestigationRunState,
  type Transition,
} from "@indago/contracts";

/**
 * Find the ordinary (non-resume, non-recovery) transition contract for
 * (from, to), if one is legal. Returns undefined for an illegal transition —
 * callers decide whether that's an error or a silent no-op.
 */
export function findTransition(
  from: InvestigationRunState,
  to: InvestigationRunState,
): Transition | undefined {
  return DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
    (t) => t.from === from && t.to === to,
  );
}

export function isLegalTransition(from: InvestigationRunState, to: InvestigationRunState): boolean {
  return findTransition(from, to) !== undefined;
}

/**
 * Every run-state that PAUSE preserves (i.e. that RESUME can legally return
 * to), per the contract's resumeTransitions. PAUSED itself pauses the
 * "pipeline stage" (InvestigationRun.state); the ordinary execution status
 * (InvestigationRun.status) is what actually flips to PAUSED/RUNNING — see
 * run-state-machine.ts for how the two columns interact.
 */
export function isLegalResumeTarget(pausedFromState: InvestigationRunState): boolean {
  return DEFAULT_RUN_STATE_CONFIGURATION.resumeTransitions.some(
    (r) => r.pausedFromState === pausedFromState,
  );
}

export type ReviewResolutionOutcome = "APPROVED" | "NEEDS_EVIDENCE";

/**
 * The two legal exits from REVIEW_REQUIRED, keyed by the human's decision.
 * Derived directly from validTransitions rather than hardcoded twice, so a
 * future change to the contract's REVIEW_REQUIRED transitions is
 * automatically reflected here.
 */
export function reviewResolutionTarget(outcome: ReviewResolutionOutcome): InvestigationRunState {
  const trigger = outcome === "APPROVED" ? "REVIEW_APPROVED" : "REVIEW_NEEDS_EVIDENCE";
  const transition = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
    (t) => t.from === "REVIEW_REQUIRED" && t.trigger === trigger,
  );
  if (!transition) {
    // Would only happen if the contract's REVIEW_REQUIRED transitions were
    // removed — a configuration bug, not a runtime/user-input error.
    throw new Error(`No contract transition found for REVIEW_REQUIRED outcome ${outcome}`);
  }
  return transition.to;
}

/**
 * States from which entering REVIEW_REQUIRED is legal, per the contract
 * (DISCOVERING and REASSESSING both have a -> REVIEW_REQUIRED transition).
 * Used by LeadRuntime to decide, non-fatally, whether a high-priority lead
 * can trigger human review right now.
 */
export function canEnterReviewRequired(currentState: InvestigationRunState): boolean {
  return isLegalTransition(currentState, "REVIEW_REQUIRED");
}

/**
 * Terminal pipeline stages — no transition (including pause) is meaningful
 * once a run has reached one of these. Consulted by RunStateMachine.pause()
 * so an operator can't "pause" a run that has already finished or failed.
 */
const TERMINAL_STATES: ReadonlySet<InvestigationRunState> = new Set(["COMPLETED", "FAILED"]);

export function isTerminalState(state: InvestigationRunState): boolean {
  return TERMINAL_STATES.has(state);
}
