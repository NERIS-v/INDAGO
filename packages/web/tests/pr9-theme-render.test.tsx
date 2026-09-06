import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";
import { GraphPanel } from "@/components/graph/graph-panel";
import { DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { GN_VICTOR } from "@/lib/providers/demo/demo-fixtures/lookup";

// ============================================================================
// PR-9 · Cinematic Theme — Render + Component-Surface Contract
//
// The graph must KEEP every data-* hook (pr6 semantics) while the presentation
// moved onto the semantic layer, and the control-center surfaces must carry
// the paper material + honest state tones. CSS classes are asserted as STRINGS
// on the live DOM / source — never pixels.
// ============================================================================

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
  [DATA_MODE_ENV]: process.env.NEXT_PUBLIC_DATA_MODE,
  [DEMO_CASE_ID_ENV]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
};

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

const els = (container: HTMLElement, sel: string): Element[] =>
  Array.from(container.querySelectorAll<Element>(sel));

/** The state <g> owning a given node id (same index mapping pr6 uses). */
function nodeGroupForId(container: HTMLElement, id: string): Element {
  const circles = els(container, "circle[data-nodeid]");
  const states = els(container, "g[data-graph-node-state]");
  const idx = circles.findIndex((c) => c.getAttribute("data-nodeid") === id);
  if (idx < 0) throw new Error(`node ${id} not rendered`);
  return states[idx]!;
}

function mainCircle(group: Element): Element {
  const circle = group.querySelector('circle[filter^="url(#"]');
  if (!circle) throw new Error("no visual node circle found");
  return circle;
}

const cls = (el: Element) =>
  (el as SVGElement).className.baseVal ?? el.getAttribute("class") ?? "";

async function renderPanel() {
  const utils = render(
    <WorkspaceBoundary>
      <GraphPanel activeTimeRange={null} />
    </WorkspaceBoundary>,
  );
  await waitFor(() => expect(els(utils.container, "g[data-graph-node-state]").length).toBeGreaterThan(0));
  await waitFor(() => expect(nodeGroupForId(utils.container, GN_VICTOR)).toBeDefined());
  return utils;
}

describe("PR-9 §D the canvas wears the semantic layer while keeping its hooks", () => {
  it("a bridge node wears the honest restrained-rose identity (no amber wash), keeping semantic fill", async () => {
    const { container } = await renderPanel();
    const circle = mainCircle(nodeGroupForId(container, GN_VICTOR));
    expect(cls(circle)).toContain("fill-semantic-surface-elevated");
    expect(cls(circle)).toContain("stroke-accent-rose/70");
  });

  it("the default and ENTITY silhouettes are silver via the source contract, never amber", () => {
    const src = fs.readFileSync(path.resolve("src/components/graph/graph-canvas.tsx"), "utf-8");
    expect(src).toContain('stroke-semantic-foreground-muted";');
    expect(src).toContain('stroke-semantic-foreground-faint";');
    expect(src).not.toContain('stroke-accent-amber";');
  });

  it("selecting a node turns it into the warm-white spotlight via data-* hooks intact", async () => {
    const { container } = await renderPanel();
    const target = els(container, "circle[data-nodeid]").find(
      (c) => c.getAttribute("data-nodeid") === GN_VICTOR,
    )!;
    fireEvent.click(target);
    const group = nodeGroupForId(container, GN_VICTOR);
    await waitFor(() => expect(group.getAttribute("data-graph-selected")).toBe("true"));
    expect(cls(mainCircle(group))).toContain("stroke-semantic-selection");
    expect(cls(mainCircle(group))).toContain("fill-semantic-selection-subtle");
    // pr6 hooks are untouched by the restyle.
    expect(group.getAttribute("data-graph-node-state")).toContain("attentionLevel");
  });

  it("contradicted shells keep the dashed ring, now in the single semantic contradiction red", async () => {
    const { container } = await renderPanel();
    await waitFor(() =>
      expect(els(container, "circle[data-graph-node-posture='contradicted']").length).toBeGreaterThan(0),
    );
    const ring = els(container, "circle[data-graph-node-posture='contradicted']")[0]!;
    expect(ring.getAttribute("stroke")).toBe("var(--color-semantic-contradiction)");
  });

  it("contradicted edges render in the semantic contradiction stroke under the state group", async () => {
    const { container } = await renderPanel();
    await waitFor(() => expect(els(container, "g[data-graph-edge-state]").length).toBeGreaterThan(0));
    const contradicted = els(container, "g[data-graph-edge-state]").find((g) =>
      (g.getAttribute("data-graph-edge-state") ?? "").includes('"posture":"contradicted"'),
    );
    expect(contradicted).toBeDefined();
    const path = contradicted!.querySelector("path");
    expect(path).not.toBeNull();
    await waitFor(() => expect(cls(path!)).toContain("stroke-semantic-contradiction"));
  });

  it("reduced motion collapses the canvas animation class paths (foreign-halo pulse off)", async () => {
    mediaPrefs.reduce = true;
    const { container } = await renderPanel();
    expect(container.querySelector("[class*='animate-slow-pulse']")).toBeNull();
    expect(container.querySelectorAll("animate")).toHaveLength(0);
  });
});

