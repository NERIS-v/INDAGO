import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";
import { useNetworkWorkspace } from "@/lib/network/use-network-workspace";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { CASE_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

// Mutable route lane so tests can simulate Next App Router navigation between
// sibling sub-routes of the SAME investigation workspace (/investigations/[id]/graph
// -> /investigations/[id]/evidence -> /investigations/[id]/graph). In the real
// app the [id] layout (which owns <WorkspaceBoundary>) persists across those
// navigations, so the NetworkWorkspaceProvider instance must NOT remount.
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

function TemporalProbe() {
  const ws = useNetworkWorkspace();
  const workspace = useWorkspace();
  return (
    <div>
      <span data-testid="workspace-id">{workspace.workspaceId}</span>
      <span data-testid="range">{ws.timeRange ? ws.timeRange.join(":") : "null"}</span>
      <span data-testid="view">{ws.activeNetworkView}</span>
      <button onClick={() => ws.setTimeRange([60, 880])}>set-range</button>
    </div>
  );
}

function workspaceUrl(searchParams: URLSearchParams) {
  lanes.searchParamsRef.current = searchParams;
}

const urlWith = (values: Record<string, string>): URLSearchParams => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) p.set(k, v);
  return p;
};

const PREV_ENV = {
  [DATA_MODE_ENV]: process.env.NEXT_PUBLIC_DATA_MODE,
  [DEMO_CASE_ID_ENV]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
};

beforeEach(() => {
  // The boundary resolves the bundle from the environment: demo mode for the
  // configured demo case keeps the test self-contained and deterministic.
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = CASE_ID;
  lanes.pathnameRef.current = "/investigations/i-1/graph";
  lanes.searchParamsRef.current = new URLSearchParams();
  lanes.paramsRef.current = { id: "i-1" };
});

afterEach(() => {
  cleanup();
  process.env.NEXT_PUBLIC_DATA_MODE = PREV_ENV[DATA_MODE_ENV];
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = PREV_ENV[DEMO_CASE_ID_ENV];
});

describe("F-PR5 — shared temporal state survives workspace sub-route navigation", () => {
  it("keeps timeRange and the workspace bundle across Graph -> another surface -> Graph", async () => {
    workspaceUrl(urlWith({ caseId: CASE_ID }));
    const { rerender } = render(
      <WorkspaceBoundary>
        <TemporalProbe />
      </WorkspaceBoundary>,
    );

    const range = await screen.findByTestId("range");
    expect(range.textContent).toBe("null");
    expect(screen.getByTestId("view").textContent).toBe("graph");
    const workspaceId = screen.getByTestId("workspace-id").textContent;

    // The analyst sets a shared two-handle temporal window on the graph.
    act(() => {
      screen.getByRole("button", { name: "set-range" }).click();
    });
    expect(screen.getByTestId("range").textContent).toBe("60:880");

    // Navigate to a sibling workspace surface (e.g. Observations). The [id]
    // layout persists in Next, so the shared provider instance must survive.
    lanes.pathnameRef.current = "/investigations/i-1/observations";
    workspaceUrl(urlWith({ caseId: CASE_ID }));
    rerender(
      <WorkspaceBoundary>
        <TemporalProbe />
      </WorkspaceBoundary>,
    );

    // The temporal scope is workspace-wide: it did NOT reset.
    expect(screen.getByTestId("range").textContent).toBe("60:880");
    expect(screen.getByTestId("view").textContent).toBe("graph");
    expect(screen.getByTestId("workspace-id").textContent).toBe(workspaceId);

    // Navigate back to Graph, this time carrying a URL view selection. URL->state
    // still applies while the shared temporal state is preserved untouched.
    lanes.pathnameRef.current = "/investigations/i-1/graph";
    workspaceUrl(urlWith({ caseId: CASE_ID, view: "pulse" }));
    rerender(
      <WorkspaceBoundary>
        <TemporalProbe />
      </WorkspaceBoundary>,
    );

    expect(screen.getByTestId("view").textContent).toBe("pulse");
    expect(screen.getByTestId("range").textContent).toBe("60:880");
    expect(screen.getByTestId("workspace-id").textContent).toBe(workspaceId);
  });
});