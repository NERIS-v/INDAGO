import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceProvider } from "@/lib/providers/workspace/context";
import { ValidAtPanel } from "@/components/graph/control-center/temporal/valid-at-panel";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";

// PR-22 — VALID-AT projection panel through the real live provider seam. The
// panel calls LiveGraphProvider.getValidAt (→ GET /cases/:caseId/graph/valid-at)
// and renders the backend projection result with honest loading/error states.
// It never fabricates a projection and never falls back to current on failure.

const BASE = "https://api.test";
const CASE_ID = "11111111-1111-4111-8111-111111111111";
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr22:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = BASE;
  process.env.AUTH_TOKEN = "test-token";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_URL;
  delete process.env.AUTH_TOKEN;
});

function stubValidAt(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === `/api/v1/cases/${CASE_ID}/graph/valid-at`) {
        return jsonResponse(body, status);
      }
      return jsonResponse({ error: "not-mocked" }, 500);
    }),
  );
}

function renderPanel() {
  const providers = createLiveWorkspaceProviders(identity(), config);
  return render(
    <WorkspaceProvider providers={providers}>
      <ValidAtPanel />
    </WorkspaceProvider>,
  );
}

const projectedGraph = {
  caseId: CASE_ID,
  nodes: [
    { id: "n1", entityType: null, canonicalName: "A" },
    { id: "n2", entityType: null, canonicalName: "B" },
  ],
  edges: [],
  nodeCount: 2,
  edgeCount: 0,
  nodeLimit: 100,
  edgeLimit: 100,
  sourceNodeCount: 2,
  sourceEdgeCount: 0,
  truncated: { nodes: false, edges: false },
};

describe("PR-22 VALID-AT panel — live seam", () => {
  it("requests and renders the backend projection on submit", async () => {
    stubValidAt({
      caseId: CASE_ID,
      at: "2026-01-01T00:00:00.000Z",
      nodeCount: 2,
      edgeCount: 0,
      graph: projectedGraph,
    });
    renderPanel();

    const input = await screen.findByTestId("valid-at-input");
    fireEvent.change(input, { target: { value: "2026-01-01T00:00" } });
    fireEvent.click(screen.getByTestId("valid-at-request"));

    await waitFor(() => expect(screen.getByTestId("valid-at-summary")).toBeInTheDocument());
    expect(screen.getByText(/Backend projection/)).toBeInTheDocument();
    expect(screen.getByText(/2 nodes/)).toBeInTheDocument();
    expect(screen.getByText(/0 edges/)).toBeInTheDocument();
  });

  it("surfaces the typed error honestly and does NOT fabricate a projection", async () => {
    stubValidAt({ error: "at must be a valid ISO 8601 instant" }, 400);
    renderPanel();

    const input = await screen.findByTestId("valid-at-input");
    fireEvent.change(input, { target: { value: "2026-01-01T00:00" } });
    fireEvent.click(screen.getByTestId("valid-at-request"));

    await waitFor(() => expect(screen.getByTestId("valid-at-error")).toBeInTheDocument());
    expect(screen.getByTestId("valid-at-error").textContent).toContain("at must be a valid ISO 8601 instant");
    expect(screen.queryByTestId("valid-at-summary")).not.toBeInTheDocument();
  });

  it("renders an honest unavailable state when the seam exposes no getValidAt", async () => {
    // Demo provider has no getValidAt — a demo workspace renders the unavailable note.
    const { createWorkspaceDemoProviders } = await import("@/lib/providers/demo/providers");
    const providers = createWorkspaceDemoProviders(identity(), config);
    render(
      <WorkspaceProvider providers={providers}>
        <ValidAtPanel />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("valid-at-unavailable")).toBeInTheDocument());
    expect(screen.queryByTestId("valid-at-input")).not.toBeInTheDocument();
  });
});