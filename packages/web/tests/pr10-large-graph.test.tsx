// ============================================================================
// PR-10 §50 — Investigation-scale canvas (500 nodes / 800 edges)
//
// A straight large-read render of the REAL canvas+layout engine (no provider
// seam, no mock): 500 node states, 800 physics edges, one focusable button per
// node. Also proves the PR-10 §5 decoupling at scale: a readability filter
// shrinks ONLY the rendered edge set while the physics input stays at 800.
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { deriveGraphVisualContext } from "@/lib/graph/graph-visual-state";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";

const NODE_COUNT = 500;
const EDGE_COUNT = 800;
const FILTER_MIN_SUPPORT = 0.5;

function node(id: string, i: number): GraphNode {
  return {
    id,
    investigationId: "i-1",
    versionId: "v-1",
    type: "ENTITY",
    entityId: `ent-${i}`,
    label: `entity-${i}`,
    structuralImportance: 0.3 + ((i * 37) % 70) / 100,
    observationCount: 2,
    sourceCount: 2,
    createdAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
  };
}

function edge(id: string, a: string, b: string, i: number): GraphEdge {
  return {
    id,
    investigationId: "i-1",
    versionId: "v-1",
    sourceNodeId: a,
    targetNodeId: b,
    relationType: "financial",
    support: 0.2 + ((i * 53) % 80) / 100, // deterministic 0.20–0.99 spread
    structuralImportance: 0.5,
    directed: true,
    status: "ACTIVE",
    observationCount: 1,
    sourceCount: 1,
    createdAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
  };
}

function bigGraph() {
  const nodes: GraphNode[] = Array.from({ length: NODE_COUNT }, (_, i) => node(`n${i}`, i));
  const edges: GraphEdge[] = [];
  for (let i = 0; i < EDGE_COUNT; i += 1) {
    const a = `n${i % NODE_COUNT}`;
    const b = `n${(i * 37 + 125) % NODE_COUNT}`;
    if (a === b) continue;
    edges.push(edge(`e${i}`, a, b, i));
  }
  return { nodes, edges };
}

const els = (container: HTMLElement, sel: string): Element[] =>
  Array.from(container.querySelectorAll<Element>(sel));

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
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
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
      matches: false,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCanvas(
  nodes: GraphNode[],
  physicsEdges: GraphEdge[],
  renderEdges: GraphEdge[],
) {
  const holes: GraphHole[] = [];
  const visualContext = deriveGraphVisualContext({
    nodes,
    edges: physicsEdges,
    holes,
    activeTimeRange: null,
  });
  return render(
    <GraphCanvas
      nodes={nodes}
      edges={renderEdges}
      physicsEdges={physicsEdges}
      holes={holes}
      onNodeClick={() => undefined}
      activeTimeRange={null}
      visualContext={visualContext}
    />,
  );
}

describe("PR-10 §50 — the canvas renders the full 500/800 projection", () => {
  it("produces exactly 500 node states, 800 edge states and 500 tab stops", async () => {
    stubPlatform();
    const { nodes, edges } = bigGraph();
    const utils = renderCanvas(nodes, edges, edges);

    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(NODE_COUNT));
    expect(els(utils.container, "g[data-graph-edge-state]").length).toBe(EDGE_COUNT);
    expect(els(utils.container, "circle[role='button']").length).toBe(NODE_COUNT);

    const canvasRoot = utils.container.querySelector("[data-graph-physics-edges]")!;
    expect(canvasRoot.getAttribute("data-graph-physics-edges")).toBe(`${EDGE_COUNT}`);
    expect(canvasRoot.getAttribute("data-graph-render-edges")).toBe(`${EDGE_COUNT}`);
  });

  it("the canvas stays honest to the 800-edge physics input while a filter narrows rendering", async () => {
    stubPlatform();
    const { nodes, edges } = bigGraph();
    const filtered = edges.filter((e) => e.support >= FILTER_MIN_SUPPORT);
    expect(filtered.length).toBeLessThan(EDGE_COUNT);

    const utils = renderCanvas(nodes, edges, filtered);
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(NODE_COUNT));

    const canvasRoot = utils.container.querySelector("[data-graph-physics-edges]")!;
    expect(canvasRoot.getAttribute("data-graph-physics-edges")).toBe(`${EDGE_COUNT}`);
    const rendered = Number(canvasRoot.getAttribute("data-graph-render-edges"));
    expect(rendered).toBe(filtered.length);
    expect(rendered).toBeLessThan(EDGE_COUNT);
    expect(els(utils.container, "g[data-graph-edge-state]").length).toBe(rendered);
  });
});