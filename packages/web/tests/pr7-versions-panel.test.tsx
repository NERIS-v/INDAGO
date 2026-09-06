import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { TemporalVersionsPanel } from "@/components/graph/control-center/temporal/versions-panel";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
  GRAPH_VERSION_V1,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  CURRENT_VERSION_SELECTION,
  type TemporalVersionSelection,
} from "@/lib/context/temporal-workspace";

// PR-7 — VERSIONS tab through the real provider seams: the demo surfaces the
// deterministic version series; the live seam reports an honest unsupported
// state (no fabricated history, no fake /as-of, no current-graph fallback).

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

const historicalSelection: TemporalVersionSelection = {
  mode: "historical",
  versionId: GRAPH_VERSION_V1,
};

function identity(workspaceId = `pr7:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderPanelSelection(selection: TemporalVersionSelection) {
  const providers = createWorkspaceDemoProviders(identity(), config);
  const onSelectVersion = vi.fn();
  const onReturnCurrent = vi.fn();
  const utils = render(
    <WorkspaceProvider providers={providers}>
      <TemporalVersionsPanel
        selection={selection}
        onSelectVersion={onSelectVersion}
        onReturnCurrent={onReturnCurrent}
      />
    </WorkspaceProvider>,
  );
  return { ...utils, onSelectVersion, onReturnCurrent };
}

afterEach(() => {
  cleanup();
});

describe("PR-7 VERSIONS panel — demo seam", () => {
  it("lists the deterministic version series ascending", async () => {
    renderPanelSelection(CURRENT_VERSION_SELECTION);
    const rows = await screen.findAllByRole("button", { name: /^view-version-/ });
    expect(rows).toHaveLength(3);
    expect(await screen.findByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("Version 3")).toBeInTheDocument();
  });

  it("marks the ACTIVE v3 as current and shows history statuses", async () => {
    renderPanelSelection(CURRENT_VERSION_SELECTION);
    const v3Row = await screen.findByRole("button", { name: "view-version-3" });
    expect(within(v3Row).getByText("Current")).toBeInTheDocument();
    expect(within(v3Row).getByText("ACTIVE")).toBeInTheDocument();

    const v1Row = screen.getByRole("button", { name: "view-version-1" });
    expect(within(v1Row).queryByText("Current")).not.toBeInTheDocument();
    expect(within(v1Row).getByText("SUPERSEDED")).toBeInTheDocument();
  });

  it("summarizes the current projection meta", async () => {
    renderPanelSelection(CURRENT_VERSION_SELECTION);
    const summary = await screen.findByText("Graph version 3");
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/6 nodes · 6 edges/)).toBeInTheDocument();
    expect(screen.getAllByText("Current").length).toBeGreaterThanOrEqual(2);
  });

  it("dispatches select when a historical version is chosen", async () => {
    const { onSelectVersion } = renderPanelSelection(CURRENT_VERSION_SELECTION);
    const row = await screen.findByRole("button", { name: "view-version-1" });
    fireEvent.click(row);
    expect(onSelectVersion).toHaveBeenCalledWith(GRAPH_VERSION_V1);
  });
});

describe("PR-7 VERSIONS panel — historical selection", () => {
  it("renders the locked historical view with an honest replay note", async () => {
    renderPanelSelection(historicalSelection);
    expect(await screen.findByText("Graph version 1")).toBeInTheDocument();
    expect(screen.getByText("Historical")).toBeInTheDocument();
    expect(screen.getByText(/not reachable on this provider seam/)).toBeInTheDocument();
    expect(screen.getByText(/never mutate/)).toBeInTheDocument();
    expect(screen.getByText("Return to current")).toBeInTheDocument();
  });

  it("dispatches return-to-current from the historical view", async () => {
    const { onReturnCurrent } = renderPanelSelection(historicalSelection);
    const button = await screen.findByText("Return to current");
    fireEvent.click(button);
    expect(onReturnCurrent).toHaveBeenCalled();
  });
});

describe("PR-7 VERSIONS panel — live seam honesty", () => {
  it("reports an unsupported historical surface without fabricating a list", async () => {
    const liveConfig: DataModeConfig = getDataModeConfig({ [DATA_MODE_ENV]: "live" });
    const providers = createLiveWorkspaceProviders(identity("pr7-live"), liveConfig);
    render(
      <WorkspaceProvider providers={providers}>
        <TemporalVersionsPanel
          selection={CURRENT_VERSION_SELECTION}
          onSelectVersion={vi.fn()}
          onReturnCurrent={vi.fn()}
        />
      </WorkspaceProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/not available on this provider seam/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^view-version-/ })).toBeNull();
  });
});