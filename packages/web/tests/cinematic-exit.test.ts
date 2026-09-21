// ============================================================================
// PR1 · Cinematic Home — Foundation · Exit of the opening
//
// The opening ENDS on the wide, calm organic graph (wordmark dissolved, camera
// eased back in on the formed network, edges fully woven) and the door flips
// "complete" exactly at scroll progress 1. This suite freezes that landing:
//   §L the end-of-journey snapshot (wordmark gone, graph steady, door complete),
//      and the summary line shown over the wide graph,
//   §M the camera eases wide from hero, holds, then pushes back in monotonically,
//   §N reduced motion is static (the wordmark stays as a title),
//   §O the stage keeps a calm scaffold — wordmark, scroll cue, no tagline,
//   §P the direct (glide-free) camera and the exit of the old cinematic module tree.
// ============================================================================

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASE_CINEMATIC_QUALITY,
  buildCinematicQuality,
} from "@/components/home/cinematic/cinematic.config";
import { CINEMATIC_CAMERA_HALF_EXTENT } from "@/components/home/cinematic/cinematic.constants";
import {
  createCinematicSceneHandle,
} from "@/components/home/cinematic/useCinematicScene";
import {
  openingEdgeAlpha,
  openingLabelAlpha,
  openingSnapshotAt,
} from "@/components/home/cinematic/opening/opening.progress";
import {
  OPENING_EDGE_OPACITY,
  OPENING_FINAL_ZOOM,
} from "@/components/home/cinematic/opening/opening.constants";

const HOME = "src/components/home/cinematic";

describe("PR1 §L the opening ends exactly when the door opens", () => {
  const opened = openingSnapshotAt(1, false);

  it("lands on the fully-assembled graph with the wordmark dissolved", () => {
    expect(opened.phase).toBe("graphResolve");
    expect(opened.phaseProgress).toBe(1);
    expect(opened.wordmark.opacity).toBe(0);
    expect(opened.wordmark.scale).toBeCloseTo(OPENING_FINAL_ZOOM, 10);
    expect(opened.decompose).toBe(1);
    expect(opened.decomposeVisual).toBe(1);
    expect(opened.release).toBe(1);
    expect(opened.haze).toBeCloseTo(0.21, 10);
    expect(opened.interactionMode).toBe("full");
    expect(opened.interactionEnvelope).toBe(1);
  });

  it("every edge has woven in and the label knots are present at the end", () => {
    expect(openingEdgeAlpha(0.7, 1, false)).toBe(OPENING_EDGE_OPACITY);
    expect(openingLabelAlpha(0, 1, false)).toBeGreaterThan(0);
  });

  it("the doorway keeps its closure state — the handle pages it through", () => {
    expect(createCinematicSceneHandle(BASE_CINEMATIC_QUALITY).completion).toBe(
      "active",
    );
    const controller = readFileSync(
      resolve("src/components/home/cinematic/useCinematicScene.ts"),
      "utf-8",
    );
    expect(controller).toContain("progress >= 1 ? \"complete\" : \"active\"");
    expect(controller).toContain("completionAt");
  });

  it("the end caption shrinks to one calm button line", () => {
    const navigation = readFileSync(
      resolve("src/components/home/HomeNavigation.tsx"),
      "utf-8",
    );
    expect(navigation).toContain("Enter the workspace");
    expect(navigation).not.toMatch(/HomeClosingCTA/);
    expect(navigation).not.toContain("→");
    expect(navigation).not.toContain("·");
    expect(navigation).not.toMatch(/interception|documentary|monospace/i);
  });
});

describe("PR1 §M the camera dollies out wide, then pushes back in as the graph forms", () => {
  it("starts close on the hero, settles wide, ends on the final push-in framing", () => {
    const start = openingSnapshotAt(0, false).camera;
    const wide = openingSnapshotAt(0.5, false).camera;
    const end = openingSnapshotAt(1, false).camera;
    expect(start.zoom).toBeCloseTo(1, 10);
    expect(wide.zoom).toBeCloseTo(0.62, 8);
    expect(end.zoom).toBeCloseTo(OPENING_FINAL_ZOOM, 10);
    expect(start.centerX).toBe(0);
    expect(start.centerY).toBe(0);
    expect(end.centerX).toBe(0);
    expect(end.centerY).toBe(0);
  });

  it("zooms out monotonically to the wide settle, then in monotonically (no spikes)", () => {
    let previous = openingSnapshotAt(0, false).camera.zoom;
    for (let p = 0.05; p <= 1.0001; p += 0.05) {
      const p0 = Math.min(p, 1);
      const zoom = openingSnapshotAt(p0, false).camera.zoom;
      if (p0 <= 0.43) {
        expect(zoom).toBeLessThanOrEqual(previous + 1e-9);
      } else if (p0 >= 0.63) {
        expect(zoom).toBeGreaterThanOrEqual(previous - 1e-9);
      }
      previous = zoom;
    }
    expect(previous).toBeCloseTo(OPENING_FINAL_ZOOM, 10);
  });

  it("the end stays safely inside the design camera half-extent", () => {
    const snapshot = openingSnapshotAt(1, false);
    const extent = CINEMATIC_CAMERA_HALF_EXTENT * snapshot.camera.zoom;
    expect(extent).toBeLessThan(CINEMATIC_CAMERA_HALF_EXTENT * 1.5);
    expect(extent).toBeGreaterThan(0);
  });
});