describe("PR-9 §E the control-center surfaces carry the paper material + honest tones", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(p), "utf-8");

  it("context panel is a dossier: cc-panel material + hairline rows, values still exposed", () => {
    const src = read("src/components/graph/control-center/contextual-panel.tsx");
    expect(src).toContain('className="cc-panel flex h-full');
    expect(src).toContain("cc-panel-header");
    expect(src).toContain("divide-semantic-border-subtle");
    expect(src).toContain("data-context-row-value");
    expect(src).toContain("text-semantic-foreground");
  });

  it("authority panel: archival status tag, semantic focus rings, restraint-until-confirm danger tone", () => {
    const src = read("src/components/graph/control-center/relation-authority-panel.tsx");
    expect(src).toContain('className="status-tag"');
    expect(src).toContain("ring-semantic-focus");
    expect(src).toContain("bg-semantic-contradiction-subtle");
    expect(src).toContain("text-semantic-contradiction");
    expect(src).toContain("border-semantic-contradiction/30");
    expect(src).not.toContain("ring-brand-500");
  });

  it("operational rail: paper material, quiet active slot, semantic focus", () => {
    const src = read("src/components/graph/control-center/operational-rail.tsx");
    expect(src).toContain("cc-panel flex h-full");
    expect(src).toContain("cc-panel-header");
    expect(src).toContain("bg-semantic-surface-soft text-semantic-foreground");
    expect(src).not.toContain("ring-brand-500");
  });

  it("bottom-band panels: paper shell and the warm-white active tab underline", () => {
    const temporal = read("src/components/graph/control-center/temporal-context-panel.tsx");
    const intel = read("src/components/graph/control-center/investigative-intelligence.tsx");
    for (const src of [temporal, intel]) {
      expect(src).toContain("cc-panel flex min-h-0 flex-col");
      expect(src).toContain("cc-panel-header");
      expect(src).toContain("border-semantic-selection text-semantic-foreground");
      expect(src).not.toContain("ring-brand-500");
    }
  });

  it("deep-dive links read as continuations (border + semantic hover), never fake availability", () => {
    const src = read("src/components/graph/control-center/deep-dive-bridges.tsx");
    expect(src).toContain("hover:border-semantic-border hover:bg-semantic-surface-elevated");
    expect(src).toContain("data-link-available");
    expect(src).toContain("border-dashed border-semantic-border");
  });

  it("docks float on the semantic paper with the archival status-tag language", () => {
    const app = read("src/components/layout/app-nav-dock.tsx");
    const ws = read("src/components/layout/workspace-nav-dock.tsx");
    for (const src of [app, ws]) {
      expect(src).toContain("cc-panel-floating");
      expect(src).toContain("ring-semantic-focus");
      expect(src).not.toContain("backdrop-blur-xl");
    }
    expect(ws).toContain('className="status-tag"');
  });

  it("the graph legend labels the semantic encoding, not the removed visuals", () => {
    const src = read("src/components/graph/graph-panel.tsx");
    expect(src).toContain("border-semantic-contradiction");
    expect(src).toContain("border-semantic-selection");
    expect(src).toContain("border-semantic-attention/70");
    expect(src).toContain("ring-semantic-foreign");
  });

  it("the canvas animation guards reduced-motion at every sink", () => {
    const src = fs.readFileSync(path.resolve("src/components/graph/graph-canvas.tsx"), "utf-8");
    // The foreign (cross-case) halo is THE pulsing decoration; reduced motion
    // collapses it to a plain circle instead of looping.
    expect(src).toContain('className={reducedMotion ? "" : "animate-slow-pulse"}');
    const guarded = (src.match(/reducedMotion \? "" :/g) ?? []).length;
    expect(guarded).toBeGreaterThanOrEqual(1);
  });
});