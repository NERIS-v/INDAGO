// ============================================================================
// M-A10 Graph Projection — buildGraph
//
// Deterministically build a Graphology graph from authoritative domain
// records (§32, §35, §65):
//
//   nodes = canonical entities
//   edges = ACCEPTED canonical relations
//
// PROPOSED RelationHypotheses MUST NOT become canonical edges by default.
//
// Deterministic: the same domain records produce the same nodes, edges, and
// metadata. Node identity = canonical EntityId; edge identity = canonical
// RelationId (addEdgeWithKey). Case isolation is enforced by the caller, which
// supplies exactly one case's records.
//
// This module is PURE — no Prisma/BullMQ/network. It only translates plain
// domain records into an in-process Graphology graph.
// ============================================================================

import Graph from 'graphology';
import { isRelationDirected } from '@indago/relation-resolution';
import type { RelationType } from '@indago/contracts';

export { Graph };

export interface BuiltGraph {
  readonly caseId: string;
  readonly graph: Graph;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

/**
 * Bound on the projection input to prevent unbounded graph construction from
 * pathological domain records.
 */
export const GRAPH_PROJECTION_BOUNDS = {
  /** Hard cap on canonical entity nodes projected per case. */
  maxNodes: 50_000,
  /** Hard cap on accepted-relation edges projected per case. */
  maxEdges: 500_000,
} as const;

/**
 * Build a deterministic Graphology graph from canonical domain records.
 *
 * Node attributes:
 *   entityType  → canonical EntityType
 *   canonicalName
 *   caseId
 *
 * Edge attributes:
 *   relationType
 *   provenance
 *   caseId
 *
 * DIRECTIONALITY: each edge is constructed with the Graph method that matches
 * the relation's domain semantics:
 *   - an UNDIRECTED relation becomes a Graphology UNDIRECTED edge
 *     (graph.addUndirectedEdgeWithKey);
 *   - a DIRECTED relation becomes a Graphology DIRECTED edge
 *     (graph.addDirectedEdgeWithKey, source → target).
 * Graphology dictates the structural type; we never store a `directed`
 * metadata attribute on an undirected edge to fake direction.
 */
export function buildGraph(input: GraphProjectionInputLike): BuiltGraph {
  const nodes = input.nodes.slice(0, GRAPH_PROJECTION_BOUNDS.maxNodes);
  const edges = input.edges.slice(0, GRAPH_PROJECTION_BOUNDS.maxEdges);

  const graph = new Graph();
  graph.setAttribute('caseId', input.caseId);

  const nodeMap = new Map<string, GraphProjectionInputLike['nodes'][number]>();
  for (const n of nodes) {
    if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
  }
  const edgeMap = new Map<string, GraphProjectionInputLike['edges'][number]>();
  for (const e of edges) {
    if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
  }

  // Deterministic node insertion order (sorted by canonical EntityId).
  const nodeIds = [...nodeMap.keys()].sort();
  for (const id of nodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    graph.addNode(id, {
      entityType: node.entityType,
      canonicalName: node.canonicalName,
      caseId: input.caseId,
    });
  }

  // Deterministic edge insertion order (sorted by relation id).
  const edgeIds = [...edgeMap.keys()].sort();
  for (const id of edgeIds) {
    const edge = edgeMap.get(id);
    if (!edge) continue;
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      // A relation referencing a non-projected node is a domain integrity
      // violation — skip it rather than fabricate a node (edges only connect
      // canonical entities that are part of this case's projection).
      continue;
    }
    if (edge.source === edge.target) continue; // no self-loops in the projection
    if (!graph.hasEdge(id)) {
      // Directionality is a structural property, not metadata. The AUTHORITATIVE
      // source is the relation's domain type (the directed/undirected split in
      // @indago/relation-resolution). A caller-supplied `directed` override is
      // honored only when present (defensive; never the authority).
      //   - directed   → Graphology directed edge (source → target)
      //   - undirected → Graphology undirected edge
      const directed = edge.directed ?? isRelationDirected(edge.relationType as RelationType);
      const attrs = {
        relationType: edge.relationType,
        relationId: id,
        sourceLabel: edge.sourceLabel,
        targetLabel: edge.targetLabel,
        provenance: edge.provenance,
        caseId: input.caseId,
      };
      if (directed) {
        graph.addDirectedEdgeWithKey(id, edge.source, edge.target, attrs);
      } else {
        graph.addUndirectedEdgeWithKey(id, edge.source, edge.target, attrs);
      }
    }
  }

  return {
    caseId: input.caseId,
    graph,
    nodeCount: graph.order,
    edgeCount: graph.size,
  };
}

// Local alias to keep the import graph clean for the homogeneous signature.
type GraphProjectionInputLike = import('./types.js').GraphProjectionInput;
