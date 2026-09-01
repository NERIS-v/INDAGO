// ============================================================================
// Operation Financial Shadow — Discovery Mode candidates
//
// Deterministic Discovery candidates derived ONLY from canonical graph data.
// NO new scoring model is invented: ranking is standard graph degree (ties
// broken by the canonical structuralImportance field), and reasons are
// assembled from real fixture facts (cut edges, contradicted edges, cross-source
// identifiers, observation counts). This is a structural/hypothesis surface —
// NOT a relevance or guilt ranking.
// ============================================================================

import type { DiscoveryCandidate } from "../../types";
import { operationFinancialShadowGraph } from "./graph";
import { operationFinancialShadowEntities } from "./entities";

function undirectedNeighbors(
  nodeId: string,
  edges: ReadonlyArray<{ sourceNodeId: string; targetNodeId: string }>,
): string[] {
  const result: string[] = [];
  for (const e of edges) {
    if (e.sourceNodeId === nodeId) result.push(e.targetNodeId);
    if (e.targetNodeId === nodeId) result.push(e.sourceNodeId);
  }
  return result;
}

/** Undirected reachability (BFS) used for cut-edge detection. */
function isReachableFrom(
  start: string,
  goal: string,
  edges: ReadonlyArray<{ sourceNodeId: string; targetNodeId: string }>,
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.sourceNodeId)) adj.set(e.sourceNodeId, []);
    if (!adj.has(e.targetNodeId)) adj.set(e.targetNodeId, []);
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    adj.get(e.targetNodeId)!.push(e.sourceNodeId);
  }
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === goal) return true;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Compute Discovery candidates for the fixture graph. Deterministic and pure —
 * callers may invoke it repeatedly and always receive the same result.
 */
export function deriveDiscoveryCandidates(): DiscoveryCandidate[] {
  const nodes = operationFinancialShadowGraph.nodes;
  const edges = operationFinancialShadowGraph.edges;
  const entityByNode = new Map(
    nodes
      .filter((n) => n.type === "ENTITY" && n.entityId)
      .map((n) => [n.id, n.entityId!]),
  );

  // Cut edges (undirected): removing the edge disconnects its endpoints.
  const cutEdges = new Set<string>();
  for (const e of edges) {
    const remaining = edges.filter((x) => x.id !== e.id);
    if (!isReachableFrom(e.sourceNodeId, e.targetNodeId, remaining)) {
      cutEdges.add(e.id);
    }
  }

  const candidates: DiscoveryCandidate[] = [];
  for (const node of nodes) {
    if (!entityByNode.has(node.id)) continue;
    const entity = operationFinancialShadowEntities.find(
      (e) => e.id === entityByNode.get(node.id),
    );
    if (!entity) continue;

    const neighbors = undirectedNeighbors(node.id, edges);
    const degree = neighbors.length;
    const contradicted = edges.filter(
      (e) =>
        e.status === "CONTRADICTED" &&
        (e.sourceNodeId === node.id || e.targetNodeId === node.id),
    );
    const incidentCutEdges = edges.filter(
      (e) => cutEdges.has(e.id) && (e.sourceNodeId === node.id || e.targetNodeId === node.id),
    );

    const reasons: string[] = [];
    if (degree >= 3) {
      reasons.push(`Central wiring point: joins ${degree} of ${edges.length} flows.`);
    }
    if (incidentCutEdges.length > 0) {
      reasons.push(
        `Bridge: a single link (${incidentCutEdges.map((e) => e.id).join(", ")}) connects this node's subgraph to the rest of the network.`,
      );
    }
    if (contradicted.length > 0) {
      reasons.push(
        `Incident to a CONTRADICTED link (${contradicted.map((e) => e.id).join(", ")}) — relationship under dispute, not resolved.`,
      );
    }
    if (node.sourceCount >= 2) {
      reasons.push(`Cross-source: identifiers from ${node.sourceCount} independent sources.`);
    }

    candidates.push({
      id: `disc:${node.id}`,
      nodeId: node.id,
      entityId: entity.id,
      label: node.label,
      type: node.type,
      degree,
      structuralImportance: node.structuralImportance,
      observationCount: node.observationCount,
      sourceCount: node.sourceCount,
      contradictedEdgeIds: contradicted.map((e) => e.id),
      bridgeNote:
        incidentCutEdges.length > 0
          ? `Connected to the network through a single cut edge (${incidentCutEdges.map((e) => e.id).join(", ")}).`
          : null,
      reasons,
      supportingObservationIds: entity.observationIds,
    });
  }

  return candidates
    .sort(
      (a, b) =>
        b.degree - a.degree ||
        b.structuralImportance - a.structuralImportance ||
        a.label.localeCompare(b.label),
    )
    .slice(0, 3);
}

/** Default top-3 discovery candidates for the demo investigation. */
export const demoDiscoveryCandidates: DiscoveryCandidate[] =
  deriveDiscoveryCandidates();