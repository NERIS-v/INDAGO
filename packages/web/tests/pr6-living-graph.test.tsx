import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";
import { GraphPanel } from "@/components/graph/graph-panel";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { deriveGraphVisualContext } from "@/lib/graph/graph-visual-state";
import type { GraphFocusSeed } from "@/lib/graph/graph-visual-state";
import { DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  GN_VICTOR, GN_WITNESS, GN_BANK, GN_MARIA, GN_SHELL_ONE,
  GE_5, GE_6,
  ENT_VICTOR, ENT_SHELL_ONE,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";

// Mutable route lane (pr5 convention) in case graph-adjacent modules read
// next/navigation at render time.
const lanes = vi.hoisted(() => ({
  pathnameRef: { current: "/investigations/i-1/graph" },
  searchParamsRef: { current: new URLSearchParams() },
  paramsRef: { current: { id: "i-1" } },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => lanes.pathnameRef.current,
  useSearchParams: () => lanes.searchParamsRef.current,
  useParams: () => lanes.paramsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// PR-6 must respect prefers-reduced-motion. The toggle is read at mount via
// window.matchMedia; tests flip `mediaPrefs.reduce` BEFORE rendering.
const mediaPrefs = vi.hoisted(() => ({ reduce: false }));

function stubPlatform() {
  class ResizeObserverStub implements ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      const entry = {
        target,
        contentRect: {
          x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
        },
        borderBoxSize: [] as unknown,
        contentBoxSize: [],
        devicePixelContentBoxSize: [] as unknown,
      } as unknown as ResizeObserverEntry;
      this.cb([entry], this);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mediaPrefs.reduce,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  );
}

const PREV_ENV = {
  [DATA_MODE_ENV]: process.env.NEXT_PUBLIC_DATA_MODE,
  [DEMO_CASE_ID_ENV]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = CASE_ID;
  mediaPrefs.reduce = false;
  lanes.pathnameRef.current = "/investigations/i-1/graph";
  lanes.searchParamsRef.current = new URLSearchParams({ caseId: CASE_ID });
  // The demo GraphProvider validates getVersion/getGraphHoles against the
  // workspace's investigation id (providers.ts:392) — it must be the fixture id.
  lanes.paramsRef.current = { id: INVESTIGATION_ID };
  stubPlatform();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_DATA_MODE = PREV_ENV[DATA_MODE_ENV];
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = PREV_ENV[DEMO_CASE_ID_ENV];
});

// ─── DOM helpers ─────────────────────────────────────────────────────────────

type NodeState = ReturnType<typeof decodeNodeState>;
function decodeNodeState(el: Element) {
  return JSON.parse(el.getAttribute("data-graph-node-state")!) as {
    posture: string;
    role: string;
    temporal: string;
    scope: string;
    hypRel: string | null;
    evidenceInScope: boolean;
    gapAffected: boolean;
    attentionLevel: number;
  };
}
function decodeEdgeState(el: Element) {
  return JSON.parse(el.getAttribute("data-graph-edge-state")!) as {
    band: string;
    posture: string;
    grounded: boolean;
    scope: string;
    temporal: string;
    hypRel: string | null;
    evidenceInScope: boolean;
    gapAffected: boolean;
    selected: boolean;
    attentionLevel: number;
  };
}

const els = (container: HTMLElement, sel: string): Element[] =>
  Array.from(container.querySelectorAll<Element>(sel));

/** Node and interaction layers iterate the same layoutNodes array, so the
 *  index of a node's interaction circle maps 1:1 onto its state <g>. */
function nodeStateForId(container: HTMLElement, id: string): NodeState {
  const circles = els(container, "circle[data-nodeid]");
  const states = els(container, "g[data-graph-node-state]");
  const idx = circles.findIndex((c) => c.getAttribute("data-nodeid") === id);
  if (idx < 0) throw new Error(`node ${id} not rendered`);
  return decodeNodeState(states[idx]!);
}

async function renderPanel() {
  const utils = render(
    <WorkspaceBoundary>
      <GraphPanel activeTimeRange={null} />
    </WorkspaceBoundary>,
  );
  await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));
  await waitFor(() => expect(els(utils.container, "g[data-graph-edge-state]").length).toBe(6));
  return utils;
}

