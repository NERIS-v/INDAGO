import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, act, renderHook } from "@testing-library/react";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { useGraphLayout } from "@/components/graph/use-graph-layout";
import type { GraphNode, GraphEdge } from "@indago/contracts";
import { GN_BANK, GN_VICTOR } from "@/lib/providers/demo/demo-fixtures/lookup";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";

// ============================================================================
// PR-17 · Graph Focus Lifecycle
//
// The analytical FOCUS AURA (thin dashed ring + selection treatment) is only a
// commitment while the graph is still. It must:
//   - hide (fade out ~150ms) the moment the simulation wakes (drag / data
//     reposition / focus-triggered movement),
//   - STAY hidden for the whole motion,
//   - return (fade in ~250ms) short after the graph reaches GENUINE rest,
//     rendered at the node's CURRENT live position — never a stale snapshot,
//   - distinguish SELECTION (a committed node state: always lit) from the
//     FOCUS aura (overlay: hides during motion),
//   - under prefers-reduced-motion, commit instantly (no fade, no hidden
//     phase).
// Detection is state-based: the hook's `motionState` mirrors the real
// simulation alpha/velocity idle detection — no arbitrary timing, no sleeps.
// ============================================================================

const ACTIVE_NODES = operationFinancialShadowGraph.nodes;
const ACTIVE_EDGES = operationFinancialShadowGraph.edges;

const noop = () => {};

// Mutable route lane (pr5 convention) — GraphCanvas does not read it, but the
// module graph stays honest if a sibling import pulls next/navigation.
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
      this.cb(
        [{
          target,
          contentRect: { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) },
          borderBoxSize: [] as unknown,
          contentBoxSize: [],
          devicePixelContentBoxSize: [] as unknown,
        } as unknown as ResizeObserverEntry],
        this,
      );
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
  [process.env.NEXT_PUBLIC_DATA_MODE as string]: process.env.NEXT_PUBLIC_DATA_MODE,
  [process.env.NEXT_PUBLIC_DEMO_CASE_ID as string]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
};

