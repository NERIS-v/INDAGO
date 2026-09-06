import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { PulsePanel } from "@/components/graph/control-center/pulse/pulse-panel";
import { buildEntityPulseOverview } from "@/lib/network/pulse/pulse-model";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations as observations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowContradictions as contradictions } from "@/lib/providers/demo/demo-fixtures/contradictions";
import {
  ENT_BANK,
  ENT_VICTOR,
} from "@/lib/providers/demo/demo-fixtures/lookup";

afterEach(() => {
  cleanup();
});

const nodes = operationFinancialShadowGraph.nodes;
const ready = buildEntityPulseOverview({
  nodes,
  observations,
  contradictions,
  timeRange: null,
});

const readyState: EntityPulseLoadState = {
  status: "ready",
  overview: ready,
  error: null,
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof PulsePanel>> = {},
) {
  return render(
    <PulsePanel overview={readyState} context={null} {...overrides} />,
  );
}

describe("F-PR6 — multi-entity pulse panel", () => {
  it("renders every placed entity as its own identifiable card", () => {
    renderPanel();
    const cards = screen.getAllByTestId("pulse-entity-card");
    expect(cards).toHaveLength(5);
    // Representative order: structuralImportance desc — the bank leads.
    expect(cards[0]!.parentElement).toHaveAttribute(
      "data-pulse-card-entity",
      ENT_BANK,
    );

    // Every glyph is a distinct, documented pulse with its own data hooks.
    const glyphs = document.querySelectorAll("[data-pulse-entity]");
    expect(glyphs).toHaveLength(5);
    const glyph = document.querySelector("[data-pulse-entity]")!;
    expect(glyph.getAttribute("data-pulse-sample-count")).toBe("96");
    expect(glyph.getAttribute("data-pulse-entity-category")).toBe("financial");
  });

  it("selects an entity through the shell context bridge (SELECT)", () => {
    const onSelectContext = vi.fn();
    renderPanel({ onSelectContext });
    fireEvent.click(
      screen.getByRole("button", { name: /Intermediary Account 0093/ }),
    );
    expect(onSelectContext).toHaveBeenCalledWith({
      kind: "entity",
      id: ENT_BANK,
      source: "graph",
    });
  });

  it("keeps SELECT distinct from FOCUS: selection shows a highlight, never the camera", () => {
    renderPanel({
      context: { kind: "entity", id: ENT_BANK, source: "graph" },
    });
    const cards = screen.getAllByTestId("pulse-entity-card");
    const bank = cards.find(
      (card) => card.parentElement?.getAttribute("data-pulse-card-entity") === ENT_BANK,
    )!;
    const victor = cards.find(
      (card) => card.parentElement?.getAttribute("data-pulse-card-entity") === ENT_VICTOR,
    )!;
    expect(bank).toHaveAttribute("aria-pressed", "true");
    expect(victor).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the durable focus entity prominent and delegates Open in Graph", () => {
    const onOpenInGraph = vi.fn();
    renderPanel({ focusEntityId: ENT_BANK, onOpenInGraph });
    const prominent = screen
      .getAllByTestId("pulse-entity-card")
      .find(
        (card) =>
          card.parentElement?.getAttribute("data-pulse-card-prominent") === "true",
      )!;
    expect(prominent.parentElement).toHaveAttribute(
      "data-pulse-card-entity",
      ENT_BANK,
    );

    fireEvent.click(screen.getByTestId("pulse-open-in-graph"));
    expect(onOpenInGraph).toHaveBeenCalledWith(ENT_BANK);
  });

  it("does not surface Open in Graph when the graph seam is unwired", () => {
    renderPanel({ focusEntityId: ENT_BANK });
    expect(screen.queryByTestId("pulse-open-in-graph")).not.toBeInTheDocument();
  });

  it("shows loading and error states honestly without a fake field", () => {
    render(
      <PulsePanel
        overview={{ status: "loading", overview: null, error: null }}
      />,
    );
    expect(
      screen.getByText("Building the entity pulse..."),
    ).toBeInTheDocument();
    cleanup();
    render(
      <PulsePanel
        overview={{
          status: "error",
          overview: null,
          error: new Error("provider failed"),
        }}
      />,
    );
    expect(screen.getByText("provider failed")).toBeInTheDocument();
  });

  it("publishes a textual equivalent of the field (a11y, color not a sole channel)", () => {
    renderPanel();
    const live = screen.getByTestId("pulse-overview");
    expect(live).toHaveTextContent(/Entity Pulse/);
    expect(live).toHaveTextContent(/Intermediary Account 0093/);

    const glyph = document.querySelector("[data-pulse-entity]")!;
    expect(glyph.getAttribute("role")).toBe("img");
    expect(glyph.getAttribute("aria-label")).toContain("observations in window");
    expect(glyph.getAttribute("aria-label")).toContain("analytical relevance");
  });

  it("renders sparse case markers from the provider registry", () => {
    renderPanel();
    expect(screen.getByTestId("pulse-markers")).toBeInTheDocument();
    expect(document.querySelector('[data-pulse-marker="contradiction"]')).toBeTruthy();
  });
});

