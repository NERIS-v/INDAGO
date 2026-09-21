// ============================================================================
// PR · Cinematic Home Opening · WHOLE-WORD glyph→particle mapping contract
//
// The old contract froze per-letter metadata and a per-letter map. The verified
// fix is ONE affine transform from the whole-word ink box into the live H1
// layout box. This suite freezes exactly that:
//   §1 the horizontal axis maps the raster advance onto the H1 layout width
//      (letter-spacing baked into both) — DOM-proportional, scale-invariant;
//   §2 the vertical axis rebuilds the alphabetic baseline inside a line-height:1
//      box at (1 + ascent − descent) / 2 and reads the ink band off it;
//   §3 the fallback sample uses the identity metrics so it fills the whole box;
//   §4 the map is deterministic;
//   §5 sampling defers while the wordmark font is unavailable.
//
// All canvas assertions run against a DETERMINISTIC fake 2D context (jsdom has
// no rasteriser) whose ink rectangles are known exactly.
// ============================================================================

import { describe, expect, it } from "vitest";
import { sampleWordmarkGlyphs } from "@/components/home/cinematic/opening/opening.glyph-sampler";
import { fallbackGlyphSample } from "@/components/home/cinematic/opening/opening.glyph-sampler";
import { ensureWordmarkFontReady } from "@/components/home/cinematic/opening/opening.fonts";
import { buildOpeningWordmarkLayout } from "@/components/home/cinematic/opening/opening.wordmark";
import { OPENING_LETTERS } from "@/components/home/cinematic/opening/opening.constants";
import type {
  OpeningGlyphSample,
  OpeningNodeDefinition,
  OpeningWordmarkRaster,
} from "@/components/home/cinematic/opening/opening.types";

const BASE_WIDTHS: Readonly<Record<string, number>> = {
  I: 0.35,
  N: 0.65,
  D: 0.6,
  A: 0.65,
  G: 0.62,
  O: 0.65,
};

const CAP_EM = 0.7;
const DESCENT_EM = 0.2;
const ASCENT_EM = 0.75;

interface DrawnGlyph {
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
}

class FakeRasterContext {
  font = "";
  textAlign = "";
  textBaseline = "";
  fillStyle = "";
  private drawn: DrawnGlyph[] = [];

  private fontPx(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return match ? parseFloat(match[1]!) : 100;
  }

  measureText(text: string): {
    width: number;
    actualBoundingBoxAscent: number;
    actualBoundingBoxDescent: number;
  } {
    const f = this.fontPx();
    let width = 0;
    for (const ch of text) width += (BASE_WIDTHS[ch] ?? 0.6) * f;
    return {
      width,
      actualBoundingBoxAscent: ASCENT_EM * f,
      actualBoundingBoxDescent: DESCENT_EM * f,
    };
  }

  clearRect(): void {}

  fillText(text: string, x: number, y: number): void {
    this.drawn.push({ text, x, baseline: y });
  }

  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    const f = this.fontPx();
    const data = new Uint8ClampedArray(w * h * 4);
    for (const glyph of this.drawn) {
      const inkW = Math.round((BASE_WIDTHS[glyph.text] ?? 0.6) * f);
      const x0 = Math.round(glyph.x);
      const yTop = Math.round(glyph.baseline - CAP_EM * f);
      const yBottom = Math.round(glyph.baseline + DESCENT_EM * f);
      for (let py = yTop; py <= Math.min(yBottom, h - 1); py += 1) {
        if (py < 0) continue;
        const row = py * w;
        for (let px = x0; px <= Math.min(x0 + inkW, w - 1); px += 1) {
          if (px < 0) continue;
          data[(row + px) * 4 + 3] = 255;
        }
      }
    }
    return { data, width: w, height: h, colorSpace: "srgb" };
  }
}

function fakeCanvas(): HTMLCanvasElement {
  const ctx = new FakeRasterContext();
  return {
    getContext: (kind: string) =>
      kind === "2d" ? (ctx as unknown as CanvasRenderingContext2D) : null,
  } as unknown as HTMLCanvasElement;
}

const FAKE_FONT = "700 50px Cormorant Garamond";
const SPACING_PX = 10;

