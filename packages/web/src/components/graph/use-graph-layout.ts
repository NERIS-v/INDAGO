"use client";

import { useMemo } from "react";
import type { GraphNode, GraphEdge } from "@indago/contracts";

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  communityId: number;
  isBridge: boolean;
}

export interface LayoutEdge extends GraphEdge {
  isBridge: boolean;
}

export interface CommunityRegion {
  id: number;
  cx: number;
  cy: number;
  r: number;
}

interface LayoutResult {
  layoutNodes: LayoutNode[];
  layoutEdges: LayoutEdge[];
  communities: CommunityRegion[];
  settled: boolean;
}

const NODE_MARGIN_X = 150;
const NODE_MARGIN_Y = 90;

/**
 * Computes exact bridge edges (cut edges) via Tarjan's DFS low-link algorithm in O(V+E) time.
 * Explicitly excludes parent edge IDs during traversal to safely handle parallel multi-edges.
 */
function findBridgeEdges(
  nodeIds: string[],
  adjacency: Map<string, { neighbor: string; edgeId: string }[]>
): Set<string> {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const visited = new Set<string>();
  const bridgeEdgeIds = new Set<string>();
  let timer = 0;

  function dfs(u: string, parentEdgeId: string | null) {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer);
    timer += 1;

    for (const { neighbor: v, edgeId } of adjacency.get(u) ?? []) {
      if (edgeId === parentEdgeId) continue;
      if (!visited.has(v)) {
        dfs(v, edgeId);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) {
          bridgeEdgeIds.add(edgeId);
        }
      } else {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) dfs(id, null);
  }

  return bridgeEdgeIds;
}

/** 
 * Computes non-linear node radius based on structural importance.
 * Utilized by both the layout engine (for accurate repulsion scaling) and the canvas renderer.
 */
export function nodeVisualRadius(importance: number | undefined): number {
  const clamped = Math.max(0, Math.min(1, importance ?? 0.5));
  return 5 + Math.pow(clamped, 1.3) * 13;
}

/**
 * Deterministic force-directed layout engine.
 * 
 * Note: `communityId` and `isBridge` are computed client-side for presentation 
 * (fog regions and halos). These should be migrated to backend GraphAnalysisResult 
 * fields once the topology analysis API is available.
 * 
 * Physics and structural groupings strictly apply only to ACTIVE edges.
 */
