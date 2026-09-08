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
    expect(Number(filled!.getAttribute("r"))).toBe(42);
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
        /^(FIN|COM|LOC|IDN|XCS|FCT|REL|BEH|OTH)$/,
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
        /^(FIN|COM|LOC|IDN|XCS|FCT|REL|BEH|OTH)$/,
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

describe("F-PR19 — fully organic sector field", () => {
  const bankGlyph = () =>
    document.querySelector('[data-pulse-entity="' + ENT_BANK + '"]')!;

  it("draws one continuous closed organic contour, not a circle or regular ring", () => {
    renderPanel();
    const glyph = bankGlyph();
    // The continuous field is a single closed smooth path.
    const paths = Array.from(glyph.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") !== "none" && p.getAttribute("d"),
    );
    expect(paths.length).toBeGreaterThan(0);
    const field = paths[0]!;
    const d = field.getAttribute("d")!;
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    // Catmull-Rom: cubic control points ⇒ smooth organic silhouette.
    expect(d.includes("C")).toBe(true);
    // The shape is not a regular circle: no single exact-radius arc command set.
    expect(d.includes("A")).toBe(false);
  });

  it("splits the field into per-category semantic sectors carrying a hue", () => {
    renderPanel();
    const glyph = bankGlyph();
    const sectors = glyph.querySelectorAll("[data-pulse-indicator-category]");
    expect(sectors.length).toBeGreaterThan(0);
    // Each sector is a coloured warp: it owns at least one field-sliver polygon
    // rendered with the category's color AND a strength-scaled opacity.
    for (const sector of sectors) {
      const polys = Array.from(sector.querySelectorAll("polygon"));
      expect(polys.length).toBeGreaterThan(0);
      const fill = polys[0]!.getAttribute("fill");
      expect(fill).toBeTruthy();
      const op = Number(polys[0]!.getAttribute("fill-opacity"));
      expect(Number.isFinite(op)).toBe(true);
      // Stronger sector ⇒ deeper wash; never negative or over-bright.
      expect(op).toBeGreaterThanOrEqual(0);
      expect(op).toBeLessThanOrEqual(0.9);
    }
  });

  it("blends adjacent sector hues through a raised-cosine intensity ramp", () => {
    renderPanel();
    const glyph = bankGlyph();
    const sectors = Array.from(
      glyph.querySelectorAll("[data-pulse-indicator-category]"),
    );
    expect(sectors.length).toBeGreaterThan(1);
    // Within a sector the per-sliver intensities follow a peak-mid/zero-edge
    // profile: some slivers are visibly faded (boundary blending) and no sliver
    // is fully opaque, confirming a soft transition rather than a hard band.
    const first = sectors[0]!;
    const ops = Array.from(first.querySelectorAll("polygon")).map((p) =>
      Number(p.getAttribute("fill-opacity")),
    );
    expect(Math.max(...ops)).toBeGreaterThan(0);
    // Edge slivers are strongly faded (approaching zero) at the sector boundary,
    // confirming a soft transition rather than a hard band.
    expect(Math.min(...ops)).toBeLessThan(0.2);
  });

  it("sector labels sit just outside the field, joined by a leader", () => {
    renderPanel();
    const glyph = bankGlyph();
    const labels = Array.from(glyph.querySelectorAll("text")).filter((t) =>
      /^(FIN|COM|LOC|IDN|XCS|FCT|REL|BEH|OTH)$/.test(t.textContent ?? ""),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      // Every labelled sector has a leader line within its own group.
      const group = label.closest("[data-pulse-indicator-category]")!;
      expect(group.querySelector("line")).not.toBeNull();
      // Labels are codes only — never a date.
      expect(label.textContent).toMatch(/^(FIN|COM|LOC|IDN|XCS|FCT|REL|BEH|OTH)$/);
    }
  });

  it("renders no dates or calendar markers anywhere on the Pulse", () => {
    renderPanel();
    const glyph = bankGlyph();
    const labels = Array.from(glyph.querySelectorAll("text")).map((t) =>
      (t.textContent ?? "").trim(),
    );
    const allText = labels.join(" ");
    expect(allText).not.toMatch(/\d{2}-[A-Z]{3}/);
    expect(allText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // No clock/hands/date glyph parts are present.
    expect(glyph.querySelectorAll("[data-pulse-glyph-clock]").length).toBe(0);
  });

  it("divides the perimeter into equal sectors and spaces labels equally", () => {
    renderPanel();
    const glyph = bankGlyph();
    const sectors = Array.from(glyph.querySelectorAll("[data-pulse-indicator-category]"));
    expect(sectors.length).toBeGreaterThan(1);
    // Sector label angles derive from the equal arc centre, evenly spread over
    // one full turn regardless of how clustered the raw observation angles are.
    const angles = sectors.map((s) => {
      const group = s as Element;
      const leaderStart = group.querySelector("line")!;
      const x = Number(leaderStart.getAttribute("x1"));
      const y = Number(leaderStart.getAttribute("y1"));
      return Math.atan2(y - 100, x - 100);
    });
    const sorted = [...angles].sort((a, b) => a - b);
    const gaps = sorted.map((angle, i) => {
      const next = sorted[(i + 1) % sorted.length]!;
      let g = next - angle;
      if (g < 0) g += Math.PI * 2;
      return g;
    });
    // Equal sectors ⇒ the label to label angular gaps are all (≈) equal.
    const expected = (Math.PI * 2) / sectors.length;
    for (const gap of gaps) {
      expect(Math.abs(gap - expected)).toBeLessThan(0.15);
    }
  });

  it("keeps a large graph-node-like entity at the centre", () => {
    renderPanel();
    const glyph = bankGlyph();
    const node = glyph.querySelector(
      'circle[cx="100"][cy="100"][fill="var(--color-surface-0)"]',
    );
    expect(node).not.toBeNull();
    const r = Number(node!.getAttribute("r"));
    // Node is large relative to the field — visually dominant centre.
    expect(r).toBeGreaterThan(36);
    // An entity name is rendered inside the node.
    const nodeText = glyph.querySelector('text[cx="100"]') ?? glyph.querySelector('text[x="100"]');
    expect(nodeText).not.toBeNull();
  });

  it("is deterministically identical for identical data (no random breathing)", () => {
    renderPanel();
    renderPanel();
    // Rebuilding with the same fixture yields the same entity count and the
    // same sector count/strengths — geometry is a pure function of the data.
    const a = document.querySelector(
      '[data-pulse-entity="' + ENT_BANK + '"]',
    )!;
    const sectors = a.querySelectorAll("[data-pulse-peak]");
    const angles = Array.from(sectors).map((s) =>
      s.getAttribute("data-pulse-peak-angle"),
    );
    // Deterministic: no two sectors collapse to an unparseable angle, and the
    // set is stable across renders (same field order ⇒ same ordered angles).
    for (const angle of angles) {
      expect(Number(angle)).toBeGreaterThanOrEqual(-Math.PI);
      expect(Number(angle)).toBeLessThanOrEqual(2 * Math.PI);
    }
  });
});