function sampleAt(heightPx: number, scale: number, count = 240): OpeningGlyphSample {
  const sample = sampleWordmarkGlyphs({
    letters: [...OPENING_LETTERS],
    font: FAKE_FONT,
    letterSpacingPx: SPACING_PX,
    heightPx,
    scale,
    threshold: 40,
    count,
    makeCanvas: fakeCanvas,
  });
  expect(sample).not.toBeNull();
  return sample!;
}

function node(index: number): OpeningNodeDefinition {
  return {
    id: `n${index}`,
    class: "secondary",
    index,
    nx: 0,
    ny: 0,
    size: 0.02,
    decomposeStart: 0.44,
    releaseStart: 0.62,
    phase: 0,
    driftAmplitude: 0,
    accent: 0,
  };
}

/** Synthetic word with hand-picked, round metrics so the map is exact. */
const SYNTH_WORD: OpeningWordmarkRaster = {
  scaledFontPx: 100,
  pad: 8,
  baselineY: 88,
  totalAdvance: 472,
  inkX0: 8,
  inkX1: 460,
  inkY0: 18,
  inkY1: 88,
  ascentEm: ASCENT_EM,
  descentEm: DESCENT_EM,
  letterRanges: [
    { letter: 0, x0: 8, x1: 63 },
    { letter: 1, x0: 63, x1: 148 },
    { letter: 2, x0: 148, x1: 228 },
    { letter: 3, x0: 228, x1: 313 },
    { letter: 4, x0: 313, x1: 395 },
    { letter: 5, x0: 395, x1: 480 },
  ],
};

const SYNTH_MEASUREMENT = { widthPx: 472, heightPx: 100, pxToWorld: 1 };

function synthSample(
  pts: ReadonlyArray<{ fx: number; fy: number; letter: number }>,
): OpeningGlyphSample {
  return { points: [...pts], word: SYNTH_WORD };
}

describe("§1 the horizontal axis maps the whole word into the H1 layout box", () => {
  const layout = buildOpeningWordmarkLayout({
    nodes: [node(0), node(1), node(2)],
    sample: synthSample([
      { fx: 0, fy: 0, letter: 0 },
      { fx: 1, fy: 1, letter: 5 },
      { fx: 0.5, fy: 0.5, letter: 2 },
    ]),
    measurement: SYNTH_MEASUREMENT,
  });

  it("places fx=0 / fx=1 on the ink box edges (center-corrected world px)", () => {
    // inkLeftDom = (8 − 8) · 1 = 0 → world −236; inkRightDom = (460 − 8) = 452
    // → world 216.
    expect(layout.glyphX[0]).toBeCloseTo(-236, 6);
    expect(layout.glyphX[1]).toBeCloseTo(216, 6);
    expect(layout.glyphX[2]).toBeCloseTo(-10, 6);
  });

  it("tags points with the reading-order letter and keeps ranges in order", () => {
    expect(Array.from(layout.letter)).toEqual([0, 5, 2]);
    for (let i = 1; i < layout.word.letterRanges.length; i += 1) {
      expect(layout.word.letterRanges[i]!.x0).toBeGreaterThan(
        layout.word.letterRanges[i - 1]!.x0,
      );
    }
  });

  it("scales linearly with the DOM layout width (reads ratios, not raw px)", () => {
    const s = synthSample([
      { fx: 0, fy: 0, letter: 0 },
      { fx: 1, fy: 0, letter: 0 },
    ]);
    const base = buildOpeningWordmarkLayout({
      nodes: [node(0), node(1)],
      sample: s,
      measurement: { widthPx: 600, heightPx: 100, pxToWorld: 1 },
    });
    const wide = buildOpeningWordmarkLayout({
      nodes: [node(0), node(1)],
      sample: s,
      measurement: { widthPx: 1200, heightPx: 100, pxToWorld: 1 },
    });
    const span = (l: typeof base) => l.glyphX[1]! - l.glyphX[0]!;
    expect(span(wide)).toBeCloseTo(2 * span(base), 4);
  });
});

