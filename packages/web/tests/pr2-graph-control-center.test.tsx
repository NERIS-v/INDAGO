import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  controlCenterColumns,
  bottomBandHeightClass,
  DEFAULT_LAYOUT_STATE,
  DEFAULT_ACTIONS,
} from "@/lib/layout/control-center";

vi.mock("@/components/graph/graph-canvas", () => ({
  // jsdom has no ResizeObserver/d3 layout pipeline — GraphCanvas is a pure
  // visual leaf in these tests; interacting with the shell must not need it.
  GraphCanvas: () => <div data-testid="graph-canvas" />,
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const { href, children, ...rest } = props;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr2:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderControlCenter() {
  const providers = createWorkspaceDemoProviders(identity(), config);
  const utils = render(
    <WorkspaceProvider providers={providers}>
      <GraphControlCenter
        activeTimeRange={null}
        onTimeRangeChange={() => undefined}
      />
    </WorkspaceProvider>,
  );
  return {
    ...utils,
    providers,
    getCols: () => utils.container.querySelector("[data-control-center-main]")?.getAttribute("data-cols") ?? null,
    graphCell: () => utils.container.querySelector("[data-graph-workspace]"),
  };
}

function temporalTabs() {
  return screen.getByRole("tablist", { name: "Temporal context tabs" });
}

function intelTabs() {
  return screen.getByRole("tablist", { name: "Investigative intelligence tabs" });
}

afterEach(() => {
  cleanup();
});

describe("PR-2 — geometry contract (pure)", () => {
  it("derives the three-column allocation with the graph always minmax(0,1fr)", () => {
    expect(controlCenterColumns({ leftRailOpen: true, rightPanelOpen: true })).toBe(
      "minmax(12rem, 15rem) minmax(0, 1fr) minmax(16rem, 20rem)",
    );
    expect(controlCenterColumns({ leftRailOpen: false, rightPanelOpen: false })).toBe(
      "2.5rem minmax(0, 1fr) 2.5rem",
    );
    expect(controlCenterColumns({ leftRailOpen: true, rightPanelOpen: false })).toBe(
      "minmax(12rem, 15rem) minmax(0, 1fr) 2.5rem",
    );
    expect(controlCenterColumns({ leftRailOpen: false, rightPanelOpen: true })).toBe(
      "2.5rem minmax(0, 1fr) minmax(16rem, 20rem)",
    );
  });

  it("defines a clamped, viewport-derived bottom band height", () => {
    expect(bottomBandHeightClass()).toBe("h-[clamp(14rem,34vh,26rem)]");
  });

  it("ships sane layout/action defaults", () => {
    expect(DEFAULT_LAYOUT_STATE).toEqual({
      leftRailOpen: true,
      rightPanelOpen: true,
      temporalTab: "time",
      intelligenceTab: "overview",
    });
    expect(DEFAULT_ACTIONS).toEqual({
      legendOpen: false,
      discoveryOpen: false,
      gapsOpen: false,
      crossCaseOpen: false,
      uploadOpen: false,
      filterOpen: false,
      activeForeignCaseId: null,
    });
  });
});

describe("PR-2 — initial five-zone layout", () => {
  it("renders rail, graph workspace, contextual panel, and the bottom band", async () => {
    const { getCols } = renderControlCenter();
    await screen.findByTestId("graph-canvas");
    expect(getCols()).toBe("rail-graph-context");

    expect(screen.getByRole("complementary", { name: "Graph operations" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Contextual panel" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Temporal and case context" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Investigative intelligence" })).toBeInTheDocument();
    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
  });

  it("defaults the temporal tab to Time and the intelligence tab to Overview", () => {
    renderControlCenter();
    expect(within(temporalTabs()).getByRole("tab", { name: "Time" })).toHaveAttribute("aria-selected", "true");
    expect(within(temporalTabs()).getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "false");
    expect(within(intelTabs()).getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(within(intelTabs()).getByRole("tab", { name: "Signals" })).toHaveAttribute("aria-selected", "false");
  });

  it("composes the TimelinePanel inside the TIME tab and leaves it mounted only there", async () => {
    renderControlCenter();
    expect((await screen.findAllByText("MILESTONES")).length).toBeGreaterThan(0);
    fireEvent.click(within(temporalTabs()).getByRole("tab", { name: "Versions" }));
    expect(screen.queryByText("MILESTONES")).not.toBeInTheDocument();
    expect(screen.getByText("Graph versions")).toBeInTheDocument();
    fireEvent.click(within(temporalTabs()).getByRole("tab", { name: "Time" }));
    expect((await screen.findAllByText("MILESTONES")).length).toBeGreaterThan(0);
  });

  it("renders the graph panel with the mocked canvas and its telemetry", async () => {
    renderControlCenter();
    expect(await screen.findByText("NODES")).toBeInTheDocument();
    expect(screen.getByText("EDGES")).toBeInTheDocument();
  });
});

describe("PR-2 — side-panel collapse and reopen", () => {
  it("collapses the left rail to a reopen strip (content unmounts) without touching the graph cell", async () => {
    const { getCols, graphCell } = renderControlCenter();
    await screen.findByTestId("graph-canvas");
    expect(screen.getByRole("button", { name: "Collapse left operational rail" })).toHaveAttribute("aria-expanded", "true");

    const cellBefore = graphCell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse left operational rail" }));

    expect(getCols()).toBe("graph-context");
    expect(screen.queryByRole("button", { name: /^Layers/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open left operational rail" })).toHaveAttribute("aria-expanded", "false");
    expect(graphCell()).toBe(cellBefore);
    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open left operational rail" }));
    expect(getCols()).toBe("rail-graph-context");
    expect(screen.getByRole("button", { name: /^Layers/ })).toBeInTheDocument();
  });

  it("collapses the right contextual panel to a reopen strip", async () => {
    const { getCols } = renderControlCenter();
    await screen.findByTestId("graph-canvas");
    expect(screen.getByRole("button", { name: "Collapse right contextual panel" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Collapse right contextual panel" }));
    expect(getCols()).toBe("rail-graph");
    expect(screen.queryByRole("complementary", { name: "Contextual panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open right contextual panel" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Open right contextual panel" }));
    expect(getCols()).toBe("rail-graph-context");
    expect(screen.getByRole("complementary", { name: "Contextual panel" })).toBeInTheDocument();
  });

  it("collapses both side panels; the graph cell keeps its identity the whole time", async () => {
    const { getCols, graphCell } = renderControlCenter();
    await screen.findByTestId("graph-canvas");
    const cell = graphCell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse right contextual panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse left operational rail" }));
    expect(getCols()).toBe("graph");
    expect(graphCell()).toBe(cell);
    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
  });

  it("moves focus to the reopen strip when a side panel collapses", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    fireEvent.click(screen.getByRole("button", { name: "Collapse left operational rail" }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Open left operational rail");
  });
});

describe("PR-2 — rail wiring and action exclusivity", () => {
  it("Layers opens the legend surface independently of other surfaces", async () => {
    const { getCols } = renderControlCenter();
    await screen.findByTestId("graph-canvas");
    fireEvent.click(screen.getByRole("button", { name: /^Layers/ }));
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.getByText("GRAPH LEGEND")).toBeInTheDocument();
    expect(getCols()).toBe("rail-graph-context");

    fireEvent.click(screen.getByRole("button", { name: /^Discover/ }));
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.getByText("GRAPH LEGEND")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Discover/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("surface-openers close other exclusive surfaces but never the legend", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    fireEvent.click(screen.getByRole("button", { name: /^Discover/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Detect Gaps/ }));

    expect(screen.getByRole("button", { name: /^Detect Gaps/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Discover/ })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("Investigative Gaps")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Discover/ }));
    expect(screen.queryByText("Investigative Gaps")).not.toBeInTheDocument();
  });

  it("Add Evidence opens the upload modal through the rail", async () => {
    renderControlCenter();
    await screen.findByTestId("graph-canvas");
    fireEvent.click(screen.getByRole("button", { name: /^Add Evidence/ }));
    expect(await screen.findByRole("heading", { name: "Upload Evidence" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByRole("heading", { name: "Upload Evidence" })).not.toBeInTheDocument();
  });

  it("Cross-Case lists provider-driven overlays and activates one on the canvas", async () => {
    renderControlCenter();
    fireEvent.click(screen.getByRole("button", { name: /^Cross-Case/ }));
    const picker = await screen.findByText("Match: Operation Cobalt");
    expect(picker).toBeInTheDocument();

    fireEvent.click(picker);
    expect(await screen.findByText("Foreign Boundary Scan Active")).toBeInTheDocument();
    expect(await screen.findByText("Authorize Graph Merge")).toBeInTheDocument();
  });

  it("marks unimplemented rail slots as capability-aware disabled rows", () => {
    renderControlCenter();
    // PR-4 wires Filter as a real command (it renders enabled), so it is
    // deliberately absent from this disabled-set.
    for (const name of [/^Search/, /^Focus/, /^Expand/, /^Layout/, /^Review/, /^Resolve/, /^Challenge/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: /^Filter/ })).not.toBeDisabled();
  });
});

describe("PR-2 — bottom tab systems (a11y)", () => {
  it("exposes tab state and roves focus with arrow keys (temporal)", () => {
    renderControlCenter();
    const time = within(temporalTabs()).getByRole("tab", { name: "Time" });
    expect(time).toHaveAttribute("aria-selected", "true");
    expect(time).toHaveAttribute("aria-controls", "temporal-context-tabpanel");

    fireEvent.keyDown(time, { key: "ArrowRight" });
    expect(within(temporalTabs()).getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    expect(within(temporalTabs()).getByRole("tab", { name: "Time" })).toHaveAttribute("aria-selected", "false");
    expect(document.activeElement?.id).toBe("temporal-tab-activity");

    fireEvent.keyDown(within(temporalTabs()).getByRole("tab", { name: "Activity" }), { key: "ArrowRight" });
    expect(within(temporalTabs()).getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true");
  });

  it("exposes tab state and roves focus with arrow keys (intelligence)", async () => {
    renderControlCenter();
    const overview = within(intelTabs()).getByRole("tab", { name: "Overview" });
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(within(intelTabs()).getByRole("tab", { name: "Hypotheses" })).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement?.id).toBe("intel-tab-hypotheses");
    // HypothesisProvider is connected to the shell: the tab surfaces the
    // canonical provider-owned hypothesis set (no reserved placeholder).
    expect(await screen.findByText("Working hypotheses")).toBeInTheDocument();
  });

  it("surfaces the investigation overview with real provider counts — never fabricated intelligence", async () => {
    renderControlCenter();
    expect(await screen.findByText("Investigation overview")).toBeInTheDocument();
    expect(screen.getByText("Counts · No rankings")).toBeInTheDocument();
    expect(screen.queryByText(/No intelligence is shown until the reasoning layer is connected/)).not.toBeInTheDocument();
  });
});

describe("PR-2 — source guards and provider boundary", () => {
  const controlCenterDir = path.resolve(__dirname, "../src/components/graph/control-center");
  const layoutModule = path.resolve(__dirname, "../src/lib/layout/control-center.ts");

  it("control-center components never import demo/live providers or provider fixtures", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    walk(controlCenterDir);
    files.push(layoutModule);

    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/providers\/(demo|live)/);
      expect(src, file).not.toMatch(/demo-\w*fixtures/);
      expect(src, file).not.toMatch(/create(WorkspaceDemo|Live)Providers/);
      expect(src, file).not.toMatch(/useGraphLiveOverlay|triggerOrQueueUploadSequence/);
    }
  });

  it("the shell consumes the workspace through the context seam only", () => {
    const src = fs.readFileSync(path.join(controlCenterDir, "graph-control-center.tsx"), "utf8");
    expect(src).toContain("@/lib/providers/workspace/context");
  });
});