describe("PR1 §N reduced motion lands on a static, calm final frame", () => {
  it("keeps the wordmark as a title and never decomposes", () => {
    const opened = openingSnapshotAt(1, true);
    expect(opened.wordmark.opacity).toBe(1);
    expect(opened.wordmark.blurPx).toBe(0);
    expect(opened.wordmark.scale).toBe(1);
    expect(opened.decompose).toBe(0);
    expect(opened.decomposeVisual).toBe(0);
    expect(opened.release).toBe(1);
    expect(opened.interactionMode).toBe("none");
    expect(opened.interactionEnvelope).toBe(0);
  });

  it("the reduced timeline is p-independent for the title frame", () => {
    const first = openingSnapshotAt(0, true);
    const last = openingSnapshotAt(1, true);
    expect(last.wordmark).toEqual(first.wordmark);
    expect(last.decompose).toBe(first.decompose);
    expect(last.decomposeVisual).toBe(first.decomposeVisual);
    expect(last.release).toBe(first.release);
    expect(last.interactionMode).toBe(first.interactionMode);
  });

  it("reduced motion lands on the same wide, static haze as the full one", () => {
    for (const p of [0, 0.5, 1]) {
      expect(openingSnapshotAt(p, true).haze).toBeCloseTo(
        openingSnapshotAt(p, false).haze,
        10,
      );
    }
  });

  it("contraction is a first-class quality tier and the door still completes", () => {
    const reduced = buildCinematicQuality({
      prefersReducedMotion: true,
      pointerFine: false,
      coarsePointer: true,
      devicePixelRatio: 1,
      smallViewport: true,
    });
    expect(reduced.tier).toBe("reduced-motion");
    expect(reduced.scrollLength).toBe(0);
    expect(reduced.motion).toBe("reduced");
  });
});

describe("PR1 §O the stage keeps a calm scaffold — wordmark, scroll cue, no tagline", () => {
  it("the hero tagline is gone; only the tiny scroll cue points forward", () => {
    const stage = readFileSync(
      resolve(`${HOME}/CinematicStage.tsx`),
      "utf-8",
    );
    // The old summary line was deleted with this rework — the wordmark IS the
    // copy, and the graph carries the "words" via its node labels.
    expect(stage).not.toContain("Investigative intelligence beyond the balance sheet.");
    expect(stage).not.toMatch(/__tagline/);
    expect(stage).not.toContain("→");
  });

  it("an explicit scroll cue points forward into the journey", () => {
    const stage = readFileSync(
      resolve(`${HOME}/CinematicStage.tsx`),
      "utf-8",
    );
    expect(stage).toMatch(/scroll/i);
  });
});

describe("PR1 §P the old cinematic exit tree is genuinely gone", () => {
  const cinematicDir = resolve(HOME);
  const files = readdirSync(cinematicDir);

  it("no stale exit/narrative/CTA module survives in the tree", () => {
    expect(files).not.toContain("cinematic-exit.ts");
    expect(files).not.toContain("narrative");
    const tree = readdirSync(cinematicDir, { recursive: true })
      .map(String)
      .join("\n");
    expect(tree).not.toMatch(/cinematicExit/);
    expect(tree).not.toMatch(/narrative/i);
    expect(tree).not.toMatch(/HomeClosingCTA/);
    expect(tree).not.toMatch(/HomeStory/);
  });

  it("no remaining source imports the deleted modules", () => {
    for (const entry of readdirSync(cinematicDir, { recursive: true })) {
      const file = String(entry);
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const src = readFileSync(resolve(cinematicDir, file), "utf-8");
      expect(src).not.toMatch(/cinematic\/exit/);
      expect(src).not.toMatch(/homeNarrative/);
      expect(src).not.toMatch(/from\s*["'][^"']*narrative/);
      expect(src).not.toMatch(/import\s*\{[^}]*\}[^;]*narrative/);
    }
  });

  it("the scene camera derives DEAD-ON from the scrubbed progress (no glide)", () => {
    const foundations = readFileSync(
      resolve(`${HOME}/scenes/FoundationScene.tsx`),
      "utf-8",
    );
    // The camera belongs to the scroll: the frame copies the pure progress cue
    // straight onto the live camera every tick, so reversing yanks it with the
    // scrub. The old exponential glide (half-life easing) must be gone.
    expect(foundations).not.toContain("CAMERA_HALF_LIFE");
    expect(foundations).not.toContain("Math.exp");
    expect(foundations).toContain("const zoom = handle.camera.zoom;");
  });
});