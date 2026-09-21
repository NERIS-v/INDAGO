// ============================================================================
// PR4 · Cinematic Home — Opening · Wordmark → organic decomposition
//
// The page OPENS on the wordmark INDAGO and decomposes the SAME persistent
// nodes into the organic graph. This suite locks the pure, browser-free
// whole-word wordmark module:
//   §A the layout is deterministic for every tier (byte-identical arrays,
//      sized to the particle count, index-aligned with the bundle),
//   §B the six letters read left→right inside a compact world bounds anchored
//      on the DOM box's pxToWorld,
//   §C the sin-lift glyph→organic blend hits its endpoints exactly,
//   §D real bundles integrate: every NODE leaves its glyph and lands exactly on
//      its organic position (extra particles are glyph-only dust),
//   §E the composition root builds the wordmark + interaction from the SAME
//      bundle and the full-journey scene drives the decomposition from this
//      module (no graph "I"-formation module any more).
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateOpeningGraph } from "@/components/home/cinematic/opening/opening.graph";
import {
  OPENING_PARTICLE_COUNT,
  OPENING_WORDMARK_TEXT,
} from "@/components/home/cinematic/opening/opening.constants";
import { fallbackGlyphSample } from "@/components/home/cinematic/opening/opening.glyph-sampler";
import {
  buildOpeningWordmarkLayout,
  decomposeBlend,
} from "@/components/home/cinematic/opening/opening.wordmark";
import type { CinematicQualityTier } from "@/components/home/cinematic/cinematic.types";
import type {
  OpeningGlyphSample,
  OpeningGraphBundle,
  OpeningWordmarkLayout,
  OpeningWordmarkMeasurement,
} from "@/components/home/cinematic/opening/opening.types";

const TIERS: readonly CinematicQualityTier[] = [
  "high",
  "medium",
  "mobile",
  "reduced-motion",
];

/** Stage-relative world scale: a 600px wordmark fits the ±3 camera (−1.8→+1.8). */
const SEAM_PX_TO_WORLD = 0.006;

function bundleFor(tier: CinematicQualityTier): OpeningGraphBundle {
  return generateOpeningGraph(tier);
}

function particleCountFor(tier: CinematicQualityTier): number {
  return OPENING_PARTICLE_COUNT[tier];
}

function seam(tier: CinematicQualityTier): {
  sample: OpeningGlyphSample;
  measurement: OpeningWordmarkMeasurement;
} {
  return {
    sample: fallbackGlyphSample(particleCountFor(tier)),
    measurement: { widthPx: 600, heightPx: 148, pxToWorld: SEAM_PX_TO_WORLD },
  };
}

function buildFor(tier: CinematicQualityTier): {
  bundle: OpeningGraphBundle;
  sample: OpeningGlyphSample;
  layout: OpeningWordmarkLayout;
} {
  const bundle = bundleFor(tier);
  const { sample, measurement } = seam(tier);
  return {
    bundle,
    sample,
    layout: buildOpeningWordmarkLayout({
      nodes: bundle.nodes,
      sample,
      measurement,
    }),
  };
}

