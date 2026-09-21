// ============================================================================
// PR — INDAGO Cinematic Home Opening · Wordmark layout (whole-word)
//
// The particles are mapped with ONE affine transform from the WORD-INK point
// space into the live H1's layout box — never per letter. The sampler already
// normalized every point against the whole word's ink bounds, so the mapper
// only has to place that ink box inside the H1 line box:
//
//   x: the raster advance maps to the H1's layout width (offsetWidth is
//      transform-immune; letter-spacing is baked into both), so the ink box
//      lands where the browser painted it.
//   y: the alphabetic baseline inside a line-height:1 box sits at
//      (1 + ascent − descent) / 2 of the em; the raster drew off the SAME
//      baseline, so reading the ink band off it reproduces cap-top/baseline.
//
// decomposeBlend keeps the dissolve math shared with the tests.
// ============================================================================

import { mulberry32 } from "./opening.layout";
import {
  OPENING_CLASS_ALPHA,
  OPENING_CLASS_SIZE,
  OPENING_NODE_SIZE_JITTER,
  OPENING_SEED,
} from "./opening.constants";
import type {
  OpeningGlyphSample,
  OpeningLetterBox,
  OpeningNodeDefinition,
  OpeningWordmarkLayout,
  OpeningWordmarkMeasurement,
} from "./opening.types";

export interface OpeningWordmarkBuildInput {
  readonly nodes: readonly OpeningNodeDefinition[];
  /** The whole-word sample; its points define the particle field size. */
  readonly sample: OpeningGlyphSample;
  readonly measurement: OpeningWordmarkMeasurement;
  /** Calibration-only uniform scale about the word centre (1 = shipped). */
  readonly wordScale?: number;
}

/** Straight lerp (as-read) or seeded sin-lift dissolve between two positions. */
export function decomposeBlend(
  gx: number,
  gy: number,
  ox: number,
  oy: number,
  t: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const lift = Math.sin(Math.PI * t);
  return {
    x: gx + ((ox + cx * lift) - gx) * t,
    y: gy + ((oy + cy * lift) - gy) * t,
  };
}

/**
 * Compose the frozen world layout: the whole-word glyph anchor for every
 * particle, plus its reveal stagger + seeded curve. Byte-deterministic given
 * the same inputs (tests freeze it).
 */
export function buildOpeningWordmarkLayout(
  input: OpeningWordmarkBuildInput,
): OpeningWordmarkLayout {
  const { nodes, sample, measurement } = input;
  const wordScale = Number.isFinite(input.wordScale) ? input.wordScale! : 1;
  const pxToWorld = measurement.pxToWorld;
  const widthWorld = measurement.widthPx * pxToWorld;
  const heightWorld = measurement.heightPx * pxToWorld;
  const { word } = sample;
  const points = sample.points;
  const count = points.length;

  // --- ONE whole-word DOM mapping (raster word → H1 layout box) -------------
  const advanceScale = measurement.widthPx / Math.max(1e-6, word.totalAdvance);
  const inkLeftDom = (word.inkX0 - word.pad) * advanceScale;
  const inkRightDom = (word.inkX1 - word.pad) * advanceScale;
  const inkWidthDom = Math.max(1e-6, inkRightDom - inkLeftDom);
  const baselineFrac = (1 + word.ascentEm - word.descentEm) / 2;
  const baselineDom = baselineFrac * measurement.heightPx;
  const vScale = measurement.heightPx / Math.max(1e-6, word.scaledFontPx);
  const inkTopDom = baselineDom - (word.baselineY - word.inkY0) * vScale;
  const inkBottomDom = baselineDom + (word.inkY1 - word.baselineY) * vScale;
  const inkHeightDom = Math.max(1e-6, inkBottomDom - inkTopDom);

  const glyphX = new Float32Array(count);
  const glyphY = new Float32Array(count);
  const letter = new Uint8Array(count);
  const size = new Float32Array(count);
  const classAlpha = new Float32Array(count);
  const bound = new Uint8Array(count);
  const start = new Float32Array(count);
  const curveX = new Float32Array(count);
  const curveY = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const point = points[i] ?? { letter: 0, fx: 0.5, fy: 0.5 };
    const xDom = inkLeftDom + point.fx * inkWidthDom;
    const yDom = inkTopDom + (1 - point.fy) * inkHeightDom;
    glyphX[i] = (xDom - measurement.widthPx / 2) * pxToWorld * wordScale;
    glyphY[i] = (measurement.heightPx / 2 - yDom) * pxToWorld * wordScale;
    letter[i] = point.letter;

    const node = nodes[i];
    if (node) {
      start[i] = node.decomposeStart;
      size[i] = node.size;
      classAlpha[i] = OPENING_CLASS_ALPHA[node.class];
      bound[i] = 1;
    } else {
      // Glyph-only dust: deterministic motion identity for particles that do
      // NOT become graph nodes (they fade as the network takes over).
      const dust = mulberry32(OPENING_SEED ^ Math.imul(i + 1, 0x9e3779b1));
      start[i] = 0.25 + dust() * 0.7;
      size[i] =
        OPENING_CLASS_SIZE.peripheral *
        (1 + (dust() * 2 - 1) * OPENING_NODE_SIZE_JITTER);
      classAlpha[i] = OPENING_CLASS_ALPHA.peripheral;
      bound[i] = 0;
    }

    const seed = Math.imul(i + 1, 0x9e3779b1) ^ 0x7c2b1a09;
    const random = mulberry32(seed);
    curveX[i] = random() * 2 - 1;
    curveY[i] = random() * 2 - 1;
  }

  return {
    glyphX,
    glyphY,
    letter,
    size,
    classAlpha,
    bound,
    start,
    curveX,
    curveY,
    word,
    measurement,
    bounds: {
      left: -widthWorld / 2,
      right: widthWorld / 2,
      top: heightWorld / 2,
      bottom: -heightWorld / 2,
    },
  };
}

