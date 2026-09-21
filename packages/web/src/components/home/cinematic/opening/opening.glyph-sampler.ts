// ============================================================================
// PR — INDAGO Cinematic Home Opening · Glyph sampler (whole-word)
//
// ROOT-CAUSE FIX: the previous sampler kept only the glyph OUTLINE pixels and
// then picked a budget with a strided index scan over a pool sorted by
// (fy, fx). A stride over a sorted pool is not a spatial distribution — it
// aliases into diagonal stripes, so the field was already wrong BEFORE any
// world mapping or GPU projection. This module replaces it with the verified
// pipeline:
//
//   1. rasterize the WHOLE word ONCE (same font the DOM H1 paints with),
//   2. keep the FILLED mask (every inked pixel, not just the edge),
//   3. sample that mask SPATIALLY and deterministically — a coarse occupancy
//      grid tuned to the requested count, then seeded farthest-point selection
//      so a subset stays evenly spread across the silhouette,
//   4. normalize every point against the WHOLE WORD ink box (one point space).
//
// When a canvas is unavailable (SSR / jsdom / tests) the deterministic
// skeleton stencil is stamped into the same kind of mask and run through the
// SAME spatial sampler, so both paths are byte-stable and share one contract.
// ============================================================================

import { OPENING_LETTERS, OPENING_SEED } from "./opening.constants";
import { mulberry32 } from "./opening.layout";
import type {
  OpeningGlyphPoint,
  OpeningGlyphSample,
  OpeningLetterRange,
  OpeningWordmarkRaster,
} from "./opening.types";

export interface OpeningSampleOptions {
  readonly letters: readonly string[];
  /** Full CSS font shorthand (family + weight + style), size included. */
  readonly font: string;
  readonly letterSpacingPx: number;
  /** Raster height in px (before sampling scale). */
  readonly heightPx: number;
  /** Sampling upscale. */
  readonly scale: number;
  /** Alpha threshold (0–255) above which a pixel counts as glyph. */
  readonly threshold: number;
  /** How many particles to sample from the filled mask. */
  readonly count: number;
  /** Optional canvas factory (test seam; defaults to document). */
  readonly makeCanvas?: () => HTMLCanvasElement;
}

interface Pixel {
  readonly x: number;
  readonly y: number;
}

const BOX_H = 20;
const FALLBACK_MASK_W = 160;
const FALLBACK_MASK_H = 44;

/** Per-letter abstract skeleton strokes in a BOX_H-wide, 0–18 (y up) box. */
const FALLBACK_STROKES: ReadonlyArray<{
  readonly box: number;
  readonly lines: ReadonlyArray<readonly number[]>;
}> = [
  // I
  {
    box: 0,
    lines: [
      [7, 3, 7, 15],
      [4, 15, 10, 15],
      [4, 3, 10, 3],
    ],
  },
  // N
  {
    box: 1,
    lines: [
      [4, 3, 4, 15],
      [4, 3, 13, 15],
      [13, 3, 13, 15],
    ],
  },
  // D
  {
    box: 2,
    lines: [
      [4, 3, 4, 15],
      [4, 15, 8, 15],
      [8, 15, 12, 12, 12, 6, 8, 3, 4, 3],
    ],
  },
  // A
  {
    box: 3,
    lines: [
      [8, 3, 4, 15],
      [8, 3, 12, 15],
      [5.5, 10, 10.5, 10],
    ],
  },
  // G
  {
    box: 4,
    lines: [
      [3, 14, 10, 14, 10, 8, 5, 8],
      [3, 3, 10, 3],
      [3, 3, 3, 15],
    ],
  },
  // O
  {
    box: 5,
    lines: [
      [6, 15, 12, 12, 12, 6, 6, 3, 2, 6, 2, 12, 6, 15],
    ],
  },
];

// ---------------------------------------------------------------------------
// Deterministic SPATIAL sampling over a filled mask
// ---------------------------------------------------------------------------

