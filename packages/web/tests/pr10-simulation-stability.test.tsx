// ============================================================================
// PR-10 §5 — Physics / render decoupling (simulation stability)
//
// The PR-4 readability filter (minSupport / hideContradicted) must change
// ONLY the RENDERED edges. The force simulation keeps running on the FULL
// topology: a filter interaction must never change the simulation's content
// key (node ids + edge ids) and therefore never rebuild/restart the physics.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";
import { GraphPanel } from "@/components/graph/graph-panel";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { CASE_ID, INVESTIGATION_ID, GE_6 } from "@/lib/providers/demo/demo-fixtures/lookup";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import type { GraphFilterState } from "@/lib/graph/graph-filter";

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

const els = (container: HTMLElement, sel: string): Element[] =>
  Array.from(container.querySelectorAll<Element>(sel));

beforeEach(() => {
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = CASE_ID;
  mediaPrefs.reduce = false;
  lanes.pathnameRef.current = "/investigations/i-1/graph";
  lanes.searchParamsRef.current = new URLSearchParams({ caseId: CASE_ID });
  lanes.paramsRef.current = { id: INVESTIGATION_ID };
  stubPlatform();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_DATA_MODE = PREV_ENV[DATA_MODE_ENV];
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = PREV_ENV[DEMO_CASE_ID_ENV];
});

describe("PR-10 §5 — the panel feeds physics and render disjoint edge sets", () => {
  it("renders the full demo graph (6 node states, 6 edge states) with no filter", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));
    await waitFor(() => expect(els(utils.container, "g[data-graph-edge-state]").length).toBe(6));
    const canvasRoot = utils.container.querySelector("[data-graph-physics-edges]");
    expect(canvasRoot).not.toBeNull();
    expect(canvasRoot!.getAttribute("data-graph-physics-edges")).toBe("6");
    expect(canvasRoot!.getAttribute("data-graph-render-edges")).toBe("6");
  });

  it("hideContradicted hides contradicted edges from the RENDER set but keeps the FULL physics topology", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} filter={{ minSupport: 0, hideContradicted: true }} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));
    const canvasRoot = utils.container.querySelector("[data-graph-physics-edges]")!;
    // The filter change does not change the physics input (full topology).
    expect(canvasRoot.getAttribute("data-graph-physics-edges")).toBe("6");
    const rendered = canvasRoot.getAttribute("data-graph-render-edges");
    expect(Number(rendered)).toBeLessThan(6);
    const states = els(utils.container, "g[data-graph-edge-state]");
    expect(states).toHaveLength(Number(rendered));
    const contradicted = states.filter((g) =>
      (g.getAttribute("data-graph-edge-state") ?? "").includes('"posture":"contradicted"'),
    );
    expect(contradicted).toHaveLength(0);
  });

  it("a minSupport filter shrinks the RENDER set while the physics count stays constant", async () => {
    const filter: GraphFilterState = { minSupport: 0.5, hideContradicted: false };
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} filter={filter} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));
    const canvasRoot = utils.container.querySelector("[data-graph-physics-edges]")!;
    expect(canvasRoot.getAttribute("data-graph-physics-edges")).toBe("6");
    expect(Number(canvasRoot.getAttribute("data-graph-render-edges"))).toBeGreaterThan(0);
    expect(Number(canvasRoot.getAttribute("data-graph-render-edges"))).toBeLessThan(6);
  });

  it("the RENDERED edge set is exactly the PR-4 filtered projection (GE_6 low-support hidden)", async () => {
    const filter: GraphFilterState = { minSupport: 0.5, hideContradicted: false };
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} filter={filter} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBe(6));
    const canvasRoot = utils.container.querySelector("[data-graph-physics-edges]")!;
    expect(canvasRoot.getAttribute("data-graph-render-edges")).not.toBe("6");
    // GE_6 is the 0.2-support weak edge — it is the only one below minSupport 0.5.
    const weak = operationFinancialShadowGraph.edges.find((e) => e.id === GE_6)!;
    expect(weak.support).toBeLessThan(0.5);
  });
});