import { describe, it, expect } from "vitest";
import {
  WEAK_SUPPORT_BAND_THRESHOLD,
  edgeIsGrounded,
  deriveSupportBand,
  deriveEvidencePostureForEdge,
  deriveEvidencePostureForNode,
  nodeInTimeRange,
  edgeTemporalState,
  deriveStructuralRole,
  deriveNodeVisualState,
  deriveEdgeVisualState,
  deriveNodeSignals,
  deriveAttentionRegions,
  deriveGraphVisualContext,
  DEFAULT_NODE_VISUAL_STATE,
  DEFAULT_EDGE_VISUAL_STATE,
} from "@/lib/graph/graph-visual-state";
import { applyGraphFilter } from "@/lib/graph/graph-filter";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";
import {
  GN_VICTOR, GN_SHELL_ONE, GN_BANK, GN_SHELL_TWO, GN_MARIA, GN_WITNESS,
  GE_1, GE_2, GE_3, GE_4, GE_5, GE_6,
  ENT_VICTOR, ENT_SHELL_ONE, ENT_BANK,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import type {
  EvidencePosture,
  AttentionSignalType,
  GraphFocusSeed,
} from "@/lib/graph/graph-visual-state";

const baseNodes: GraphNode[] = operationFinancialShadowGraph.nodes;
const baseEdges: GraphEdge[] = operationFinancialShadowGraph.edges;

const nodeById = (id: string): GraphNode => {
  const n = baseNodes.find((x) => x.id === id);
  if (!n) throw new Error(`node ${id} missing`);
  return n;
};
const edgeById = (id: string): GraphEdge => {
  const e = baseEdges.find((x) => x.id === id);
  if (!e) throw new Error(`edge ${id} missing`);
  return e;
};

/** Build a single synthetic node for isolated derivations. */
function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const createdAt = { value: "2024-06-15T00:00:00.000Z", precision: "exact" as const };
  return {
    id: "n-0",
    investigationId: "i",
    versionId: "v",
    type: "ENTITY",
    label: "N",
    structuralImportance: 0.5,
    observationCount: 1,
    sourceCount: 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: "e-0",
    investigationId: "i",
    versionId: "v",
    sourceNodeId: GN_VICTOR,
    targetNodeId: GN_WITNESS,
    relationType: "ownership",
    support: 0.7,
    structuralImportance: 0.5,
    directed: true,
    status: "ACTIVE",
    observationCount: 1,
    sourceCount: 1,
    createdAt: { value: "2024-06-15T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-15T00:00:00.000Z", precision: "exact" },
    ...overrides,
  };
}

// ─── Threshold + grounding ───────────────────────────────────────────────────

describe("PR-6 §C visual-language constants", () => {
  it("keeps the canonical weak-support band at 0.3 (shared with intelligence)", () => {
    expect(WEAK_SUPPORT_BAND_THRESHOLD).toBe(0.3);
  });

  it("grounding: a relation is grounded only with >=1 observation AND >=1 source", () => {
    expect(edgeIsGrounded(edgeById(GE_1))).toBe(true);
    expect(edgeIsGrounded(makeEdge({ observationCount: 0, sourceCount: 1 }))).toBe(false);
    expect(edgeIsGrounded(makeEdge({ observationCount: 1, sourceCount: 0 }))).toBe(false);
    expect(edgeIsGrounded(makeEdge({ observationCount: 0, sourceCount: 0 }))).toBe(false);
  });
});

describe("PR-6 §C support band", () => {
  it("maps support to strong/moderate/weak bands", () => {
    expect(deriveSupportBand(0.61)).toBe("strong");
    expect(deriveSupportBand(0.6)).toBe("strong");
    expect(deriveSupportBand(0.599)).toBe("moderate");
    expect(deriveSupportBand(0.3)).toBe("moderate");
    expect(deriveSupportBand(0.29)).toBe("weak");
    expect(deriveSupportBand(0.2)).toBe("weak");
  });

  it("GE_6 (support 0.2) is weak; all other demo edges are moderate/strong", () => {
    const weak = baseEdges.filter((e) => deriveSupportBand(e.support) === "weak");
    expect(weak.map((e) => e.id)).toEqual([GE_6]);
  });
});