describe("PR4 §A the wordmark layout is deterministic for every tier", () => {
  it("the same bundle yields byte-identical positions, letters, stagger and curves", () => {
    for (const tier of TIERS) {
      const a = buildFor(tier).layout;
      const b = buildFor(tier).layout;
      expect(Array.from(a.glyphX)).toEqual(Array.from(b.glyphX));
      expect(Array.from(a.glyphY)).toEqual(Array.from(b.glyphY));
      expect(Array.from(a.letter)).toEqual(Array.from(b.letter));
      expect(Array.from(a.size)).toEqual(Array.from(b.size));
      expect(Array.from(a.bound)).toEqual(Array.from(b.bound));
      expect(Array.from(a.start)).toEqual(Array.from(b.start));
      expect(Array.from(a.curveX)).toEqual(Array.from(b.curveX));
      expect(Array.from(a.curveY)).toEqual(Array.from(b.curveY));
      expect(a.bounds).toEqual(b.bounds);
    }
  });

  it("arrays are sized to the particle count and all values are finite", () => {
    for (const tier of TIERS) {
      const { bundle, layout } = buildFor(tier);
      const count = particleCountFor(tier);
      const arrays = [
        layout.glyphX,
        layout.glyphY,
        layout.letter,
        layout.size,
        layout.bound,
        layout.start,
        layout.curveX,
        layout.curveY,
      ];
      for (const array of arrays) expect(array).toHaveLength(count);
      expect(layout.size.length).toBe(count);
      for (let i = 0; i < count; i += 1) {
        expect(Number.isFinite(layout.glyphX[i]!)).toBe(true);
        expect(Number.isFinite(layout.glyphY[i]!)).toBe(true);
        expect(layout.letter[i]!).toBeGreaterThanOrEqual(0);
        expect(layout.letter[i]!).toBeLessThanOrEqual(5);
      }
      // The first `nodes.length` particles ARE the graph nodes: same stagger.
      for (let i = 0; i < bundle.nodes.length; i += 1) {
        expect(layout.bound[i]).toBe(1);
        expect(layout.start[i]!).toBeCloseTo(bundle.nodes[i]!.decomposeStart, 5);
      }
      // The rest are glyph-only dust: unbound, with a valid fade start.
      for (let i = bundle.nodes.length; i < count; i += 1) {
        expect(layout.bound[i]).toBe(0);
        expect(layout.start[i]!).toBeGreaterThanOrEqual(0.2);
        expect(layout.start[i]!).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("PR4 §B the six letters read left→right inside a compact world bounds", () => {
  it("the wordmark spells INDAGO in reading order", () => {
    expect(OPENING_WORDMARK_TEXT).toBe("INDAGO");
    for (const tier of TIERS) {
      const { layout } = buildFor(tier);
      expect(layout.word.letterRanges).toHaveLength(6);
      expect(
        layout.word.letterRanges.map((range) =>
          OPENING_WORDMARK_TEXT[range.letter],
        ),
      ).toEqual(["I", "N", "D", "A", "G", "O"]);
    }
  });

  it("letter ranges advance strictly left to right", () => {
    for (const tier of TIERS) {
      const { layout } = buildFor(tier);
      for (let i = 1; i < layout.word.letterRanges.length; i += 1) {
        expect(layout.word.letterRanges[i]!.x0).toBeGreaterThan(
          layout.word.letterRanges[i - 1]!.x0,
        );
      }
    }
  });

  it("every letter carries glyph samples (the mask field is not sparse)", () => {
    for (const tier of TIERS) {
      const { layout } = buildFor(tier);
      const perLetter = new Array(6).fill(0);
      for (const letterIndex of layout.letter) perLetter[letterIndex] += 1;
      for (let i = 0; i < 6; i += 1) expect(perLetter[i]).toBeGreaterThan(0);
    }
  });

  it("the world bounds stem from the DOM box and stay camera-framed", () => {
    for (const tier of TIERS) {
      const { layout } = buildFor(tier);
      const { bounds } = layout;
      expect(bounds.right - bounds.left).toBeCloseTo(
        600 * SEAM_PX_TO_WORLD,
        10,
      );
      expect(bounds.top - bounds.bottom).toBeCloseTo(
        148 * SEAM_PX_TO_WORLD,
        10,
      );
      // Centered on the word, inside the ±3 world half-extent the camera frames.
      expect(bounds.left).toBeCloseTo(-(600 * SEAM_PX_TO_WORLD) / 2, 10);
      expect(bounds.right).toBeCloseTo((600 * SEAM_PX_TO_WORLD) / 2, 10);
      expect(bounds.top).toBeCloseTo((148 * SEAM_PX_TO_WORLD) / 2, 10);
      expect(bounds.bottom).toBeCloseTo(-(148 * SEAM_PX_TO_WORLD) / 2, 10);
      expect(Math.abs(bounds.top)).toBeLessThan(2);
      expect(Math.abs(bounds.right)).toBeLessThanOrEqual(3);
    }
  });
});

describe("PR4 §C the glyph→organic blend is exact at both endpoints", () => {
  it("t = 0 lands exactly on the glyph, t = 1 exactly on the organic position", () => {
    for (const tier of TIERS) {
      const { bundle, layout } = buildFor(tier);
      for (let i = 0; i < bundle.nodes.length; i += 1) {
        const node = bundle.nodes[i]!;
        const glyph = decomposeBlend(
          layout.glyphX[i]!,
          layout.glyphY[i]!,
          node.nx,
          node.ny,
          0,
          layout.curveX[i]!,
          layout.curveY[i]!,
        );
        expect(glyph.x).toBeCloseTo(layout.glyphX[i]!, 8);
        expect(glyph.y).toBeCloseTo(layout.glyphY[i]!, 8);
        const organic = decomposeBlend(
          layout.glyphX[i]!,
          layout.glyphY[i]!,
          node.nx,
          node.ny,
          1,
          layout.curveX[i]!,
          layout.curveY[i]!,
        );
        expect(organic.x).toBeCloseTo(node.nx, 8);
        expect(organic.y).toBeCloseTo(node.ny, 8);
      }
    }
  });

  it("without a curve the morph is a pure straight lerp", () => {
    const straight = decomposeBlend(0, 0, 1, 1, 0.25, 0, 0);
    expect(straight.x).toBeCloseTo(0.25, 10);
    expect(straight.y).toBeCloseTo(0.25, 10);
  });

  it("the sin-lift bends only a little (subtle, never a wander)", () => {
    const straight = decomposeBlend(0, 0, 1, 0, 0.5, 0, 0);
    const curved = decomposeBlend(0, 0, 1, 0, 0.5, 0.02, 0.06);
    const bend = Math.hypot(curved.x - straight.x, curved.y - straight.y);
    expect(bend).toBeGreaterThan(0.001);
    expect(bend).toBeLessThan(0.15);
  });

  it("the blend stays inside the segment's bounding box at 0.5", () => {
    const mid = decomposeBlend(0, 0, 1, 1, 0.5, 0, 0);
    expect(mid.x).toBe(0.5);
    expect(mid.y).toBe(0.5);
  });
});

describe("PR4 §D integration: every node decomposes onto its own organic position", () => {
  it("across all tiers the stencil dissolves onto the exact constellation", () => {
    for (const tier of TIERS) {
      const { bundle, layout } = buildFor(tier);
      for (let i = 0; i < bundle.nodes.length; i += 1) {
        const node = bundle.nodes[i]!;
        const mid = decomposeBlend(
          layout.glyphX[i]!,
          layout.glyphY[i]!,
          node.nx,
          node.ny,
          0.5,
          layout.curveX[i]!,
          layout.curveY[i]!,
        );
        expect(Number.isFinite(mid.x)).toBe(true);
        expect(Number.isFinite(mid.y)).toBe(true);
      }
    }
  });

  it("the same bundle always yields the same wordmark — the scene cannot flicker", () => {
    const a = buildFor("high").layout;
    const b = buildFor("high").layout;
    expect(a.glyphX).toEqual(b.glyphX);
    expect(a.glyphY).toEqual(b.glyphY);
  });
});

describe("PR4 §E the controller drives the decomposition from this module", () => {
  const intro = readFileSync(
    resolve("src/components/home/cinematic/CinematicIntro.tsx"),
    "utf-8",
  );
  const scene = readFileSync(
    resolve("src/components/home/cinematic/scenes/OpeningScene.tsx"),
    "utf-8",
  );
  const interaction = readFileSync(
    resolve("src/components/home/cinematic/scenes/OpeningInteraction.tsx"),
    "utf-8",
  );
  const foundation = readFileSync(
    resolve("src/components/home/cinematic/scenes/FoundationScene.tsx"),
    "utf-8",
  );

  it("the composition root builds wordmark + interaction from the same bundle", () => {
    expect(intro).toContain("buildOpeningWordmarkLayout");
    expect(intro).toContain("fallbackLayout");
    expect(intro).toContain("createOpeningInteraction(bundle");
    expect(intro).toContain("openingGraphStats");
  });

  it("the single compute owner blends from the wordmark module", () => {
    expect(scene).toContain("openingNodeAlpha");
    expect(scene).toContain("openingEdgeAlpha");
    expect(scene).toContain("openingLabelAlpha");
    expect(scene).toContain("OPENING_POINTS_VERTEX");
    expect(scene).toContain("useFrame");
    expect(scene).not.toMatch(/addEventListener/);
  });

  it("the interaction owner stays passive and never steals the scroll", () => {
    expect(interaction).toContain("useFrame");
    expect(interaction).toContain('passive: true');
    expect(interaction).not.toMatch(/preventDefault/);
    expect(interaction).not.toMatch(/touchmove/);
    expect(interaction).not.toMatch(/wheel/);
    expect(interaction).not.toMatch(/touch-action/);
  });

  it("the foundation mounts the FULL journey scene + pointer layer (wordmark → graph)", () => {
    // The opening runs the whole journey from the persistent node: wordmark →
    // outward decomposition → release → graph, then hands the SAME nodes to the
    // interactive network. The interaction layer is part of the tree now.
    expect(foundation).toContain("<OpeningScene");
    expect(foundation).toContain("<OpeningInteraction");
  });

  it("the old 'I'-formation module is gone: no scene imports cinematicGraph.formation", () => {
    expect(intro).not.toContain("cinematicGraph.formation");
    expect(scene).not.toContain("cinematicGraph.formation");
    expect(interaction).not.toContain("cinematicGraph.formation");
    expect(foundation).not.toContain("cinematicGraph.formation");
  });
});