beforeEach(() => {
  mediaPrefs.reduce = false;
  lanes.pathnameRef.current = "/investigations/i-1/graph";
  lanes.searchParamsRef.current = new URLSearchParams();
  lanes.paramsRef.current = { id: "i-1" };
  stubPlatform();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── DOM helpers (pr6 convention: interaction circles index-lock to state <g>) ─

const els = (container: HTMLElement, sel: string): Element[] =>
  Array.from(container.querySelectorAll<Element>(sel));

function stateGroupForId(container: HTMLElement, id: string): Element {
  const circles = els(container, "circle[data-nodeid]");
  const states = els(container, "g[data-graph-node-state]");
  const idx = circles.findIndex((c) => c.getAttribute("data-nodeid") === id);
  if (idx < 0) throw new Error(`node ${id} not rendered`);
  return states[idx]!;
}

function auraRingIn(group: Element): Element | null {
  return group.querySelector("circle[data-graph-aura]");
}

function bodyCircleIn(group: Element): Element {
  const circle = group.querySelector('circle[filter^="url(#"]');
  if (!circle) throw new Error("no visual node circle found");
  return circle;
}

function interactionCircleFor(container: HTMLElement, id: string): Element {
  const circle = els(container, "circle[data-nodeid]").find(
    (c) => c.getAttribute("data-nodeid") === id,
  );
  if (!circle) throw new Error(`interaction circle for ${id} not found`);
  return circle;
}

interface CanvasControls {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  focusNode: (id: string) => void;
  focusPair: (aId: string, bId: string, durationMs?: number) => void;
}

function renderCanvas() {
  const controlsRef: React.MutableRefObject<CanvasControls | null> = { current: null };
  const utils = render(
    <GraphCanvas
      nodes={ACTIVE_NODES}
      edges={ACTIVE_EDGES}
      holes={[]}
      onNodeClick={noop}
      activeTimeRange={null}
      controlsRef={controlsRef}
    />,
  );
  return { utils, controlsRef };
}

// ─── The motion signal is real simulation state ──────────────────────────────

describe("PR-17 §F motion state follows genuine simulation life", () => {
  it("reports moving at build, settles to genuine rest, wakes on drag, re-settles", async () => {
    const { result } = renderHook(() =>
      useGraphLayout(ACTIVE_NODES, ACTIVE_EDGES, 800, 600, {
        hoveredNodeId: null,
        focusedNodeId: null,
        reducedMotion: false,
      }),
    );
    // The initial layout runs from alpha=1.
    expect(result.current.motionState).toBe("moving");

    await waitFor(() => expect(result.current.motionState).toBe("settled"), { timeout: 20000 });
    expect(result.current.apiRef.current.isActive()).toBe(false);

    // Dragging wakes the physics — the settle edge must consume it as motion.
    act(() => result.current.apiRef.current.beginDrag(GN_BANK));
    await waitFor(() => expect(result.current.motionState).toBe("moving"), { timeout: 5000 });
    act(() => result.current.apiRef.current.moveNode(GN_BANK, 500, 300));

    act(() => result.current.apiRef.current.endDrag(GN_BANK));
    await waitFor(() => expect(result.current.motionState).toBe("settled"), { timeout: 20000 });
    expect(result.current.apiRef.current.isActive()).toBe(false);
  }, 30000);

  it("a reduced-motion graph reports settled rest (static scene, no wake)", async () => {
    const { result } = renderHook(() =>
      useGraphLayout(ACTIVE_NODES, ACTIVE_EDGES, 800, 600, {
        hoveredNodeId: null,
        focusedNodeId: null,
        reducedMotion: true,
      }),
    );
    await waitFor(() => expect(result.current.motionState).toBe("settled"), { timeout: 20000 });
  }, 25000);
});

// ─── Focus-aura lifecycle on the canvas ──────────────────────────────────────

describe("PR-17 §F focus aura hides during motion and commits at the current position", () => {
  it("keyboard focus lights the aura only after settle, at the node's current coords", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await waitFor(() => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(), { timeout: 20000 });

    fireEvent.focus(interactionCircleFor(container, GN_BANK));

    // The focus wake flexes the graph -> the aura must hide for the whole run.
    await waitFor(() => expect(container.querySelector("[data-graph-motion='moving']")).not.toBeNull(), { timeout: 10000 });
    await waitFor(() => expect(container.querySelector("[data-focus-aura='hidden']")).not.toBeNull(), { timeout: 1000 });
    expect(auraRingIn(stateGroupForId(container, GN_BANK))!.getAttribute("data-graph-aura")).toBe("hidden");

    // Genuine rest -> aura returns, drawn from the CURRENT live position.
    await waitFor(() => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(), { timeout: 20000 });
    await waitFor(() => expect(container.querySelector("[data-focus-aura='visible']")).not.toBeNull(), { timeout: 2000 });

    const group = stateGroupForId(container, GN_BANK);
    expect(group.getAttribute("data-graph-focused")).toBe("true"); // focus navigation intact
    const ring = auraRingIn(group)!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");
    // The ring must sit exactly on the live body circle — never a stale snapshot.
    expect(ring.getAttribute("data-graph-aura-x")).toBe(bodyCircleIn(group).getAttribute("cx"));
    expect(ring.getAttribute("data-graph-aura-y")).toBe(bodyCircleIn(group).getAttribute("cy"));
  }, 35000);

  it("a committed selection persists through motion while the focused node's ring hides and returns", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await waitFor(() => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(), { timeout: 20000 });

    // Clicking commits a SELECTION — communicated through node body styling, not the ring.
    fireEvent.click(interactionCircleFor(container, GN_BANK));
    await waitFor(() => expect(stateGroupForId(container, GN_BANK).getAttribute("data-graph-selected")).toBe("true"), { timeout: 2000 });
    // No ring is rendered for a pure selection (ring is focus-only overlay).
    expect(auraRingIn(stateGroupForId(container, GN_BANK))).toBeNull();

    // Keyboard-focus ANOTHER node: focus ring hides during motion.
    fireEvent.focus(interactionCircleFor(container, GN_VICTOR));
    await waitFor(() => expect(container.querySelector("[data-graph-motion='moving']")).not.toBeNull(), { timeout: 10000 });
    // VICTOR's focus ring is hidden during motion.
    await waitFor(() => expect(auraRingIn(stateGroupForId(container, GN_VICTOR))!.getAttribute("data-graph-aura")).toBe("hidden"), { timeout: 1000 });
    // BANK's selection persists through motion (body styling, not a ring).
    expect(stateGroupForId(container, GN_BANK).getAttribute("data-graph-selected")).toBe("true");

    await waitFor(() => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(), { timeout: 20000 });
    await waitFor(() => expect(auraRingIn(stateGroupForId(container, GN_VICTOR))!.getAttribute("data-graph-aura")).toBe("focus"), { timeout: 2000 });
  }, 35000);

  it("the rail Focus action (camera dive) commits selection and focus ring returns after settle", async () => {
    const { utils, controlsRef } = renderCanvas();
    const container = utils.container;
    await waitFor(() => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(), { timeout: 20000 });
    expect(controlsRef.current).not.toBeNull();

    act(() => controlsRef.current!.focusNode(GN_BANK));
    // focusNode sets both selection and focus — data-graph-selected persists immediately.
    await waitFor(() => expect(stateGroupForId(container, GN_BANK).getAttribute("data-graph-selected")).toBe("true"), { timeout: 2000 });
    // During motion, the focus ring is hidden.
    await waitFor(() => expect(container.querySelector("[data-graph-motion='moving']")).not.toBeNull(), { timeout: 10000 });
    await waitFor(() => expect(auraRingIn(stateGroupForId(container, GN_BANK))!.getAttribute("data-graph-aura")).toBe("hidden"), { timeout: 1000 });
  }, 35000);

  it("reduced motion commits the aura instantly — no fade, no hidden phase", async () => {
    mediaPrefs.reduce = true;
    const { utils } = renderCanvas();
    const container = utils.container;
    await waitFor(() => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(), { timeout: 20000 });
    await waitFor(() => expect(container.querySelector("[data-focus-aura='visible']")).not.toBeNull(), { timeout: 2000 });

    fireEvent.focus(interactionCircleFor(container, GN_BANK));
    const ring = auraRingIn(stateGroupForId(container, GN_BANK))!;
    await waitFor(() => expect(ring.getAttribute("data-graph-aura")).toBe("focus"), { timeout: 2000 });
    expect(ring.getAttribute("style")).toContain("none"); // transition: none

    // Give the sim a beat: under reduced motion the aura never hides.
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(container.querySelector("[data-focus-aura='hidden']")).toBeNull();
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");
  }, 35000);
});

// ─── Deterministic source contract (pr9 style) ───────────────────────────────

describe("PR-17 §F the aura source never stales or animates", () => {
  it("draws the aura ring from the live per-tick node position, never a snapshot", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain("data-graph-aura-x={nx}");
    expect(src).toContain("data-graph-aura-y={ny}");
    expect(src).toContain("cx={nx} cy={ny} r={radius + 8}");
  });

  it("keeps the reduced-motion transition guard on the ring", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain('transition: reducedMotion ? "none"');
  });
});