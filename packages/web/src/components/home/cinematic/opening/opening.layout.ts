// ============================================================================
// PR — INDAGO Cinematic Home Opening · Seeded layout
//
// A deterministic seeded force layout for the organic constellation. Replaces
// the old graph config/layout pair with one pure, browser-free module: a
// mulberry32 PRNG plus a compressed spring/repulsion relaxer that lands any
// node set in the same ±(1 − margin) box every time. Tests can freeze the
// byte-identical arrays without a browser.
// ============================================================================

import {
  OPENING_LAYOUT_FIT_MARGIN,
  OPENING_LAYOUT_TICKS,
} from "./opening.constants";
import type { OpeningGraphBounds } from "./opening.types";

/** Deterministic 32-bit mulberry32 PRNG (same contract as the graph module). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OpeningLayoutResult {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly bounds: OpeningGraphBounds;
}

export interface OpeningEdgePair {
  readonly s: number;
  readonly t: number;
}

function lerpBounds(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  scaleX: number,
  scaleY: number,
): OpeningGraphBounds {
  return {
    left: minX * scaleX,
    right: maxX * scaleX,
    top: maxY * scaleY,
    bottom: minY * scaleY,
  };
}

/**
 * Spring/repulsion relaxer. Nodes start on a seeded unit disc, then repel
 * (proportional to their combined size — big nodes push harder) and pull along
 * their edges toward a rest length tied to the same sizes. The cooling damp
 * drops to ~0.18 across OPENING_LAYOUT_TICKS so the cloud settles instead of
 * orbiting. Finally the whole set is MASS-CENTRED (its arithmetic mean lands on
 * the origin — the relaxer alone often strands the bulk of the network in ONE
 * quadrant, e.g. ~80% bottom-right on the high tier, so extent-centring alone
 * leaves a lopsided graph) and scaled axis-by-axis into `±(1 − fitMargin)`
 * keeping aspect — the dense core the eye reads as "the graph" sits exactly on
 * the viewport centre.
 */
export function layoutOpeningGraph(
  count: number,
  edgePairs: readonly OpeningEdgePair[],
  sizes: readonly number[],
  seed: number,
  fitMargin: number = OPENING_LAYOUT_FIT_MARGIN,
): OpeningLayoutResult {
  const random = mulberry32(seed);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random());
    x[i] = Math.cos(angle) * r;
    y[i] = Math.sin(angle) * r;
  }

  const sizeAt = (i: number): number => sizes[i] ?? 0.04;

  for (let step = 0; step < OPENING_LAYOUT_TICKS; step += 1) {
    const damp = 1 - (step / OPENING_LAYOUT_TICKS) * 0.82;

    for (const e of edgePairs) {
      if (e.s >= count || e.t >= count) continue;
      const dx = x[e.t]! - x[e.s]!;
      const dy = y[e.t]! - y[e.s]!;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const rest = (sizeAt(e.s) + sizeAt(e.t)) * 12 + 0.16;
      const f = 0.016 * (dist - rest);
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      vx[e.s] = (vx[e.s] ?? 0) + fx;
      vy[e.s] = (vy[e.s] ?? 0) + fy;
      vx[e.t] = (vx[e.t] ?? 0) - fx;
      vy[e.t] = (vy[e.t] ?? 0) - fy;
    }

    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = x[j]! - x[i]!;
        const dy = y[j]! - y[i]!;
        const d2 = Math.max(dx * dx + dy * dy, 1e-6);
        const dist = Math.sqrt(d2);
        const s = (sizeAt(i) + sizeAt(j)) * 9;
        const f = (0.02 * s) / d2 / Math.max(0.35, dist);
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        vx[i] = (vx[i] ?? 0) - fx;
        vy[i] = (vy[i] ?? 0) - fy;
        vx[j] = (vx[j] ?? 0) + fx;
        vy[j] = (vy[j] ?? 0) + fy;
      }
    }

    for (let i = 0; i < count; i += 1) {
      vx[i] = (vx[i] ?? 0) - 0.012 * x[i]!;
      vy[i] = (vy[i] ?? 0) - 0.012 * y[i]!;
      vx[i] = (vx[i] ?? 0) * damp;
      vy[i] = (vy[i] ?? 0) * damp;
      x[i] = (x[i] ?? 0) + (vx[i] ?? 0);
      y[i] = (y[i] ?? 0) + (vy[i] ?? 0);
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < count; i += 1) {
    minX = Math.min(minX, x[i]!);
    maxX = Math.max(maxX, x[i]!);
    minY = Math.min(minY, y[i]!);
    maxY = Math.max(maxY, y[i]!);
    meanX += x[i]!;
    meanY += y[i]!;
  }
  meanX /= count;
  meanY /= count;
  // The relaxed cloud CAN settle far from the origin (the spring/repulsion
  // balance drifts the whole mass into a corner), so a centred bounding box
  // alone still leaves the graph reading bottom-right. Shift the MASS to the
  // origin — the standard deviation around the mean is untouched, only the
  // location moves — then scale each axis into ±(1 − fitMargin) from its own
  // extremes. The final box may be mildly asymmetric; that is correct: the
  // dense core, not the whole box, is what must sit on the viewport centre.
  const half = Math.max(0.05, 1 - fitMargin);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scaleX = (2 * half) / spanX;
  const scaleY = (2 * half) / spanY;

  for (let i = 0; i < count; i += 1) {
    x[i] = (x[i]! - meanX) * scaleX;
    y[i] = (y[i]! - meanY) * scaleY;
  }

  return {
    x,
    y,
    bounds: lerpBounds(
      minX - meanX,
      maxX - meanX,
      minY - meanY,
      maxY - meanY,
      scaleX,
      scaleY,
    ),
  };
}