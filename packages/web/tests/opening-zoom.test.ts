// ============================================================================
// PR — INDAGO Cinematic Home Opening · Graph zoom / depth model
//
// The pure dive model (opening.zoom.ts) is browser-free: these tests freeze
// identity outside the window, the eased ramp, the deterministic depth, the
// 1/distance scale math and the blend trajectory — so the shipped dive (with
// the production fallbacks) can never drift into bounce, NaN or offset.
// ============================================================================

import { describe, expect, it } from "vitest";
import { CINEMATIC_CALIBRATION_DEFAULTS } from "@/components/home/cinematic/cinematic.calibration";
import {
  openingGraphZoomDistance,
  openingGraphZoomFrame,
  openingGraphZoomParallax,
  openingGraphZoomScale,
  openingGraphZoomZOffset,
  openingNodeDepth,
} from "@/components/home/cinematic/opening/opening.zoom";
import { OPENING_GRAPH_ZOOM_WINDOW } from "@/components/home/cinematic/opening/opening.constants";

const CAL = CINEMATIC_CALIBRATION_DEFAULTS;
const START = OPENING_GRAPH_ZOOM_WINDOW.start;
const END = OPENING_GRAPH_ZOOM_WINDOW.end;

describe("graph zoom — the dive window", () => {
  it("is identity before the window starts (nothing moves before the dive)", () => {
    const frame = openingGraphZoomFrame(START - 0.05, CAL);
    expect(frame.active).toBe(false);
    expect(frame.q).toBe(0);
    expect(frame.ease).toBe(0);
    expect(frame.cameraZ).toBe(1);
    expect(frame.plane).toBe(1);
    expect(frame.foreground).toBe(1);
    expect(frame.background).toBe(1);
    expect(frame.nodeBlend).toBe(1);
    expect(frame.edgeBlend).toBe(1);
    expect(frame.labelBlend).toBe(1);
    // With cameraZ = 1 every node stays at distance 1 → scale 1, no parallax.
    expect(openingGraphZoomScale(frame, 0.7)).toBe(1);
    expect(openingGraphZoomScale(frame, 0.1)).toBe(1);
    expect(openingGraphZoomParallax(frame, 0.6)).toBe(1);
  });

  it("clamps at full ease by the window end and stays there beyond it", () => {
    for (const p of [END, END + 0.5]) {
      const frame = openingGraphZoomFrame(p, CAL);
      expect(frame.q).toBe(1);
      expect(frame.ease).toBe(1);
      expect(frame.cameraZ).toBe(CAL.graphCameraEndZ);
      expect(frame.plane).toBe(CAL.graphWorldScaleEnd);
      expect(frame.foreground).toBe(CAL.graphForegroundScale);
      expect(frame.background).toBe(CAL.graphBackgroundScale);
      expect(frame.nodeBlend).toBe(CAL.graphZoomOpacity);
      expect(frame.edgeBlend).toBe(CAL.graphZoomEdgeOpacity);
      expect(frame.labelBlend).toBe(CAL.graphZoomLabelOpacity);
    }
  });

  it("is monotone and bounceless across the whole ramp", () => {
    let prev = -1;
    for (let i = 0; i <= 40; i += 1) {
      const p = START + (END - START) * (i / 40);
      const ease = openingGraphZoomFrame(p, CAL).ease;
      expect(ease).toBeGreaterThanOrEqual(0);
      expect(ease).toBeLessThanOrEqual(1);
      expect(ease).toBeGreaterThanOrEqual(prev);
      prev = ease;
    }
  });

  it("matches the modelled easing math at the window midpoint", () => {
    const mid = (START + END) / 2;
    const frame = openingGraphZoomFrame(mid, CAL);
    // smoothstep(0,1,0.5) = 0.5, raised by the shipped ease power (1).
    expect(frame.q).toBeCloseTo(0.5, 6);
    expect(frame.ease).toBeCloseTo(0.5, 3);
    expect(frame.cameraZ).toBeCloseTo(
      1 + (CAL.graphCameraEndZ - 1) * 0.5,
      6,
    );
    expect(frame.allocation).toBeCloseTo(
      CAL.graphDepthStart + (CAL.graphDepthEnd - CAL.graphDepthStart) * 0.5,
      6,
    );
    expect(frame.plane).toBeCloseTo(
      CAL.graphWorldScaleStart +
        (CAL.graphWorldScaleEnd - CAL.graphWorldScaleStart) * 0.5,
      6,
    );
    expect(frame.edgeBlend).toBeCloseTo(
      1 + (CAL.graphZoomEdgeOpacity - 1) * 0.5,
      6,
    );
    expect(frame.labelBlend).toBeCloseTo(
      1 + (CAL.graphZoomLabelOpacity - 1) * 0.5,
      6,
    );
  });

  it("always returns finite, in-range values (NaN-proof production fallback)", () => {
    for (const p of [-1, 0, START, (START + END) / 2, END, 1.5]) {
      // No calibration → the shipping constants feed the model, never NaN.
      const frame = openingGraphZoomFrame(p);
      for (const [k, v] of Object.entries(frame)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `p=${p} ${k}`).toBe(true);
        }
      }
      expect(frame.cameraZ).toBeGreaterThanOrEqual(
        CAL.graphCameraEndZ - 1e-6,
      );
      expect(frame.cameraZ).toBeLessThanOrEqual(1 + 1e-6);
      expect(frame.plane).toBeGreaterThanOrEqual(
        CAL.graphWorldScaleStart - 1e-6,
      );
      expect(frame.ease).toBeGreaterThanOrEqual(0);
      expect(frame.ease).toBeLessThanOrEqual(1);
    }
  });
});

