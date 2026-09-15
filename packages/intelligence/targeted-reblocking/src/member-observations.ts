// ============================================================================
// Targeted Reblocking — region member observations (Phase 5A-PR11)
//
// Deterministic resolution of the OBSERVATION membership set that defines
// "which EntityMentionCandidates are inside the suspicious region".
//
// Membership rule (V1, frozen):
//   regionMemberObservationIds =
//       seedObservationIds                              ← authoritative region seeds
//     ∪ { nodeObservations whose effective domain interval overlaps the
//         region temporalContext when one is present }  ← observations linked to
//                                                        region nodes
//
// Temporal evaluation is CLOSED-INTERVAL and mirrors graph-hole-region's
// intervalOverlapsContext semantics: a missing endpoint is treated as
// unbounded, and an observation with NO resolvable domain time is RETAINED
// (ambiguous time is never a reason to drop evidence).
//
// Bounded + deterministic:
//   - all id sets are deduplicated and sorted asc before output
//   - a hard maxRegionObservations cap truncates deterministically and
//     surfaces regionObservationBoundReached (never silent)
// ============================================================================

import type { EventTime, TemporalInterval } from '@indago/contracts';
import type { RegionObservation } from './types.js';

const RANGE_SEPARATOR = '/';

interface BoundaryWindow {
  readonly start?: string;
  readonly end?: string;
}

function eventTimeWindow(value: EventTime): BoundaryWindow {
  const raw = value.value;
  const parts = raw.split(RANGE_SEPARATOR);
  if (parts.length === 1) {
    const start = parts[0]!.trim();
    return { start, end: start };
  }
  const start = parts[0]?.trim();
  const end = parts[1]?.trim();
  if (!start || !end) return { start, end };
  return { start, end };
}

/** Effective domain interval of an observation (validityInterval wins, then eventTime, then observedAt). */
function observationBoundaryWindow(obs: RegionObservation): BoundaryWindow | null {
  if (obs.validityInterval) {
    return {
      start: obs.validityInterval.validFrom?.value,
      end: obs.validityInterval.validTo?.value,
    };
  }
  const event = obs.eventTime ?? obs.observedAt;
  if (event) return eventTimeWindow(event);
  return null;
}

/**
 * Closed-interval overlap between an observation's domain window and the
 * region temporal context. Missing endpoints are unbounded; an observation
 * with no resolvable domain time is retained. ISO-8601 UTC strings compare
 * lexicographically.
 */
export function observationOverlapsTemporalContext(
  obs: RegionObservation,
  context: TemporalInterval | null | undefined,
): boolean {
  if (context === null || context === undefined) return true;
  const window = observationBoundaryWindow(obs);
  if (window === null) return true;

  const aFrom = window.start;
  const aTo = window.end;
  const bFrom = context.validFrom.value;
  const bTo = context.validTo?.value;

  if (aFrom !== undefined && bTo !== undefined && aFrom > bTo) return false;
  if (aTo !== undefined && bFrom > aTo) return false;
  return true;
}

export interface ResolveRegionMemberObservationsInput {
  /** Authoritative seed observation ids from the persisted region record. */
  readonly seedObservationIds: readonly string[];
  /** Observations referencing at least one canonical region node (case-scoped). */
  readonly nodeObservations: readonly RegionObservation[];
  /** Authoritative region temporal context (persisted region record). */
  readonly temporalContext?: TemporalInterval | null;
  readonly maxRegionObservations: number;
}

export interface RegionMemberObservationResolution {
  /** Sorted, deduplicated, bounded member observation ids. */
  readonly memberObservationIds: readonly string[];
  /** true when the hard region observation bound was reached (truncation). */
  readonly boundReached: boolean;
}

/**
 * Resolve the region member observation set. Seeds are always retained
 * (they are authoritative region inputs); node-scoped observations are
 * retained only when they overlap the region temporal context (if present).
 */
export function resolveRegionMemberObservations(
  input: ResolveRegionMemberObservationsInput,
): RegionMemberObservationResolution {
  const members = new Set<string>(input.seedObservationIds);

  for (const obs of input.nodeObservations) {
    if (!observationOverlapsTemporalContext(obs, input.temporalContext)) {
      continue;
    }
    members.add(obs.id);
  }

  const sorted = [...members].sort();
  const boundReached = sorted.length > input.maxRegionObservations;
  const bounded = boundReached
    ? sorted.slice(0, input.maxRegionObservations)
    : sorted;

  return { memberObservationIds: bounded, boundReached };
}