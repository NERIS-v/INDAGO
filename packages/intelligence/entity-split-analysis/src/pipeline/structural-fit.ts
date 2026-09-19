// ============================================================================
// Structural Fit (Phase 5A-PR16, policy §13/§6)
//
// The hole's boundary node set and how the pair's two canonical entities cover
// it. NO graph is simulated or mutated: the boundary subgraph is an in-memory
// derived view over `context.edges` restricted to the boundary node set only.
//
// Concretely, given the closed package and a pair (c, d):
//   boundarySet = Q.nodeIds ∪ { v : an edge in context.edges touches v and v's
//                              neighbor is in Q.nodeIds }        (sorted unique)
//   side(c)     = boundary nodes n whose GraphNode.entityId is among
//                 observation(candidate).entityIds                (side A)
//   side(d)     = likewise                                         (side B)
//   coverage    = |side(c) ∪ side(d) ∩ boundarySet| / |boundarySet|
//   bothSides   = side(c) ≠ ∅ ∧ side(d) ≠ ∅
//   bridging    = bothSides ∧ ¬(∃ boundary-subgraph path side(c) → side(d))
//
// structuralFitScore = clamp01(0.60·bridging + 0.20·coverage + 0.20·bothSides)
//
// NOTE on naming: policy §13's illustrative edge endpoints (`e1NodeId`/
// `e2NodeId`) are realized here by the authoritative GraphEdge fields
// `sourceNodeId`/`targetNodeId`.
// ============================================================================

import type { CandidatePair } from '@indago/contracts';

import { STRUCTURAL_WEIGHT_BRIDGING, STRUCTURAL_WEIGHT_COVERAGE, STRUCTURAL_WEIGHT_BOTH_SIDES } from '../contracts/er-split-policy.js';
import type { ErSplitBoundContext } from './boundary.js';
import { sortedUniqueString } from './sorted.js';

/** Deterministic structural-fit result for one pair (policy §13). */
export interface StructuralFitEvidence {
  /** The contract-shaped structural-fit payload. */
  readonly structuralFit: {
    readonly holeBoundaryNodeIds: string[];
    readonly coveredNodeIdsA: string[];
    readonly coveredNodeIdsB: string[];
    readonly borderBridging: boolean;
  };
  readonly structuralFitScore: number;
  readonly coverage: number;
  readonly bothSidesPresent: boolean;
}

function boundarySetFor(bound: ErSplitBoundContext): string[] {
  const nodeIds = bound.context.qualifiedCandidate.rawCandidate.nodeIds;
  const seed = new Set(nodeIds);
  const result = new Set(nodeIds);
  for (const edge of bound.context.edges) {
    const inSeed =
      seed.has(edge.sourceNodeId) || seed.has(edge.targetNodeId);
    if (inSeed) {
      result.add(edge.sourceNodeId);
      result.add(edge.targetNodeId);
    }
  }
  return sortedUniqueString([...result]);
}

function sideSetFor(
  bound: ErSplitBoundContext,
  observationId: string,
  boundarySet: ReadonlySet<string>,
): string[] {
  const observation = bound.observationsById.get(observationId);
  if (observation === undefined) return [];
  const entityIds = new Set(observation.entityIds);
  const nodes: string[] = [];
  for (const nodeId of boundarySet) {
    const entityId = bound.nodesById.get(nodeId)?.entityId;
    if (entityId !== undefined && entityIds.has(entityId)) nodes.push(nodeId);
  }
  return sortedUniqueString(nodes);
}

function boundarySubgraphConnected(
  bound: ErSplitBoundContext,
  boundarySet: ReadonlySet<string>,
  from: ReadonlySet<string>,
  to: ReadonlySet<string>,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of bound.context.edges) {
    if (!boundarySet.has(edge.sourceNodeId) || !boundarySet.has(edge.targetNodeId)) continue;
    const listA = adjacency.get(edge.sourceNodeId);
    if (listA === undefined) adjacency.set(edge.sourceNodeId, [edge.targetNodeId]);
    else listA.push(edge.targetNodeId);
    const listB = adjacency.get(edge.targetNodeId);
    if (listB === undefined) adjacency.set(edge.targetNodeId, [edge.sourceNodeId]);
    else listB.push(edge.sourceNodeId);
  }
  // Deterministic traversal: sorted frontier, visited set (policy §2).
  const visited = new Set<string>(from);
  const frontier = [...from].sort();
  while (frontier.length > 0) {
    const current = frontier.shift()!;
    if (to.has(current)) return true;
    for (const neighbor of (adjacency.get(current) ?? []).sort()) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        frontier.push(neighbor);
      }
    }
    frontier.sort();
  }
  return false;
}

/**
 * Deterministic structural-fit evidence for one pair (policy §13). Never
 * fabricates connectivity and never mutates the graph.
 */
export function buildStructuralFit(
  bound: ErSplitBoundContext,
  pair: CandidatePair,
): StructuralFitEvidence {
  const boundary = boundarySetFor(bound);
  const boundarySet = new Set(boundary);
  const left = bound.universeById.get(pair.leftCandidateId);
  const right = bound.universeById.get(pair.rightCandidateId);
  const sideA = left !== undefined ? sideSetFor(bound, left.observationId, boundarySet) : [];
  const sideB = right !== undefined ? sideSetFor(bound, right.observationId, boundarySet) : [];
  const bothSidesPresent = sideA.length > 0 && sideB.length > 0;
  const unionSize = new Set([...sideA, ...sideB]).size;
  const coverage = boundary.length > 0 ? unionSize / boundary.length : 0;

  let bridging = false;
  if (bothSidesPresent) {
    const connected = boundarySubgraphConnected(bound, boundarySet, new Set(sideA), new Set(sideB));
    bridging = !connected;
  }

  const structuralFitScore = Math.min(
    1,
    Math.max(
      0,
      STRUCTURAL_WEIGHT_BRIDGING * (bridging ? 1 : 0) +
        STRUCTURAL_WEIGHT_COVERAGE * coverage +
        STRUCTURAL_WEIGHT_BOTH_SIDES * (bothSidesPresent ? 1 : 0),
    ),
  );

  return {
    structuralFit: {
      holeBoundaryNodeIds: boundary,
      coveredNodeIdsA: sideA,
      coveredNodeIdsB: sideB,
      borderBridging: bridging,
    },
    structuralFitScore,
    coverage,
    bothSidesPresent,
  };
}