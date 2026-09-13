// ============================================================================
// ISOLATED_NODE detector (Phase 5A-PR4)
//
// "A canonical node inside the region has zero observed incident edges, yet it
// participates in an analytical expectation."
//
// An isolated node alone is NEVER a candidate. Contextual relevance comes
// strictly from the PR3 hypothesis context (a hypothesis references the node)
// or the region seeds (the node was resolved from a seed observation).
// Candidates carry basis HYPOTHESIS_REFERENCED_NODE / SEED_REFERENCED_NODE.
// ============================================================================

import { sortedUnique } from '../determinism.js';
import { DetectorRun } from './run.js';
import type { AtomicRelationshipHypothesis } from '@indago/hypothesis-context';
import type { GraphHoleDetectionContext } from '../types.js';

export function detectIsolatedNode(ctx: GraphHoleDetectionContext): DetectorRun {
  const run = new DetectorRun('ISOLATED_NODE');

  const atomics = ctx.hypothesisContext.atomic;
  const referencedById = new Map<string, AtomicRelationshipHypothesis[]>();
  for (const atomic of atomics) {
    for (const nodeId of atomic.referencedCanonicalEntityIds) {
      const list = referencedById.get(nodeId) ?? [];
      list.push(atomic);
      referencedById.set(nodeId, list);
    }
  }

  const seeds = new Set(ctx.region.resolvedSeedNodeIds);
  const seedObservationIds = sortedUnique(ctx.region.seedObservationIds);

  for (const node of ctx.nodes) {
    const incident = ctx.edgesByNode.get(node.id) ?? [];
    if (incident.length > 0) continue;
    if (!run.evaluate()) {
      run.stop('PAIR_EVALUATIONS');
      return run;
    }

    const referencing = referencedById.get(node.id) ?? [];
    if (referencing.length > 0) {
      const supportingObservations = sortedUnique(
        referencing.flatMap((x) => [...x.supportingObservations]),
      );
      if (supportingObservations.length === 0) continue;
      run.emit({
        detectorType: 'ISOLATED_NODE',
        nodeIds: [node.id],
        observedEdgeIds: [],
        expectedRelationshipType: null,
        temporalScope: null,
        supportingHypothesisIds: sortedUnique(referencing.map((x) => x.derivedId)),
        supportingObservationIds: supportingObservations,
        contradictingObservationIds: sortedUnique(
          referencing.flatMap((x) => [...x.contradictingObservations]),
        ),
        structuralBasis: 'HYPOTHESIS_REFERENCED_NODE',
      });
      continue;
    }

    if (seeds.has(node.id) && seedObservationIds.length > 0) {
      run.emit({
        detectorType: 'ISOLATED_NODE',
        nodeIds: [node.id],
        observedEdgeIds: [],
        expectedRelationshipType: null,
        temporalScope: null,
        supportingHypothesisIds: [],
        supportingObservationIds: seedObservationIds,
        contradictingObservationIds: [],
        structuralBasis: 'SEED_REFERENCED_NODE',
      });
    }
  }

  return run;
}