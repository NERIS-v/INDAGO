// ============================================================================
// PR · Cinematic Home Opening · Point-size budget
//
// V4 art direction reverses the old "2–4 px everywhere" budget at the END of
// the journey: the final graph settles LARGE. The settled node size is the
// class world-radius × the shipped node scale (2.15) × the final particle-size
// ramp (3.25) — intentionally big, and the hierarchy stays intact. The blur
// swell alone is still hard-capped (OPENING_POINT_SCALE_MAX) so the dissolve
// haze never becomes solid discs:
//
//   cssDiameter = aRadius · 2 · aScale · uWorldToPx · uZoom
//   uWorldToPx  = stageHeight / (2 · CINEMATIC_CAMERA_HALF_EXTENT)
//
// uPixelRatio is applied AFTER this css figure (gl_PointSize = css · dpr), so
// the CSS budget is read before DPR.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CINEMATIC_CAMERA_HALF_EXTENT } from "@/components/home/cinematic/cinematic.constants";
import {
  OPENING_CLASS_SIZE,
  OPENING_NODE_SCALE,
  OPENING_POINT_SCALE_MAX,
} from "@/components/home/cinematic/opening/opening.constants";
import { OPENING_POINTS_VERTEX } from "@/components/home/cinematic/opening/opening.points";

const STAGE_HEIGHT = 900;
const WORLD_TO_PX = STAGE_HEIGHT / (2 * CINEMATIC_CAMERA_HALF_EXTENT);
const FINAL_ZOOM = 0.9;
/** Shipped final particle-size ramp value (the deliberate climb's ceiling). */
const FINAL_RAMP_SIZE = 3.25;

function cssDiameter(radius: number, aScale: number, zoom: number): number {
  return radius * 2 * aScale * WORLD_TO_PX * zoom;
}

const CLASSES = ["core", "secondary", "bridge", "peripheral"] as const;

describe("PR point-size budget", () => {
  it("the FINAL graph settles large and hierarchical (art direction: large nodes preserved)", () => {
    for (const klass of CLASSES) {
      const px =
        cssDiameter(OPENING_CLASS_SIZE[klass], 1, FINAL_ZOOM) *
        OPENING_NODE_SCALE *
        FINAL_RAMP_SIZE;
      expect(px).toBeGreaterThanOrEqual(12);
      expect(px).toBeLessThanOrEqual(26);
    }
  });

  it("caps the dissolve swell at the art-directed 2.16 so the haze never solidifies", () => {
    expect(OPENING_POINT_SCALE_MAX).toBeCloseTo(2.16, 2);
    for (const klass of CLASSES) {
      const capped = cssDiameter(OPENING_CLASS_SIZE[klass], OPENING_POINT_SCALE_MAX, 1);
      expect(capped).toBeLessThanOrEqual(8.5);
    }
  });

  it("keeps the hierarchy ordered core > secondary > bridge > peripheral", () => {
    expect(OPENING_CLASS_SIZE.core).toBeGreaterThan(OPENING_CLASS_SIZE.secondary);
    expect(OPENING_CLASS_SIZE.secondary).toBeGreaterThan(OPENING_CLASS_SIZE.bridge);
    expect(OPENING_CLASS_SIZE.bridge).toBeGreaterThan(OPENING_CLASS_SIZE.peripheral);
  });

  it("the vertex shader sizes from world radius × css-px-per-unit × dpr", () => {
    expect(OPENING_POINTS_VERTEX).toContain("aRadius");
    expect(OPENING_POINTS_VERTEX).toContain("uWorldToPx");
    expect(OPENING_POINTS_VERTEX).toContain("uZoom");
    expect(OPENING_POINTS_VERTEX).toContain("uPixelRatio");
    expect(OPENING_POINTS_VERTEX).toContain("gl_PointSize");
  });

  it("the scene clamps aScale with the shared cap constant", () => {
    const scene = readFileSync(
      resolve("src/components/home/cinematic/scenes/OpeningScene.tsx"),
      "utf-8",
    );
    expect(scene).toContain("OPENING_POINT_SCALE_MAX");
    expect(scene).toContain("Math.min(");
  });
});