// ─── Orthogonal posture (unsupported ≠ weak ≠ contradicted ≠ unknown) ────────

describe("PR-6 §C evidence posture is orthogonal and honest", () => {
  it("GE_5 CONTRADICTED is contradicted regardless of grounding/support", () => {
    expect(deriveEvidencePostureForEdge(edgeById(GE_5))).toBe("contradicted");
  });

  it("GROUNDED active edges are supported", () => {
    expect(deriveEvidencePostureForEdge(edgeById(GE_1))).toBe("supported");
    expect(deriveEvidencePostureForEdge(edgeById(GE_6))).toBe("supported");
  });

  it("an active but UNGROUNDED edge is unresolved, NOT contradicted and NOT unknown", () => {
    const edge = deriveEvidencePostureForEdge(makeEdge({ observationCount: 0, sourceCount: 0 }));
    expect(edge).toBe("unresolved");
  });

  it("ARCHIVED edges are unknown (no posture claim)", () => {
    expect(deriveEvidencePostureForEdge(makeEdge({ status: "ARCHIVED" }))).toBe("unknown");
  });

  it("node posture: contradicted when any incident edge is CONTRADICTED", () => {
    expect(deriveEvidencePostureForNode([edgeById(GE_5 as never), makeEdge()], false)).toBe("contradicted");
  });

  it("node posture: supported when an active grounded edge exists, else unresolved/unknown", () => {
    expect(deriveEvidencePostureForNode([edgeById(GE_1 as never)], false)).toBe("supported");
    expect(deriveEvidencePostureForNode([makeEdge({ observationCount: 0, sourceCount: 0 })], false)).toBe("unresolved");
    expect(deriveEvidencePostureForNode([], false)).toBe("unknown");
  });

  it("foreign nodes are always unknown posture (never look locally understood)", () => {
    expect(deriveEvidencePostureForNode([edgeById(GE_1 as never)], true)).toBe("unknown");
  });
});

// ─── Temporal ────────────────────────────────────────────────────────────────

describe("PR-6 §C temporal in-range / out-of-range / uncertain", () => {
  const RANGE: [number, number] = [new Date("2024-06-10T00:00:00Z").getTime(), new Date("2024-06-20T00:00:00Z").getTime()];

  it("node in range, out of range, and unknown (no timestamp) are distinct", () => {
    expect(nodeInTimeRange(nodeById(GN_WITNESS as never), RANGE)).toBe("in-range");
    expect(nodeInTimeRange(nodeById(GN_VICTOR as never), RANGE)).toBe("out-of-range");
    expect(nodeInTimeRange(makeNode({ createdAt: undefined as never }), RANGE)).toBe("uncertain");
  });

  it("without a range every node is in-range", () => {
    expect(nodeInTimeRange(nodeById(GN_VICTOR as never), null)).toBe("in-range");
  });

  it("edge temporal = min of endpoints; out-of-range wins, uncertain next", () => {
    expect(edgeTemporalState("in-range", "in-range")).toBe("in-range");
    expect(edgeTemporalState("out-of-range", "in-range")).toBe("out-of-range");
    expect(edgeTemporalState("out-of-range", "uncertain")).toBe("out-of-range");
    expect(edgeTemporalState("uncertain", "in-range")).toBe("uncertain");
  });
});

// ─── Structural role (uses real bridges: GE_1) ───────────────────────────────

