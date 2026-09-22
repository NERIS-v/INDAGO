import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  CINEMATIC_CAMERA_HALF_EXTENT,
  CINEMATIC_SCROLL_DISTANCE_SVH,
  CINEMATIC_SCROLL_DISTANCE_COLLAPSED_SVH,
  CINEMATIC_PIN_END,
  cinematicCameraBounds,
  cinematicScrollDistancePx,
  clamp01,
  normalizeProgress,
} from "@/components/home/cinematic/cinematic.constants";
import {
  BASE_CINEMATIC_QUALITY,
  buildCinematicQuality,
} from "@/components/home/cinematic/cinematic.config";
import {
  OPENING_PHASES,
} from "@/components/home/cinematic/opening/opening.constants";
import {
  assertOpeningPhasesValid,
  openingPhaseAt,
  openingPhaseProgressAt,
} from "@/components/home/cinematic/opening/opening.progress";
import type { CinematicEnvironment } from "@/components/home/cinematic/cinematic.types";

// ============================================================================
// PR1 · Cinematic Home — Opening · Foundation pure contract
//
// Locks the scroll contract without a browser: the opening phase table must be
// valid and normalized (ordered, overlapping where beats crossfade, covering
// [0,1]), the quality resolver must honor reduced-motion / mobile / desktop
// budgets, and the orthographic camera bounds must stay centered.
// ============================================================================

function env(overrides: Partial<CinematicEnvironment> = {}): CinematicEnvironment {
  return {
    prefersReducedMotion: false,
    pointerFine: true,
    coarsePointer: false,
    devicePixelRatio: 1,
    smallViewport: false,
    ...overrides,
  };
}

