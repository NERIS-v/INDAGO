// ============================================================================
// PR — INDAGO Cinematic Home Opening · Shipping timeline (the production bake)
//
// The public scroll evaluates the APPROVED calibration-lab timeline whenever no
// dev session is open (`openingSnapshotAt` with a null record, and the
// per-frame `shippingCalibrationAt` in the scene). These tests freeze that
// table: endpoint holds, the lerp between moments, and the production snapshot
// following the table instead of the pre-bake fallback constants. Passing an
// explicit `CINEMATIC_CALIBRATION_DEFAULTS` record still restores the old
// one-value baseline, which the progress/choreography suites keep covering.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  CINEMATIC_CALIBRATION_DEFAULTS,
  OPENING_SHIPPING_MOMENTS,
  shippingCalibrationAt,
} from "@/components/home/cinematic/cinematic.calibration";
import { openingSnapshotAt } from "@/components/home/cinematic/opening/opening.progress";

describe("shipping timeline — endpoint holds", () => {
  it("before the first moment the first approved frame holds (no invented baseline)", () => {
    const at = shippingCalibrationAt(0);
    expect(at.particleSize).toBe(1);
    expect(at.particleScaleMax).toBe(2.16);
    expect(at.releaseStart).toBe(0.63);
    expect(at.releaseEnd).toBe(0.84);
    expect(at.releaseSpread).toBe(1.6);
    expect(at.releaseCurl).toBe(0.35);
    expect(at.edgeStart).toBe(0.76);
    expect(at.edgeOpacity).toBe(0.22);
    expect(at.labelStart).toBe(0.93);
    expect(at.graphScale).toBe(1.3);
    expect(at.nodeScale).toBe(2.15);
    expect(at.cameraPushInStart).toBe(0.66);
  });

  it("at and after the final moment the approved final frame holds", () => {
    for (const p of [1, 1.5, 2]) {
      const at = shippingCalibrationAt(p);
      expect(at.graphScale).toBe(1.3);
      expect(at.nodeScale).toBe(2.15);
      expect(at.releaseSpread).toBe(1.6);
      expect(at.releaseCurl).toBe(0.35);
      expect(at.edgeOpacity).toBe(0.22);
      expect(at.edgeStart).toBe(0.76);
      expect(at.labelStart).toBe(0.93);
      expect(at.particleSize).toBe(4);
      expect(at.particleScaleMax).toBe(3);
      expect(at.particleOpacity).toBe(0.3);
      expect(at.brightness).toBe(0.73);
      expect(at.decomposeEnd).toBe(0.68);
      expect(at.graphZoomStart).toBe(0.912);
      expect(at.graphPerspective).toBe(1.92);
      expect(at.alignmentX).toBe(0);
      expect(at.alignmentY).toBe(0);
    }
  });

  it("the table is the seven approved moments, in ascending order", () => {
    expect(OPENING_SHIPPING_MOMENTS.map((m) => m.progress)).toEqual([
      0.722, 0.746, 0.795, 0.868, 0.917, 0.965, 1,
    ]);
  });
});

describe("shipping timeline — size climbs into the graph, brightness then dims", () => {
  it("size keeps climbing through the spread and peaks as the graph appears", () => {
    expect(shippingCalibrationAt(0.9).particleSize).toBeGreaterThan(
      shippingCalibrationAt(0.868).particleSize,
    );
    // By the end of the spread the particles are at their largest…
    expect(shippingCalibrationAt(0.965).particleSize).toBe(4);
    // …and hold that size while the network forms.
    for (const p of [0.965, 0.98, 1]) {
      expect(shippingCalibrationAt(p).particleSize).toBe(4);
    }
  });

  it("brightness stays bright through most of the spread, dims only near the graph", () => {
    for (const p of [0, 0.746, 0.868]) {
      expect(shippingCalibrationAt(p).brightness).toBe(1);
    }
    // The dim arc begins at the late-spread frame and lands on the final dim.
    const dimStart = shippingCalibrationAt(0.917).brightness;
    const mid = shippingCalibrationAt(0.947).brightness;
    const late = shippingCalibrationAt(0.965).brightness;
    expect(dimStart).toBe(0.95);
    expect(mid).toBeLessThan(dimStart);
    expect(mid).toBeGreaterThan(late);
    expect(late).toBe(0.73);
    expect(shippingCalibrationAt(1).brightness).toBe(0.73);
    expect(shippingCalibrationAt(0.965).particleSize).toBe(4);
  });
});

describe("shipping timeline — smooth interpolation between moments", () => {
  it("lerps every numeric scene key between bracketing moments", () => {
    // Between 0.722 and 0.746 the particle size eases 1 → 1.83…
    const t = (0.734 - 0.722) / (0.746 - 0.722);
    const at = shippingCalibrationAt(0.734);
    expect(at.particleSize).toBeCloseTo(1 + (1.83 - 1) * t, 6);
    // …while the shared static fields stay pinned (no drift between moments).
    expect(at.decomposeStart).toBe(0.4);
    expect(at.decomposeEnd).toBe(0.68);
    expect(at.releaseStart).toBe(0.63);
    expect(at.particleScaleMax).toBe(2.16);
  });

  it("constancies survive the whole timeline (word, camera, tint fields)", () => {
    for (const p of [0, 0.44, 0.7, 0.9, 1]) {
      const at = shippingCalibrationAt(p);
      expect(at.wordScale).toBe(1);
      expect(at.heroZoom).toBe(1);
      expect(at.pullbackZoom).toBe(0.62);
      expect(at.graphZoom).toBe(0.9);
      expect(at.cameraPullbackStart).toBe(0.14);
      expect(at.cameraPushInStart).toBe(0.66);
    }
  });
});

describe("production snapshot follows the baked timeline", () => {
  it("disintegration now opens at the approved 0.40, straight off the export", () => {
    expect(openingSnapshotAt(0.39, false).decompose).toBe(0);
    expect(openingSnapshotAt(0.44, false).decompose).toBeGreaterThan(0);
    expect(openingSnapshotAt(0.5, false).decompose).toBeGreaterThan(0);
  });

  it("the release runs the single approved window 0.63 → 0.84", () => {
    expect(openingSnapshotAt(0.5, false).release).toBe(0);
    expect(openingSnapshotAt(0.7, false).release).toBeGreaterThan(0);
    expect(openingSnapshotAt(0.7, false).release).toBeLessThan(1);
    expect(openingSnapshotAt(1, false).release).toBe(1);
  });

  it("an explicit DEFAULTS record still restores the pre-bake baseline", () => {
    expect(
      openingSnapshotAt(0.44, false, CINEMATIC_CALIBRATION_DEFAULTS).decompose,
    ).toBeGreaterThan(0);
    expect(
      openingSnapshotAt(0.44, false, CINEMATIC_CALIBRATION_DEFAULTS).release,
    ).toBe(0);
  });

  it("reduced motion pins the timeline to the final approved frame", () => {
    const at = shippingCalibrationAt(1);
    expect(at.graphScale).toBe(1.3);
    const snap = openingSnapshotAt(0, true);
    expect(snap.wordmark.opacity).toBe(1);
    expect(snap.release).toBe(1);
    expect(snap.decompose).toBe(0);
  });

  it("the shipped record is scene-ready: no lab state leaks into it", () => {
    const at = shippingCalibrationAt(0.8);
    expect(at.progress).toBe(0.8);
    expect(at.progressLocked).toBe(false);
    expect(at.worldSpace).toBe(false);
    expect(at.glyphAudit).toBe(false);
  });
});