import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { GN_BANK, GN_VICTOR } from "@/lib/providers/demo/demo-fixtures/lookup";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";

// ============================================================================
// PR-18 §12 · Graph Focus Lifecycle (F-PR18)
//
// The focus ring (dashed circle) is ONLY for focus/hover — NOT selection.
// Selection persists through node body styling (data-graph-selected,
// fill/stroke/glow) and must never be communicated through the ring.
//
// Ring rendering gate:
//   motionState === "settled" && focusAuraOn && (isFocusTarget || isHovered) && inTimeRange
//
// data-graph-aura values: "focus" (visible) | "hidden" (not)
//
// Motion cycle:
//   - wake (focus / drag / data reposition) → motion "moving" → ring snaps off
//     (opacity 0ms, no trailing fade),
//   - genuine settle → 160ms delay → focusAuraOn=true → ring fades in (250ms)
//     at the node's CURRENT live position — never a stale snapshot.
//
// setFocus: one-shot wake — alpha(HOVER_ALPHA) if below, alphaTarget(0),
//           restart(). Under reduced motion: returns early, no wake and
//           motionState stays "settled" (instant commit, no hidden phase).
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

// ─── DOM helpers (pr6 convention) ────────────────────────────────────────────

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

// PR-18 drag harness. The GraphCanvas mounts d3-drag on the interaction circles
// (mousedown/mousemove/mouseup). jsdom constructs MouseEvent with event.view
// === null, which d3-drag's mousedowned depends on (it attaches the move/up
// listeners to `event.view`, then beginDrag/moveNode/endDrag drive the real d3
// simulation). We repatch the readonly-computed `view` after construction so
// the genuine d3 drag lifecycle runs end-to-end in jsdom.
const dragEvent = (win: Window, type: string, x: number, y: number): MouseEvent => {
  const ev = new win.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(ev, "view", { value: win, configurable: true });
  return ev;
};

function dragOn(container: HTMLElement, id: string, from: { x: number; y: number }, to: { x: number; y: number }) {
  const circle = interactionCircleFor(container, id);
  const win = circle.ownerDocument!.defaultView as Window;
  act(() => {
    circle.dispatchEvent(dragEvent(win, "mousedown", from.x, from.y));
    circle.dispatchEvent(dragEvent(win, "mousemove", to.x, to.y));
  });
}

function dragEnd(container: HTMLElement, id: string, at: { x: number; y: number }) {
  const circle = interactionCircleFor(container, id);
  const win = circle.ownerDocument!.defaultView as Window;
  act(() => {
    circle.dispatchEvent(dragEvent(win, "mouseup", at.x, at.y));
  });
}

// ─── Motion sync helpers ─────────────────────────────────────────────────────

const whenSettled = async (container: HTMLElement) => {
  await waitFor(
    () => expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull(),
    { timeout: 20000 },
  );
};

const whenMoving = async (container: HTMLElement) => {
  await waitFor(
    () => expect(container.querySelector("[data-graph-motion='moving']")).not.toBeNull(),
    { timeout: 10000 },
  );
};

const whenFocusHidden = async (container: HTMLElement) => {
  await waitFor(
    () => expect(container.querySelector("[data-focus-aura='hidden']")).not.toBeNull(),
    { timeout: 2000 },
  );
};

const whenFocusVisible = async (container: HTMLElement) => {
  await waitFor(
    () => expect(container.querySelector("[data-focus-aura='visible']")).not.toBeNull(),
    { timeout: 3000 },
  );
};

// Focus a node and ride the full focus wake to committed (settled + visible).
// Sequence matters: the wake is GENUINE motion, so we wait for the moving edge
// first — a bare `waitFor(settled)` right after focus can no-op against the
// still-lived render before the wake propagates.
async function focusAndSettle(container: HTMLElement, id: string) {
  fireEvent.focus(interactionCircleFor(container, id));
  await whenMoving(container);
  await whenFocusHidden(container);
  await whenSettled(container);
  await whenFocusVisible(container);
}

// ─── §12 Cases ───────────────────────────────────────────────────────────────