const ACTIVE_EDGES = operationFinancialShadowGraph.edges;
const ACTIVE_NODES = operationFinancialShadowGraph.nodes;

// ─── Baseline presentation model through the full panel ──────────────────────

describe("PR-6 §D baseline visual language on the demo graph", () => {
  it("renders 6 node states and 6 edge states after data load", async () => {
    const { container } = await renderPanel();
    expect(els(container, "g[data-graph-node-state]")).toHaveLength(6);
    expect(els(container, "g[data-graph-edge-state]")).toHaveLength(6);
    expect(els(container, "circle[data-nodeid]")).toHaveLength(6);
  });

  it("every base node is local, in-range and carried into its state", async () => {
    const { container } = await renderPanel();
    for (const id of [GN_BANK, GN_VICTOR, GN_MARIA, GN_SHELL_ONE, GN_WITNESS]) {
      const state = nodeStateForId(container, id);
      expect(state.scope).toBe("local");
      expect(state.temporal).toBe("in-range");
    }
    // No foreign overlay is active by default -> zero foreign-scoped nodes.
    const foreignScoped = els(container, "g[data-graph-node-state]").filter(
      (g) => g.getAttribute("data-graph-case-scope") === "foreign",
    );
    expect(foreignScoped).toHaveLength(0);
  });

  it("all six nodes are structural bridges under the ACTIVE topology (GE_5 excluded)", async () => {
    const { container } = await renderPanel();
    for (const id of [GN_BANK, GN_VICTOR, GN_MARIA, GN_SHELL_ONE, GN_WITNESS]) {
      expect(nodeStateForId(container, id).role).toBe("bridge");
    }
  });

  it("contradicted shells carry the danger posture ring; clean nodes do not", async () => {
    const { container } = await renderPanel();
    // One shared contradicted edge (GE_5) -> BOTH shells carry the posture ring.
    const rings = els(container, "circle[data-graph-node-posture='contradicted']");
    expect(rings).toHaveLength(2);

    const postures = els(container, "g[data-graph-node-state]").map(decodeNodeState);
    expect(postures.filter((s) => s.posture === "contradicted")).toHaveLength(2);
    expect(postures.filter((s) => s.posture === "supported")).toHaveLength(4);
    // Clean nodes render no posture ring.
    const groupsWithRing = els(container, "g[data-graph-node-state]").filter(
      (g) => g.querySelector('circle[data-graph-node-posture="contradicted"]') !== null,
    );
    expect(groupsWithRing).toHaveLength(2);
  });

  it("grounding: all strong edges carry the amber midpoint (5 of 6; GE_5 does not)", async () => {
    const { container } = await renderPanel();
    const dots = els(container, "circle[data-graph-edge-grounded='true']");
    expect(dots).toHaveLength(5);
    const edgeGroups = els(container, "g[data-graph-edge-state]");
    const groundedCount = edgeGroups.filter((g) => g.hasAttribute("data-graph-edge-grounded")).length;
    expect(groundedCount).toBe(5);
    const ge5 = edgeGroups.find((g) => decodeEdgeState(g).posture === "contradicted");
    expect(ge5).toBeDefined();
    expect(ge5!.hasAttribute("data-graph-edge-grounded")).toBe(false);
  });

  it("weak band, contradicted posture and support bands are exact per edge", async () => {
    const { container } = await renderPanel();
    const edgeGroups = els(container, "g[data-graph-edge-state]");
    // Overlay replay (PR-0 choreography) can inject extra edges over time; the
    // BASE projection must be exactly the six fixture relations at first paint.
    expect(edgeGroups.length).toBe(6);
    const states = edgeGroups.map(decodeEdgeState);
    expect(states.filter((s) => s.band === "weak")).toHaveLength(1); // GE_6 (0.2)
    expect(states.filter((s) => s.posture === "contradicted")).toHaveLength(1); // GE_5
    expect(states.filter((s) => s.posture === "supported")).toHaveLength(5);
    expect(states.filter((s) => s.band === "strong")).toHaveLength(5); // all but GE_6
    // Contradicted is orthogonal to grounded: GE_5 still carries observation +
    // source counts, so ALL SIX edges are honestly grounded. The canvas only
    // HIDES the amber midpoint on the contradicted edge (rendering rule).
    expect(states.filter((s) => s.grounded)).toHaveLength(6);
  });
});