/** One representative pixel per occupied cell, chosen with a seeded RNG so
 *  the field is organic but still deterministic. */
function collectCellReps(
  mask: Uint8Array,
  width: number,
  height: number,
  cell: number,
  seed: number,
): Pixel[] {
  const gw = Math.max(1, Math.ceil(width / cell));
  const gh = Math.max(1, Math.ceil(height / cell));
  const rng = mulberry32(seed ^ 0x51ed270b);
  const reps: Pixel[] = [];
  for (let gy = 0; gy < gh; gy += 1) {
    const y0 = Math.floor(gy * cell);
    const y1 = Math.min(height, Math.ceil((gy + 1) * cell));
    for (let gx = 0; gx < gw; gx += 1) {
      const x0 = Math.floor(gx * cell);
      const x1 = Math.min(width, Math.ceil((gx + 1) * cell));
      let count = 0;
      for (let py = y0; py < y1; py += 1) {
        const row = py * width;
        for (let px = x0; px < x1; px += 1) {
          if (mask[row + px] === 1) count += 1;
        }
      }
      if (count === 0) continue;
      const k = Math.floor(rng() * count);
      let seen = 0;
      for (let py = y0; py < y1 && seen <= k; py += 1) {
        const row = py * width;
        for (let px = x0; px < x1; px += 1) {
          if (mask[row + px] !== 1) continue;
          if (seen === k) {
            reps.push({ x: px, y: py });
            seen += 1;
            break;
          }
          seen += 1;
        }
      }
    }
  }
  return reps;
}

function collectAllInk(
  mask: Uint8Array,
  width: number,
  height: number,
): Pixel[] {
  const out: Pixel[] = [];
  for (let py = 0; py < height; py += 1) {
    const row = py * width;
    for (let px = 0; px < width; px += 1) {
      if (mask[row + px] === 1) out.push({ x: px, y: py });
    }
  }
  return out;
}

/** Deterministic farthest-point subset — keeps a chosen subset evenly spread
 *  across the candidate silhouette instead of clumping. */
function farthestPointSample(points: readonly Pixel[], count: number, seed: number): Pixel[] {
  const n = points.length;
  if (count >= n) return points.slice();
  const rng = mulberry32(seed ^ 0x2f1e3d4c);
  const chosen = new Array<number>(count);
  const dist = new Float64Array(n).fill(Infinity);
  const first = Math.floor(rng() * n);
  chosen[0] = first;
  for (let i = 0; i < n; i += 1) {
    const dx = points[i]!.x - points[first]!.x;
    const dy = points[i]!.y - points[first]!.y;
    dist[i] = dx * dx + dy * dy;
  }
  for (let k = 1; k < count; k += 1) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < n; i += 1) {
      if (dist[i]! > bestD) {
        bestD = dist[i]!;
        best = i;
      }
    }
    chosen[k] = best;
    const bx = points[best]!.x;
    const by = points[best]!.y;
    for (let i = 0; i < n; i += 1) {
      const dx = points[i]!.x - bx;
      const dy = points[i]!.y - by;
      const dd = dx * dx + dy * dy;
      if (dd < dist[i]!) dist[i] = dd;
    }
  }
  return chosen.map((i) => points[i]!);
}

/**
 * Sample exactly `count` pixels from a filled mask with even spatial coverage.
 * The occupancy cell size is shrunk until there are at least `count` occupied
 * cells, then a deterministic farthest-point pass picks the final subset.
 */