describe("graph zoom — deterministic node depth", () => {
  it("is stable: the same id + slot always yields the same depth", () => {
    expect(openingNodeDepth("n17", 0.3, -0.2)).toBe(
      openingNodeDepth("n17", 0.3, -0.2),
    );
    // Ids differ across the master set (almost surely).
    const a = openingNodeDepth("n0", 0, 0);
    const b = openingNodeDepth("n1", 0, 0);
    expect(a).not.toBe(b);
  });

  it("lives inside [0, 1] with a radial core bias (centre comes closer)", () => {
    for (let i = 0; i < 200; i += 1) {
      const nx = i / 100 - 1;
      const ny = i / 100 - 0.5;
      const d = openingNodeDepth(`n${i}`, nx, ny);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
    // Same id, same radial direction: the more central slot must be closer.
    expect(openingNodeDepth("n5", 0.02, 0.01)).toBeLessThan(
      openingNodeDepth("n5", 0.95, -0.9),
    );
    expect(openingNodeDepth("n5", -0.1, 0.0)).toBeLessThan(
      openingNodeDepth("n5", -0.9, 0.9),
    );
  });

  it("separates the front from the back band across the shipped bundle", () => {
    // The depth pool used by the scene: node ids within [0,1], mean ~0.5.
    const depths: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      depths.push(openingNodeDepth(`n${i}`, (i % 7) * 0.1 - 0.3, (i % 5) * 0.1));
    }
    const nonDegenerate = new Set(depths.map((d) => d.toFixed(3))).size;
    expect(nonDegenerate).toBeGreaterThan(20);
  });
});

describe("graph zoom — 1/distance scale, parallax, z offset", () => {
  const end = openingGraphZoomFrame(END, CAL);

  it("near nodes swell to 1/cameraZ × foreground, far nodes recede to background", () => {
    const near = openingGraphZoomScale(end, 0);
    const far = openingGraphZoomScale(end, 1);
    // near: (1/0.4) × the foreground bias 1.2 → 3.0×; far: 1 × 0.85.
    expect(near).toBeCloseTo(
      (1 / CAL.graphCameraEndZ) * CAL.graphForegroundScale,
      6,
    );
    expect(far).toBeCloseTo(CAL.graphBackgroundScale, 6);
    expect(near).toBeGreaterThan(1);
    expect(far).toBeLessThan(1);
    expect(near).toBeGreaterThan(far);
  });

  it("scale never explodes: the near plane distance is clamped away from 0", () => {
    for (let d = 0; d <= 1; d += 0.05) {
      const scale = openingGraphZoomScale(end, d);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeLessThan(1 / 0.25 + 0.001);
    }
  });

  it("parallax pushes near nodes further out and keeps the periphery fixed", () => {
    const near = openingGraphZoomParallax(end, 0);
    const far = openingGraphZoomParallax(end, 1);
    expect(near).toBeGreaterThan(1);
    // Depth 1 sits exactly at the far point (distance 1) → no displacement.
    expect(far).toBeCloseTo(1, 4);
    expect(near).toBeGreaterThan(far);
    // Parallax falls monotonically from near to far.
    let prev = near;
    for (let d = 0.1; d <= 1; d += 0.1) {
      const p = openingGraphZoomParallax(end, d);
      expect(p).toBeLessThanOrEqual(prev + 1e-6);
      prev = p;
    }
  });

  it("z offset pushes back nodes behind the near plane monotonically", () => {
    const far = openingGraphZoomZOffset(end, 1);
    const near = openingGraphZoomZOffset(end, 0);
    const mid = openingGraphZoomZOffset(end, 0.6);
    expect(far).toBeGreaterThan(near);
    expect(mid).toBeGreaterThan(near);
    expect(mid).toBeLessThan(far);
  });

  it("distance stays above the hard near-plane clamp", () => {
    for (let d = 0; d <= 1; d += 0.02) {
      expect(openingGraphZoomDistance(end, d)).toBeGreaterThanOrEqual(0.25);
    }
  });

  it("the dive keeps the framed world identical for a repeated query", () => {
    const a = openingGraphZoomFrame(0.97, CAL);
    const b = openingGraphZoomFrame(0.97, CAL);
    expect(a).toEqual(b);
  });
});

describe("graph zoom — reduced motion pins the identity frame", () => {
  it("progress 0 (reduced motion) yields the untouched resolved graph", () => {
    const frame = openingGraphZoomFrame(0, CAL);
    expect(frame.q).toBe(0);
    expect(frame.ease).toBe(0);
    expect(frame.plane).toBe(1);
    expect(frame.nodeBlend).toBe(1);
    expect(frame.edgeBlend).toBe(1);
    expect(frame.labelBlend).toBe(1);
    expect(openingGraphZoomScale(frame, 0.4)).toBe(1);
    expect(openingGraphZoomParallax(frame, 0.9)).toBe(1);
  });
});