describe("§2 the vertical axis rebuilds the alphabetic baseline in the line box", () => {
  const layout = buildOpeningWordmarkLayout({
    nodes: [node(0), node(1), node(2)],
    sample: synthSample([
      { fx: 0.5, fy: 0, letter: 0 },
      { fx: 0.5, fy: 1, letter: 0 },
      { fx: 0.5, fy: 0.5, letter: 0 },
    ]),
    measurement: SYNTH_MEASUREMENT,
  });

  it("baseline = (1 + ascent − descent)/2 = 0.775 → 77.5px", () => {
    // Ink top = 77.5 − (88 − 18) = 7.5px; ink bottom = 77.5 + (88 − 88) = 77.5.
    // fy=1 → ink top → yDom 7.5 → world 50 − 7.5 = 42.5.
    expect(layout.glyphY[1]).toBeCloseTo(42.5, 6);
    // fy=0 → ink bottom → yDom 77.5 → world 50 − 77.5 = −27.5.
    expect(layout.glyphY[0]).toBeCloseTo(-27.5, 6);
    // fy=0.5 → yDom 42.5 → world 7.5.
    expect(layout.glyphY[2]).toBeCloseTo(7.5, 6);
  });

  it("keeps ink top above ink bottom (Y is inverted exactly once)", () => {
    expect(layout.glyphY[1]).toBeGreaterThan(layout.glyphY[0]);
  });
});

describe("§3 the fallback sample fills the whole H1 box (identity metrics)", () => {
  const fallback = fallbackGlyphSample(240);
  const layout = buildOpeningWordmarkLayout({
    nodes: [node(0), node(1)],
    sample: {
      points: [
        { fx: 0.5, fy: 1, letter: 0 },
        { fx: 0.5, fy: 0, letter: 0 },
      ],
      word: fallback.word,
    },
    measurement: { widthPx: 600, heightPx: 148, pxToWorld: 0.006 },
  });

  it("spreads fy=1..0 across the full 148px box (top→bottom)", () => {
    // baselineFrac = (1 + 1 − 0)/2 = 1 → baseline at the box bottom. Ink top
    // at the box top. fy=1 → 74 − 0 = 74px → 0.444; fy=0 → 74 − 148 = −74px.
    expect(layout.glyphY[0]).toBeCloseTo(74 * 0.006, 6);
    expect(layout.glyphY[1]).toBeCloseTo(-74 * 0.006, 6);
  });

  it("centers fx=0.5 on the box center", () => {
    expect(layout.glyphX[0]).toBeCloseTo(0, 6);
  });
});

describe("§4 the whole-word map is deterministic", () => {
  it("same sample + measurement → byte-identical layout", () => {
    const build = () =>
      buildOpeningWordmarkLayout({
        nodes: [node(0), node(1)],
        sample: sampleAt(50, 2),
        measurement: SYNTH_MEASUREMENT,
      });
    const a = build();
    const b = build();
    expect(Array.from(a.glyphX)).toEqual(Array.from(b.glyphX));
    expect(Array.from(a.glyphY)).toEqual(Array.from(b.glyphY));
    expect(Array.from(a.start)).toEqual(Array.from(b.start));
  });

  it("browser sample is byte-identical for identical options", () => {
    expect(sampleAt(50, 2)).toEqual(sampleAt(50, 2));
  });
});

describe("§5 sampling defers while the wordmark font is unavailable", () => {
  const readyFonts = {
    load: async () => undefined,
    status: "loaded",
    check: () => true,
  } as unknown as FontFaceSet;

  const loadingFonts = {
    load: async () => undefined,
    status: "loading",
    ready: Promise.resolve(),
    check: () => false,
  } as unknown as FontFaceSet;

  it("reports ready when the face resolves", async () => {
    await expect(
      ensureWordmarkFontReady(FAKE_FONT, "INDAGO", readyFonts),
    ).resolves.toBe(true);
  });

  it("reports not-ready while the set is still loading (defer, do not sample)", async () => {
    await expect(
      ensureWordmarkFontReady(FAKE_FONT, "INDAGO", loadingFonts),
    ).resolves.toBe(false);
  });

  it("trusts check() even when load throws (a failed face is still verified)", async () => {
    const flaky = {
      load: async () => {
        throw new Error("network");
      },
      status: "loaded",
      check: () => true,
    } as unknown as FontFaceSet;
    await expect(
      ensureWordmarkFontReady(FAKE_FONT, "INDAGO", flaky),
    ).resolves.toBe(true);
  });
});