export function sampleMaskEvenly(
  mask: Uint8Array,
  width: number,
  height: number,
  count: number,
  seed: number,
): Pixel[] {
  if (count <= 0) return [];
  let cell = Math.max(0.5, Math.sqrt((width * height) / Math.max(1, count)));
  let reps = collectCellReps(mask, width, height, cell, seed);
  let guard = 0;
  while (reps.length < count && cell > 0.5 && guard < 80) {
    cell *= 0.82;
    reps = collectCellReps(mask, width, height, cell, seed);
    guard += 1;
  }
  if (reps.length >= count) {
    return farthestPointSample(reps, count, seed);
  }
  // Tiny mask: fewer occupied cells than requested. Pad from the raw ink
  // pixels (which are few by construction here) so the count is always exact.
  const all = collectAllInk(mask, width, height);
  if (all.length === 0) return [];
  const rng = mulberry32(seed ^ 0x6b2c9d13);
  const out = reps.slice();
  while (out.length < count) {
    out.push(all[Math.floor(rng() * all.length)]!);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic fallback stencil
// ---------------------------------------------------------------------------

/** Sample a polyline with `steps` seeded steps, stamping a small disc into the
 *  mask so the skeleton reads as a filled form, not a 1px thread. */
function walkPolyline(
  points: readonly number[],
  steps: number,
  random: () => number,
  mask: Uint8Array,
  width: number,
  height: number,
  originX: number,
  boxW: number,
): void {
  const segments: { len: number; from: number; to: number }[] = [];
  let total = 0;
  for (let i = 2; i < points.length; i += 2) {
    const len = Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!);
    segments.push({ len, from: i - 2, to: i });
    total += len;
  }
  if (total <= 0) return;
  const stamp = (x: number, y: number): void => {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const px = Math.round(x) + ox;
        const py = Math.round(y) + oy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        mask[py * width + px] = 1;
      }
    }
  };
  for (let s = 0; s < steps; s += 1) {
    const target = random() * total;
    let acc = 0;
    let picked = segments[segments.length - 1]!;
    for (const seg of segments) {
      acc += seg.len;
      if (target <= acc) {
        picked = seg;
        break;
      }
    }
    const t = picked.len === 0 ? 0 : random();
    const x = points[picked.from]! + (points[picked.to]! - points[picked.from]!) * t;
    const y = points[picked.from + 1]! + (points[picked.to + 1]! - points[picked.from + 1]!) * t;
    // x ∈ [0, BOX_H] across the letter form; y ∈ [0, 18] with y UP.
    const maskX = originX + (x / BOX_H) * boxW;
    const maskY = height - (y / 18) * height;
    stamp(maskX, maskY);
  }
}

/**
 * Deterministic abstract letterforms (a skeleton stencil per letter) so the
 * wordmark layout is byte-identical even where no canvas exists. The stencil is
 * stamped into a fill mask and sampled through the SAME spatial sampler as the
 * browser path, so the fallback trace also reads as a solid INDAGO.
 */