describe("PR-18 §12 focus ring is focus-only overlay; selection is body-persistent", () => {
  it("case 1 — focused ring visible at settled state", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    fireEvent.focus(interactionCircleFor(container, GN_BANK));
    await whenMoving(container);
    await whenSettled(container);
    await whenFocusVisible(container);

    const group = stateGroupForId(container, GN_BANK);
    const ring = auraRingIn(group)!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");
    expect(group.getAttribute("data-graph-focused")).toBe("true");
    expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull();
  }, 35000);

  it("case 2 — graph becomes active → focus becomes hidden", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const group = stateGroupForId(container, GN_BANK);
    const ring = auraRingIn(group)!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");

    // Re-focusing the SAME node is one more one-shot setFocus wake: the graph
    // becomes active while BANK stays the focus target — its ring must hide.
    fireEvent.focus(interactionCircleFor(container, GN_BANK));
    await whenMoving(container);
    await whenFocusHidden(container);
    expect(ring.getAttribute("data-graph-aura")).toBe("hidden");
    expect(container.querySelector("[data-focus-aura='hidden']")).not.toBeNull();
  }, 35000);

  it("case 3 — drag begins → focus hidden", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const ring = auraRingIn(stateGroupForId(container, GN_BANK))!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");

    // beginDrag on an unrelated node: motion starts, ring snaps off.
    dragOn(container, GN_VICTOR, { x: 400, y: 300 }, { x: 420, y: 310 });
    await whenMoving(container);
    await whenFocusHidden(container);
    expect(ring.getAttribute("data-graph-aura")).toBe("hidden");
  }, 35000);

  it("case 4 — drag continues → focus remains hidden", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const ring = auraRingIn(stateGroupForId(container, GN_BANK))!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");

    dragOn(container, GN_VICTOR, { x: 400, y: 300 }, { x: 420, y: 310 });
    await whenMoving(container);
    await whenFocusHidden(container);
    expect(ring.getAttribute("data-graph-aura")).toBe("hidden");
    expect(container.querySelector("[data-focus-aura='hidden']")).not.toBeNull();

    // Continuing the drag keeps the ring hidden the whole time.
    const circle = interactionCircleFor(container, GN_VICTOR);
    const win = circle.ownerDocument!.defaultView as Window;
    act(() => circle.dispatchEvent(dragEvent(win, "mousemove", 440, 330)));
    expect(ring.getAttribute("data-graph-aura")).toBe("hidden");

    act(() => circle.dispatchEvent(dragEvent(win, "mousemove", 460, 350)));
    expect(ring.getAttribute("data-graph-aura")).toBe("hidden");
  }, 35000);

  it("case 5 — drag ends → focus still hidden", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const ring = auraRingIn(stateGroupForId(container, GN_BANK))!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");

    dragOn(container, GN_VICTOR, { x: 400, y: 300 }, { x: 440, y: 340 });
    await whenMoving(container);
    await whenFocusHidden(container);

    // endDrag: the physics is STILL active (decelerating rebound) — motion
    // must remain "moving" and the ring stays hidden until genuine rest.
    dragEnd(container, GN_VICTOR, { x: 440, y: 340 });
    expect(container.querySelector("[data-graph-motion='moving']")).not.toBeNull();
    expect(ring.getAttribute("data-graph-aura")).toBe("hidden");
    expect(container.querySelector("[data-focus-aura='hidden']")).not.toBeNull();
  }, 35000);

  it("case 6 — graph settles → focus returns", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const group = stateGroupForId(container, GN_BANK);
    const ring = auraRingIn(group)!;
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");

    // A drag wakes then releases the graph; the focus ring must return once
    // the simulation reaches genuine rest again.
    dragOn(container, GN_VICTOR, { x: 400, y: 300 }, { x: 440, y: 340 });
    await whenMoving(container);
    await whenFocusHidden(container);

    dragEnd(container, GN_VICTOR, { x: 440, y: 340 });
    await whenSettled(container);
    await whenFocusVisible(container);

    expect(ring.getAttribute("data-graph-aura")).toBe("focus");
    expect(group.getAttribute("data-graph-focused")).toBe("true");
  }, 35000);

  it("case 7 — returned focus uses NEW node coordinates (aura-x/y match body circle after settle)", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const groupBefore = stateGroupForId(container, GN_BANK);
    const ringBefore = auraRingIn(groupBefore)!;
    const bodyBefore = bodyCircleIn(groupBefore);

    // Settled ring sits exactly on the live body circle.
    expect(ringBefore.getAttribute("data-graph-aura-x")).toBe(bodyBefore.getAttribute("cx"));
    expect(ringBefore.getAttribute("data-graph-aura-y")).toBe(bodyBefore.getAttribute("cy"));

    // Drag the FOCUSED node itself to a new position.
    dragOn(container, GN_BANK, { x: 400, y: 300 }, { x: 520, y: 360 });
    await whenMoving(container);
    await whenFocusHidden(container);

    dragEnd(container, GN_BANK, { x: 520, y: 360 });
    await whenSettled(container);
    await whenFocusVisible(container);

    // After re-settle the ring must be rendered at the node's NEW live
    // position — matching the moved body circle, never a stale snapshot.
    const groupAfter = stateGroupForId(container, GN_BANK);
    const ringAfter = auraRingIn(groupAfter)!;
    const bodyAfter = bodyCircleIn(groupAfter);
    expect(ringAfter.getAttribute("data-graph-aura")).toBe("focus");
    expect(ringAfter.getAttribute("data-graph-aura-x")).toBe(bodyAfter.getAttribute("cx"));
    expect(ringAfter.getAttribute("data-graph-aura-y")).toBe(bodyAfter.getAttribute("cy"));
  }, 35000);

  it("case 8 — no stale focus element remains (only ONE ring per node after settle)", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    await focusAndSettle(container, GN_BANK);
    const ringsBefore = stateGroupForId(container, GN_BANK).querySelectorAll("circle[data-graph-aura]");
    expect(ringsBefore.length).toBe(1);

    // Wake the graph with a drag on an unrelated node, let it fully re-settle.
    dragOn(container, GN_VICTOR, { x: 400, y: 300 }, { x: 440, y: 340 });
    await whenMoving(container);
    dragEnd(container, GN_VICTOR, { x: 440, y: 340 });
    await whenSettled(container);
    await whenFocusVisible(container);

    // After motion exactly ONE live ring remains — no stale duplicates.
    const ringsAfter = stateGroupForId(container, GN_BANK).querySelectorAll("circle[data-graph-aura]");
    expect(ringsAfter.length).toBe(1);
    expect(ringsAfter[0].getAttribute("data-graph-aura")).toBe("focus");
  }, 35000);

  it("case 9 — selection persists through motion (data-graph-selected persists; ring absent for selection-only)", async () => {
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    // Clicking commits a SELECTION — communicated through body styling only.
    fireEvent.click(interactionCircleFor(container, GN_BANK));
    await waitFor(
      () => expect(stateGroupForId(container, GN_BANK).getAttribute("data-graph-selected")).toBe("true"),
      { timeout: 2000 },
    );
    // Selection is body-only: no aura ring is rendered for a pure selection.
    const group = stateGroupForId(container, GN_BANK);
    expect(auraRingIn(group)).toBeNull();
    expect(bodyCircleIn(group).className.baseVal).toContain("fill-semantic-selection-subtle");

    // Drag an unrelated node — the graph wakes, selection must persist.
    dragOn(container, GN_VICTOR, { x: 400, y: 300 }, { x: 440, y: 340 });
    await whenMoving(container);

    expect(stateGroupForId(container, GN_BANK).getAttribute("data-graph-selected")).toBe("true");
    expect(auraRingIn(stateGroupForId(container, GN_BANK))).toBeNull();
    expect(bodyCircleIn(stateGroupForId(container, GN_BANK)).className.baseVal).toContain("fill-semantic-selection-subtle");

    dragEnd(container, GN_VICTOR, { x: 440, y: 340 });
    await whenSettled(container);

    // After settle: selection still intact and still no ring for the selected
    // node (the ring is the focus/hover overlay, never selection).
    expect(stateGroupForId(container, GN_BANK).getAttribute("data-graph-selected")).toBe("true");
    expect(auraRingIn(stateGroupForId(container, GN_BANK))).toBeNull();
  }, 35000);

  it("case 10 — reduced motion: instant commit, no hidden phase", async () => {
    mediaPrefs.reduce = true;
    const { utils } = renderCanvas();
    const container = utils.container;
    await whenSettled(container);

    fireEvent.focus(interactionCircleFor(container, GN_BANK));
    const ring = auraRingIn(stateGroupForId(container, GN_BANK))!;
    await waitFor(
      () => expect(ring.getAttribute("data-graph-aura")).toBe("focus"),
      { timeout: 2000 },
    );
    expect(ring.getAttribute("style")).toContain("none"); // transition: none

    // Give the sim a beat: under reduced motion the aura never hides and
    // motionState stays "settled" (setFocus returns early, no wake).
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(container.querySelector("[data-focus-aura='hidden']")).toBeNull();
    expect(ring.getAttribute("data-graph-aura")).toBe("focus");
    expect(container.querySelector("[data-graph-motion='settled']")).not.toBeNull();
  }, 35000);
});