// ─── Attention convergence ───────────────────────────────────────────────────

describe("PR-6 §F attention convergence through the panel", () => {
  it("Victor+Witness converge into ONE region with weak-support+unresolved", async () => {
    const { container } = await renderPanel();
    const regions = els(container, "[data-graph-attention-region]");
    expect(regions).toHaveLength(1);
    const signals = regions[0]!.getAttribute("data-graph-attention-signals")!.split(",");
    expect(signals).toContain("weak-support");
    expect(signals).toContain("unresolved");
    expect(regions[0]!.getAttribute("data-graph-attention-members")).toBe(`${GN_VICTOR},${GN_WITNESS}`);
  });

  it("region members sit at attention 2, contradicted shells at 1, clean nodes at 0", async () => {
    const { container } = await renderPanel();
    expect(nodeStateForId(container, GN_VICTOR).attentionLevel).toBe(2);
    expect(nodeStateForId(container, GN_WITNESS).attentionLevel).toBe(2);
    expect(nodeStateForId(container, GN_SHELL_ONE).attentionLevel).toBe(1);
    expect(nodeStateForId(container, GN_BANK).attentionLevel).toBe(0);
    expect(nodeStateForId(container, GN_MARIA).attentionLevel).toBe(0);

    const edgeStates = els(container, "g[data-graph-edge-state]").map(decodeEdgeState);
    expect(edgeStates.filter((s) => s.attentionLevel === 2)).toHaveLength(1); // GE_6 in-region
    expect(edgeStates.filter((s) => s.attentionLevel === 1)).toHaveLength(1); // GE_5 contradicted
    expect(edgeStates.filter((s) => s.attentionLevel === 0)).toHaveLength(4);
  });
});

// ─── Selection / interaction hydration is canvas-local ───────────────────────

describe("PR-6 §G interaction hydration", () => {
  it("clicking a node selects it at attention 3 and lights its incident edges", async () => {
    const { container } = await renderPanel();
    const witness = els(container, "circle[data-nodeid]").find(
      (c) => c.getAttribute("data-nodeid") === GN_WITNESS,
    )!;
    fireEvent.click(witness);

    const states = els(container, "g[data-graph-node-state]");
    const selected = states.find((g) => g.getAttribute("data-graph-selected") === "true");
    expect(selected).toBeDefined();
    expect(decodeNodeState(selected!).attentionLevel).toBe(3);

    // WITNESS is only incident to GE_6 -> exactly one edge lights up.
    const edgeStates = els(container, "g[data-graph-edge-state]").map(decodeEdgeState);
    expect(edgeStates.filter((s) => s.selected)).toHaveLength(1);
    expect(edgeStates.filter((s) => s.attentionLevel === 3)).toHaveLength(1);
  });

  it("keyboard focus raises attention; blur returns to baseline", async () => {
    const { container } = await renderPanel();
    const bank = els(container, "circle[data-nodeid]").find(
      (c) => c.getAttribute("data-nodeid") === GN_BANK,
    )!;
    fireEvent.focus(bank);
    const states = els(container, "g[data-graph-node-state]");
    const focused = states.find((g) => g.getAttribute("data-graph-focused") === "true");
    expect(focused).toBeDefined();
    expect(decodeNodeState(focused!).attentionLevel).toBe(3);

    fireEvent.blur(bank);
    expect(els(container, "g[data-graph-focused='true']")).toHaveLength(0);
  });

  it("hover surfaces the hovered flag on the state card", async () => {
    const { container } = await renderPanel();
    const victor = els(container, "circle[data-nodeid]").find(
      (c) => c.getAttribute("data-nodeid") === GN_VICTOR,
    )!;
    fireEvent.mouseEnter(victor);
    const states = els(container, "g[data-graph-node-state]");
    const hovered = states.find((g) => g.getAttribute("data-graph-hovered") === "true");
    expect(hovered).toBeDefined();
  });

  it("honors prefers-reduced-motion: connected-edge draw animates normally, never under reduce", async () => {
    const first = await renderPanel();
    fireEvent.click(
      els(first.container, "circle[data-nodeid]").find(
        (c) => c.getAttribute("data-nodeid") === GN_BANK,
      )!,
    );
    await waitFor(() => expect(els(first.container, "animate")).not.toHaveLength(0));
    cleanup();

    mediaPrefs.reduce = true;
    const reduced = await renderPanel();
    fireEvent.click(
      els(reduced.container, "circle[data-nodeid]").find(
        (c) => c.getAttribute("data-nodeid") === GN_BANK,
      )!,
    );
    expect(els(reduced.container, "animate")).toHaveLength(0);
  });
});

