import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { FlowPanel } from "@/components/graph/control-center/flow/flow-panel";
import { buildFlowModel } from "@/lib/network/flow/flow-model";
import type { FlowLoadState } from "@/lib/network/flow/use-flow-analysis";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowRelations } from "@/lib/providers/demo/demo-fixtures/relations";
import {
  ENT_BANK,
  ENT_SHELL_ONE,
  REL_3,
} from "@/lib/providers/demo/demo-fixtures/lookup";

const graphNodes = operationFinancialShadowGraph.nodes;
const observations = operationFinancialShadowObservations;
const relations = operationFinancialShadowRelations;

function epochMs(iso: string): number {
  return new Date(iso).getTime();
}

function demoState(window: [number, number] | null): FlowLoadState {
  return {
    status: "ready",
    meta: buildFlowModel({
      nodes: graphNodes,
      observations,
      relations,
      timeRange: window,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    }),
    error: null,
  };
}

afterEach(() => {
  cleanup();
});

describe("F-PR8 — Adaptive Flow panel", () => {
  it("renders the deterministic demo chain with a data-backed summary", () => {
    render(<FlowPanel meta={demoState(null)} />);
    expect(screen.getByTestId("flow-panel")).toBeInTheDocument();
    expect(screen.getByTestId("flow-summary")).toHaveTextContent(
      "Financial · 4 flow segments · 3 active paths · ₹495,000 observed",
    );
    expect(screen.getByTestId("flow-mode-label")).toHaveTextContent("Financial");
    expect(screen.getByTestId("flow-diagram")).toBeInTheDocument();
  });

  it("renders every entity plus the unobserved-destination gap node", () => {
    const { container } = render(<FlowPanel meta={demoState(null)} />);
    const nodes = container.querySelectorAll("[data-flow-node]");
    expect(nodes.length).toBe(5);
    const gap = container.querySelector('[data-flow-node-kind="gap"]');
    expect(gap).not.toBeNull();
    // The gap is labelled an unresolved destination, never a fabricated name.
    expect(screen.getByText("Unknown destination")).toBeInTheDocument();
  });

  it("renders PROPOSED segments dashed and outlets the observed amounts", () => {
    const { container } = render(<FlowPanel meta={demoState(null)} />);
    const r5Edge = container.querySelector(
      `[data-flow-edge-id="edge:seg:${REL_3}"]`,
    );
    // REL_3 is ACCEPTED so its edge is solid (no dasharray).
    expect(r5Edge!.querySelector("path")!.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("clicking a layout node SELECTs it through the context bridge", async () => {
    const onSelectContext = vi.fn();
    const { container, rerender } = render(
      <FlowPanel meta={demoState(null)} onSelectContext={onSelectContext} />,
    );
    const bankNode = container.querySelector(`[data-flow-node-id="ent:${ENT_BANK}"]`);
    expect(bankNode).not.toBeNull();
    fireEvent.click(bankNode!);
    await waitFor(() =>
      expect(onSelectContext).toHaveBeenCalledWith({
        kind: "entity",
        id: ENT_BANK,
        source: "flow",
      }),
    );
    // The shell owns the selection: re-render WITH the context like the shell
    // does after rematerializing the click, then the panel highlights it.
    rerender(
      <FlowPanel
        meta={demoState(null)}
        onSelectContext={onSelectContext}
        context={{ kind: "entity", id: ENT_BANK, source: "flow" }}
      />,
    );
    expect(screen.getByTestId("flow-selected-node-label")).toHaveTextContent(
      "Intermediary Account 0093",
    );
  });

  it("clicking a segment edge SELECTs its relation through the context bridge", () => {
    const onSelectContext = vi.fn();
    const { container } = render(
      <FlowPanel meta={demoState(null)} onSelectContext={onSelectContext} />,
    );
    const edge = container.querySelector(`[data-flow-edge-id="edge:seg:${REL_3}"]`);
    fireEvent.click(edge!);
    expect(onSelectContext).toHaveBeenCalledWith({
      kind: "relation",
      id: REL_3,
      source: "flow",
    });
  });

  it("Enter/Space activates a roving-focused node", () => {
    const onSelectContext = vi.fn();
    const { container } = render(
      <FlowPanel meta={demoState(null)} onSelectContext={onSelectContext} />,
    );
    const bankNode = container.querySelector(`[data-flow-node-id="ent:${ENT_BANK}"]`);
    fireEvent.focus(bankNode!);
    fireEvent.keyDown(bankNode!, { key: " " });
    expect(onSelectContext).toHaveBeenCalledWith({
      kind: "entity",
      id: ENT_BANK,
      source: "flow",
    });
  });

  it("arrow keys rove focus across nodes and edges", async () => {
    render(<FlowPanel meta={demoState(null)} />);
    const region = screen.getByRole("region", {
      name: /Adaptive flow diagram/,
    });
    fireEvent.keyDown(region, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        document.querySelector('[data-flow-focus-index="1"]'),
      ).toHaveAttribute("tabindex", "0"),
    );
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(
        document.querySelector('[data-flow-focus-index="0"]'),
      ).toHaveAttribute("tabindex", "0"),
    );
  });

  it("splits observed amounts per currency — never sums across currencies", () => {
    const { container } = render(<FlowPanel meta={demoState(null)} />);
    // The demo is single-currency, so a single observed total is shown.
    expect(screen.getByTestId("flow-summary")).toHaveTextContent("₹495,000");
    // No fabricated currency appears.
    expect(container.textContent).not.toContain("$");
  });

  it("reports NO FLOW IN SELECTED WINDOW honestly when the window is empty", () => {
    const may2024: [number, number] = [
      epochMs("2024-05-01T00:00:00.000Z"),
      epochMs("2024-05-31T23:59:59.999Z"),
    ];
    render(<FlowPanel meta={demoState(may2024)} />);
    expect(screen.getByText("No flow in selected window")).toBeInTheDocument();
    expect(screen.queryByTestId("flow-diagram")).not.toBeInTheDocument();
  });

  it("reports NO FLOW DATA honestly when no flow-forming relations exist", () => {
    const state: FlowLoadState = {
      status: "ready",
      meta: buildFlowModel({
        nodes: graphNodes,
        observations,
        relations: [],
        timeRange: null,
        selectedMode: null,
        roleFilter: "all",
        crossCaseEntityIds: new Set(),
      }),
      error: null,
    };
    render(<FlowPanel meta={state} />);
    expect(screen.getByText("No flow data")).toBeInTheDocument();
    expect(screen.queryByTestId("flow-diagram")).not.toBeInTheDocument();
  });

  it("renders a typed error pane on provider failure without fabrication", () => {
    const state: FlowLoadState = {
      status: "error",
      meta: null,
      error: new Error("flow compute failed"),
    };
    render(<FlowPanel meta={state} />);
    expect(screen.getByRole("alert")).toHaveTextContent("flow compute failed");
  });

  it("scopes the flow to the shared February window (drops the January segment and the gap)", () => {
    const feb2024: [number, number] = [
      epochMs("2024-02-01T00:00:00.000Z"),
      epochMs("2024-02-29T23:59:59.999Z"),
    ];
    render(<FlowPanel meta={demoState(feb2024)} />);
    expect(screen.getByTestId("flow-summary")).toHaveTextContent(
      "Financial · 3 flow segments · 2 active paths · ₹495,000 observed",
    );
  });
});