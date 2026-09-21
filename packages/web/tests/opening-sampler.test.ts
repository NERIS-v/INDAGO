// ============================================================================
// PR · Cinematic Home Opening · Whole-word glyph sampling + spatial field
//
// The ROOT-CAUSE FIX replaced outline-only + strided index selection with a
// FILLED whole-word mask + deterministic spatial sampling. This suite freezes
// the new contract:
//   §A the deterministic no-canvas fallback produces an exact-count, whole-word
//      normalized field with every letter covered,
//   §B the browser raster sampler degrades to null without a canvas,
//   §C SILHOUETTE FIDELITY: every sampled point maps back onto an inked pixel
//      of the raster (a scatter / edge-only / strided field FAILS this),
//   §D per-letter coverage and vertical spread,
//   §E exact count + byte determinism.
//
// All canvas assertions run against a DETERMINISTIC fake 2D context whose ink
// rectangles are known exactly, so the pixels can be rebuilt and checked.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  OPENING_LETTERS,
  OPENING_SEED,
} from "@/components/home/cinematic/opening/opening.constants";
import {
  fallbackGlyphSample,
  sampleMaskEvenly,
  sampleWordmarkGlyphs,
} from "@/components/home/cinematic/opening/opening.glyph-sampler";
import type { OpeningGlyphSample } from "@/components/home/cinematic/opening/opening.types";

// ---------------------------------------------------------------------------
// Deterministic fake 2D raster (same model as the real glyf readouts): each
// letter paints an exact ink rectangle from 0.7·F above the baseline to 0.2·F
// below it. The drawn glyphs are exposed so the test can rebuild the mask.
// ---------------------------------------------------------------------------

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
const BASE_FONT_PX = 50;
const FAKE_FONT = `700 ${BASE_FONT_PX}px Cormorant Garamond`;
const SPACING_PX = 10;

interface DrawnGlyph {
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
}

interface FakeRaster {
  readonly makeCanvas: () => HTMLCanvasElement;
  readonly drawn: DrawnGlyph[];
  readonly canvas: { width: number; height: number };
  readonly fontPx: () => number;
  /** Font shorthand observed at each fillText, in call order. */
  readonly fontsAtFill: readonly string[];
  /** How many times a width/height assignment reset the context. */
  readonly resetCount: () => number;
}

/** Browser default 2D context font; assigning canvas.width/height restores it. */
const CANVAS_DEFAULT_FONT = "10px sans-serif";

