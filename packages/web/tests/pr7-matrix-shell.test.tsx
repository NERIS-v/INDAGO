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

function identity(workspaceId = `pr7:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function epochMs(iso: string): number {
  return new Date(iso).getTime();
}

const jan2024: [number, number] = [
  epochMs("2024-01-01T00:00:00.000Z"),
  epochMs("2024-01-31T23:59:59.999Z"),
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

/**
 * Drive the mode into within-case and settle there. Within-case ignores the
 * cross-case boundary/overlays pipeline entirely, so once the mode commit
 * renders (grid cells present, no boundary select) the grid is deterministic —
 * the column set cannot be swapped out by a later overlays refetch.
 */
async function switchToWithinCase() {
  await waitFor(() => {
    fireEvent.click(screen.getByTestId("matrix-mode-within-case"));
    expect(screen.getByTestId("matrix-mode-within-case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  await waitFor(() =>
    expect(screen.queryByTestId("matrix-boundary-select")).not.toBeInTheDocument(),
  );
  await screen.findAllByRole("gridcell");
}

/**
 * SELECT a real matrix cell and wait until the context pane actually binds it.
 * The grid can be unmounted for a frame while the matrix refetches, and a click
 * on a detached cell never reaches the handler, so drive the click by retrying
 * until the pane's cell id stops being empty. Rotate the picked cell between
 * attempts so a re-click never toggles the previous selection off.
 */
async function selectMatrixCell(): Promise<{ rowId: string; colId: string }> {
  let attempt = 0;
  let pair: { rowId: string; colId: string } | null = null;
  await waitFor(
    () => {
      const cells = screen
        .getAllByRole("gridcell")
        .filter((cell) => !cell.hasAttribute("data-matrix-self"));
      if (cells.length === 0) {
        throw new Error("matrix grid not settled yet");
      }
      const signalCells = cells.filter(
        (cell) => (cell.getAttribute("data-matrix-state") ?? "empty") !== "empty",
      );
      const pool = signalCells.length > 0 ? signalCells : cells;
      const cell = pool[attempt % pool.length];
      attempt += 1;
      fireEvent.click(cell);
      const context = screen.getByRole("complementary", {
        name: "Matrix context",
      });
      const rowId = cell.getAttribute("data-matrix-row-id") ?? "";
      const colId = cell.getAttribute("data-matrix-col-id") ?? "";
      expect(context).toHaveAttribute(
        "data-matrix-context-cell",
        `${rowId}::${colId}`,
      );
      pair = { rowId, colId };
    },
    { timeout: 5000 },
  );
  return pair!;
}

describe("F-PR7 — the five-zone shell serves the Relationship Matrix", () => {
  it("renders the Matrix representation in Zone 2 by default (cross-case) with the railed shell", async () => {
    renderControlCenter("matrix");
    expect(screen.queryByTestId("graph-canvas")).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("matrix-grid", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    const rail = screen.getByRole("complementary", { name: "Matrix operations" });
    expect(rail).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Temporal and case context" })).toBeInTheDocument();
    // The matrix defaults to cross-case with no graph artefacts leaking in.
    // The matrix pipeline refetches (boundary auto-follow + foreign overlays)
    // and briefly unmounts the ready rail between frames, so poll with fresh
    // queries each attempt.
    await waitFor(() =>
      expect(screen.getByTestId("matrix-mode-cross-case")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("matrix-boundary-select")).toBeInTheDocument(),
    );
  });

  it("a cell SELECT opens the Matrix context pane (SELECT ≠ FOCUS) with a bounded evidence deep-link", async () => {
    renderControlCenter("matrix");
    // SELECT is exercised in within-case mode: the cross-case boundary/overlays
    // pipeline can swap grid column sets between refetches, while within-case
    // resolves a deterministic Case-A × Case-A grid once it settles.
    await switchToWithinCase();
    const { rowId } = await selectMatrixCell();

    await waitFor(() => {
      const evidence = screen.getByTestId("matrix-ctx-view-evidence");
      expect(evidence).toHaveAttribute(
        "href",
        expect.stringContaining(`/investigations/${INVESTIGATION_ID}/observations`),
      );
      expect(evidence).toHaveAttribute(
        "href",
        expect.stringContaining(`caseId=${CASE_ID}`),
      );
      expect(evidence).toHaveAttribute(
        "href",
        expect.stringContaining(`entity=${encodeURIComponent(rowId)}`),
      );
    });
  });

  it("Open in Graph hands the selected row entity to the graph representation", async () => {
    const onNetworkViewChange = vi.fn();
    renderControlCenter("matrix", onNetworkViewChange);
    await switchToWithinCase();
    await selectMatrixCell();

    // The context actions branch unmounts while the matrix refetches, so
    // retry the click until the graph transition actually fires.
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("matrix-ctx-open-in-graph"));
      expect(onNetworkViewChange).toHaveBeenCalledWith("graph");
    });
  });

  it("the rail auth flow runs idle → confirming → authorized and then reveals the candidates", async () => {
    renderControlCenter("matrix");

    // Cross-case default resolves the first comparison boundary and asks for
    // authorization before any provider-backed candidate is revealed. The rail
    // ready branch briefly unmounts during refetches, so drive each step by
    // retrying until the next state actually renders.
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("matrix-auth-begin"));
      expect(screen.getByTestId("matrix-auth-confirm")).toBeInTheDocument();
      expect(screen.getByTestId("matrix-auth-cancel")).toBeInTheDocument();
    });

    await waitFor(() => {
      fireEvent.click(screen.getByTestId("matrix-auth-confirm"));
      expect(screen.getByTestId("matrix-auth-authorized")).toBeInTheDocument();
    });

    // Once authorized the honest "hidden candidates" count leaves the rail.
    await waitFor(() =>
      expect(screen.queryByText("Hidden candidates")).not.toBeInTheDocument(),
    );
  });

  it("the mode toggle switches cross-case ↔ within-case without losing the shell", async () => {
    renderControlCenter("matrix");
    // Settle onto the boundary-resolved matrix (grid cells only exist once the
    // boundary auto-follow refetch has landed), then assert the cross-case rail.
    await screen.findAllByRole("gridcell");
    await waitFor(() =>
      expect(screen.getByTestId("matrix-mode-cross-case")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("matrix-boundary-select")).toBeInTheDocument(),
    );

    // Switching the mode re-fetches the matrix; the rail ready branch briefly
    // unmounts, so re-resolve the toggles once the refetch settles.
    fireEvent.click(screen.getByTestId("matrix-mode-within-case"));
    await waitFor(
      () =>
        expect(screen.getByTestId("matrix-mode-within-case")).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
      { timeout: 5000 },
    );
    await waitFor(() => {
      expect(screen.getByTestId("matrix-mode-cross-case")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByTestId("matrix-mode-within-case")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    await waitFor(() =>
      expect(screen.queryByTestId("matrix-boundary-select")).not.toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(screen.getByTestId("matrix-grid")).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Temporal and case context" }),
      ).toBeInTheDocument();
    });
  });

  it("the matrix temporal note narrates the SHARED timeRange (zone 4)", async () => {
    renderControlCenter("matrix", undefined, jan2024);
    // Re-query the note each poll — it keeps its testid while loading but can
    // briefly remount while the matrix refetches.
    await waitFor(
      () =>
        expect(screen.getByTestId("matrix-temporal-note")).toHaveTextContent(
          /1 of 9 observations in scope/,
        ),
      { timeout: 5000 },
    );
  });
});