export function fallbackGlyphSample(count: number): OpeningGlyphSample {
  const mask = new Uint8Array(FALLBACK_MASK_W * FALLBACK_MASK_H);
  const rng = mulberry32(OPENING_SEED ^ 0x2f6e2b1d);
  const per = FALLBACK_MASK_W / OPENING_LETTERS.length;
  const boxW = per * 0.72;
  const letterRanges: OpeningLetterRange[] = [];

  for (const stroke of FALLBACK_STROKES) {
    const originX = stroke.box * per + (per - boxW) / 2;
    const line: number[] = [];
    for (const pt of stroke.lines) line.push(...pt);
    walkPolyline(line, 46, rng, mask, FALLBACK_MASK_W, FALLBACK_MASK_H, originX, boxW);
    letterRanges.push({ letter: stroke.box, x0: originX, x1: originX + boxW });
  }

  const pixels = sampleMaskEvenly(
    mask,
    FALLBACK_MASK_W,
    FALLBACK_MASK_H,
    count,
    OPENING_SEED,
  );
  const points: OpeningGlyphPoint[] = pixels.map((p) => ({
    letter: letterAt(p.x, letterRanges),
    fx: clamp01(p.x / FALLBACK_MASK_W),
    fy: clamp01((FALLBACK_MASK_H - p.y) / FALLBACK_MASK_H),
  }));

  const word: OpeningWordmarkRaster = {
    scaledFontPx: FALLBACK_MASK_H,
    pad: 0,
    baselineY: FALLBACK_MASK_H,
    totalAdvance: FALLBACK_MASK_W,
    inkX0: 0,
    inkX1: FALLBACK_MASK_W,
    inkY0: 0,
    inkY1: FALLBACK_MASK_H,
    ascentEm: 1,
    descentEm: 0,
    letterRanges,
  };
  return { points, word };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function letterAt(x: number, ranges: readonly OpeningLetterRange[]): number {
  for (const range of ranges) {
    if (x >= range.x0 && x < range.x1) return range.letter;
  }
  return ranges.length > 0 ? ranges[ranges.length - 1]!.letter : 0;
}

// ---------------------------------------------------------------------------
// Browser raster sampler
// ---------------------------------------------------------------------------

/** Pull the numeric font size out of a CSS font shorthand (0 when absent). */
function parseFontSizePx(font: string): number {
  const match = /(?:^|\s)(\d+(?:\.\d+)?)px(?=$|\s)/.exec(font);
  return match ? parseFloat(match[1]!) : 0;
}

/** Rescale ONLY the px size token of a CSS font shorthand, keeping family.
 *  The `(?:^|\s)` prefix is part of the MATCH, so the replacing string must
 *  re-emit that leading whitespace — dropping it produced an invalid shorthand
 *  ("700100px Cormorant") which browsers refuse, silently falling back to a
 *  system face and rasterizing the wrong glyphs. */
function scaleFontShorthand(font: string, scale: number): string {
  return font.replace(
    /(?:^|\s)(\d+(?:\.\d+)?)px(?=$|\s)/,
    (match, pixels: string) => {
      const scaled = parseFloat(pixels) * scale;
      const lead = match.slice(0, match.indexOf(pixels));
      return `${lead}${Number(scaled.toFixed(2)).toString()}px`;
    },
  );
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rasterInkBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): { x0: number; x1: number; y0: number; y1: number } | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let py = 0; py < height; py += 1) {
    const row = py * width;
    for (let px = 0; px < width; px += 1) {
      if (mask[row + px] !== 1) continue;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, x1, y0, y1 };
}

/**
 * Rasterize the whole wordmark with a real 2D canvas, keep the FILLED mask and
 * return `count` spatially sampled points normalized against the whole word's
 * ink box. Requires measureText + fillText + getImageData; returns null where
 * the canvas is unavailable (SSR / jsdom / tests drop to the fallback).
 */
