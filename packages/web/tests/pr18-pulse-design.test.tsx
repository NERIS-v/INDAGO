import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";
import { PulsePanel } from "@/components/graph/control-center/pulse/pulse-panel";
import { buildEntityPulseOverview } from "@/lib/network/pulse/pulse-model";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations as observations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowContradictions as contradictions } from "@/lib/providers/demo/demo-fixtures/contradictions";
import { ENT_BANK } from "@/lib/providers/demo/demo-fixtures/lookup";

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

describe("F-PR18 — Entity Pulse analytical-field redesign", () => {
  it("renders a single large center entity node per glyph (no radial peak bars)", () => {
    renderPanel();
    const glyph = document.querySelector(
      '[data-pulse-entity="' + ENT_BANK + '"]',
    )!;
    // The filled entity node circle sits at the glyph center.
    const nodeCircles = Array.from(glyph.querySelectorAll("circle")).filter(
      (c) => {
        const cx = Number(c.getAttribute("cx"));
        const cy = Number(c.getAttribute("cy"));
        return Math.abs(cx - 100) < 0.001 && Math.abs(cy - 100) < 0.001;
      },
    );
    expect(nodeCircles.length).toBeGreaterThan(0);
    const filled = nodeCircles.find((c) => c.getAttribute("fill") !== "none");
    expect(filled).not.toBeNull();
    expect(Number(filled!.getAttribute("r"))).toBe(34);
    // No legacy radial bar ticks: peaks are now boundary indicators.
    expect(glyph.querySelectorAll("[data-pulse-glyph-bar]").length).toBe(0);
  });

  it("draws a continuous organic aura contour rather than a rigid circle", () => {
    renderPanel();
    const glyph = document.querySelector(
      '[data-pulse-entity="' + ENT_BANK + '"]',
    )!;
    const aura = glyph.querySelector(
      '[data-d=""] path, path[fill-opacity]',
    ) as SVGPathElement | null;
    // The aura is the filled contour path (fill-opacity ring, not the center node).
    const paths = Array.from(glyph.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") !== "none",
    );
    expect(paths.length).toBeGreaterThan(0);
    const d = paths[0]!.getAttribute("d")!;
    expect(d.startsWith("M")).toBe(true);
    // Spline control points make the silhouette organic.
    expect(d.includes("C") || d.includes("Q")).toBe(true);
  });

  it("places per-category perimeter indicators with counts and leader lines", () => {
    renderPanel();
    const glyph = document.querySelector(
      '[data-pulse-entity="' + ENT_BANK + '"]',
    )!;
    const indicators = glyph.querySelectorAll("[data-pulse-indicator-category]");
    expect(indicators.length).toBeGreaterThan(0);
    const first = indicators[0]!;
    // Full category name on the indicator; the short code lives on its peak label.
    expect(first.getAttribute("data-pulse-indicator-category")).toMatch(
      /^(communication|financial|location|identity|other|exchange)$/,
    );
    const count = Number(first.getAttribute("data-pulse-indicator-count"));
    expect(count).toBeGreaterThan(0);
    // Every indicator group carries a leader line to its label.
    for (const ind of indicators) {
      expect(ind.querySelector("line")).not.toBeNull();
      expect(ind.querySelector("text")).not.toBeNull();
      // Labels are category codes only — never contain a date.
      expect(ind.getAttribute("data-pulse-peak-label")).toMatch(
        /^(FIN|COM|LOC|IDN|XCS|OTH)$/,
      );
    }
  });

  it("aura-boundary peak markers carry the documented four data attributes", () => {
    renderPanel();
    const glyph = document.querySelector(
      '[data-pulse-entity="' + ENT_BANK + '"]',
    )!;
    const ticks = glyph.querySelectorAll("[data-pulse-peak]");
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.getAttribute("data-pulse-peak-label")).toMatch(
        /^(FIN|COM|LOC|IDN|XCS|OTH)$/,
      );
      expect(tick.getAttribute("data-pulse-peak-angle")).not.toBeNull();
      expect(tick.getAttribute("data-pulse-peak-magnitude")).not.toBeNull();
    }
  });

  it("never renders radial time bars or explicit observation dates anywhere", () => {
    renderPanel();
    expect(document.querySelectorAll("[data-pulse-glyph-bar]").length).toBe(0);
    // No day-clustered date suffix surfaces in any chip or label.
    const labels = document.querySelectorAll("[data-pulse-peak-label]");
    for (const label of labels) {
      expect(label.getAttribute("data-pulse-peak-label")).not.toMatch(
        / · \d{2}-[A-Z]{3}$/,
      );
    }
  });

  it("cards lay out vertically as large analytical fields (glyph above info)", () => {
    renderPanel();
    const cards = screen.getAllByTestId("pulse-entity-card");
    expect(cards.length).toBe(5);
    for (const card of cards) {
      // Vertical column: the SVG glyph precedes the entity label text in DOM.
      const glyph = card.querySelector("[data-pulse-entity]")!;
      const label = card.querySelector('span[title]');
      expect(label).not.toBeNull();
      const glyphPos = glyph.compareDocumentPosition(label!);
      expect(glyphPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
    }
  });

  it("each card exposes a readable accessible description for its glyph", () => {
    renderPanel();
    const glyphs = document.querySelectorAll("[data-pulse-entity]");
    for (const glyph of glyphs) {
      const title = glyph.querySelector("title");
      expect(title?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it("prominent entity renders a large field and is visually first", () => {
    renderPanel();
    const prominent = document.querySelector("[data-pulse-card-prominent]")!;
    expect(prominent).not.toBeNull();
    const glyph = prominent.querySelector("[data-pulse-entity]")!;
    // sample-count contract intact on the prominent glyph.
    expect(glyph.getAttribute("data-pulse-sample-count")).toBe("96");
  });
});
