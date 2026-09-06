// ============================================================================
// PR-10 §45 — Graph projection scales (pure derivation, large synthetic graph)
//
// The presentation model must be CORRECT under investigation-scale inputs: a
// 1000-node / 3000-edge read must produce exactly one visual state per element
// and every derived flag must survive the indexing pass that replaced the
// O(V·E)/double-derivation hotspots (PR-10 performance):
//   - nodeById lookups (edges loop)
//   - the single-pass grounded-evidence incident map
//   - the single shared signal derivation
//
// These tests assert BEHAVIOR: for the reference workload the derived states
// (evidenceInScope, attention regions, caseScope, filter honesty) must equal
// what a brute-force reference model would say.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  deriveGraphVisualContext,
  deriveNodeSignals,
  deriveAttentionRegions,
  edgeIsGrounded,
  ATTENTION_CONVERGENCE_MIN_SIGNAL_TYPES,
  WEAK_SUPPORT_BAND_THRESHOLD,
} from "@/lib/graph/graph-visual-state";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";

// ---------------------------------------------------------------------------
// Synthetic graph builders (no fixtures — large sizes need generated data)
// ---------------------------------------------------------------------------

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    investigationId: "i-1",
    versionId: "v-1",
    type: "ENTITY",
    label: `entity-${id}`,
    structuralImportance: 0.5,
    observationCount: 2,
    sourceCount: 2,
    createdAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    ...over,
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  over: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id,
    investigationId: "i-1",
    versionId: "v-1",
    sourceNodeId,
    targetNodeId,
    relationType: "financial",
    support: 0.7,
    structuralImportance: 0.5,
    directed: true,
    status: "ACTIVE",
    observationCount: 1,
    sourceCount: 1,
    createdAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    ...over,
  };
}

/** 1000 isolated-ish nodes chained with 3000 edges (dense overlap chains). */
function largeGraph() {
  const nodes: GraphNode[] = Array.from({ length: 1000 }, (_, i) =>
    node(`n${i}`, { entityId: `ent${i}` }),
  );
  const edges: GraphEdge[] = [];
  for (let i = 0; i < 3000; i += 1) {
    const a = i % 1000;
    const b = (i * 7 + 123) % 1000;
    if (a === b) continue;
    edges.push(edge(`e${i}`, `n${a}`, `n${b}`));
  }
  return { nodes, edges };
}

describe("PR-10 §45 — one state per element at scale", () => {
  it("derives a 1000-node / 3000-edge projection with every id keyed exactly once", () => {
    const { nodes, edges } = largeGraph();
    const ctx = deriveGraphVisualContext({ nodes, edges, holes: [], activeTimeRange: null });

    expect(ctx.nodes.size).toBe(1000);
    expect(ctx.edges.size).toBe(3000);
    for (const n of nodes) {
      const state = ctx.nodes.get(n.id);
      expect(state).toBeDefined();
      expect(state!.caseScope).toBe("local");
    }
    for (const e of edges) {
      const state = ctx.edges.get(e.id);
      expect(state).toBeDefined();
      expect(state!.supportBand).toMatch(/strong|moderate/);
    }
  });

  it("edges whose endpoints are missing are honestly skipped, never fabricated", () => {
    const { nodes } = largeGraph();
    const dangling = edge("e-dangling", "n0", "missing-node");
    const ctx = deriveGraphVisualContext({
      nodes: nodes.slice(0, 50),
      edges: [...largeGraph().edges.slice(0, 100), dangling],
      holes: [],
      activeTimeRange: null,
    });
    expect(ctx.edges.has("e-dangling")).toBe(false);
    expect(ctx.nodes.size).toBeLessThanOrEqual(50);
  });

  it("the derivation is stable across repeated calls on the same snapshot", () => {
    const { nodes, edges } = largeGraph();
    const input = { nodes, edges, holes: [] as GraphHole[], activeTimeRange: null };
    const first = deriveGraphVisualContext(input);
    const second = deriveGraphVisualContext(input);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.edges).toEqual(second.edges);
    expect(first.regions).toEqual(second.regions);
  });
});

describe("PR-10 §45 — evidence-in-scope matches the brute-force reference", () => {
  it("marks exactly the nodes incident to grounded, non-contradicted edges", () => {
    const { nodes, edges } = largeGraph();
    const scored = edges.slice(0, 200);
    const contradicted = scored.map((e, i) =>
      edge(`c${i}`, e.sourceNodeId, e.targetNodeId, {
        status: "CONTRADICTED",
        observationCount: 3,
        sourceCount: 3,
      }),
    );
    const ungrounded = scored.map((e, i) =>
      edge(`u${i}`, e.sourceNodeId, e.targetNodeId, {
        observationCount: 0,
        sourceCount: 2,
      }),
    );
    const archived = scored.map((e, i) =>
      edge(`a${i}`, e.sourceNodeId, e.targetNodeId, {
        status: "ARCHIVED",
        observationCount: 3,
        sourceCount: 3,
      }),
    );
    const allEdges = [...edges, ...contradicted, ...ungrounded, ...archived];

    const ctx = deriveGraphVisualContext({
      nodes,
      edges: allEdges,
      holes: [],
      activeTimeRange: null,
      focusSeed: { kind: "evidence", id: "evidence-1", source: "graph" },
    });

    // Brute-force reference of the documented rule: incident AND grounded AND
    // NOT contradicted/archived.
    const expectedScope = new Set<string>();
    for (const e of allEdges) {
      if (e.status === "CONTRADICTED" || e.status === "ARCHIVED") continue;
      if (!edgeIsGrounded(e)) continue;
      expectedScope.add(e.sourceNodeId);
      expectedScope.add(e.targetNodeId);
    }

    for (const n of nodes) {
      expect(ctx.nodes.get(n.id)!.evidenceInScope).toBe(expectedScope.has(n.id));
    }
    // Edge contract: under an evidence focus, evidenceInScope follows groundness
    // (status is conveyed by posture) — contradicted-but-grounded is still in
    // evidence scope, an ungrounded edge never is.
    expect(ctx.edges.get("c0")!.evidenceInScope).toBe(true);
    expect(ctx.edges.get("c0")!.posture).toBe("contradicted");
    expect(ctx.edges.get("u0")!.evidenceInScope).toBe(false);
  });
});