// ─── Filter is a real readability effect — no signal contamination ───────────

describe("PR-6 §D filter honesty (hideContradicted never poisons the model)", () => {
  it("hides GE_5 and drops every contradiction signal on the shells", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} filter={{ minSupport: 0, hideContradicted: true }} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-edge-state]").length).toBe(5));

    const edgeGroups = els(utils.container, "g[data-graph-edge-state]");
    expect(edgeGroups.map(decodeEdgeState).filter((s) => s.posture === "contradicted")).toHaveLength(0);

    const nodeStates = els(utils.container, "g[data-graph-node-state]").map(decodeNodeState);
    expect(nodeStates[0]!.posture).not.toBe("contradicted");
    expect(nodeStateForId(utils.container, GN_SHELL_ONE).posture).toBe("supported");
    // Without GE_5 the shells hold no signal at all (single removed signal).
    expect(nodeStateForId(utils.container, GN_SHELL_ONE).attentionLevel).toBe(0);
  });
});

// ─── Focus scope (panel-free canvas check with a derived context) ────────────

const noop = () => {};

function renderCanvasWith(seed: GraphFocusSeed | null, extraNodes: GraphNode[] = [], extraEdges: GraphEdge[] = []) {
  const nodes = [...ACTIVE_NODES, ...extraNodes];
  const edges = [...ACTIVE_EDGES, ...extraEdges];
  const context = deriveGraphVisualContext({ nodes, edges, holes: [], activeTimeRange: null, focusSeed: seed });
  const utils = render(
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      holes={[]}
      onNodeClick={noop}
      activeTimeRange={null}
      visualContext={context}
    />,
  );
  return utils;
}

describe("PR-6 §E hypothesis focus semantics", () => {
  it("maps related entities to supporting nodes/edges; incident contradiction reads contradicting", async () => {
    const utils = renderCanvasWith({ kind: "hypothesis", entityIds: [ENT_VICTOR, ENT_SHELL_ONE], nodeIds: [] });
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));

    const nodeStates = els(utils.container, "g[data-graph-node-state]").map(decodeNodeState);
    const supporting = nodeStates.filter((s) => s.hypRel === "supporting");
    const contradicting = nodeStates.filter((s) => s.hypRel === "contradicting");
    expect(supporting).toHaveLength(1); // Victor only
    // Shell One is IN scope AND incident to the contradicted GE_5 -> literal.
    expect(contradicting).toHaveLength(1);
    const untouched = nodeStates.filter((s) => s.hypRel === null);
    expect(untouched).toHaveLength(4); // Bank, Maria, Shell Two, Witness

    const edgeStates = els(utils.container, "g[data-graph-edge-state]").map(decodeEdgeState);
    expect(edgeStates.filter((s) => s.hypRel === "supporting")).toHaveLength(3); // GE_1, GE_3, GE_6
    expect(edgeStates.filter((s) => s.hypRel === "contradicting")).toHaveLength(1); // GE_5
    expect(edgeStates.filter((s) => s.hypRel === null)).toHaveLength(2); // GE_2, GE_4
  });

  it("focus is carried into the context and marks the scope honestly", async () => {
    const seed: GraphFocusSeed = { kind: "hypothesis", entityIds: [ENT_VICTOR, ENT_SHELL_ONE], nodeIds: [] };
    const utils = renderCanvasWith(seed);
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));
    const unused = els(utils.container, "g[data-graph-node-state]").filter(
      (g) => !g.hasAttribute("data-graph-case-scope"),
    );
    expect(unused).toHaveLength(0); // every card carries an explicit scope
  });
});