describe("PR1 §A opening phases are a valid normalized timeline", () => {
  it("the phase table covers [0,1], is ordered and in bounds", () => {
    expect(assertOpeningPhasesValid()).toBe(true);
    expect(OPENING_PHASES[0]!.start).toBe(0);
    expect(OPENING_PHASES[OPENING_PHASES.length - 1]!.end).toBe(1);
  });

  it("windows are ordered, in-bounds and OVERLAP where beats must crossfade", () => {
    for (let i = 1; i < OPENING_PHASES.length; i += 1) {
      const a = OPENING_PHASES[i - 1]!;
      const b = OPENING_PHASES[i]!;
      expect(b.start).toBeGreaterThanOrEqual(a.start);
      expect(a.start).toBeLessThan(a.end);
    }
    // The crossfade is the point: disintegration begins inside focusLoss, the
    // release and the connect both begin while their predecessor ends.
    const byName = Object.fromEntries(OPENING_PHASES.map((p) => [p.name, p]));
    expect(byName.disintegration!.start).toBe(0.4);
    expect(byName.focusLoss!.end).toBe(0.45);
    expect(byName.nodeRelease!.start).toBe(0.63);
    expect(byName.disintegration!.end).toBe(0.68);
    expect(byName.graphConnect!.start).toBe(0.76);
    expect(byName.graphResolve!.start).toBe(0.9);
  });

  it("every phase window sits inside [0,1]", () => {
    for (const phase of OPENING_PHASES) {
      expect(phase.start).toBeGreaterThanOrEqual(0);
      expect(phase.end).toBeLessThanOrEqual(1);
    }
  });

  it("openingPhaseAt maps any normalized progress onto the owning phase", () => {
    expect(openingPhaseAt(0)).toBe("hero");
    expect(openingPhaseAt(0.05)).toBe("hero");
    expect(openingPhaseAt(0.1)).toBe("hero");
    expect(openingPhaseAt(0.2)).toBe("pullback");
    expect(openingPhaseAt(0.3)).toBe("focusLoss");
    expect(openingPhaseAt(0.5)).toBe("disintegration");
    expect(openingPhaseAt(0.7)).toBe("nodeRelease");
    expect(openingPhaseAt(0.8)).toBe("graphConnect");
    expect(openingPhaseAt(0.92)).toBe("graphResolve");
    expect(openingPhaseAt(1)).toBe("graphResolve");
  });

  it("progress is clamped to the normalized range", () => {
    expect(openingPhaseAt(-5)).toBe("hero");
    expect(openingPhaseAt(5)).toBe("graphResolve");
    expect(normalizeProgress(-1)).toBe(0);
    expect(normalizeProgress(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it("openingPhaseProgressAt is 0 at a phase start and 1 at its end", () => {
    expect(openingPhaseProgressAt(0, "hero")).toBe(0);
    expect(openingPhaseProgressAt(0.09, "hero")).toBeCloseTo(0.75, 6);
    expect(openingPhaseProgressAt(0.12, "pullback")).toBe(0);
    expect(openingPhaseProgressAt(0.28, "pullback")).toBe(1);
    // Before the phase → 0, after the phase → 1.
    expect(openingPhaseProgressAt(0, "pullback")).toBe(0);
    expect(openingPhaseProgressAt(1, "graphResolve")).toBe(1);
  });
});

describe("PR1 §B quality resolver honors per-device budgets", () => {
  it("reduced motion collapses motion, interaction and scroll length", () => {
    const q = buildCinematicQuality(env({ prefersReducedMotion: true }));
    expect(q.tier).toBe("reduced-motion");
    expect(q.motion).toBe("reduced");
    expect(q.interaction).toBe(false);
    expect(q.pixelRatio).toBe(1);
    expect(q.scrollLength).toBe(CINEMATIC_SCROLL_DISTANCE_COLLAPSED_SVH);
  });

  it("coarse-pointer devices get a mobile budget with interaction off", () => {
    const q = buildCinematicQuality(
      env({ coarsePointer: true, pointerFine: false, devicePixelRatio: 3 }),
    );
    expect(q.tier).toBe("mobile");
    expect(q.interaction).toBe(false);
    expect(q.pixelRatio).toBe(1.5);
    expect(q.motion).toBe("full");
    expect(q.scrollLength).toBe(CINEMATIC_SCROLL_DISTANCE_SVH);
  });

  it("fine-pointer desktops get full interaction with a capped pixel ratio", () => {
    const q = buildCinematicQuality(env({ devicePixelRatio: 3 }));
    expect(q.tier).toBe("high");
    expect(q.interaction).toBe(true);
    expect(q.pixelRatio).toBe(2);
    expect(q.scrollLength).toBe(CINEMATIC_SCROLL_DISTANCE_SVH);
  });

  it("a small viewport stays on the desktop 'medium' tier", () => {
    const q = buildCinematicQuality(env({ smallViewport: true }));
    expect(q.tier).toBe("medium");
    expect(q.interaction).toBe(true);
  });

  it("BASE_CINEMATIC_QUALITY is a normalized default usable pre-hydration", () => {
    expect(BASE_CINEMATIC_QUALITY.pixelRatio).toBeGreaterThan(0);
    expect(BASE_CINEMATIC_QUALITY.motion).toBe("full");
    expect(BASE_CINEMATIC_QUALITY.scrollLength).toBeGreaterThan(0);
  });
});

describe("PR1 §C orthographic camera bounds stay centered", () => {
  it("horizontal extent follows aspect ratio at a fixed vertical half-extent", () => {
    const wide = cinematicCameraBounds(16 / 9);
    expect(wide.top).toBe(CINEMATIC_CAMERA_HALF_EXTENT);
    expect(wide.bottom).toBe(-CINEMATIC_CAMERA_HALF_EXTENT);
    expect(wide.left).toBeCloseTo(-(CINEMATIC_CAMERA_HALF_EXTENT * (16 / 9)));
    expect(wide.right).toBeCloseTo(CINEMATIC_CAMERA_HALF_EXTENT * (16 / 9));

    const tall = cinematicCameraBounds(9 / 16);
    expect(tall.right).toBeCloseTo(CINEMATIC_CAMERA_HALF_EXTENT * (9 / 16));
    expect(tall.top).toBe(CINEMATIC_CAMERA_HALF_EXTENT);
  });
});

describe("PR1 §D the Home route owns the cinematic intro (dashboard lives at /dashboard)", () => {
  it("root page.tsx mounts IndagoHome and nothing of the dashboard", () => {
    const home = fs.readFileSync(path.resolve("src/app/page.tsx"), "utf-8");
    expect(home).toMatch(/<IndagoHome \/>/);
    expect(home).toMatch(/components\/home\/IndagoHome/);
    expect(home).not.toMatch(/<CaseList/);
    expect(home).not.toMatch(/\/investigations\/new/);
  });

  it("IndagoHome composes only the navigation and the cinematic intro", () => {
    const root = fs.readFileSync(
      path.resolve("src/components/home/IndagoHome.tsx"),
      "utf-8",
    );
    expect(root).toMatch(/<HomeNavigation \/>/);
    expect(root).toMatch(/<CinematicIntro \/>/);
    // The old narrative sections are gone from the composition.
    expect(root).not.toMatch(/HomeStory/);
    expect(root).not.toMatch(/HomeClosingCTA/);
  });

  it("the canonical Dashboard resides at /dashboard with New Investigation intact", () => {
    const dashboard = fs.readFileSync(path.resolve("src/app/dashboard/page.tsx"), "utf-8");
    expect(dashboard).toMatch(/\/investigations\/new/);
    expect(dashboard).toMatch(/<CaseList/);
    expect(dashboard).not.toMatch(/CinematicIntro/);
  });
});

describe("PR1 §E pinned scroll distance stays longer than a single viewport", () => {
  it("the full-motion distance is measured in svh and exceeds any viewport", () => {
    expect(CINEMATIC_SCROLL_DISTANCE_SVH).toBeGreaterThan(100);
    const heightPx = 800;
    const distancePx = cinematicScrollDistancePx(
      CINEMATIC_SCROLL_DISTANCE_SVH,
      heightPx,
    );
    expect(distancePx).toBe((CINEMATIC_SCROLL_DISTANCE_SVH / 100) * heightPx);
    expect(distancePx).toBeGreaterThan(heightPx);
  });

  it("every full-motion tier reserves more scroll distance than the viewport", () => {
    const desktop = buildCinematicQuality(env({ devicePixelRatio: 2 }));
    const mobile = buildCinematicQuality(
      env({ coarsePointer: true, pointerFine: false }),
    );
    expect(desktop.motion).toBe("full");
    expect(mobile.motion).toBe("full");
    for (const q of [desktop, mobile]) {
      for (const viewport of [844, 932]) {
        expect(
          cinematicScrollDistancePx(q.scrollLength, viewport),
        ).toBeGreaterThan(viewport);
      }
    }
  });

  it("reduced motion reserves zero distance (track collapses to the stage)", () => {
    expect(CINEMATIC_SCROLL_DISTANCE_COLLAPSED_SVH).toBe(0);
    const q = buildCinematicQuality(env({ prefersReducedMotion: true }));
    expect(q.scrollLength).toBe(0);
    expect(cinematicScrollDistancePx(q.scrollLength, 900)).toBe(0);
  });

  it("GUI-scale px conversion matches the svh math exactly", () => {
    const distancePx = cinematicScrollDistancePx(
      CINEMATIC_SCROLL_DISTANCE_SVH,
      1440,
    );
    expect(distancePx).toBe((CINEMATIC_SCROLL_DISTANCE_SVH / 100) * 1440);
    expect(cinematicScrollDistancePx(200, 800)).toBe(1600);
  });
});

describe("PR1 §F pin end locks to the scroller maximum (reverse-scroll release contract)", () => {
  it("the pin end is the standard scroller-max keyword", () => {
    expect(CINEMATIC_PIN_END).toBe("max");
  });

  it("with the track as the only flow, the pin duration equals exactly the reserved distance", () => {
    const viewport = 932;
    const trackSvh = 100 + CINEMATIC_SCROLL_DISTANCE_SVH; // viewport + distance
    // end == "max" ⇒ change = maxScroll − start. On the home route the track
    // is the only content, so maxScroll = trackSvh − viewport in px. When the
    // small viewport equals the layout viewport (desktop) this is exactly the
    // reserved svh distance — the release position R = current scroll position.
    const maxScrollPx = (trackSvh / 100) * viewport - viewport;
    expect(maxScrollPx).toBeCloseTo(
      cinematicScrollDistancePx(CINEMATIC_SCROLL_DISTANCE_SVH, viewport),
    );
    expect(cinematicScrollDistancePx(CINEMATIC_SCROLL_DISTANCE_SVH, 932)).toBeCloseTo(
      (CINEMATIC_SCROLL_DISTANCE_SVH / 100) * 932,
    );
  });

  it("useCinematicScene pins to CINEMATIC_PIN_END and never derives the end from the viewport", () => {
    const hook = fs.readFileSync(
      path.resolve("src/components/home/cinematic/useCinematicScene.ts"),
      "utf-8",
    );
    expect(hook).toContain("end: CINEMATIC_PIN_END");
    // Regression guard: the release jump returns if a px end (from innerHeight)
    // lands short of maxScroll — the end must stay scroller-relative, so the
    // trigger must never use the distance helper or a function-returned "+=".
    expect(hook).not.toMatch(/cinematicScrollDistancePx/);
    expect(hook).not.toMatch(/end:\s*\(\)\s*=>/);
  });
});