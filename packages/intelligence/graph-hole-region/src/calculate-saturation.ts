// ============================================================================
// Region saturation calculation (Phase 5A-PR1)
//
// V1 saturation definition (frozen in @indago/contracts):
//   A region is SATURATED only when two CONSECUTIVE expansion rounds each
//   satisfy:
//       newUniqueObservations / totalUniqueObservations <= 0.10  AND
//       newUniqueNodes / totalUniqueNodes <= 0.10
//   AND no hard expansion budget was exhausted during those rounds.
//
// Zero-denominator edge case (deterministic, documented):
//   noveltyRatio(added, total) is undefined (null) when total <= 0. A round
//   with an undefined ratio is NEVER satisfying — a region with nothing to
//   measure cannot claim saturation. Seed construction itself is round 0 and
//   is NEVER counted toward the two required consecutive rounds.
//
// SATURATED means "retrieval produced sufficiently little new context during
// the final required expansion rounds" — NOT mathematical completeness.
// ============================================================================

import {
  SATURATION_NOVELTY_THRESHOLD,
  SATURATION_REQUIRED_CONSECUTIVE_ROUNDS,
} from '@indago/contracts';

export interface SaturationDefinition {
  readonly requiredConsecutiveRounds: number;
  readonly observationNoveltyThreshold: number;
  readonly nodeNoveltyThreshold: number;
}

/**
 * The frozen V1 saturation definition, sourced ONLY from the authoritative
 * contract constants (never re-declared literals). Saturation uses the single
 * shared threshold for both the observation and node novelty axes.
 */
export const SATURATION_DEFINITION_V1: SaturationDefinition = {
  requiredConsecutiveRounds: SATURATION_REQUIRED_CONSECUTIVE_ROUNDS,
  observationNoveltyThreshold: SATURATION_NOVELTY_THRESHOLD,
  nodeNoveltyThreshold: SATURATION_NOVELTY_THRESHOLD,
};

/**
 * A single expansion round's novelty measurements (post-budget: `added*` is
 * what was actually admitted this round).
 */
export interface RoundNoveltyInput {
  readonly addedObservations: number;
  readonly totalObservations: number;
  readonly addedNodes: number;
  readonly totalNodes: number;
  /** true when any hard budget was exhausted during THIS round. */
  readonly budgetBoundReached: boolean;
}

/**
 * new / total. Undefined (null) when the denominator is zero — used only for
 * the documented zero-denominator rule; never treated as low novelty.
 */
export function noveltyRatio(added: number, total: number): number | null {
  if (total <= 0) return null;
  return added / total;
}

/**
 * Whether a single round counts toward saturation (novelty thresholds met AND
 * no hard budget exhausted in that round).
 */
export function isRoundSatisfying(
  round: RoundNoveltyInput,
  definition: SaturationDefinition,
): boolean {
  if (round.budgetBoundReached) return false;
  const observationRatio = noveltyRatio(round.addedObservations, round.totalObservations);
  const nodeRatio = noveltyRatio(round.addedNodes, round.totalNodes);
  if (observationRatio === null || nodeRatio === null) return false;
  return (
    observationRatio <= definition.observationNoveltyThreshold &&
    nodeRatio <= definition.nodeNoveltyThreshold
  );
}

export interface SaturationStatus {
  readonly saturated: boolean;
  readonly consecutiveSatisfyingRounds: number;
}

/**
 * Scan completed expansion rounds in order and compute the running consecutive
 * satisfying-round count. A non-satisfying round resets the counter (rounds
 * must be CONSECUTIVE).
 */
export function saturationStatusOf(
  rounds: readonly RoundNoveltyInput[],
  definition: SaturationDefinition,
): SaturationStatus {
  let consecutive = 0;
  for (const round of rounds) {
    consecutive = isRoundSatisfying(round, definition) ? consecutive + 1 : 0;
    if (consecutive >= definition.requiredConsecutiveRounds) {
      return { saturated: true, consecutiveSatisfyingRounds: consecutive };
    }
  }
  return { saturated: false, consecutiveSatisfyingRounds: consecutive };
}

/**
 * Incremental tracker used by the orchestrator: observe a round after it
 * completes; observe() returns true exactly when saturation has been reached
 * (requiredConsecutiveRounds consecutive satisfying rounds).
 */
export class SaturationTracker {
  private consecutive = 0;

  constructor(private readonly definition: SaturationDefinition) {}

  observe(round: RoundNoveltyInput): boolean {
    this.consecutive = isRoundSatisfying(round, this.definition)
      ? this.consecutive + 1
      : 0;
    return this.consecutive >= this.definition.requiredConsecutiveRounds;
  }

  get consecutiveSatisfyingRounds(): number {
    return this.consecutive;
  }
}