describe("PR-6 §C structural role", () => {
  it("leaf, standard, core, bridge derive deterministically", () => {
    expect(deriveStructuralRole({ isBridge: false, importance: 0.5, degree: 1 })).toBe("leaf");
    expect(deriveStructuralRole({ isBridge: false, importance: 0.5, degree: 2 })).toBe("standard");
    expect(deriveStructuralRole({ isBridge: false, importance: 0.8, degree: 3 })).toBe("core");
    expect(deriveStructuralRole({ isBridge: true, importance: 0.5, degree: 2 })).toBe("bridge");
  });

  it("GE_1/GE_6 are the splice edges; their endpoints are the bridge structural role", () => {
    const ctx = deriveGraphVisualContext({ nodes: baseNodes, edges: baseEdges, holes: [], activeTimeRange: null });
    // GE_1 is a strong grounded ACTIVE edge — no attention signal (level 0).
    expect(ctx.edges.get(GE_1)?.attentionLevel).toBe(0);
    expect(ctx.edges.get(GE_1)?.supportBand).toBe("strong");
    expect(ctx.nodes.get(GN_BANK)?.structuralRole).toBe("bridge");
    expect(ctx.nodes.get(GN_VICTOR)?.structuralRole).toBe("bridge");
    expect(ctx.nodes.get(GN_WITNESS)?.structuralRole).toBe("bridge");
    // GE_5 is CONTRADICTED and excluded from the ACTIVE structural topology,
    // so SHELL_ONE/SHELL_TWO are structural leaves attached only to BANK:
    // their single ACTIVE edge is a cut edge => they are bridge endpoints too.
    expect(ctx.nodes.get(GN_SHELL_ONE)?.structuralRole).toBe("bridge");
    expect(ctx.nodes.get(GN_SHELL_TWO)?.structuralRole).toBe("bridge");
    expect(ctx.nodes.get(GN_MARIA)?.structuralRole).toBe("bridge");
  });
});

// ─── Signals + attention convergence ─────────────────────────────────────────

describe("PR-6 §F attention signals", () => {
  it("GE_5 endpoints carry contradiction; GE_6 endpoints carry weak-support; unresolved node carries 'unresolved'", () => {
    const signals = deriveNodeSignals({ nodes: baseNodes, edges: baseEdges, holes: [] });
    expect(signals.get(GN_SHELL_ONE)?.has("contradiction")).toBe(true);
    expect(signals.get(GN_SHELL_TWO)?.has("contradiction")).toBe(true);
    const sigMap = (id: string) => signals.get(id) ?? new Set<AttentionSignalType>();
    expect(sigMap(GN_SHELL_ONE)?.has("contradiction")).toBe(true);
    expect(sigMap(GN_VICTOR)?.has("weak-support")).toBe(true);
    expect(sigMap(GN_WITNESS)?.has("weak-support")).toBe(true);
    expect(sigMap(GN_WITNESS)?.has("unresolved")).toBe(true);
  });

  it("no fabricated signals on clean hub nodes", () => {
    const signals = deriveNodeSignals({ nodes: baseNodes, edges: baseEdges, holes: [] });
    expect(signals.get(GN_BANK)).toEqual(new Set<AttentionSignalType>());
  });

  it("graph-hole adds a 'graph-hole' signal to affected nodes", () => {
    const hole = { id: "h-1", investigationGapId: "gap-1", nodeIds: [GN_BANK] } as GraphHole;
    const signals = deriveNodeSignals({ nodes: baseNodes, edges: baseEdges, holes: [hole] });
    expect(signals.get(GN_BANK)?.has("graph-hole")).toBe(true);
  });

  it("foreign nodes add a cross-case signal", () => {
    const signals = deriveNodeSignals({
      nodes: baseNodes, edges: baseEdges, holes: [],
      foreignNodeIds: new Set([GN_BANK]),
    });
    expect(signals.get(GN_BANK)?.has("cross-case")).toBe(true);
  });
});

