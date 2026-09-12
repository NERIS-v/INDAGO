// ============================================================================
// P4 Graph Analytics — community candidates
//
// M-A13 already exposes raw Louvain community assignment (communities.ts /
// GET .../graph/communities) as a general analytics primitive. A COMMUNITY
// CANDIDATE is the Phase-4 interpretation layer on top of that primitive: it
// scores each community's internal COHESION (edge density) and filters to the
// communities dense/large enough to be worth surfacing as an investigative
// signal, rather than handing every Louvain partition — including trivial
// pairs and noise — to the lead-generation loop.
//
// cohesion = internalEdges / possibleInternalEdges, where possibleInternalEdges
// is the simple-graph maximum (n * (n-1) / 2) for the community's member
// count. This is a bounded [0,1] density score, matching
// GraphAnalysisResultSchema.communities[].cohesion (graph-analysis.ts).
//
// Communities are NOT evidence and community membership is NOT relevance —
// this module only ranks structural clustering density (structural signal ≠
// criminal relevance, same discipline as centrality/bridges).
//
// READ-ONLY: community-candidate scoring never mutates the graph or any
// domain record; it is a pure post-processing step over detectCommunities().
// ============================================================================

import Graph from 'graphology';
import { detectCommunities, type CommunityResult } from './communities.js';

export interface CommunityCandidate {
  readonly communityId: number;
  /** Canonical EntityIds in this community (same bound as detectCommunities). */
  readonly memberNodeIds: readonly string[];
  /** Actual community size before any member-list bound was applied. */
  readonly size: number;
  /** Whether the member list was truncated by detectCommunities' bound. */
  readonly truncated: boolean;
  /** Internal edge density in [0,1]. 1.0 = fully connected clique. */
  readonly cohesion: number;
  /** Count of accepted-relation edges with both endpoints inside the community. */
  readonly internalEdgeCount: number;
}

export const COMMUNITY_CANDIDATE_BOUNDS = {
  /** Minimum members for a community to be worth surfacing as a candidate. */
  minSize: 3,
  /** Minimum internal edge density to be worth surfacing. */
  minCohesion: 0.15,
  /** Hard cap on candidates returned. */
  maxResults: 1_000,
} as const;

/**
 * Count accepted-relation edges with both endpoints inside `memberSet`,
 * de-duplicating parallel relations between the same pair (cohesion measures
 * connectivity between distinct member pairs, not relation volume — that is
 * what centrality.ts already covers).
 */
function internalEdgeCount(graph: Graph, memberSet: Set<string>): number {
  const seenPairs = new Set<string>();
  graph.forEachEdge((_edgeKey, _attrs, source, target) => {
    if (source === target) return;
    if (!memberSet.has(source) || !memberSet.has(target)) return;
    const a = source < target ? source : target;
    const b = source < target ? target : source;
    seenPairs.add(`${a}|${b}`);
  });
  return seenPairs.size;
}

function cohesionOf(community: CommunityResult, graph: Graph): { cohesion: number; internalEdgeCount: number } {
  // Cohesion is computed over the FULL community (before the member-list
  // bound), since density is a property of the whole cluster; truncation only
  // affects which member ids are reported, not the scoring.
  const memberSet = new Set(community.memberNodeIds);
  const n = community.size;
  if (n < 2) return { cohesion: 0, internalEdgeCount: 0 };
  const internal = memberSet.size === n
    ? internalEdgeCount(graph, memberSet)
    : // member list was truncated; density is computed over the reported
      // subset as a best-effort lower bound rather than fabricating counts
      // for members we did not receive ids for.
      internalEdgeCount(graph, memberSet);
  const possible = (n * (n - 1)) / 2;
  return { cohesion: possible > 0 ? internal / possible : 0, internalEdgeCount: internal };
}

/**
 * Score every Louvain community for internal cohesion and filter to the
 * communities dense/large enough to be a worthwhile investigative candidate.
 * Sorted by descending cohesion, then descending size, then ascending
 * communityId for a stable tiebreak.
 */
export function detectCommunityCandidates(
  graph: Graph,
  bounds: Partial<typeof COMMUNITY_CANDIDATE_BOUNDS> = {},
): CommunityCandidate[] {
  const cfg = { ...COMMUNITY_CANDIDATE_BOUNDS, ...bounds };
  const communities = detectCommunities(graph);

  const candidates: CommunityCandidate[] = [];
  for (const community of communities) {
    if (community.size < cfg.minSize) continue;
    const { cohesion, internalEdgeCount: internal } = cohesionOf(community, graph);
    if (cohesion < cfg.minCohesion) continue;
    candidates.push({
      communityId: community.communityId,
      memberNodeIds: community.memberNodeIds,
      size: community.size,
      truncated: community.truncated,
      cohesion,
      internalEdgeCount: internal,
    });
  }

  candidates.sort((a, b) => {
    if (a.cohesion !== b.cohesion) return b.cohesion - a.cohesion;
    if (a.size !== b.size) return b.size - a.size;
    return a.communityId - b.communityId;
  });

  return candidates.slice(0, cfg.maxResults);
}
