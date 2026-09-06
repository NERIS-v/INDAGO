// ============================================================================
// PR-10 §48 — Accessibility hardening of graph surfaces
//
// PR-10 accessibility: every node is exactly ONE tab stop (the interaction
// circle — the pre-PR-10 sr-only duplicate list is gone), each carries a
// truthful label (+ ", bridge candidate") and exposes selection state honestly
// via aria-pressed; focus is visibly indicated (focus-visible ring); canvas
// zoom controls are labeled; tablists rove focus with arrow keys; pressed/
// disabled state of the representation switcher reflects capability truth.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";
import { GraphPanel } from "@/components/graph/graph-panel";
import { TemporalContextPanel } from "@/components/graph/control-center/temporal-context-panel";
import { RepresentationSwitcher } from "@/components/graph/control-center/representation-switcher";
import { DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

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

const interactionCircles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<SVGCircleElement>("circle[role='button']"));

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

describe("PR-10 §48 — one tab stop per node, honestly labeled", () => {
  it("exposes exactly one labeled button per node (no sr-only duplication)", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(interactionCircles(utils.container).length).toBe(6));

    const circles = interactionCircles(utils.container);
    for (const circle of circles) {
      expect(circle.getAttribute("aria-label")).toBeTruthy();
      expect(circle.getAttribute("tabindex")).toBe("0");
      expect(circle.className.baseVal).toContain("focus-visible:ring-2");
      expect(circle.className.baseVal).toContain("outline-none");
      expect(circle.getAttribute("data-nodeid")).toBeTruthy();
    }
    // PR-10: the extraneous sr-only entity list is gone — the interaction
    // circles are the ONLY focusable node affordances.
    const focusableLabels = utils.container.querySelectorAll(
      "svg [aria-label], svg [role='button']",
    );
    expect(focusableLabels.length).toBe(6);
  });

  it("marks a node pressed when clicked and clears it on another selection", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(interactionCircles(utils.container).length).toBe(6));
    const first = interactionCircles(utils.container)[0]!;
    const second = interactionCircles(utils.container)[1]!;

    fireEvent.click(first);
    await waitFor(() => expect(first.getAttribute("aria-pressed")).toBe("true"));
    expect(second.getAttribute("aria-pressed")).toBeNull();

    fireEvent.click(second);
    await waitFor(() => expect(second.getAttribute("aria-pressed")).toBe("true"));
    expect(first.getAttribute("aria-pressed")).toBeNull();
  });

  it("selects via the Enter key with the same honest pressed state", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(interactionCircles(utils.container).length).toBe(6));
    const first = interactionCircles(utils.container)[0]!;
    fireEvent.keyDown(first, { key: "Enter" });
    await waitFor(() => expect(first.getAttribute("aria-pressed")).toBe("true"));
  });

  it("labels canvas zoom controls unambiguously", async () => {
    render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit graph to view" })).toBeInTheDocument();
  });

  it("keeps the physics/render edge attributes readable for debugging", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => expect(interactionCircles(utils.container).length).toBe(6));
    const root = utils.container.querySelector("[data-graph-physics-edges]")!;
    expect(root.hasAttribute("data-graph-render-edges")).toBe(true);
  });
});

describe("PR-10 §48 — roving-tab tablist keyboard semantics", () => {
  const renderTabs = (tab: "time" | "activity" | "versions") => {
    const onTabChange = vi.fn();
    const utils = render(
      <TemporalContextPanel
        tab={tab}
        onTabChange={onTabChange}
        children={<div data-testid="time-body" />}
      />,
    );
    return { utils, onTabChange };
  };

  it("keeps exactly one roving tab stop and exposes pressed/selected/controls state", () => {
    const { utils } = renderTabs("time");
    const tabs = Array.from(
      utils.container.querySelectorAll<HTMLButtonElement>("button[role='tab']"),
    );
    expect(tabs).toHaveLength(3);
    const active = tabs.find((t) => t.id === "temporal-tab-time")!;
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(active.getAttribute("tabindex")).toBe("0");
    for (const t of tabs) {
      if (t === active) continue;
      expect(t.getAttribute("aria-selected")).toBe("false");
      expect(t.getAttribute("tabindex")).toBe("-1");
      expect(t.getAttribute("aria-controls")).toBe("temporal-context-tabpanel");
    }
  });

  it("ArrowRight advances the tab and moves focus onto the next control", () => {
    const { utils, onTabChange } = renderTabs("time");
    const timeTab = utils.container.querySelector("#temporal-tab-time")!;
    fireEvent.keyDown(timeTab, { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenCalledWith("activity");
    expect(document.activeElement?.id).toBe("temporal-tab-activity");
  });

  it("arrow navigation wraps around the tablist boundaries", () => {
    const { utils, onTabChange } = renderTabs("versions");
    const versionsTab = utils.container.querySelector("#temporal-tab-versions")!;
    fireEvent.keyDown(versionsTab, { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenCalledWith("time");

    utils.rerender(
      <TemporalContextPanel
        tab="time"
        onTabChange={onTabChange}
        children={<div data-testid="time-body" />}
      />,
    );
    const timeTab = utils.container.querySelector("#temporal-tab-time")!;
    fireEvent.keyDown(timeTab, { key: "ArrowLeft" });
    expect(onTabChange).toHaveBeenCalledWith("versions");
  });
});

describe("PR-10 §48 — representation switcher states capability truth", () => {
  it("marks only the current view pressed and disables not-ready views with an honest title", () => {
    render(
      <RepresentationSwitcher
        current="graph"
        onChange={vi.fn()}
        availability={{ graph: "available", pulse: "available", matrix: "not-ready", flow: "available" }}
      />,
    );
    const graphButton = screen.getByRole("button", { name: "Graph" });
    const pulseButton = screen.getByRole("button", { name: "Pulse" });
    const matrixButton = screen.getByRole("button", { name: "Matrix", hidden: true });
    expect(graphButton.getAttribute("aria-pressed")).toBe("true");
    expect(pulseButton.getAttribute("aria-pressed")).toBe("false");
    expect(matrixButton).toBeDisabled();
    expect(matrixButton.title).toContain("not ready in this mode");
    expect(graphButton).not.toBeDisabled();
  });

  it("reports onChange only for a genuinely available view", () => {
    const onChange = vi.fn();
    render(
      <RepresentationSwitcher
        current="pulse"
        onChange={onChange}
        availability={{ graph: "available", pulse: "available", matrix: "not-ready", flow: "available" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Flow" }));
    expect(onChange).toHaveBeenCalledWith("flow");
    fireEvent.click(screen.getByRole("button", { name: "Matrix", hidden: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});