describe("PR-6 §E gap focus semantics", () => {
  it("marks hole-resolved nodes as gap-affected with a warning ring", async () => {
    const hole = {
      investigationId: CASE_ID,
      graphVersionId: "v-1",
      type: "MISSING_EDGE",
      investigationGapId: "gap-7",
      nodeIds: [GN_BANK, GN_VICTOR],
      expectedEdgeType: "financial",
      significance: 0.6,
      description: "missing link",
      detectedAt: { value: "2024-06-15T00:00:00.000Z", precision: "exact" },
    } as GraphHole;
    const context = deriveGraphVisualContext({
      nodes: ACTIVE_NODES,
      edges: ACTIVE_EDGES,
      holes: [hole],
      activeTimeRange: null,
      focusSeed: { kind: "gap", entityIds: [], nodeIds: [GN_BANK, GN_VICTOR] },
    });
    const utils = render(
      <GraphCanvas nodes={ACTIVE_NODES} edges={ACTIVE_EDGES} holes={[hole]} onNodeClick={noop} activeTimeRange={null} visualContext={context} />,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));

    const rings = els(utils.container, "circle[data-graph-gap-affected='true']");
    expect(rings).toHaveLength(2);
    for (const id of [GN_BANK, GN_VICTOR]) {
      expect(nodeStateForId(utils.container, id).gapAffected).toBe(true);
    }
    expect(nodeStateForId(utils.container, GN_MARIA).gapAffected).toBe(false);
    // The incident edges of the affected nodes inherit the gap treatment.
    const edgeStates = els(utils.container, "g[data-graph-edge-state]").map(decodeEdgeState);
    expect(edgeStates.filter((s) => s.gapAffected).length).toBeGreaterThan(0);
  });
});

describe("PR-6 §D foreign never looks local", () => {
  it("a foreign island node/edge carries scope=foreign everywhere", async () => {
    const foreignNode = {
      id: "foreign-1", investigationId: "i-x", versionId: "v-x", type: "ENTITY",
      label: "Cobalt Accounts", structuralImportance: 0.6,
      observationCount: 0, sourceCount: 0,
      createdAt: { value: "2024-06-10T00:00:00.000Z", precision: "exact" },
      updatedAt: { value: "2024-06-10T00:00:00.000Z", precision: "exact" },
    } as GraphNode;
    const foreignEdge = {
      id: "foreign-edge-1", investigationId: "i-x", versionId: "v-x",
      sourceNodeId: "foreign-1", targetNodeId: GN_BANK, relationType: "SHARED_INFRASTRUCTURE",
      support: 0.9, structuralImportance: 0.5, directed: true, status: "ACTIVE",
      observationCount: 0, sourceCount: 0,
      createdAt: { value: "2024-06-10T00:00:00.000Z", precision: "exact" },
      updatedAt: { value: "2024-06-10T00:00:00.000Z", precision: "exact" },
    } as GraphEdge;

    const nodes = [...ACTIVE_NODES, foreignNode];
    const edges = [...ACTIVE_EDGES, foreignEdge];
    const context = deriveGraphVisualContext({
      nodes,
      edges,
      holes: [],
      activeTimeRange: null,
      foreignNodeIds: new Set(["foreign-1"]),
      foreignEdgeIds: new Set(["foreign-edge-1"]),
    });
    const utils = render(
      <GraphCanvas nodes={nodes} edges={edges} holes={[]} onNodeClick={noop} activeTimeRange={null} visualContext={context} />,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(7));

    // Exactly one foreign node, honestly marked.
    const foreignNodeCards = els(utils.container, "g[data-graph-node-state]").filter(
      (g) => g.getAttribute("data-graph-case-scope") === "foreign",
    );
    expect(foreignNodeCards).toHaveLength(1);
    expect(decodeNodeState(foreignNodeCards[0]!).scope).toBe("foreign");
    expect(decodeNodeState(foreignNodeCards[0]!).posture).toBe("unknown");

    // Exactly one foreign edge; it is underivable as grounded (no observations).
    const foreignEdgeCards = els(utils.container, "g[data-graph-edge-state]").filter(
      (g) => decodeEdgeState(g).scope === "foreign",
    );
    expect(foreignEdgeCards).toHaveLength(1);
    expect(foreignEdgeCards[0]!.hasAttribute("data-graph-edge-grounded")).toBe(false);
  });
});