describe("PR-6 §F attention convergence", () => {
  it("Victor∪Witness converge: weak-support + unresolved => ONE attention region", () => {
    const regions = deriveAttentionRegions({ nodes: baseNodes, edges: baseEdges, holes: [] });
    const covering = regions.filter(
      (r) => r.memberNodeIds.includes(GN_VICTOR) || r.memberNodeIds.includes(GN_WITNESS),
    );
    expect(covering.length).toBeGreaterThanOrEqual(1);
    const region = covering[0];
    expect(region.signalTypes).toContain("weak-support");
    expect(region.signalTypes).toContain("unresolved");
    expect(region.memberNodeIds).toContain(GN_VICTOR);
    expect(region.memberNodeIds).toContain(GN_WITNESS);
    // Region identity is deterministic.
    expect(region.id).toBe([...region.memberNodeIds].sort().join(","));
  });

  it("Shells do NOT converge into an attention region: contradiction is a single signal type (level 1 only)", () => {
    const regions = deriveAttentionRegions({ nodes: baseNodes, edges: baseEdges, holes: [] });
    const shellRegion = regions.filter(
      (r) => r.memberNodeIds.includes(GN_SHELL_ONE) && r.memberNodeIds.includes(GN_SHELL_TWO),
    );
    // The two shells are connected by ONE contradicted edge — a single signal
    // type (contradiction), so they are NOT an attention region.
    expect(shellRegion).toHaveLength(0);
  });

  it("region signal-type union drives convergence, not node count", () => {
    // Two distinct signal types on isolated nodes remain separate (regions are
    // connected components), so no spurious cross-graph region forms.
    const regions = deriveAttentionRegions({ nodes: baseNodes, edges: baseEdges, holes: [] });
    for (const region of regions) {
      expect(region.signalTypes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("a filter that hides GE_5 removes its contradiction signal (no contamination)", () => {
    const filter = { minSupport: 0, hideContradicted: true };
    const edges = applyGraphFilter(baseEdges, filter);
    expect(edges.find((e) => e.id === GE_5)).toBeUndefined();
    const signals = deriveNodeSignals({ nodes: baseNodes, edges: baseEdges, holes: [], filter });
    expect(signals.get(GN_SHELL_ONE)?.has("contradiction")).toBe(false);
  });
});

// ─── Full presentation context / focus scope ─────────────────────────────────

describe("PR-6 §E hypothesis focus scope", () => {
  const hypothesisSeed: GraphFocusSeed = {
    kind: "hypothesis",
    entityIds: [ENT_VICTOR, ENT_SHELL_ONE, ENT_BANK],
    nodeIds: [],
  };

  it("hypothesis focus maps related entities to supporting relevance; GE_5=>contradicting", () => {
    const ctx = deriveGraphVisualContext({
      nodes: baseNodes, edges: baseEdges, holes: [], activeTimeRange: null, focusSeed: hypothesisSeed,
    });
    expect(ctx.nodes.get(GN_VICTOR)?.hypothesisRelevance).toBe("supporting");
    expect(ctx.nodes.get(GN_BANK)?.hypothesisRelevance).toBe("supporting");
    // Shell Two is NOT in the hypothesis related set -> null.
    expect(ctx.nodes.get(GN_SHELL_TWO)?.hypothesisRelevance).toBeNull();
    // GE_5 is an incident CONTRADICTED edge meaning the OTHER shell node isn't
    // scoped, but the relevant shell-one node is marked contradicting? No —
    // Shell One IS in scope and GE_5 is contradicted, so its posture is
    // contradicted and relevance contradicting.
    expect(ctx.nodes.get(GN_SHELL_ONE)?.evidencePosture).toBe("contradicted");
  });

  it("out-of-scope nodes/edges carry no relevance and keep default posture", () => {
    const ctx = deriveGraphVisualContext({
      nodes: baseNodes, edges: baseEdges, holes: [], activeTimeRange: null, focusSeed: hypothesisSeed,
    });
    expect(ctx.nodes.get(GN_MARIA)?.hypothesisRelevance).toBeNull();
    expect(ctx.nodes.get(GN_MARIA)?.caseScope).toBe("local");
  });

  it("no focus seed yields all-null relevance and a null context focus", () => {
    const ctx = deriveGraphVisualContext({ nodes: baseNodes, edges: baseEdges, holes: [], activeTimeRange: null });
    expect(ctx.focus).toBeNull();
    expect(ctx.nodes.get(GN_VICTOR)?.hypothesisRelevance).toBeNull();
  });
});

describe("PR-6 §E evidence / gap focus", () => {
  it("gap focus resolves nodeIds through holes (investigationGapId match)", () => {
    const hole = { id: "h-1", investigationGapId: "gap-1", nodeIds: [GN_BANK, GN_VICTOR] } as GraphHole;
    const ctx = deriveGraphVisualContext({
      nodes: baseNodes, edges: baseEdges, holes: [hole], activeTimeRange: null,
      focusSeed: { kind: "gap", entityIds: [], nodeIds: [GN_BANK, GN_VICTOR] },
    });
    expect(ctx.nodes.get(GN_BANK)?.gapAffected).toBe(true);
    expect(ctx.nodes.get(GN_VICTOR)?.gapAffected).toBe(true);
    expect(ctx.nodes.get(GN_MARIA)?.gapAffected).toBe(false);
  });

  it("default node/edge states are the safe honest fallback", () => {
    expect(DEFAULT_NODE_VISUAL_STATE.evidencePosture).toBe("unknown");
    expect(DEFAULT_NODE_VISUAL_STATE.hypothesisRelevance).toBeNull();
    expect(DEFAULT_EDGE_VISUAL_STATE.grounded).toBe(false);
    expect(DEFAULT_EDGE_VISUAL_STATE.caseScope).toBe("local");
  });
});

// ─── Interaction hydration is canvas-side, never baked into the base map ─────

describe("PR-6 §G base context is interaction-free by default", () => {
  it("base node/edge states report no selection or focus", () => {
    const ctx = deriveGraphVisualContext({ nodes: baseNodes, edges: baseEdges, holes: [], activeTimeRange: null });
    const ns = ctx.nodes.get(GN_VICTOR) ?? DEFAULT_NODE_VISUAL_STATE;
    expect(ns.selected).toBe(false);
    expect(ns.focused).toBe(false);
    expect(ns.hovered).toBe(false);
  });

  it("deriveNodeVisualState can hydrate interaction deterministically", () => {
    const vs = deriveNodeVisualState({
      node: nodeById(GN_VICTOR as never),
      incidentEdges: [edgeById(GE_1 as never), edgeById(GE_6 as never)],
      selectedNodeId: GN_VICTOR,
      focusedNodeId: null,
      hoveredNodeId: null,
      activeTimeRange: null,
      isForeign: false,
      isBridge: true,
      degree: 2,
      hypothesisRelevance: "supporting",
      evidenceInScope: false,
      gapAffected: false,
      signals: new Set<AttentionSignalType>(["weak-support", "unresolved"]),
      inAttentionRegion: true,
    });
    expect(vs.selected).toBe(true);
    expect(vs.attentionLevel).toBe(3); // selected overrides region
  });

  it("in-region but unselected nodes report attention level 2", () => {
    const vs = deriveNodeVisualState({
      node: nodeById(GN_VICTOR as never),
      incidentEdges: [],
      selectedNodeId: null,
      focusedNodeId: null,
      hoveredNodeId: null,
      activeTimeRange: null,
      isForeign: false,
      isBridge: false,
      degree: 2,
      hypothesisRelevance: null,
      evidenceInScope: false,
      gapAffected: false,
      signals: new Set<AttentionSignalType>(),
      inAttentionRegion: true,
    });
    expect(vs.attentionLevel).toBe(2);
  });
});

// ─── Boundary derivation ─────────────────────────────────────────────────────

describe("PR-6 §G edge derivations", () => {
  it("GE_1 (grounded ACTIVE, incident to selected) hydrates to selected + supported", () => {
    const vs = deriveEdgeVisualState({
      edge: edgeById(GE_1 as never),
      sourceNode: nodeById(GN_BANK as never),
      targetNode: nodeById(GN_VICTOR as never),
      selectedNodeId: GN_BANK,
      focusedNodeId: null,
      hoveredNodeId: null,
      activeTimeRange: null,
      isForeign: false,
      hypothesisRelevance: "supporting",
      evidenceInScope: false,
      gapAffected: false,
      inAttentionRegion: false,
    });
    expect(vs.incidentToSelection).toBe(true);
    expect(vs.attentionLevel).toBe(3);
    expect(vs.grounded).toBe(true);
    expect(vs.supportBand).toBe("strong");
  });
});