export function useGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
) {
  return useMemo<LayoutResult>(() => {
    if (!nodes.length || width === 0 || height === 0) {
      return { layoutNodes: [], layoutEdges: [], communities: [], settled: false };
    }

    const structuralEdges = edges.filter((e) => e.status === "ACTIVE");

    // Connected components grouping
    const adjacency = new Map<string, Set<string>>();
    nodes.forEach((n) => adjacency.set(n.id, new Set()));
    structuralEdges.forEach((e) => {
      adjacency.get(e.sourceNodeId)?.add(e.targetNodeId);
      adjacency.get(e.targetNodeId)?.add(e.sourceNodeId);
    });

    const communityOf = new Map<string, number>();
    let communityCounter = 0;
    nodes.forEach((n) => {
      if (communityOf.has(n.id)) return;
      const queue = [n.id];
      communityOf.set(n.id, communityCounter);
      while (queue.length) {
        const cur = queue.shift()!;
        for (const neighbor of adjacency.get(cur) ?? []) {
          if (!communityOf.has(neighbor)) {
            communityOf.set(neighbor, communityCounter);
            queue.push(neighbor);
          }
        }
      }
      communityCounter += 1;
    });

    // Exact bridge-edge detection
    const dfsAdjacency = new Map<string, { neighbor: string; edgeId: string }[]>();
    nodes.forEach((n) => dfsAdjacency.set(n.id, []));
    structuralEdges.forEach((e) => {
      dfsAdjacency.get(e.sourceNodeId)?.push({ neighbor: e.targetNodeId, edgeId: e.id });
      dfsAdjacency.get(e.targetNodeId)?.push({ neighbor: e.sourceNodeId, edgeId: e.id });
    });
    const bridgeEdgeIds = findBridgeEdges(
      nodes.map((n) => n.id),
      dfsAdjacency
    );
    const bridgeNodeIds = new Set<string>();
    structuralEdges.forEach((e) => {
      if (bridgeEdgeIds.has(e.id)) {
        bridgeNodeIds.add(e.sourceNodeId);
        bridgeNodeIds.add(e.targetNodeId);
      }
    });

    // Deterministic initial placement
    const initialized: LayoutNode[] = nodes.map((n, i) => {
      const cId = communityOf.get(n.id) ?? 0;
      const angle = (i / nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.35;
      return {
        ...n,
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        communityId: cId,
        isBridge: bridgeNodeIds.has(n.id),
      };
    });

    const nodeById = new Map<string, LayoutNode>();
    initialized.forEach((n) => nodeById.set(n.id, n));

    const springEdges = structuralEdges
      .map((e) => ({ source: nodeById.get(e.sourceNodeId), target: nodeById.get(e.targetNodeId) }))
      .filter((e): e is { source: LayoutNode; target: LayoutNode } => Boolean(e.source && e.target));

    // Force simulation
    const iterations = 300;
    const k = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 1.6;
    const speed = 0.1;
    const centerX = width / 2;
    const centerY = height / 2;
    const gravity = 0.005;
    let temperature = width / 4;

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < initialized.length; i++) {
        for (let j = i + 1; j < initialized.length; j++) {
          const u = initialized[i];
          const v = initialized[j];
          if (!u || !v) continue;
          let dx = u.x - v.x;
          let dy = u.y - v.y;
          if (dx === 0 && dy === 0) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
          }
          const dist = Math.max(10, Math.sqrt(dx * dx + dy * dy));
          const sameCommunity = u.communityId === v.communityId;
          
          // Scale repulsion by rendered node radius to prevent overlap among high-centrality hubs
          const sizeFactor =
            1 + (nodeVisualRadius(u.structuralImportance) + nodeVisualRadius(v.structuralImportance)) / 24;
          const force = ((k * k) / dist) * (sameCommunity ? 1.0 : 1.5) * sizeFactor;
          
          u.vx += (dx / dist) * force;
          u.vy += (dy / dist) * force;
          v.vx -= (dx / dist) * force;
          v.vy -= (dy / dist) * force;
        }
      }

      for (const { source, target } of springEdges) {
        let dx = source.x - target.x;
        let dy = source.y - target.y;
        if (dx === 0 && dy === 0) {
          dx = 0.1;
          dy = 0.1;
        }
        const dist = Math.max(10, Math.sqrt(dx * dx + dy * dy));
        const force = (dist * dist) / (k * 1.5);
        
        source.vx -= (dx / dist) * force;
        source.vy -= (dy / dist) * force;
        target.vx += (dx / dist) * force;
        target.vy += (dy / dist) * force;
      }

      for (const node of initialized) {
        node.vx += (centerX - node.x) * gravity * k;
        node.vy += (centerY - node.y) * gravity * k;
        node.vx *= 0.85;
        node.vy *= 0.85;

        const vMag = Math.sqrt(node.vx * node.vx + node.vy * node.vy) || 1;
        if (vMag > temperature) {
          node.vx = (node.vx / vMag) * temperature;
          node.vy = (node.vy / vMag) * temperature;
        }

        node.x += node.vx * speed;
        node.y += node.vy * speed;
        node.x = Math.max(NODE_MARGIN_X, Math.min(width - NODE_MARGIN_X, node.x));
        node.y = Math.max(NODE_MARGIN_Y, Math.min(height - NODE_MARGIN_Y, node.y));
      }
      temperature *= 0.98;
    }

    // Community fog regions
    const communities: CommunityRegion[] = [];
    for (let c = 0; c < communityCounter; c++) {
      const members = initialized.filter((n) => n.communityId === c);
      if (members.length < 2) continue;
      const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
      const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
      const r = Math.max(...members.map((n) => Math.hypot(n.x - cx, n.y - cy))) + 46;
      communities.push({ id: c, cx, cy, r });
    }

    // Exclude ARCHIVED edges from the active projection
    const layoutEdges: LayoutEdge[] = edges
      .filter((e) => e.status !== "ARCHIVED")
      .map((e) => ({ ...e, isBridge: bridgeEdgeIds.has(e.id) }));

    return { layoutNodes: initialized, layoutEdges, communities, settled: true };
  }, [nodes, edges, width, height]);
}