export function sampleWordmarkGlyphs(
  options: OpeningSampleOptions,
): OpeningGlyphSample | null {
  const makeCanvas = options.makeCanvas;
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = makeCanvas
      ? makeCanvas()
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
  } catch {
    return null;
  }
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (typeof ctx.measureText !== "function") return null;
  if (typeof ctx.fillText !== "function") return null;
  if (typeof ctx.getImageData !== "function") return null;

  const letters = options.letters.length > 0 ? options.letters : OPENING_LETTERS;
  const fontPx = parseFontSizePx(options.font);
  const targetH = Math.max(8, options.heightPx * options.scale);
  const scale = fontPx > 0 ? targetH / fontPx : 1;
  const rasterFont =
    scale === 1 ? options.font : scaleFontShorthand(options.font, scale);
  // Font is set here ONLY so measureText below can size the canvas. It does not
  // survive the resize, so it is re-applied after the bitmap dimensions are set.
  ctx.font = rasterFont;
  const scaledFontPx = fontPx * scale;

  const advance: number[] = [];
  let total = 0;
  for (const letter of letters) {
    const inkWidth = ctx.measureText(letter).width;
    // Letter-spacing comes from the DOM in UNSCALED CSS px; the glyph advance
    // above is measured at the upscaled font, so the gap must be upscaled with
    // it (letter-spacing * scale) or the inter-letter gaps shrink relative to
    // the strokes and the raster reassigns neighbouring glyph pixels.
    const width = inkWidth + options.letterSpacingPx * scale;
    advance.push(width);
    total += width;
  }
  if (!(total > 0) || letters.length === 0) return null;

  const probe = ctx.measureText(letters.join(""));
  const probeAscent = (probe as { actualBoundingBoxAscent?: unknown })
    .actualBoundingBoxAscent;
  const probeDescent = (probe as { actualBoundingBoxDescent?: unknown })
    .actualBoundingBoxDescent;
  const ascent =
    typeof probeAscent === "number" ? probeAscent : scaledFontPx * 0.78;
  const descent =
    typeof probeDescent === "number" ? probeDescent : scaledFontPx * 0.2;

  const pad = 8;
  const width = Math.max(1, Math.ceil(total)) + pad * 2;
  const height = Math.max(1, Math.ceil(ascent + descent)) + pad * 2;
  // Assigning canvas.width / canvas.height RESETS the 2D rendering context to
  // its defaults (font → "10px sans-serif", fillStyle → "#000", textAlign →
  // "start", etc.). Every drawing-state property this rasterizer relies on MUST
  // therefore be re-established AFTER the resize and immediately before
  // fillText, or the glyphs paint with the default font (baseline dots).
  canvas.width = width;
  canvas.height = height;
  if (typeof ctx.clearRect === "function") ctx.clearRect(0, 0, width, height);
  ctx.font = rasterFont;
  ctx.fillStyle = "#000";
  ctx.textAlign = "left";
  // textBaseline "alphabetic": the raster uses the SAME reference the browser
  // uses to place glyphs inside a span — the alphabetic baseline. The baseline
  // row is pinned `ascent` below the canvas top, and the whole-word mapper
  // rebuilds that baseline inside the H1's line box from the font's
  // ascent/descent (line-height 1).
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
  const baselineY = pad + ascent;

  const starts: number[] = [];
  let cursor = pad;
  for (let i = 0; i < letters.length; i += 1) {
    starts.push(cursor);
    ctx.fillText(letters[i]!, cursor, baselineY);
    cursor += advance[i]!;
  }

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const mask = new Uint8Array(width * height);
  for (let py = 0; py < height; py += 1) {
    const row = py * width;
    for (let px = 0; px < width; px += 1) {
      if (data[(row + px) * 4 + 3]! > options.threshold) mask[row + px] = 1;
    }
  }

  const bounds = rasterInkBounds(mask, width, height);
  if (!bounds) return null;

  const letterRanges: OpeningLetterRange[] = letters.map((_letter, i) => ({
    letter: i,
    x0: starts[i]!,
    x1: starts[i]! + advance[i]!,
  }));

  const pixels = sampleMaskEvenly(mask, width, height, options.count, OPENING_SEED);
  if (pixels.length === 0) return null;
  const spanX = Math.max(1e-6, bounds.x1 - bounds.x0);
  const spanY = Math.max(1e-6, bounds.y1 - bounds.y0);
  const points: OpeningGlyphPoint[] = pixels.map((p) => ({
    letter: letterAt(p.x, letterRanges),
    fx: clamp01((p.x - bounds.x0) / spanX),
    fy: clamp01((bounds.y1 - p.y) / spanY),
  }));

  return {
    points,
    word: {
      scaledFontPx,
      pad,
      baselineY,
      totalAdvance: finiteOr(total, 1),
      inkX0: bounds.x0,
      inkX1: bounds.x1,
      inkY0: bounds.y0,
      inkY1: bounds.y1,
      ascentEm: scaledFontPx > 0 ? ascent / scaledFontPx : 0.78,
      descentEm: scaledFontPx > 0 ? descent / scaledFontPx : 0.2,
      letterRanges,
    },
  };
}
