import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { TemporalActivityFeed } from "@/components/graph/control-center/temporal/activity-feed";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import { CASE_ID, INVESTIGATION_ID, GRAPH_VERSION_V1 } from "@/lib/providers/demo/demo-fixtures/lookup";
import {
  CURRENT_VERSION_SELECTION,
  type TemporalVersionSelection,
} from "@/lib/context/temporal-workspace";

// PR-7 — ACTIVITY tab through the existing realtime seam. The demo provider
// pre-loads its memory bank on connect and replays it on subscribe, so events
// surface deterministically (fast timing scale).

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr7:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function renderFeed(selection: TemporalVersionSelection = CURRENT_VERSION_SELECTION) {
  const providers = createWorkspaceDemoProviders(identity(), config);
  const utils = render(
    <WorkspaceProvider providers={providers}>
      <TemporalActivityFeed selection={selection} />
    </WorkspaceProvider>,
  );
  return utils;
}

afterEach(() => {
  cleanup();
});

describe("PR-7 ACTIVITY feed — demo seam", () => {
  it("streams case activity through the realtime seam", async () => {
    const { container } = renderFeed();
    await waitFor(() => {
      expect(container.querySelectorAll("[data-activity-event]").length).toBeGreaterThan(0);
    });
    await waitFor(() =>
      expect(screen.getByText(/connected · \d+ events/)).toBeInTheDocument(),
    );
  });

  it("de-duplicates the memory-bank replay so no event key renders twice", async () => {
    const { container } = renderFeed();
    await waitFor(() => {
      expect(container.querySelectorAll("[data-activity-event]").length).toBeGreaterThan(0);
    });
    const keys = [...container.querySelectorAll("[data-activity-event-key]")].map((el) =>
      el.getAttribute("data-activity-event-key"),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows the record-only banner while a historical version is selected", () => {
    const historical: TemporalVersionSelection = { mode: "historical", versionId: GRAPH_VERSION_V1 };
    renderFeed(historical);
    expect(screen.getByText(/Record-only/)).toBeInTheDocument();
    expect(screen.getByText(/never mutate/)).toBeInTheDocument();
  });
});