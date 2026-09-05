import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
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

function identity(workspaceId = `pr5:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderControlCenter(view: "graph" | "pulse") {
  const providers = createWorkspaceDemoProviders(identity(), config);
  return render(
    <WorkspaceProvider providers={providers}>
      <GraphControlCenter
        activeTimeRange={null}
        onTimeRangeChange={() => undefined}
        activeNetworkView={view}
      />
    </WorkspaceProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("F-PR5 — representation-aware Zone 2", () => {
  it("defaults to graph and renders the unchanged canvas + five-zone shell", async () => {
    renderControlCenter("graph");
    expect(await screen.findByTestId("graph-canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Graph operations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Temporal and case context" }),
    ).toBeInTheDocument();
  });

  it("renders an honest typed not-ready pane for a declared representation", async () => {
    renderControlCenter("pulse");
    expect(screen.queryByTestId("graph-canvas")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Entity Pulse is not yet available"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /This representation is declared in the workspace state seam but has no implementation yet/,
      ),
    ).toBeInTheDocument();
    // The surrounding five-zone shell is preserved.
    expect(
      screen.getByRole("complementary", { name: "Graph operations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Temporal and case context" }),
    ).toBeInTheDocument();
  });

  it("never renders a fake visualization for any declared non-graph view", async () => {
    for (const view of ["pulse", "matrix", "flow"] as const) {
      renderControlCenter(view);
      expect(await screen.findByText(/is not yet available/)).toBeInTheDocument();
      expect(screen.queryByTestId("graph-canvas")).not.toBeInTheDocument();
      cleanup();
    }
  });
});