// ============================================================================
// MISSING_EDGE detector (Phase 5A-PR4)
//
// "A relationship is expected between two canonical nodes; the graph carries
// no edge documenting it."
//
// Expectations are NEVER invented:
//   1. HYPOTHESIS-ASSERTED (SHARED_HYPOTHESIS_CONTEXT) — a single
//      RELATION_HYPOTHESIS atomic jointly references A and B (typed
//      expectation when the predicate is an authoritative RelationType).
//   2. GROUP-BRIDGE (OBSERVED_NEIGHBOR_CONTEXT) — A and B already sit inside
//      one PR3 hypothesis group, each has an observed neighbor, and they share
//      at least one supporting observation; no atomic directly asserts the
//      pair (so this never duplicates mode 1).
//
// An absent edge alone is NEVER a candidate. Direction is respected at the
// materialization level (any existing edge satisfies the expectation).
// ============================================================================

import { pairKey, sortedUnique } from '../determinism.js';
import { DetectorRun } from './run.js';
import {
  hasEdgeBetween,
  incidentEdgeIds,
  intersectSorted,
  isInRegion,
  relationTypeOrNull,
  jointlyReferencedPairKeys,
} from './shared.js';
import type { AtomicRelationshipHypothesis } from '@indago/hypothesis-context';
import type { GraphHoleDetectionContext } from '../types.js';

export function detectMissingEdge(ctx: GraphHoleDetectionContext): DetectorRun {
  const run = new DetectorRun('MISSING_EDGE');
  const directlyAsserted = jointlyReferencedPairKeys(ctx);

  // --- Mode 1: hypothesis-asserted expectations ----------------------------
  for (const atomic of ctx.hypothesisContext.atomic) {
    if (atomic.hypothesisType !== 'RELATION_HYPOTHESIS') continue;
    const refs = atomic.referencedCanonicalEntityIds;
    if (refs.length < 2) continue;
    const expected = relationTypeOrNull(atomic.predicate);
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        if (!run.evaluate()) {
          run.stop('PAIR_EVALUATIONS');
          return run;
        }
        const a = refs[i]!;
        const b = refs[j]!;
        if (!isInRegion(ctx, a) || !isInRegion(ctx, b)) continue;
        if (hasEdgeBetween(ctx, a, b)) continue;
        if (atomic.supportingObservations.length === 0) continue;
        run.emit({
          detectorType: 'MISSING_EDGE',
          nodeIds: [a, b],
          observedEdgeIds: incidentEdgeIds(ctx, [a, b]),
          expectedRelationshipType: expected,
          temporalScope: null,
          supportingHypothesisIds: [atomic.derivedId],
          supportingObservationIds: atomic.supportingObservations,
          contradictingObservationIds: atomic.contradictingObservations,
          structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
        });
      }
    }
  }

  // --- Mode 2: group-bridge context (shared evidence, no direct assertion) --
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
        if (directlyAsserted.has(pairKey(a, b))) continue;
        if (!run.evaluate()) {
          run.stop('PAIR_EVALUATIONS');
          return run;
        }
        if (!isInRegion(ctx, a) || !isInRegion(ctx, b)) continue;
        if (hasEdgeBetween(ctx, a, b)) continue;
        const atomicsA = atomicsByNode.get(a) ?? [];
        const atomicsB = atomicsByNode.get(b) ?? [];
        if (atomicsA.length === 0 || atomicsB.length === 0) continue;
        // Both nodes are structurally embedded (neighboring observed relations).
        if ((ctx.adjacency.get(a) ?? []).length === 0) continue;
        if ((ctx.adjacency.get(b) ?? []).length === 0) continue;
        const supportA = sortedUnique(
          atomicsA.flatMap((x) => [...x.supportingObservations]),
        );
        const supportB = sortedUnique(
          atomicsB.flatMap((x) => [...x.supportingObservations]),
        );
        const sharedObservations = intersectSorted(supportA, supportB);
        if (sharedObservations.length === 0) continue;
        const hypothesisIds = sortedUnique(
          [...atomicsA, ...atomicsB].map((x) => x.derivedId),
        );
        const contradicting = sortedUnique(
          [...atomicsA, ...atomicsB].flatMap((x) => [...x.contradictingObservations]),
        );
        run.emit({
          detectorType: 'MISSING_EDGE',
          nodeIds: [a, b],
          observedEdgeIds: incidentEdgeIds(ctx, [a, b]),
          expectedRelationshipType: null,
          temporalScope: null,
          supportingHypothesisIds: hypothesisIds,
          supportingObservationIds: sharedObservations,
          contradictingObservationIds: contradicting,
          structuralBasis: 'OBSERVED_NEIGHBOR_CONTEXT',
        });
      }
    }
  }

  return run;
}