describe("F-PR16 — circular pulse redesign: peaks, empty states, selection", () => {
  it("marks activity peaks on glyphs with real day-cluster labels", () => {
    renderPanel();
    const glyph = document.querySelector('[data-pulse-entity="' + ENT_BANK + '"]')!;
    expect(glyph.getAttribute("data-pulse-peaks-count")).not.toBe("0");
    const ticks = document.querySelectorAll(
      '[data-pulse-entity="' + ENT_BANK + '"] [data-pulse-peak]',
    );
    expect(ticks.length).toBeGreaterThan(0);
    const firstLabel = ticks[0]!.getAttribute("data-pulse-peak-label")!;
    expect(firstLabel).toMatch(/^(FIN|COM|LOC|IDN|XCS|OTH)( · \d{2}-[A-Z]{3})?$/);
  });

  it("labels peaks as readable chips under each entity tile", () => {
    renderPanel();
    const chips = document.querySelectorAll("[data-pulse-peak-chip]");
    expect(chips.length).toBeGreaterThan(0);
    const chip = chips[0]!;
    expect(chip.getAttribute("data-pulse-peak-label")).toBeTruthy();
    expect(chip.getAttribute("title")).toMatch(/observation/);
  });

  it("truncates the chip row and narrates the remainder honestly", () => {
    renderPanel();
    const more = document.querySelectorAll("[data-pulse-peak-more]");
    // Some entity has more day clusters than the visible chip cap.
    expect(more.length).toBeGreaterThan(0);
    expect(more[0]!.textContent).toMatch(/^\+(\d+) more$/);
  });

  it("shows an honest NO DATA state when no entities are placed", () => {
    const empty = buildEntityPulseOverview({
      nodes: [],
      observations: [],
      timeRange: null,
    });
    render(
      <PulsePanel
        overview={{ status: "ready", overview: empty, error: null }}
      />,
    );
    expect(screen.getByTestId("pulse-empty-no-data")).toBeInTheDocument();
    expect(screen.queryAllByTestId("pulse-entity-card")).toHaveLength(0);
  });

  it("reports NO ACTIVITY IN WINDOW honestly (real zero, not a fabricated calm)", () => {
    const boundedWindow: [number, number] = [
      Date.parse("2024-01-01T00:00:00.000Z"),
      Date.parse("2024-01-31T23:59:59.999Z"),
    ];
    // Honest zero inside a bounded window, entities still placed.
    const calm = buildEntityPulseOverview({
      nodes,
      observations: [],
      timeRange: boundedWindow,
    });
    render(
      <PulsePanel overview={{ status: "ready", overview: calm, error: null }} />,
    );
    expect(calm.totalObservationsInWindow).toBe(0);
    expect(calm.windowLabel).toBe("selected window");
    expect(screen.getByTestId("pulse-empty-no-window-activity")).toBeInTheDocument();
  });
});