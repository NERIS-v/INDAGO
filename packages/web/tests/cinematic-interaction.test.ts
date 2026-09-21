// ============================================================================
// PR3 · Cinematic Home — Opening · Interaction logic
//
// Pure-logic suite over opening/opening.interaction.ts: the immutable bundle
// adjacency, the preallocated emphasis buffers with their neutral defaults,
// nearest-point hit-testing, the focus/hover/neighbour emphasis matrix, edge
// multipliers, the settle spring and the reduced-motion / controller wiring
// (source-level guards — jsdom cannot mount R3F, and the screens live in the
// browser).
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OPENING_FOCUS_EDGE_MULT,
  OPENING_FOCUS_EMISSION,
  OPENING_FOCUS_SCALE,
  OPENING_HOVER_EDGE_MULT,
  OPENING_HOVER_EMISSION,
  OPENING_HOVER_SCALE,
  OPENING_NEIGHBOUR_EMISSION,
  approach,
  assertOpeningInteractionConsistent,
  buildOpeningInteractionLayout,
  createOpeningInteraction,
  edgeEndpointIndices,
  findNearestPoint,
  openingEdgeMultiplier,
  openingNodeEmphasis,
} from "../src/components/home/cinematic/opening/opening.interaction";
import type {
  OpeningGraphBundle,
  OpeningNodeClass,
} from "../src/components/home/cinematic/opening/opening.types";

// ---------------------------------------------------------------------------
// Test fixture: a tiny hand-built constellation
//   n1 ── n2 ── n3
//   | \________/
//   n5 ── n6
//   n4 ... isolated
// ---------------------------------------------------------------------------

function node(
  id: string,
  index: number,
  nx: number,
  ny: number,
  cls: OpeningNodeClass = "core",
): OpeningGraphBundle["nodes"][number] {
  return {
    id,
    class: cls,
    index,
    nx,
    ny,
    size: 0.05,
    decomposeStart: 0.2,
    releaseStart: 0.5,
    phase: 0,
    driftAmplitude: 0.02,
    accent: 0,
  };
}

function edge(
  id: string,
  source: string,
  sourceIndex: number,
  target: string,
  targetIndex: number,
): OpeningGraphBundle["edges"][number] {
  return {
    id,
    source,
    target,
    sourceIndex,
    targetIndex,
    slot: sourceIndex,
    formationStart: 0.7,
  };
}

function makeBundle(): OpeningGraphBundle {
  return {
    tier: "mobile",
    seed: 1,
    nodes: [
      node("n1", 0, 0, 0.5),
      node("n2", 1, -0.6, 0.1),
      node("n3", 2, 0.6, 0.1),
      node("n4", 3, 1.6, 0.2, "peripheral"),
      node("n5", 4, -1.2, 0.3),
      node("n6", 5, -1.9, 0.5),
    ],
    edges: [
      edge("e1", "n1", 0, "n2", 1),
      edge("e2", "n2", 1, "n3", 2),
      edge("e3", "n1", 0, "n3", 2),
      edge("e4", "n1", 0, "n5", 4),
      edge("e5", "n5", 4, "n6", 5),
    ],
    bounds: { left: -1.9, right: 1.6, bottom: 0.1, top: 0.5 },
  };
}

describe("PR3 §A the imm utable adjacency layout", () => {
  const bundle = makeBundle();
  const layout = buildOpeningInteractionLayout(bundle);

  it("resolves ids to indices and keeps neighbor lists symmetric", () => {
    expect(layout.nodeIndexById.get("n1")).toBe(0);
    expect(layout.nodeIndexById.get("n6")).toBe(5);
    for (const e of bundle.edges) {
      expect(layout.neighborsByNodeId.get(e.source)).toContain(e.target);
      expect(layout.neighborsByNodeId.get(e.target)).toContain(e.source);
    }
    expect(layout.edgeCount).toBe(bundle.edges.length);
  });

  it("passes the cross-check for a consistent bundle", () => {
    expect(assertOpeningInteractionConsistent(bundle, layout)).toBe(true);
  });

  it("rejects a missing endpoint in the cross-check", () => {
    const bad = {
      ...bundle,
      edges: [
        ...bundle.edges,
        edge("e9", "n1", 0, "ghost", 99),
      ],
    };
    const inconsistent = assertOpeningInteractionConsistent(
      bad,
      buildOpeningInteractionLayout(bad),
    );
    expect(inconsistent).toBe(false);
  });
});