function makeFakeRaster(): FakeRaster {
  const drawn: DrawnGlyph[] = [];
  const fontsAtFill: string[] = [];
  const canvas = { width: 0, height: 0 };
  let fontShorthand = "";
  let fontPx = 100;
  let resetCount = 0;
  const ctx = {
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
    globalAlpha: 1,
    measureText(text: string) {
      let width = 0;
      for (const ch of text) width += (BASE_WIDTHS[ch] ?? 0.6) * fontPx;
      return {
        width,
        actualBoundingBoxAscent: ASCENT_EM * fontPx,
        actualBoundingBoxDescent: DESCENT_EM * fontPx,
      };
    },
    clearRect(): void {},
    fillText(text: string, x: number, y: number): void {
      drawn.push({ text, x, baseline: y });
      fontsAtFill.push(fontShorthand);
    },
    getImageData(_x: number, _y: number, w: number, h: number): ImageData {
      const data = new Uint8ClampedArray(w * h * 4);
      for (const glyph of drawn) {
        const inkW = Math.round((BASE_WIDTHS[glyph.text] ?? 0.6) * fontPx);
        const x0 = Math.round(glyph.x);
        const yTop = Math.round(glyph.baseline - CAP_EM * fontPx);
        const yBottom = Math.round(glyph.baseline + DESCENT_EM * fontPx);
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
    },
  };
  Object.defineProperty(ctx, "font", {
    get: () => fontShorthand,
    set: (value: string) => {
      fontShorthand = value;
      const match = /(\d+(?:\.\d+)?)px/.exec(value);
      if (match) fontPx = parseFloat(match[1]!);
    },
  });
  // SPEC: assigning canvas.width / canvas.height resets the 2D rendering context
  // to browser defaults. Without this the suite is falsely green — it cannot see
  // the production bug where the font is set, the canvas is resized and the
  // glyphs then paint with the default 10px font.
  const applyBrowserReset = (): void => {
    resetCount += 1;
    ctx.font = CANVAS_DEFAULT_FONT;
    ctx.fillStyle = "#000";
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
  };
  const canvasEl = {
    getContext: (kind: string) =>
      kind === "2d" ? (ctx as unknown as CanvasRenderingContext2D) : null,
    get width() {
      return canvas.width;
    },
    set width(value: number) {
      canvas.width = value;
      applyBrowserReset();
    },
    get height() {
      return canvas.height;
    },
    set height(value: number) {
      canvas.height = value;
      applyBrowserReset();
    },
  } as unknown as HTMLCanvasElement;
  return {
    makeCanvas: () => canvasEl,
    drawn,
    canvas,
    fontPx: () => fontPx,
    fontsAtFill,
    resetCount: () => resetCount,
  };
}

/** Rebuild the exact filled mask the sampler saw from the drawn glyph rects. */
function rebuildMask(raster: FakeRaster): Uint8Array {
  const w = raster.canvas.width;
  const h = raster.canvas.height;
  const mask = new Uint8Array(w * h);
  const f = raster.fontPx();
  for (const glyph of raster.drawn) {
    const inkW = Math.round((BASE_WIDTHS[glyph.text] ?? 0.6) * f);
    const x0 = Math.round(glyph.x);
    const yTop = Math.round(glyph.baseline - CAP_EM * f);
    const yBottom = Math.round(glyph.baseline + DESCENT_EM * f);
    for (let py = yTop; py <= Math.min(yBottom, h - 1); py += 1) {
      if (py < 0) continue;
      const row = py * w;
      for (let px = x0; px <= Math.min(x0 + inkW, w - 1); px += 1) {
        if (px < 0) continue;
        mask[row + px] = 1;
      }
    }
  }
  return mask;
}

function hasInkNear(
  mask: Uint8Array,
  w: number,
  h: number,
  px: number,
  py: number,
): boolean {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const x = px + ox;
      const y = py + oy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (mask[y * w + x] === 1) return true;
    }
  }
  return false;
}

function everyPointInInk(
  sample: OpeningGlyphSample,
  mask: Uint8Array,
  w: number,
  h: number,
): boolean {
  const { word } = sample;
  const spanX = Math.max(1e-6, word.inkX1 - word.inkX0);
  const spanY = Math.max(1e-6, word.inkY1 - word.inkY0);
  for (const point of sample.points) {
    const px = Math.round(word.inkX0 + point.fx * spanX);
    const py = Math.round(word.inkY1 - point.fy * spanY);
    if (!hasInkNear(mask, w, h, px, py)) return false;
  }
  return true;
}

function sampleBrowser(count: number): {
  sample: OpeningGlyphSample;
  mask: Uint8Array;
  raster: FakeRaster;
} {
  const raster = makeFakeRaster();
  const sample = sampleWordmarkGlyphs({
    letters: [...OPENING_LETTERS],
    font: FAKE_FONT,
    letterSpacingPx: SPACING_PX,
    heightPx: BASE_FONT_PX,
    scale: 2,
    threshold: 40,
    count,
    makeCanvas: raster.makeCanvas,
  });
  expect(sample).not.toBeNull();
  const mask = rebuildMask(raster);
  return { sample: sample!, mask, raster };
}

