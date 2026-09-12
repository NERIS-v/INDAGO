// ============================================================================
// P4 Graph Analytics — connecting path candidates
//
// M-A13 already delivered and tested bounded N-hop traversal (traversal.ts /
// GET .../graph/traversal) as a general primitive: "expand every reachable
// path from one node". The Phase-4 investigation loop needs a narrower,
// purpose-built question the raw traversal primitive does not directly
// answer: "how (if at all) are THESE TWO specific entities connected?" — e.g.
// two entities surfaced independently by separate leads, or the two endpoints
// of a candidate cross-case link.
//
// This module wires traverseBounded into that query: it expands bounded paths
// from the source node and keeps only the ones that actually terminate at the
// target node, ranked shortest-first. It does not implement a new traversal
// algorithm — it is a thin, deterministic filter over the existing bounded
// primitive, which is what makes it "wiring" rather than new analytics.
//
// READ-ONLY: never mutates the graph or any domain record.
// ============================================================================

import Graph from 'graphology';
import { traverseBounded, TRAVERSAL_BOUNDS, type TraversalPath } from './traversal.js';

export interface ConnectingPathCandidate extends TraversalPath {
  readonly targetNodeId: string;
}

export const CONNECTING_PATH_BOUNDS = {
  /** Hard cap on connecting paths returned. */
  maxResults: 200,
} as const;

/**
 * Find bounded paths from `sourceNodeId` to `targetNodeId`. Delegates all
 * expansion/bounding to traverseBounded (same hop cap, same
 * maxExpandedWalksPerLevel work bound) and filters to paths whose last node is
 * the target. Results are already shortest-first because traverseBounded
 * emits paths in BFS level order.
 *
 * Returns an empty array (never throws) if either node is absent from the
 * projection or unreachable within the hop bound — "no path found" is a valid,
 * common investigative answer, not an error.
 */
export function findConnectingPaths(
  graph: Graph,
  sourceNodeId: string,
  targetNodeId: string,
  options: { hops?: number; maxResults?: number } = {},
): ConnectingPathCandidate[] {
  if (!graph.hasNode(sourceNodeId) || !graph.hasNode(targetNodeId)) return [];
  if (sourceNodeId === targetNodeId) return [];

  const maxResults = options.maxResults ?? CONNECTING_PATH_BOUNDS.maxResults;
  const hops = options.hops ?? TRAVERSAL_BOUNDS.maxHops;

  // Ask the bounded primitive for enough candidate paths to find matches
  // reliably; traverseBounded's own maxPaths cap still bounds the work done.
  const allPaths = traverseBounded(graph, sourceNodeId, {
    hops,
    maxPaths: TRAVERSAL_BOUNDS.maxPaths,
  });

  const matches: ConnectingPathCandidate[] = [];
  for (const path of allPaths) {
    const lastNode = path.nodes[path.nodes.length - 1];
    if (lastNode?.nodeId !== targetNodeId) continue;
    matches.push({ ...path, targetNodeId });
    if (matches.length >= maxResults) break;
  }

  return matches;
}
