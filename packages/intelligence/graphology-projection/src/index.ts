// ============================================================================
// M-A10 Graph Projection (Graphology) — public surface
//
// Neo4j was replaced by Graphology as the current in-process graph
// implementation. PostgreSQL remains authoritative; Graphology is a derived
// graph projection that can be rebuilt from authoritative domain records
// (§31, §35, §77).
//
// Domain contracts do NOT depend on Graphology — this module translates
// canonical entities + ACCEPTED relations into a Graphology graph and exposes
// bounded, read-only analytics (traversal, centrality, communities).
// ============================================================================

export { buildGraph, Graph, GRAPH_PROJECTION_BOUNDS } from './build-graph.js';
export type { BuiltGraph } from './build-graph.js';

export { traverseBounded, TRAVERSAL_BOUNDS } from './traversal.js';
export type {
  TraversalHopCert,
  TraversalPath,
  TraversalStep,
  TraversalOptions,
} from './traversal.js';

export { degreeCentrality, CENTRALITY_BOUNDS } from './centrality.js';
export type { CentralityResult } from './centrality.js';

export { detectCommunities, COMMUNITY_BOUNDS } from './communities.js';
export type { CommunityResult } from './communities.js';

export type {
  GraphProjectionInput,
  GraphNode,
  GraphEdge,
} from './types.js';