describe("§A the fallback stencil is a deterministic INDAGO field", () => {
  const sample = fallbackGlyphSample(240);

  it("repeats byte-identically and returns exactly the requested count", () => {
    expect(fallbackGlyphSample(240)).toEqual(sample);
    expect(sample.points).toHaveLength(240);
    for (const count of [40, 160, 420]) {
      expect(fallbackGlyphSample(count).points).toHaveLength(count);
    }
  });

  it("normalizes every point against the WHOLE word (one point space)", () => {
    for (const point of sample.points) {
      expect(point.fx).toBeGreaterThanOrEqual(0);
      expect(point.fx).toBeLessThanOrEqual(1);
      expect(point.fy).toBeGreaterThanOrEqual(0);
      expect(point.fy).toBeLessThanOrEqual(1);
    }
  });

  it("carries all six letters in reading order with finite ranges", () => {
    expect(sample.word.letterRanges).toHaveLength(OPENING_LETTERS.length);
    expect(
      sample.word.letterRanges.map((r) => OPENING_LETTERS[r.letter]),
    ).toEqual([...OPENING_LETTERS]);
    for (let i = 1; i < sample.word.letterRanges.length; i += 1) {
      expect(sample.word.letterRanges[i]!.x0).toBeGreaterThan(
        sample.word.letterRanges[i - 1]!.x0,
      );
    }
  });

  it("covers every letter (no dead letters)", () => {
    const perLetter = new Map<number, number>();
    for (const point of sample.points) {
      perLetter.set(point.letter, (perLetter.get(point.letter) ?? 0) + 1);
    }
    for (let i = 0; i < OPENING_LETTERS.length; i += 1) {
      expect(perLetter.get(i) ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("§B the browser raster sampler degrades to null without a canvas", () => {
  const opts = {
    letters: OPENING_LETTERS,
    font: "700 120px serif",
    letterSpacingPx: 2,
    heightPx: 120,
    scale: 2,
    threshold: 128,
    count: 120,
  };

  it("returns null when the platform cannot rasterize (SSR / jsdom)", () => {
    expect(
      sampleWordmarkGlyphs({
        ...opts,
        makeCanvas: () => null as unknown as HTMLCanvasElement,
      }),
    ).toBeNull();
    const contextless = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(sampleWordmarkGlyphs({ ...opts, makeCanvas: () => contextless })).toBeNull();
  });
});

describe("§C SILHOUETTE FIDELITY: sampled points trace the filled glyphs", () => {
  it("every sampled point maps back onto an inked raster pixel", () => {
    const { sample, mask, raster } = sampleBrowser(240);
    expect(
      everyPointInInk(sample, mask, raster.canvas.width, raster.canvas.height),
    ).toBe(true);
  });

  it("rejects a non-glyph point set (the old scatter would fail this)", () => {
    const { sample, mask, raster } = sampleBrowser(240);
    const flatScatter: OpeningGlyphSample = {
      word: sample.word,
      points: sample.points.map((p, i) => ({
        letter: p.letter,
        fx: (i * 0.37) % 1,
        fy: (i * 0.61) % 1,
      })),
    };
    expect(
      everyPointInInk(
        flatScatter,
        mask,
        raster.canvas.width,
        raster.canvas.height,
      ),
    ).toBe(false);
  });

  it("keeps interpolated neighbours spread, not strided down one diagonal", () => {
    const { sample } = sampleBrowser(240);
    // A sorted-then-strided field collapsed onto a thin band; the spatial
    // sampler must fill the word's vertical extent (cap top to baseline).
    const ys = sample.points.map((p) => p.fy);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(maxY - minY).toBeGreaterThan(0.5);
    const xs = sample.points.map((p) => p.fx);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8);
  });
});

describe("§D per-letter coverage and vertical spread", () => {
  it("distributes the field across all six letters with a real quota", () => {
    const { sample } = sampleBrowser(300);
    const perLetter = new Array(OPENING_LETTERS.length).fill(0);
    for (const point of sample.points) perLetter[point.letter] += 1;
    const total = sample.points.length;
    for (let i = 0; i < OPENING_LETTERS.length; i += 1) {
      expect(perLetter[i]).toBeGreaterThanOrEqual(Math.floor(total * 0.03));
    }
  });

  it("samples the whole mask evenly (grid occupancy is not degenerate)", () => {
    // Direct contract check on the spatial sampler: a full rectangle must be
    // covered in every grid cell for a reasonable count.
    const w = 64;
    const h = 32;
    const mask = new Uint8Array(w * h).fill(1);
    const pts = sampleMaskEvenly(mask, w, h, 128, OPENING_SEED);
    expect(pts).toHaveLength(128);
    const cols = new Set(pts.map((p) => Math.floor(p.x / (w / 4))));
    const rows = new Set(pts.map((p) => Math.floor(p.y / (h / 4))));
    expect(cols.size).toBe(4);
    expect(rows.size).toBe(4);
  });
});

describe("§E the browser field is exact and byte-deterministic", () => {
  it("returns exactly the requested count", () => {
    for (const count of [60, 240, 420]) {
      expect(sampleBrowser(count).sample.points).toHaveLength(count);
    }
  });

  it("same options → identical field", () => {
    const a = sampleBrowser(200).sample;
    const b = sampleBrowser(200).sample;
    expect(a).toEqual(b);
  });

  it("tags every point with a valid reading-order letter", () => {
    const { sample } = sampleBrowser(240);
    for (const point of sample.points) {
      expect(point.letter).toBeGreaterThanOrEqual(0);
      expect(point.letter).toBeLessThan(OPENING_LETTERS.length);
    }
  });
});

// ---------------------------------------------------------------------------
// §F BROWSER REGRESSION: assigning canvas.width/height resets the 2D context.
// The old implementation set ctx.font, resized the canvas, then called
// fillText — so the real browser painted with the default 10px font and the
// field collapsed to baseline dots. The fake context above now emulates that
// reset, and these assertions fail if the rasterizer stops re-establishing the
// intended font/state after the resize.
// ---------------------------------------------------------------------------

const SCALED_FONT_PX = BASE_FONT_PX * 2; // heightPx (50) × scale (2)

describe("§F canvas resize must not lose the intended drawing state", () => {
  it("emulates the browser reset when the bitmap dimensions are assigned", () => {
    const raster = makeFakeRaster();
    const canvas = raster.makeCanvas();
    canvas.getContext("2d");
    // Sanity: the double must actually reset, or the suite is falsely green.
    expect(raster.resetCount()).toBe(0);
    canvas.width = 100;
    expect(raster.resetCount()).toBe(1);
    canvas.height = 200;
    expect(raster.resetCount()).toBe(2);
  });

  it("re-establishes the intended font BEFORE every fillText", () => {
    const { raster } = sampleBrowser(240);
    expect(raster.resetCount()).toBeGreaterThanOrEqual(2);
    expect(raster.fontsAtFill).toHaveLength(OPENING_LETTERS.length);
    for (const font of raster.fontsAtFill) {
      expect(font).not.toBe(CANVAS_DEFAULT_FONT);
      expect(font).toContain("Cormorant Garamond");
      const px = /(\d+(?:\.\d+)?)px/.exec(font);
      expect(px).not.toBeNull();
      expect(parseFloat(px![1]!)).toBeCloseTo(SCALED_FONT_PX, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// §G METRIC CONSISTENCY: the raster ink must scale with the intended font, not
// collapse to the ~10px default. The live failure was ≈10/727; this fake lands
// near 0.9. Thresholds are deliberately loose to catch a fallback font, not to
// pin exact pixels.
// ---------------------------------------------------------------------------

describe("§G raster ink scales with the intended font", () => {
  it("ink height / scaledFontPx is well above the default-font failure", () => {
    const { sample } = sampleBrowser(240);
    const { word } = sample;
    const inkHeight = word.inkY1 - word.inkY0;
    expect(word.scaledFontPx).toBeCloseTo(SCALED_FONT_PX, 5);
    const ratio = inkHeight / word.scaledFontPx;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeGreaterThan(10 / 727);
  });
});

// ---------------------------------------------------------------------------
// §H SPREAD: normalized X/Y extents must describe the whole word, rejecting the
// collapsed baseline-row (tiny fy band) and single-column failures. Tuned to the
// fake raster and intentionally not exact-pixel brittle.
// ---------------------------------------------------------------------------

describe("§H normalized whole-word spread", () => {
  it("vertical spread (maxFy − minFy) is not a collapsed baseline row", () => {
    const { sample } = sampleBrowser(240);
    const ys = sample.points.map((p) => p.fy);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
  });

  it("horizontal spread (maxFx − minFx) spans the full word width", () => {
    const { sample } = sampleBrowser(240);
    const xs = sample.points.map((p) => p.fx);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8);
  });
});