describe("PR3 §B createOpeningInteraction runtime", () => {
  const bundle = makeBundle();
  const view = createOpeningInteraction(bundle, true);

  it("sizes every buffer to the bundle and fills neutral defaults", () => {
    const n = bundle.nodes.length;
    const e = bundle.edges.length;
    expect(view.nodeEmission).toHaveLength(n);
    expect(view.nodeScale).toHaveLength(n);
    expect(view.edgeMult).toHaveLength(e);
    expect(Array.from(view.nodeEmission)).toEqual([
      ...new Float32Array(n),
    ]);
    expect(Array.from(view.nodeScale)).toEqual([
      ...new Float32Array(n).fill(1),
    ]);
    expect(Array.from(view.edgeMult)).toEqual([
      ...new Float32Array(e).fill(1),
    ]);
    expect(view.active).toBe(true);
    expect(view.coarse).toBe(true);
    expect(view.focusedId).toBeNull();
    expect(view.hoveredId).toBeNull();
    expect(view.focusStrength).toBe(0);
    expect(view.hoverStrength).toBe(0);
    expect(view.focusRevision).toBe(0);
    expect(view.cursor).toEqual({ x: 0, y: 0, inside: false });
  });

  it("reports the coarse flag verbatim (desktop = fine targets)", () => {
    const fine = createOpeningInteraction(bundle, false);
    expect(fine.coarse).toBe(false);
    expect(fine.layout.edgeCount).toBe(bundle.edges.length);
  });
});

describe("PR3 §C nearest-point hit-testing", () => {
  const bundle = makeBundle();
  const xs = new Float32Array(bundle.nodes.map((n) => n.nx));
  const ys = new Float32Array(bundle.nodes.map((n) => n.ny));

  it("picks the nearest node whose radius covers the cursor", () => {
    expect(findNearestPoint(0, 0.5, xs, ys, xs.length, 1.5)).toBe(0);
    expect(findNearestPoint(-0.6, 0.1, xs, ys, xs.length, 0.62)).toBe(1);
  });

  it("returns -1 when the cursor is outside every radius", () => {
    expect(findNearestPoint(10, 10, xs, ys, xs.length, 1)).toBe(-1);
  });

it("returns -1 when every node sits farther than the radius", () => {
    const sampleX = new Float32Array([2, -1, 1, 3, -2, -3]);
    const sampleY = new Float32Array([0, 0, 0, 0, 0, 0]);
    expect(findNearestPoint(0, 0, sampleX, sampleY, sampleX.length, 0.5)).toBe(-1);
  });

  it("count respects a smaller bound", () => {
    expect(findNearestPoint(0, 0.5, xs, ys, 1, 3)).toBe(0);
    expect(findNearestPoint(0, 0.5, xs, ys, 0, 3)).toBe(-1);
  });
});

describe("PR3 §D node emphasis matrix", () => {
  it("orders focused > hovered > focused-neighbour > rest", () => {
    const focused = openingNodeEmphasis(true, false, false);
    expect(focused.emission).toBe(OPENING_FOCUS_EMISSION);
    expect(focused.scale).toBe(OPENING_FOCUS_SCALE);

    const hovered = openingNodeEmphasis(false, true, false);
    expect(hovered.emission).toBe(OPENING_HOVER_EMISSION);
    expect(hovered.scale).toBe(OPENING_HOVER_SCALE);

    const neighbour = openingNodeEmphasis(false, false, true);
    expect(neighbour.emission).toBe(OPENING_NEIGHBOUR_EMISSION);
    expect(neighbour.scale).toBe(1);

    const rest = openingNodeEmphasis(false, false, false);
    expect(rest.emission).toBe(0);
    expect(rest.scale).toBe(1);

    expect(focused.emission).toBeGreaterThan(hovered.emission);
    expect(hovered.emission).toBeGreaterThan(neighbour.emission);
    expect(neighbour.emission).toBeGreaterThan(rest.emission);
  });

  it("hover wins over neighbour emphasis (a hovered node marks itself)", () => {
    const both = openingNodeEmphasis(false, true, true);
    expect(both.emission).toBe(OPENING_HOVER_EMISSION);
  });
});