// ─── Deterministic source contract (pr9 style) ───────────────────────────────

describe("PR-18 §12 source contract: ring is focus/hover only, selection is body-only", () => {
  it("ring renders only for focus/hover targets, not for selection", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain("isFocusTarget || isHovered");
  });

  it("bodyEmphasis includes selection (body persists) while the ring gate is focus+hover only", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain("bodyEmphasis = isSelectedNode || (focusAuraOn && (isFocusTarget || isHovered))");
  });

  it("ring visibility is gated on settled + bodyEmphasis + inTimeRange", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain('motionState === "settled" && bodyEmphasis && inTimeRange');
  });

  it("ring snaps off instantly during motion (opacity 0ms, no trailing fade)", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain('motionState === "moving" ? "opacity 0ms"');
  });

  it("reduced-motion transition guard on the ring", () => {
    const src = require("fs").readFileSync("src/components/graph/graph-canvas.tsx", "utf-8") as string;
    expect(src).toContain('transition: reducedMotion ? "none"');
  });

  it("setFocus is one-shot wake with HOVER_ALPHA and alphaTarget(0)", () => {
    const src = require("fs").readFileSync("src/components/graph/use-graph-layout.ts", "utf-8") as string;
    expect(src).toContain("sim.simulation.alpha(HOVER_ALPHA)");
    expect(src).toContain("sim.simulation.alphaTarget(0)");
  });

  it("setFocus returns early under reduced motion (no wake)", () => {
    const src = require("fs").readFileSync("src/components/graph/use-graph-layout.ts", "utf-8") as string;
    expect(src).toContain("if (!sim || controlsRef.current.reducedMotion || sim.dragging) return");
  });
});