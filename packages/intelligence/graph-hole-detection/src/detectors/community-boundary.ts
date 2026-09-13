// ============================================================================
// COMMUNITY_BOUNDARY detector (Phase 5A-PR4)
//
// "Two canonical nodes in DIFFERENT detected communities share a hypothesis
// expectation, the region shows at least one observed inter-community edge
// (the communities are structurally bridged), yet the specific cross-boundary
// relation is not materialized."
//
// Community membership is NEVER computed here: it is supplied by the caller
// from the deterministic M-A10/M-A13 detectCommunities pass. Without a
// community map this detector emits nothing (graceful skip). Expectation is,
// as always, hypothesis-asserted (typed) or shared-evidence with neighbor
// context (untyped); an untraversed boundary alone is never a candidate.
// ============================================================================

import { relationTypeOrNull, incidentEdgeIds, intersectSorted, isInRegion, jointlyReferencedPairKeys, hasEdgeBetween } from './shared.js';
import { pairKey, sortedUnique } from '../determinism.js';
import { DetectorRun } from './run.js';
import type { AtomicRelationshipHypothesis } from '@indago/hypothesis-context';
import type { GraphHoleDetectionContext } from '../types.js';

export function detectCommunityBoundary(ctx: GraphHoleDetectionContext): DetectorRun {
  const run = new DetectorRun('COMMUNITY_BOUNDARY');
  const communities = ctx.communities;
  if (communities === null) return run;

  // Bridge-like context: at least one observed edge crosses a community boundary.
  const interCommunityEdgeCount = ctx.edges.reduce((count, edge) => {
    const from = communities.get(edge.sourceNodeId);
    const to = communities.get(edge.targetNodeId);
    return from !== undefined && to !== undefined && from !== to ? count + 1 : count;
  }, 0);
  if (interCommunityEdgeCount === 0) return run;

  const directlyAsserted = jointlyReferencedPairKeys(ctx);

  for (const group of ctx.hypothesisContext.groups) {
    const atomicsByNode = new Map<string, AtomicRelationshipHypothesis[]>();
    for (const atomic of group.atomicHypotheses) {
      for (const nodeId of atomic.referencedCanonicalEntityIds) {
        const list = atomicsByNode.get(nodeId) ?? [];
        list.push(atomic);
        atomicsByNode.set(nodeId, list);
      }
    }

    const shared = group.sharedNodeIds
      .map((key) => (key.startsWith('entity:') ? key.slice('entity:'.length) : key))
      .sort();
    for (let i = 0; i < shared.length; i += 1) {
      for (let j = i + 1; j < shared.length; j += 1) {
        const a = shared[i]!;
        const b = shared[j]!;
        const communityA = communities.get(a);
        const communityB = communities.get(b);
        if (communityA === undefined || communityB === undefined) continue;
        if (communityA === communityB) continue;
        if (!isInRegion(ctx, a) || !isInRegion(ctx, b)) continue;
        if (!run.evaluate()) {
          run.stop('PAIR_EVALUATIONS');
          return run;
        }
        if (hasEdgeBetween(ctx, a, b)) continue;
        const atomicsA = atomicsByNode.get(a) ?? [];
        const atomicsB = atomicsByNode.get(b) ?? [];
        if (atomicsA.length === 0 || atomicsB.length === 0) continue;

        // Hypothesis-asserted boundary (a single relation atomic spans it).
        const asserting = atomicsA.filter(
          (x) => x.hypothesisType === 'RELATION_HYPOTHESIS' && atomicsB.includes(x),
        );
        if (asserting.length > 0) {
          const atomic = asserting[0]!;
          if (atomic.supportingObservations.length === 0) continue;
          run.emit({
            detectorType: 'COMMUNITY_BOUNDARY',
            nodeIds: [a, b],
            observedEdgeIds: incidentEdgeIds(ctx, [a, b]),
            expectedRelationshipType: relationTypeOrNull(atomic.predicate),
            temporalScope: null,
            supportingHypothesisIds: [atomic.derivedId],
            supportingObservationIds: atomic.supportingObservations,
            contradictingObservationIds: atomic.contradictingObservations,
            structuralBasis: 'CROSS_COMMUNITY_HYPOTHESIS_CONTEXT',
          });
          continue;
        }

        // Shared-evidence boundary: no single atomic asserts the pair.
        if (directlyAsserted.has(pairKey(a, b))) continue;
        if ((ctx.adjacency.get(a) ?? []).length === 0) continue;
        if ((ctx.adjacency.get(b) ?? []).length === 0) continue;
        const supportA = sortedUnique(atomicsA.flatMap((x) => [...x.supportingObservations]));
        const supportB = sortedUnique(atomicsB.flatMap((x) => [...x.supportingObservations]));
        const sharedObservations = intersectSorted(supportA, supportB);
        if (sharedObservations.length === 0) continue;
        const hypothesisIds = sortedUnique([...atomicsA, ...atomicsB].map((x) => x.derivedId));
        run.emit({
          detectorType: 'COMMUNITY_BOUNDARY',
          nodeIds: [a, b],
          observedEdgeIds: incidentEdgeIds(ctx, [a, b]),
          expectedRelationshipType: null,
          temporalScope: null,
          supportingHypothesisIds: hypothesisIds,
          supportingObservationIds: sharedObservations,
          contradictingObservationIds: sortedUnique(
            [...atomicsA, ...atomicsB].flatMap((x) => [...x.contradictingObservations]),
          ),
          structuralBasis: 'CROSS_COMMUNITY_HYPOTHESIS_CONTEXT',
        });
      }
    }
  }

  return run;
}