describe("PR3 §E edge emphasis", () => {
  it("brightens incident edges to the focus and dims everything else", () => {
    expect(openingEdgeMultiplier("n1", "n2", "n1", null)).toBe(
      OPENING_FOCUS_EDGE_MULT,
    );
    expect(openingEdgeMultiplier("n2", "n1", "n1", null)).toBe(
      OPENING_FOCUS_EDGE_MULT,
    );
    expect(openingEdgeMultiplier("n3", "n1", "n2", null)).toBe(1);
  });

  it("scales hover edges by the gentler multiplier, focus wins over hover", () => {
    expect(openingEdgeMultiplier("n1", "n2", null, "n1")).toBe(
      OPENING_HOVER_EDGE_MULT,
    );
    expect(openingEdgeMultiplier("n1", "n2", "n1", "n2")).toBe(
      OPENING_FOCUS_EDGE_MULT,
    );
  });
});

describe("PR3 §F settle spring (exponential approach)", () => {
  it("approach halves the gap every half-life", () => {
    expect(approach(1, 0, 0.12, 0.12)).toBeCloseTo(0.5, 5);
    expect(approach(0, 1, 0.12, 0.12)).toBeCloseTo(0.5, 5);
    expect(approach(1, 0, 0, 0.12)).toBe(1); // zero dt → frozen
    expect(approach(1, 0, 0.24, 0.12)).toBeCloseTo(0.25, 5);
  });

  it("a zero half-life snaps instantly (guarded), never loops", () => {
    expect(approach(0.8, 0.2, 0, 0)).toBe(0.2);
    expect(approach(0.8, 0.2, 0.5, -1)).toBe(0.2);
  });
});

describe("PR3 §G edge endpoint mirrors", () => {
  it("extracts source/target index arrays aligned 1:1 with the edges", () => {
    const bundle = makeBundle();
    const { source, target } = edgeEndpointIndices(bundle.edges);
    expect(source).instanceOf(Uint16Array);
    expect(target).instanceOf(Uint16Array);
    expect(source).toHaveLength(bundle.edges.length);
    expect(target).toHaveLength(bundle.edges.length);
    bundle.edges.forEach((edge, i) => {
      expect(source[i]).toBe(edge.sourceIndex);
      expect(target[i]).toBe(edge.targetIndex);
    });
  });
});

describe("PR3 §H controller wiring (source-level guards — jsdom cannot mount R3F)", () => {
  const interaction = readFileSync(
    resolve("src/components/home/cinematic/scenes/OpeningInteraction.tsx"),
    "utf-8",
  );
  const scene = readFileSync(
    resolve("src/components/home/cinematic/scenes/OpeningScene.tsx"),
    "utf-8",
  );
  const foundation = readFileSync(
    resolve("src/components/home/cinematic/scenes/FoundationScene.tsx"),
    "utf-8",
  );

  it("keeps every pointer listener on the canvas passive and never steals the scroll", () => {
    expect(interaction).toContain('passive: true');
    expect(interaction).not.toMatch(/preventDefault/);
    expect(interaction).not.toMatch(/touchmove/);
    expect(interaction).not.toMatch(/wheel/);
    expect(interaction).not.toMatch(/"scroll"|'scroll'/);
    expect(interaction).not.toMatch(/touch-action/);
  });

  it("defines exactly one interaction owner (no listeners inside the scene)", () => {
    expect(scene).toContain("useFrame");
    expect(scene).not.toMatch(/addEventListener/);
    // The full journey is mounted: the pointer layer is back in the tree,
    // gated to full motion so reduced-motion never mounts it.
    expect(foundation).toContain("<OpeningInteraction");
    expect(foundation).toContain("fullMotion ?");
  });

  it("runs the single compute owner inside the one canvas frame loop", () => {
    expect(interaction).toContain("useFrame");
    expect(interaction).toContain("findNearestPoint");
    expect(interaction).toContain("approach");
    expect(interaction).toContain("openingNodeEmphasis");
    expect(interaction).toContain("openingEdgeMultiplier");
  });

  it("keeps reduced motion and coarse pointers from mounting any interaction", () => {
    // The mount is gated on full motion in the render tree, while the source
    // gating (tier + coarse pointer) lives in the composition root.
    expect(foundation).not.toContain("interaction ? (");
    expect(foundation).toContain('fullMotion ? <OpeningInteraction');
    const intro = readFileSync(
      resolve("src/components/home/cinematic/CinematicIntro.tsx"),
      "utf-8",
    );
    expect(intro).toContain('tier === "reduced-motion"');
    expect(intro).toContain("? null");
    expect(intro).toContain('createOpeningInteraction(bundle');
  });
});