describe("PR-10 §45 — attention regions at scale", () => {
  it("detects weak-support + an unresolved observation converging into one region", () => {
    // One entity joined to an unresolved observation by a WEAK edge → two
    // distinct signal types in one connected component → exactly ONE region.
    const nodes = [
      node("va", { entityId: "ent-va", type: "ENTITY" }),
      node("wb", {
        entityId: "ent-wb",
        type: "OBSERVATION",
        observationCount: 0,
        sourceCount: 0,
      }),
    ];
    const edges = [
      edge("weak-1", "va", "wb", { support: WEAK_SUPPORT_BAND_THRESHOLD - 0.01 }),
    ];
    const holes: GraphHole[] = [];

    const ctx = deriveGraphVisualContext({
      nodes,
      edges,
      holes,
      activeTimeRange: null,
    });

    expect(ctx.regions).toHaveLength(1);
    expect(ctx.regions[0]!.memberNodeIds.sort()).toEqual(["va", "wb"]);
    expect(ctx.regions[0]!.signalTypes)
      .toEqual(expect.arrayContaining(["weak-support", "unresolved"]));
    expect(ATTENTION_CONVERGENCE_MIN_SIGNAL_TYPES).toBe(2);
  });

  it("a single-signal node never forms a region by itself", () => {
    const nodes = [node("alone", { entityId: "ent-alone", type: "ENTITY" })];
    const edges: GraphEdge[] = [];
    const allNodes = [
      ...nodes,
      node("o1", { entityId: "ent-o1", type: "OBSERVATION", observationCount: 0, sourceCount: 0 }),
    ];
    const ctx = deriveGraphVisualContext({
      nodes: allNodes,
      edges,
      holes: [],
      activeTimeRange: null,
    });
    // Only "unresolved" fires (the lone primary has no signals) → no region.
    const signals = deriveNodeSignals({ nodes: allNodes, edges, holes: [], filter: null });
    expect(signals.get("o1")!.size).toBe(1);
    expect(ctx.regions).toHaveLength(0);
  });

  it("filtered edges do not leak weak-support attention into the projection", () => {
    // Without a filter: weak edge joins an entity to an unresolved observation
    // → {weak-support, unresolved} converge into ONE region.
    const nodes = [
      node("aa", { entityId: "ent-aa", type: "ENTITY" }),
      node("bb", {
        entityId: "ent-bb",
        type: "OBSERVATION",
        observationCount: 0,
        sourceCount: 0,
      }),
    ];
    const weakEdge = edge("weak-1", "aa", "bb", { support: 0.2 });
    const edges = [weakEdge];

    const visibleAllowed = deriveGraphVisualContext({
      nodes,
      edges,
      holes: [],
      activeTimeRange: null,
      filter: { minSupport: 0.5, hideContradicted: false },
    });
    // With minSupport 0.5 the weak edge is filtered out → the weak-support
    // signal disappears, the observation is left single-signal, so nothing
    // converges → no region, no attention from that edge.
    expect(visibleAllowed.regions).toHaveLength(0);
    expect(visibleAllowed.nodes.get("aa")!.attentionLevel).toBe(0);

    // Sanity: the same snapshot without a filter still generates the region.
    const unfiltered = deriveGraphVisualContext({
      nodes,
      edges,
      holes: [],
      activeTimeRange: null,
    });
    expect(unfiltered.regions).toHaveLength(1);
  });
});

describe("PR-10 §45 — foreign/contradiction flags survive at scale", () => {
  it("originally O(V·E) rules scale to the 1000/3000 workload without state loss", () => {
    const { nodes, edges } = largeGraph();
    const contradictedEdge = edge("big-con", "n0", "n1", {
      status: "CONTRADICTED",
      observationCount: 4,
      sourceCount: 4,
    });
    const foreignNode = node("foreign-a", {
      entityId: "ent-fa",
      observationCount: 0,
      sourceCount: 0,
    });
    const foreignEdges = [
      edge("foreign-e", "foreign-a", "n2", {
        observationCount: 0,
        sourceCount: 1,
      }),
    ];

    const ctx = deriveGraphVisualContext({
      nodes: [...nodes, foreignNode],
      edges: [...edges, contradictedEdge, ...foreignEdges],
      holes: [],
      activeTimeRange: null,
      foreignNodeIds: new Set(["foreign-a"]),
      foreignEdgeIds: new Set(["foreign-e"]),
    });

    expect(ctx.nodes.get("foreign-a")!.caseScope).toBe("foreign");
    expect(ctx.edges.get("foreign-e")!.caseScope).toBe("foreign");
    expect(ctx.edges.get("foreign-e")!.grounded).toBe(false);
    expect(ctx.edges.get("big-con")!.posture).toBe("contradicted");
    // The contradicted edge still feeds contradiction signals to both endpoints.
    expect(ctx.nodes.get("n0")!.attentionLevel).toBeGreaterThan(0);
    expect(deriveAttentionRegions).toBeTypeOf("function");
  });
});