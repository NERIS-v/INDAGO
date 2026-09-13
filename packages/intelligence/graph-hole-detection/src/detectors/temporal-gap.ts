// ============================================================================
// TEMPORAL_GAP detector (Phase 5A-PR4)
//
// "Two canonical nodes share an asserted relationship expectation, yet their
// authoritative temporal windows are strictly disjoint with a positive gap
// between them."
//
// The gap is ONLY computed from authoritative TemporalInterval endpoints at
// DAY granularity; open-ended / missing endpoints are UNKNOWN and can never
// produce a gap (NULL semantics — we never guess an unseen boundary). The
// expected relationship type comes only from the hypothesis predicate when it
// is an authoritative RelationType. The claimed temporalScope of the candidate
// is the inferred gap window itself (content-derived, part of the identity).
// ============================================================================

import { pairKey } from '../determinism.js';
import { gapBetween } from '../temporal.js';
import { DetectorRun } from './run.js';
import { incidentEdgeIds, unmaterializedAssertedPairs } from './shared.js';
import type { GraphHoleDetectionContext } from '../types.js';

export function detectTemporalGap(ctx: GraphHoleDetectionContext): DetectorRun {
  const run = new DetectorRun('TEMPORAL_GAP');
  const seen = new Set<string>();

  for (const assertion of unmaterializedAssertedPairs(ctx)) {
    const key = pairKey(assertion.a, assertion.b);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!run.evaluate()) {
      run.stop('PAIR_EVALUATIONS');
      return run;
    }
    const nodeA = ctx.nodeById.get(assertion.a);
    const nodeB = ctx.nodeById.get(assertion.b);
    if (nodeA === undefined || nodeA.temporalRange === undefined) continue;
    if (nodeB === undefined || nodeB.temporalRange === undefined) continue;
    const gap = gapBetween(nodeA.temporalRange, nodeB.temporalRange);
    if (gap === null) continue;
    if (assertion.atomic.supportingObservations.length === 0) continue;
    run.emit({
      detectorType: 'TEMPORAL_GAP',
      nodeIds: [assertion.a, assertion.b],
      observedEdgeIds: incidentEdgeIds(ctx, [assertion.a, assertion.b]),
      expectedRelationshipType: assertion.expected,
      temporalScope: gap,
      supportingHypothesisIds: [assertion.atomic.derivedId],
      supportingObservationIds: assertion.atomic.supportingObservations,
      contradictingObservationIds: assertion.atomic.contradictingObservations,
      structuralBasis: 'TEMPORAL_DISCONTINUITY',
    });
  }

  return run;
}