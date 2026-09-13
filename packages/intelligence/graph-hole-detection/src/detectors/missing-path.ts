// ============================================================================
// MISSING_PATH detector (Phase 5A-PR4)
//
// "A bounded hypothesis chain A—x—B implies a connection is expected; the
// region graph carries no path (≤4 observed hops) linking A and B."
//
// The expectation is a PR3 hypothesis-path: two DISTINCT atomic hypotheses
// share the intermediate canonical node x (A via H1, B via H2) — a transitive
// relationship claim — while a single atomic does NOT assert A–B directly
// (that is MISSING_EDGE territory). Path existence reuses the M-A10/M-A13
// bounded traversal utility (traverseBounded, TRAVERSAL_BOUNDS discipline):
// it is cycle-safe and deterministically ordered, and it runs on a projection
// of exactly the bounded region scope. Traversal queries are capped per-run
// (boundKind TRAVERSAL_QUERIES) and cached by pair.
// ============================================================================

import {
  buildGraph,
  traverseBounded,
  type Graph,
  type GraphProjectionInput,
} from '@indago/graphology-projection';
import { DETECTOR_BOUNDS } from '../bounds.js';
import { pairKey, sortedUnique } from '../determinism.js';
import { DetectorRun } from './run.js';
import { hasEdgeBetween, isInRegion, jointlyReferencedPairKeys } from './shared.js';
import type { AtomicRelationshipHypothesis } from '@indago/hypothesis-context';
import type { GraphHoleDetectionContext } from '../types.js';

export function detectMissingPath(ctx: GraphHoleDetectionContext): DetectorRun {
  const run = new DetectorRun('MISSING_PATH');
  const directlyAsserted = jointlyReferencedPairKeys(ctx);
  const pathCache = new Map<string, boolean>();

  let projection: Graph | null = null;
  let traversalQueries = 0;

  const pathExists = (a: string, b: string): boolean => {
    const key = pairKey(a, b);
    const cached = pathCache.get(key);
    if (cached !== undefined) return cached;
    if (traversalQueries >= DETECTOR_BOUNDS.maxTraversalQueriesPerDetector) {
      run.stop('TRAVERSAL_QUERIES');
      return false;
    }
    traversalQueries += 1;
    if (projection === null) projection = buildGraph(toProjectionInput(ctx)).graph;
    const paths = traverseBounded(projection, a, { hops: DETECTOR_BOUNDS.missingPathHops });
    const result = paths.some((path) => path.nodes.some((node) => node.nodeId === b));
    pathCache.set(key, result);
    return result;
  };

  for (const group of ctx.hypothesisContext.groups) {
    const atomicsByNode = new Map<string, AtomicRelationshipHypothesis[]>();
    for (const atomic of group.atomicHypotheses) {
      for (const nodeId of atomic.referencedCanonicalEntityIds) {
        const list = atomicsByNode.get(nodeId) ?? [];
        list.push(atomic);
        atomicsByNode.set(nodeId, list);
      }
    }

    for (const x of group.sharedNodeIds.map((key) =>
      key.startsWith('entity:') ? key.slice('entity:'.length) : key,
    )) {
      const atomics = atomicsByNode.get(x) ?? [];
      if (atomics.length < 2) continue;
      for (let p = 0; p < atomics.length; p += 1) {
        for (let q = p + 1; q < atomics.length; q += 1) {
          const h1 = atomics[p]!;
          const h2 = atomics[q]!;
          for (const a of h1.referencedCanonicalEntityIds) {
            if (a === x) continue;
            for (const b of h2.referencedCanonicalEntityIds) {
              if (b === x || b === a) continue;
              if (!run.evaluate()) {
                run.stop('PAIR_EVALUATIONS');
                return run;
              }
              if (directlyAsserted.has(pairKey(a, b))) continue;
              if (!isInRegion(ctx, a) || !isInRegion(ctx, x) || !isInRegion(ctx, b)) continue;
              if (hasEdgeBetween(ctx, a, b)) continue;
              const supportingObservations = sortedUnique([
                ...h1.supportingObservations,
                ...h2.supportingObservations,
              ]);
              if (supportingObservations.length === 0) continue;
              if (pathExists(a, b)) continue;
              run.emit({
                detectorType: 'MISSING_PATH',
                nodeIds: [a, x, b],
                observedEdgeIds: incidentEdgeIdsFor(ctx, [a, x, b]),
                expectedRelationshipType: null,
                temporalScope: null,
                supportingHypothesisIds: sortedUnique([h1.derivedId, h2.derivedId]),
                supportingObservationIds: supportingObservations,
                contradictingObservationIds: sortedUnique([
                  ...h1.contradictingObservations,
                  ...h2.contradictingObservations,
                ]),
                structuralBasis: 'EXPECTED_PATH_BROKEN',
              });
            }
          }
        }
      }
    }
  }

  return run;
}

function incidentEdgeIdsFor(
  ctx: GraphHoleDetectionContext,
  nodeIds: readonly string[],
): string[] {
  const ids: string[] = [];
  for (const id of nodeIds) {
    ids.push(...(ctx.edgesByNode.get(id) ?? []));
  }
  return sortedUnique(ids);
}

function toProjectionInput(ctx: GraphHoleDetectionContext): GraphProjectionInput {
  return {
    caseId: ctx.caseId,
    nodes: ctx.nodes.map((node) => ({
      id: node.id,
      entityType: node.type,
      canonicalName: node.label,
      temporalRange: node.temporalRange,
    })),
    edges: ctx.edges.map((edge) => ({
      id: edge.id,
      relationType: edge.relationType,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      directed: edge.directed,
      provenance: undefined,
      temporalRange: edge.temporalRange,
    })),
  };
}