import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { PulseRail } from "@/components/graph/control-center/pulse/pulse-rail";
import { buildEntityPulseOverview } from "@/lib/network/pulse/pulse-model";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations as observations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowContradictions as contradictions } from "@/lib/providers/demo/demo-fixtures/contradictions";
import { ENT_BANK } from "@/lib/providers/demo/demo-fixtures/lookup";

afterEach(() => {
  cleanup();
});

const ready = buildEntityPulseOverview({
  nodes: operationFinancialShadowGraph.nodes,
  observations,
  contradictions,
  timeRange: null,
});

const readyState: EntityPulseLoadState = {
  status: "ready",
  overview: ready,
  error: null,
};

const bankField = ready.entities.find((e) => e.entityId === ENT_BANK)!;

function renderRail(
  overrides: Partial<ComponentProps<typeof PulseRail>> = {},
) {
  return render(
    <PulseRail
      open
      onToggle={() => undefined}
      overview={readyState}
      context={null}
      onClearSelection={() => undefined}
      {...overrides}
    />,
  );
}

describe("F-PR16 — pulse rail detail drill (§16)", () => {
  it("shows only the overview until an entity is selected", () => {
    renderRail();
    expect(screen.getByTestId("pulse-rail-stats")).toBeInTheDocument();
    expect(screen.queryByTestId("pulse-rail-detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open in Graph/ })).toBeDisabled();
  });

  it("holds the selected entity's detail: activity, observations, relevance", () => {
    renderRail({
      context: { kind: "entity", id: ENT_BANK, source: "graph" },
    });
    const detail = screen.getByTestId("pulse-rail-detail");
    expect(detail).toHaveAttribute("data-pulse-rail-entity", ENT_BANK);
    expect(detail).toHaveTextContent(bankField.categoryLabel);
    expect(detail).toHaveTextContent(
      `${bankField.observationCount} in window · ${bankField.totalObservationCount} total`,
    );
    expect(detail).toHaveTextContent(/Analytical relevance/);
  });

  it("lists the entity's REAL key-event peaks as its own drill rows", () => {
    renderRail({
      context: { kind: "entity", id: ENT_BANK, source: "graph" },
    });
    expect(bankField.peaks.length).toBeGreaterThan(0);
    const rows = Array.from(
      document.querySelectorAll("[data-pulse-rail-peak]"),
    );
    expect(rows).toHaveLength(bankField.peaks.length);
    rows.forEach((row, index) => {
      expect(row.getAttribute("data-pulse-rail-peak-label")).toBe(
        bankField.peaks[index]!.label,
      );
      expect(row).toHaveTextContent(`×${bankField.peaks[index]!.observationCount}`);
    });
  });

  it("enables Open in Graph for the selected entity and clears selection", () => {
    const onOpenInGraph = vi.fn();
    const onClearSelection = vi.fn();
    renderRail({
      context: { kind: "entity", id: ENT_BANK, source: "graph" },
      onOpenInGraph,
      onClearSelection,
    });
    fireEvent.click(screen.getByRole("button", { name: /Open in Graph/ }));
    expect(onOpenInGraph).toHaveBeenCalledWith(ENT_BANK);

    fireEvent.click(screen.getByRole("button", { name: /Clear selection/ }));
    expect(onClearSelection).toHaveBeenCalled();
  });

  it("does not invent peaks for a calm selected entity", () => {
    const calm = buildEntityPulseOverview({
      nodes: operationFinancialShadowGraph.nodes,
      observations: [],
      timeRange: null,
    });
    const calmState: EntityPulseLoadState = {
      status: "ready",
      overview: calm,
      error: null,
    };
    render(
      <PulseRail
        open
        onToggle={() => undefined}
        overview={calmState}
        context={{ kind: "entity", id: ENT_BANK, source: "graph" }}
        onClearSelection={() => undefined}
      />,
    );
    // Detail still describes the entity; the Key-events section is absent.
    expect(screen.getByTestId("pulse-rail-detail")).toHaveTextContent(
      "0 in window",
    );
    expect(screen.queryByText(/Key events/)).not.toBeInTheDocument();
  });
});