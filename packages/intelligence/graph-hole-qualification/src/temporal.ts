// ============================================================================
// Temporal consistency helpers (Phase 5A-PR5)
//
// V1 interval semantics (frozen): interval endpoints ARE ISO-8601 strings
// (`EventTime.value`). Identical-format ISO-8601 strings compare
// lexicographically in time order, so PR5 compares `.value` strings directly.
// An ABSENT `validTo` means an open-ended interval (+∞) — it never forces an
// overlap failure.
//
// The temporal gate is CONSERVATIVE:
//   - No temporal scope is claimed anywhere (candidate + region) → PASS.
//     Nothing temporal exists to be inconsistent with.
//   - FUTURE support cannot qualify a historical candidate:
//       supportingObservation.validityInterval.validFrom > scope end → FAIL
//       supportingAtomic.temporalScope.validFrom      > scope end → FAIL
//   - When BOTH candidate.temporalScope and region.identity.temporalContext
//     exist, they must overlap (the region was analyzed over a different
//     window than the candidate claims) → FAIL otherwise.
//   - Supporting observations without validityInterval never fail the gate
//     (no invented interval; neutral).
//
// "Future information cannot qualify a historical candidate" is enforced by
// the STRICT-AFTER rule above. Today's canonical state is only consulted via
// the bounded region edges the caller supplied (the authoritative projection
// for the candidate's graphVersionId); PR5 never loads the live graph.
// ============================================================================

import type {
  RawGraphHoleCandidate,
  TemporalInterval,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { QualificationObservation } from './types.js';
import type { HypothesisContext } from '@indago/hypothesis-context';

/** Upper bound of an interval; null means open-ended (+∞). */
function endOf(interval: TemporalInterval): string | null {
  return interval.validTo?.value ?? null;
}

function startOf(interval: TemporalInterval): string {
  return interval.validFrom.value;
}

/**
 * True when [aStart, aEnd] and [bStart, bEnd] intersect (inclusive on closed
 * endpoints). Open ends compare as +∞.
 */
export function intervalsOverlap(a: TemporalInterval, b: TemporalInterval): boolean {
  const aEnd = endOf(a);
  const bEnd = endOf(b);
  // a starts before b ends ?
  const aStartsBeforeBEnds = bEnd === null || startOf(a) <= bEnd;
  // b starts before a ends ?
  const bStartsBeforeAEnds = aEnd === null || startOf(b) <= aEnd;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/** True when `value` is strictly after the interval's closed upper bound. */
export function isStrictlyAfterInterval(value: string, interval: TemporalInterval): boolean {
  const end = endOf(interval);
  return end !== null && value > end;
}

/**
 * First available temporal scope for a candidate:
 * candidate.temporalScope ?? region.identity.temporalContext ?? null.
 */
export function temporalScopeOf(
  candidate: RawGraphHoleCandidate,
  region: GraphHoleRegion,
): TemporalInterval | null {
  return candidate.temporalScope ?? region.identity.temporalContext ?? null;
}

interface TemporalGateContext {
  readonly candidate: RawGraphHoleCandidate;
  readonly region: GraphHoleRegion;
  readonly observations: readonly QualificationObservation[];
  readonly hypothesisContext: HypothesisContext;
}

/**
 * Deterministic temporal-consistency gate. Returns false → the candidate must
 * fail qualification with TEMPORAL_INCONSISTENCY.
 */
export function temporalGateIsValid(ctx: TemporalGateContext): boolean {
  const { candidate, region, observations, hypothesisContext } = ctx;
  const scope = temporalScopeOf(candidate, region);
  if (scope === null) return true;

  // Future support evidence disqualifies a historical candidate.
  for (const observationId of candidate.supportingObservationIds) {
    const obs = observations.find((o) => o.id === observationId);
    if (obs !== undefined && obs.validityInterval !== undefined && obs.validityInterval !== null) {
      if (isStrictlyAfterInterval(obs.validityInterval.validFrom.value, scope)) {
        return false;
      }
    }
  }

  // Future supporting hypotheses disqualify a historical candidate.
  for (const atomic of hypothesisContext.atomic) {
    if (!candidate.supportingHypothesisIds.includes(atomic.derivedId)) continue;
    if (atomic.temporalScope !== null && atomic.temporalScope !== undefined) {
      if (isStrictlyAfterInterval(atomic.temporalScope.validFrom.value, scope)) {
        return false;
      }
    }
  }

  // Candidate scope and region context must agree when both are claimed.
  if (candidate.temporalScope !== undefined && region.identity.temporalContext !== undefined) {
    if (!intervalsOverlap(candidate.temporalScope, region.identity.temporalContext)) {
      return false;
    }
  }

  return true;
}