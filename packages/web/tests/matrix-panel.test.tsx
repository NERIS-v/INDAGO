import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MatrixPanel } from "@/components/graph/control-center/matrix/matrix-panel";
import {
  buildMatrix,
  matrixCellCounts,
  matrixContextForCell,
} from "@/lib/network/matrix/matrix-model";
import type { MatrixLoadState } from "@/lib/network/matrix/use-matrix";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations as observations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowRelations as relations } from "@/lib/providers/demo/demo-fixtures/relations";
import { operationFinancialShadowContradictions as contradictions } from "@/lib/providers/demo/demo-fixtures/contradictions";
import { operationFinancialShadowCrossCase as matches, MOCK_FOREIGN_CASES } from "@/lib/providers/demo/demo-fixtures/cross-case";
import {
  CASE_ID,
  INVESTIGATION_ID,
  CROSS_CASE_ID,
  CROSS_ENTITY_ID,
  ENT_VICTOR,
  ENT_SHELL_ONE,
  ENT_BANK,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import type { ForeignCaseOverlay } from "@/lib/providers/types";

afterEach(() => {
  cleanup();
});

const overlays: ForeignCaseOverlay[] = Object.values(MOCK_FOREIGN_CASES).map(
  (mock) => ({
    ref: mock.id,
    caseId: mock.id,
    title: mock.title,
    summary: mock.summary,
    localTargetMatch: mock.localTargetMatch,
    bridgeSupport: mock.bridgeSupport,
    nodes: mock.nodes,
    edges: mock.edges,
  }),
);

const withinCase = buildMatrix({
  nodes: operationFinancialShadowGraph.nodes,
  observations,
  relations,
  contradictions,
  candidates: [],
  matches,
  overlays,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  timeRange: null,
  mode: "within-case",
  boundaryCaseId: null,
  authorizedBoundaries: [],
});

const readyState: MatrixLoadState = {
  status: "ready",
  meta: withinCase,
  boundaryOptions: [],
  error: null,
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof MatrixPanel>> = {},
) {
  return render(
    <MatrixPanel
      meta={readyState}
      mode="within-case"
      context={null}
      {...overrides}
    />,
  );
}

const victorShellOneContext = matrixContextForCell(
  "within-case",
  ENT_VICTOR,
  ENT_SHELL_ONE,
);

describe("F-PR7 — relationship matrix panel (Zone 2)", () => {
  it("renders the symmetric grid, summary, and the active-cell inventory", () => {
    renderPanel();
    expect(screen.getByTestId("matrix-grid")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-summary")).toHaveTextContent(
      "Relationship matrix",
    );
    // 1 corner header + 5 entity columns.
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.getAllByRole("rowheader")).toHaveLength(5);
    // 5 self cells are inert; every other cell is a focusable button.
    const cells = document.querySelectorAll("[data-matrix-cell]");
    expect(cells).toHaveLength(25);
    expect(document.querySelectorAll('[data-matrix-self="true"]')).toHaveLength(5);
    expect(screen.getAllByRole("gridcell")).toHaveLength(25);

    const counts = matrixCellCounts(withinCase);
    expect(counts.active).toBe(14);
    expect(
      document.querySelectorAll('[data-matrix-state="candidate"]'),
    ).toHaveLength(counts.candidate);
    expect(
      document.querySelectorAll('[data-matrix-state="conflict"]'),
    ).toHaveLength(counts.conflict);
    expect(
      document.querySelectorAll('[data-matrix-state="multi-signal"]'),
    ).toHaveLength(counts.multiSignal);
    expect(
      document.querySelector('[data-matrix-state="conflict"]'),
    ).toHaveAttribute("data-matrix-cell-index", `${ENT_VICTOR}::${ENT_SHELL_ONE}`);
  });

  it("SELECTs a cell through the shell context bridge (never FOCUSes)", () => {
    const onSelectContext = vi.fn();
    renderPanel({ onSelectContext });
    fireEvent.click(
      document.querySelector(
        `[data-matrix-cell-index="${ENT_VICTOR}::${ENT_SHELL_ONE}"]`,
      )!,
    );
    expect(onSelectContext).toHaveBeenCalledWith(victorShellOneContext);
  });

  it("reflects a selection from the shell with aria-pressed and the window row", () => {
    renderPanel({ context: victorShellOneContext, onOpenInGraph: vi.fn() });
    const cell = document.querySelector(
      `[data-matrix-cell-index="${ENT_VICTOR}::${ENT_SHELL_ONE}"]`,
    )!;
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("matrix-panel-actions")).toHaveTextContent(
      /Selected cell window/,
    );
  });

  it("keeps the actions row hidden until a non-empty cell is selected", () => {
    renderPanel();
    expect(screen.queryByTestId("matrix-panel-actions")).toHaveTextContent("");
    renderPanel({ context: null });
    expect(screen.queryByText(/Selected cell window/)).not.toBeInTheDocument();
  });

  it("delegates Open in Graph and Open in Pulse with the row entity", () => {
    const onOpenInGraph = vi.fn();
    const onOpenPulse = vi.fn();
    renderPanel({ context: victorShellOneContext, onOpenInGraph, onOpenPulse });
    fireEvent.click(screen.getByTestId("matrix-open-in-graph"));
    expect(onOpenInGraph).toHaveBeenCalledWith(ENT_VICTOR);
    fireEvent.click(screen.getByTestId("matrix-open-in-pulse"));
    expect(onOpenPulse).toHaveBeenCalledWith(ENT_VICTOR);
  });

  it("roves keyboard focus with arrow keys over provider cells", () => {
    renderPanel();
    const grid = screen.getByTestId("matrix-grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    // Base [0,0] (Bank × Bank is self-centric) → row 1 / col 0 = Victor × Bank.
    expect(document.activeElement).toHaveAttribute(
      "data-matrix-cell-index",
      `${ENT_VICTOR}::${ENT_BANK}`,
    );
  });

  it("gates the authorization card to un-authorized cross-case boundaries", () => {
    const crossCase = buildMatrix({
      nodes: operationFinancialShadowGraph.nodes,
      observations,
      relations,
      contradictions,
      candidates: [],
      matches,
      overlays,
      caseId: CASE_ID,
      investigationId: INVESTIGATION_ID,
      timeRange: null,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [],
    });
    const onRequestAuthorization = vi.fn();
    renderPanel({
      meta: { ...readyState, meta: crossCase },
      mode: "cross-case",
      onRequestAuthorization,
    });
    expect(screen.getByTestId("matrix-auth-card")).toHaveTextContent(
      /holds 1 provider-backed comparison candidate/,
    );
    fireEvent.click(screen.getByTestId("matrix-request-auth"));
    expect(onRequestAuthorization).toHaveBeenCalledWith(CROSS_CASE_ID);
  });

  it("never surfaces the auth card once the boundary is authorized", () => {
    const crossCase = buildMatrix({
      nodes: operationFinancialShadowGraph.nodes,
      observations,
      relations,
      contradictions,
      candidates: [],
      matches,
      overlays,
      caseId: CASE_ID,
      investigationId: INVESTIGATION_ID,
      timeRange: null,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [CROSS_CASE_ID],
    });
    renderPanel({
      meta: { ...readyState, meta: crossCase },
      mode: "cross-case",
    });
    expect(screen.queryByTestId("matrix-auth-card")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-matrix-state="multi-signal"]'),
    ).toHaveAttribute(
      "data-matrix-cell-index",
      `${ENT_VICTOR}::${CROSS_ENTITY_ID}`,
    );
  });

  it("shows loading and error states honestly", () => {
    render(
      <MatrixPanel
        meta={{ status: "loading", meta: null, boundaryOptions: [], error: null }}
        mode="within-case"
      />,
    );
    expect(
      screen.getByText("Building the relationship matrix..."),
    ).toBeInTheDocument();
    cleanup();
    render(
      <MatrixPanel
        meta={{
          status: "error",
          meta: null,
          boundaryOptions: [],
          error: new Error("provider failed"),
        }}
        mode="within-case"
      />,
    );
    expect(screen.getByText("provider failed")).toBeInTheDocument();
  });
});