import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import {
  getDataModeConfig,
  TIMING_SCALE_ENV,
  DATA_MODE_ENV,
  DEMO_CASE_ID_ENV,
} from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import type { NetworkView } from "@/lib/network/network-workspace";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_BANK,
} from "@/lib/providers/demo/demo-fixtures/lookup";

vi.mock("@/components/graph/graph-canvas", () => ({
  GraphCanvas: () => <div data-testid="graph-canvas" />,
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/investigations/i-1/graph"),
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

function identity(workspaceId = `pr8:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function epochMs(iso: string): number {
  return new Date(iso).getTime();
}

const feb2024: [number, number] = [
  epochMs("2024-02-01T00:00:00.000Z"),
  epochMs("2024-02-29T23:59:59.999Z"),
];
const may2024: [number, number] = [
  epochMs("2024-05-01T00:00:00.000Z"),
  epochMs("2024-05-31T23:59:59.999Z"),
];

function renderControlCenter(
  view: NetworkView,
  onNetworkViewChange?: (view: NetworkView) => void,
  timeRange: [number, number] | null = null,
) {
  const providers = createWorkspaceDemoProviders(identity(), config);
  return {
    providers,
    ...render(
      <WorkspaceProvider providers={providers}>
        <GraphControlCenter
          activeTimeRange={timeRange}
          onTimeRangeChange={() => undefined}
          activeNetworkView={view}
          onNetworkViewChange={onNetworkViewChange}
        />
      </WorkspaceProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
});

describe("F-PR8 — the five-zone shell serves the Adaptive Flow", () => {
  it("renders the Flow representation in Zone 2 with all five zones adapted", async () => {
    renderControlCenter("flow");
    expect(screen.queryByTestId("graph-canvas")).not.toBeInTheDocument();

    // Zone 2: the deterministic flow panel settles with a data-backed summary.
    await waitFor(
      () =>
        expect(screen.getByTestId("flow-summary")).toHaveTextContent(
          /Financial · 4 flow segments · 3 active paths/,
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId("flow-diagram")).toBeInTheDocument();

    // Zone 1: flow operations rail.
    expect(
      screen.getByRole("complementary", { name: "Flow operations" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("flow-rail-stats")).toBeInTheDocument();

    // Zone 4 + 5: temporal note and intelligence insight adapt too.
    expect(await screen.findByTestId("flow-temporal-note")).toBeInTheDocument();
    expect(
      await screen.findByTestId("flow-intelligence-insight"),
    ).toBeInTheDocument();

    // The shared five-zone shell is preserved.
    expect(
      screen.getByRole("region", { name: "Temporal and case context" }),
    ).toBeInTheDocument();
  });

  it("the mode toggle hides when only ONE domain holds data (nothing to adapt)", async () => {
    renderControlCenter("flow");
    await waitFor(
      () =>
        expect(screen.getByTestId("flow-summary")).toHaveTextContent(/Financial/),
      { timeout: 5000 },
    );
    // The demo case holds financial flow only, so the adaptive toggle is absent.
    expect(screen.queryByTestId("flow-mode-financial")).not.toBeInTheDocument();
  });

  it("the SHARED timeRange is the single temporal controller for the flow", async () => {
    renderControlCenter("flow", undefined, feb2024);
    // February keeps r3/r4/r5 (3 segments, 2 paths) and drops the January
    // segment plus the March gap — the rail and note narrate the same window.
    await waitFor(
      () =>
        expect(screen.getByTestId("flow-summary")).toHaveTextContent(
          /Financial · 3 flow segments · 2 active paths · ₹495,000 observed/,
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId("flow-temporal-note")).toHaveTextContent(
      /3 flow segments/,
    );
  });

  it("reports NO FLOW IN SELECTED WINDOW when the window holds no flow", async () => {
    renderControlCenter("flow", undefined, may2024);
    await waitFor(
      () => expect(screen.getByText("No flow in selected window")).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("flow-diagram")).not.toBeInTheDocument();
  });

  it("the role filter reshapes the rail overview (role is never fabricated)", async () => {
    renderControlCenter("flow", undefined, feb2024);
    await waitFor(
      () =>
        expect(screen.getByTestId("flow-summary")).toHaveTextContent(
          /3 flow segments/,
        ),
      { timeout: 5000 },
    );
    fireEvent.change(screen.getByTestId("flow-role-filter-select"), {
      target: { value: "sources" },
    });
    // In February, sources = SHELL_ONE; its two outbound segments r3 + r5 remain.
    await waitFor(() =>
      expect(screen.getByTestId("flow-summary")).toHaveTextContent(
        /Financial · 2 flow segments/,
      ),
    );
  });

  it("a node SELECT opens the Flow context zone (SELECT ≠ FOCUS)", async () => {
    const { container } = renderControlCenter("flow");
    await waitFor(
      () =>
        expect(screen.getByTestId("flow-summary")).toHaveTextContent(/Financial/),
      { timeout: 5000 },
    );
    const bankNode = container.querySelector(
      `[data-flow-node-id="ent:${ENT_BANK}"]`,
    );
    expect(bankNode).not.toBeNull();
    fireEvent.click(bankNode!);

    const context = await screen.findByRole("complementary", {
      name: "Flow context",
    });
    await waitFor(() =>
      expect(context).toHaveTextContent(/Intermediary Account 0093/),
    );
    expect(screen.getByTestId("flow-context-summary")).toBeInTheDocument();
  });

  it("Open in Graph hands the selected flow entity to the graph representation", async () => {
    const onNetworkViewChange = vi.fn();
    const { container } = renderControlCenter("flow", onNetworkViewChange);
    await waitFor(
      () =>
        expect(screen.getByTestId("flow-summary")).toHaveTextContent(/Financial/),
      { timeout: 5000 },
    );
    const bankNode = container.querySelector(
      `[data-flow-node-id="ent:${ENT_BANK}"]`,
    );
    fireEvent.click(bankNode!);
    await waitFor(() =>
      expect(screen.getByTestId("flow-context-open-in-graph")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("flow-context-open-in-graph"));
    expect(onNetworkViewChange).toHaveBeenCalledWith("graph");
  });

  it("graph mode never triggers or leaks flow artefacts", async () => {
    renderControlCenter("graph");
    expect(await screen.findByTestId("graph-canvas")).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Flow operations" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("flow-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("flow-temporal-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("flow-intelligence-insight")).not.toBeInTheDocument();
  });
});