/** Transform-immune measurement of the CSS wordmark element. */
export function measureWordmarkElement(
  el: Element,
): { widthPx: number; heightPx: number } | null {
  if (typeof (el as HTMLElement).offsetWidth !== "number") return null;
  return {
    widthPx: (el as HTMLElement).offsetWidth,
    heightPx: (el as HTMLElement).offsetHeight,
  };
}

/**
 * Live per-letter boxes (H1-relative px), read from the rendered `<span
 * data-letter>` elements. offsetLeft/Top/Width/Height are transform-immune, so
 * the translate/scale CSS transform on the H1 never pollutes them. Used ONLY by
 * the dev overlay's 50%-layer alignment readout — the particle mapping itself
 * is whole-word.
 */
export function measureWordmarkLetterBoxes(
  el: Element | null,
): OpeningLetterBox[] | null {
  if (!(el instanceof Element)) return null;
  const spans = el.querySelectorAll("[data-letter]");
  const boxes: OpeningLetterBox[] = [];
  for (const span of spans) {
    if (!(span instanceof HTMLElement)) return null;
    boxes.push({
      left: span.offsetLeft,
      top: span.offsetTop,
      width: span.offsetWidth,
      height: span.offsetHeight,
    });
  }
  if (boxes.length === 0) return null;
  return boxes;
}

/**
 * Compose the world measurement for the sampled wordmark: the px box of the
 * element (SSR/tests feed a synthetic one) converted through the px→world
 * ratio. `letterBoxes` are optional and debug-only.
 */
export function openingWordmarkMeasurement(
  element: { widthPx: number; heightPx: number },
  pxToWorld: number,
  letterBoxes?: readonly OpeningLetterBox[] | null,
): OpeningWordmarkMeasurement {
  return {
    widthPx: Math.max(1, element.widthPx),
    heightPx: Math.max(1, element.heightPx),
    pxToWorld,
    letterBoxes: letterBoxes ?? undefined,
  };
}

/**
 * The CSS font shorthand used for OFFSCREEN sampling must match the DOM
 * exactly enough that the advances reflect the visible H1. Reads the computed
 * style from the live element, or returns the fallback elsewhere.
 */
export function readWordmarkFontStyle(el: Element | null, fallback: string): string {
  if (!el || typeof getComputedStyle === "undefined") return fallback;
  const style = getComputedStyle(el);
  const family = style.fontFamily || "sans-serif";
  const weight = style.fontWeight || "600";
  const styleVariant = style.fontStyle || "normal";
  const size = style.fontSize || "1px";
  return `${styleVariant} ${weight} ${size} ${family}`;
}
