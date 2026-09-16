// ============================================================================
// Graph shapes — deterministic GraphNode/GraphEdge assembly (Phase 5A-PR12)
//
// The PR4/PR5/PR7 packages consume the repository contract shapes
// (@indago/contracts GraphNode / GraphEdge). The authoritative projected graph
// (@indago/graphology-projection buildGraph over GraphVersion replay) carries
// the document-critical subset (entityType, canonicalName, temporalRange,
// relationType, directionality, provenance). This helper maps that projection
// into the contract shapes with DETERMINISTIC neutral defaults ONLY for fields
// no detector/qualifier/analyser consumes (structuralImportance, support,
// observationCount, sourceCount): 0 = the empty signal, never an invented truth.
//
// Same projected graph + same (investigationId, graphVersionId, computedAt)
// ⇒ byte-identical shapes. computedAt is a REQUIRED caller input used ONLY for
// the createdAt/updatedAt audit stamps — it never influences semantics.
// ============================================================================

import type {
  GraphEdge,
  GraphNode,
  ObservedTime,
} from '@indago/contracts';
import type { BuiltGraph } from '@indago/graphology-projection';

export interface GraphShapeScope {
  readonly caseId: string;
  readonly investigationId: string;
  readonly graphVersionId: string;
  readonly computedAt: ObservedTime;
}

interface ProjectedNodeAttrs {
  readonly entityType?: string | null;
  readonly canonicalName?: string;
  readonly temporalRange?: unknown;
}

interface ProjectedEdgeAttrs {
  readonly relationType?: string;
  readonly sourceLabel?: string;
  readonly targetLabel?: string;
  readonly temporalRange?: unknown;
  readonly provenance?: unknown;
}

function toStamps(at: ObservedTime): { createdAt: ObservedTime; updatedAt: ObservedTime } {
  return { createdAt: at, updatedAt: at };
}

/** In-scope, deterministically ordered GraphNodes (region node members only). */
export function projectRegionNodes(
  built: BuiltGraph,
  regionNodeIds: readonly string[],
  scope: GraphShapeScope & { regionId: string },
): GraphNode[] {
  const member = new Set(regionNodeIds);
  return [...member]
    .sort()
    .filter((id) => built.graph.hasNode(id))
    .map<GraphNode>((id) => {
      const attrs = built.graph.getNodeAttributes(id) as ProjectedNodeAttrs;
      return {
        id,
        investigationId: scope.investigationId,
        versionId: scope.graphVersionId,
        type: attrs.entityType === 'EVIDENCE' || attrs.entityType === 'SOURCE'
          ? attrs.entityType
          : 'ENTITY',
        entityId: id,
        label: attrs.canonicalName ?? id,
        structuralImportance: 0,
        observationCount: 0,
        sourceCount: 0,
        ...(attrs.temporalRange !== undefined
          ? { temporalRange: attrs.temporalRange as GraphNode['temporalRange'] }
          : {}),
        ...toStamps(scope.computedAt),
      };
    });
}

/** In-scope, deterministically ordered GraphEdges (region edge members only). */
export function projectRegionEdges(
  built: BuiltGraph,
  regionEdgeIds: readonly string[],
  scope: GraphShapeScope & { regionId: string },
): GraphEdge[] {
  const member = new Set(regionEdgeIds);
  return [...member]
    .sort()
    .filter((id) => built.graph.hasEdge(id))
    .map<GraphEdge>((id) => {
      const attrs = built.graph.getEdgeAttributes(id) as ProjectedEdgeAttrs;
      const [a, b] = built.graph.extremities(id) as readonly [string, string];
      // Canonical endpoint assignment: direction kept for directed edges,
      // lexicographic for undirected (order-independent, deterministic).
      const [sourceNodeId, targetNodeId] =
        built.graph.isDirected(id) || a <= b ? [a, b] : [b, a];
      return {
        id,
        investigationId: scope.investigationId,
        versionId: scope.graphVersionId,
        sourceNodeId,
        targetNodeId,
        relationType: attrs.relationType as GraphEdge['relationType'],
        support: 0,
        structuralImportance: 0,
        directed: built.graph.isDirected(id),
        ...(attrs.temporalRange !== undefined
          ? { temporalRange: attrs.temporalRange as GraphEdge['temporalRange'] }
          : {}),
        status: 'ACTIVE',
        observationCount: 0,
        sourceCount: 0,
        ...toStamps(scope.computedAt),
      };
    });
}

/**
 * Authoritative relation refs present in the projected graph (the deterministic
 * RESOLVED producer input). Directed edges keep ordered endpoints; undirected
 * edges match endpoint set-equality downstream.
 */
export function projectPresentRelations(
  built: BuiltGraph,
): ReadonlyArray<{
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationType: string;
  readonly directed: boolean;
}> {
  const nodes = new Set(built.graph.nodes());
  return built.graph
    .edges()
    .map((edgeId) => {
      const attrs = built.graph.getEdgeAttributes(edgeId) as ProjectedEdgeAttrs;
      const [a, b] = built.graph.extremities(edgeId) as readonly [string, string];
      if (!nodes.has(a) || !nodes.has(b)) return null;
      return {
        sourceNodeId: a,
        targetNodeId: b,
        relationType: (attrs.relationType ?? '') as string,
        directed: built.graph.isDirected(edgeId),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((x, y) => {
      const left = `${x.sourceNodeId}:${x.targetNodeId}:${x.relationType}`;
      const right = `${y.sourceNodeId}:${y.targetNodeId}:${y.relationType}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
}