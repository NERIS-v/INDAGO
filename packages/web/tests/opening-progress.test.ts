// ============================================================================
// PR4 · Cinematic Home Opening · Progress pipeline (pure)
//
// The scrub axis p ∈ [0,1] must be one pure, testable function. This suite
// freezes the cue math and its monotonicity so the seven OVERLAPPING
// choreographed phases (hero → pullback → focusLoss → disintegration →
// nodeRelease → graphConnect → graphResolve) never jitter on a scroll tick
// and stay perfectly reversible. The camera is one continuous dolly (1.0 →
// 0.62 → 0.9), nodes start INVISIBLE and arrive with the disintegration, and
// edges only weave in after the released nodes have separated.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  clamp01,
  lerp,
  openingAmbientScale,
  openingCameraAt,
  openingDecompose,
  openingDecomposeAt,
  openingDecomposeVisual,
  openingEdgeAlpha,
  openingGlyphHold,
  openingGlyphPresence,
  openingHazeAt,
  openingInteractionEnvelopeAt,
  openingInteractionModeAt,
  openingLabelAlpha,
  openingNodeAlpha,
  openingParticleSizeAt,
  openingPhaseProgressAt,
  openingRelease,
  openingReleaseAt,
  openingSnapshotAt,
  openingWordmarkCues,
  smoothstep,
} from "@/components/home/cinematic/opening/opening.progress";
import {
  OPENING_EDGE_OPACITY,
  OPENING_EDGE_WINDOW,
  OPENING_FINAL_ZOOM,
  OPENING_HERO_ZOOM,
  OPENING_WIDE_ZOOM,
} from "@/components/home/cinematic/opening/opening.constants";

const SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20);
const NODE_SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20);

function assertMonotonic(
  values: number[],
  direction: "up" | "down",
  tolerance = 1e-9,
): void {
  for (let i = 1; i < values.length; i += 1) {
    if (direction === "up") {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]! - tolerance);
    } else {
      expect(values[i]!).toBeLessThanOrEqual(values[i - 1]! + tolerance);
    }
  }
}

describe("PR4 §A primitives stay tamed in [0, 1]", () => {
  it("clamp01 and smoothstep live inside [0, 1]", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(9)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("lerp interpolates exactly at both ends", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe("PR4 §B the camera is one continuous dolly: close → wide → push-in", () => {
  it("starts close on the hero, settles wide, then pushes back in to the final framing", () => {
    expect(openingCameraAt(0).zoom).toBeCloseTo(OPENING_HERO_ZOOM, 10);
    expect(openingCameraAt(0.5).zoom).toBeCloseTo(OPENING_WIDE_ZOOM, 8);
    expect(openingCameraAt(1).zoom).toBeCloseTo(OPENING_FINAL_ZOOM, 10);
    // smack in the middle of the pullback the half-way ease holds.
    expect(openingCameraAt(0.22).zoom).toBeCloseTo(0.81, 6);
  });

  it("the zoom drops into the wide hold, then rises only with the push-in", () => {
    assertMonotonic(
      SAMPLES.filter((p) => p <= 0.5).map((p) => openingCameraAt(p).zoom),
      "down",
    );
    assertMonotonic(
      SAMPLES.filter((p) => p >= 0.62).map((p) => openingCameraAt(p).zoom),
      "up",
    );
    // Never dips below the wide settle — the push-in only ever approaches.
    for (const p of SAMPLES) {
      expect(openingCameraAt(p).zoom).toBeGreaterThanOrEqual(OPENING_WIDE_ZOOM - 1e-9);
    }
  });

  it("the camera never leaves the wordmark's screen centre", () => {
    for (const p of SAMPLES) {
      expect(openingCameraAt(p).centerX).toBe(0);
      expect(openingCameraAt(p).centerY).toBe(0);
    }
  });
});

describe("PR4 §C wordmark cues track the camera and dissolve late", () => {
  it("the wordmark sits sharp and whole, then blurs and fades out", () => {
    const hero = openingWordmarkCues(0, false);
    expect(hero.opacity).toBe(1);
    expect(hero.blurPx).toBe(0);
    expect(hero.scale).toBeCloseTo(OPENING_HERO_ZOOM, 10);
    const end = openingWordmarkCues(1, false);
    expect(end.opacity).toBe(0);
    expect(end.blurPx).toBe(15);
    expect(end.scale).toBeCloseTo(OPENING_FINAL_ZOOM, 10);
  });

  it("scale mirrors the live camera zoom at every sample", () => {
    for (const p of SAMPLES) {
      const cues = openingWordmarkCues(p, false);
      expect(cues.scale).toBeCloseTo(openingCameraAt(p).zoom, 10);
    }
  });

  it("fade + blur only start once the wordmark begins its exit", () => {
    expect(openingWordmarkCues(0.1, false).opacity).toBe(1);
    expect(openingWordmarkCues(0.3, false).opacity).toBe(1);
    expect(openingWordmarkCues(0.7, false).opacity).toBe(0);
    assertMonotonic(SAMPLES.map((p) => openingWordmarkCues(p, false).opacity), "down");
    assertMonotonic(SAMPLES.map((p) => openingWordmarkCues(p, false).blurPx), "up");
  });

  it("reduced motion pins the wordmark as a legible title", () => {
    for (const p of [0, 0.5, 1]) {
      expect(openingWordmarkCues(p, true)).toEqual({ opacity: 1, blurPx: 0, scale: 1 });
    }
  });
});

describe("PR4 §D the decompose + release windows are exact and staggered", () => {
  it("decomposition runs inside the disintegration window [0.4, 0.68]", () => {
    expect(openingDecompose(0.2)).toBe(0);
    expect(openingDecompose(0.4)).toBe(0);
    expect(openingDecompose(0.68)).toBe(1);
    expect(openingDecompose(0.9)).toBe(1);
    assertMonotonic(SAMPLES.map((p) => openingDecompose(p)), "up");
  });

  it("release only runs inside [0.63, 0.84]", () => {
    expect(openingRelease(0.59)).toBe(0);
    expect(openingRelease(0.63)).toBe(0);
    expect(openingRelease(0.84)).toBe(1);
    expect(openingRelease(1)).toBe(1);
    assertMonotonic(SAMPLES.map((p) => openingRelease(p)), "up");
  });

  it("the eased visual dissolves at least as richly on every node window", () => {
    expect(openingDecomposeVisual(0.1)).toBe(0);
    expect(openingDecomposeVisual(0.68)).toBe(1);
    expect(openingDecomposeVisual(0.5)).toBeGreaterThan(0);
    assertMonotonic(SAMPLES.map((p) => openingDecomposeVisual(p)), "up");
  });

  it("per-node window-local dissolves are normalised 0 → 1", () => {
    expect(openingDecomposeAt(0.2, 0.2)).toBe(0);
    expect(openingDecomposeAt(0.2, 0.6)).toBeCloseTo(0.5, 10);
    expect(openingDecomposeAt(0.2, 1)).toBe(1);
    expect(openingDecomposeAt(0.2, 0.1)).toBe(0);
    expect(openingReleaseAt(0.5, 0.5)).toBe(0);
    expect(openingReleaseAt(0.5, 1)).toBe(1);
  });
});

describe("PR4 §E alpha pipelines: emergence, edges and labels", () => {
  it("glyph presence dies across the visual dissolve; hold grounds the letters", () => {
    expect(openingGlyphPresence(0)).toBe(1);
    expect(openingGlyphPresence(1)).toBe(0);
    expect(openingGlyphHold(0.15)).toBeLessThan(1);
    expect(openingGlyphHold(0.3)).toBe(1);
  });

  it("nodes START invisible and arrive only inside the disintegration + release", () => {
    // Reduced motion: static, fully formed at the class's decorative alpha.
    expect(openingNodeAlpha(0, 0, 1, true)).toBe(1);
    // Nothing at all during hero/pullback: the sharp HTML INDAGO owns the
    // stage — no glyph particles, no graph, no labels.
    expect(openingNodeAlpha(0, 0, 1, false)).toBe(0);
    // A node whose own stagger has barely begun stays near-invisible…
    expect(openingNodeAlpha(0.15, 0, 1, false)).toBeLessThan(0.2);
    // Half-way through a node's own dissolve it has begun to arrive…
    const appearing = openingNodeAlpha(0.3, 0, 1, false);
    expect(appearing).toBeGreaterThan(0);
    expect(appearing).toBeLessThan(1);
    // …and once both the dissolve and the release are complete it sits at its
    // class's commanded alpha.
    expect(openingNodeAlpha(1, 1, 1, false)).toBe(1);
  });

  it("the decorative hierarchy is preserved: core ≥ secondary ≥ bridge ≥ peripheral", () => {
    const core = openingNodeAlpha(1, 1, 1, false);
    const secondary = openingNodeAlpha(1, 1, 0.82, false);
    const bridge = openingNodeAlpha(1, 1, 0.72, false);
    const peripheral = openingNodeAlpha(1, 1, 0.58, false);
    expect(core).toBeGreaterThan(secondary);
    expect(secondary).toBeGreaterThan(bridge);
    expect(bridge).toBeGreaterThan(peripheral);
    // The ramp is monotone and never drops once a node has appeared — the
    // particle wordmark dissolves IN PLACE, it never vanishes and snaps back.
    const ramp = NODE_SAMPLES.map((u) => openingNodeAlpha(1, u, 0.82, false));
    assertMonotonic(ramp, "up");
    for (const alpha of ramp) expect(alpha).toBeLessThanOrEqual(0.82 + 1e-9);
  });

  it("edges weave in only after the released nodes have separated", () => {
    expect(openingEdgeAlpha(0.8, 0.6, false)).toBe(0);
    expect(openingEdgeAlpha(0.8, 0.8, false)).toBe(0);
    expect(openingEdgeAlpha(0.8, 0.88, false)).toBe(OPENING_EDGE_OPACITY);
    const mid = openingEdgeAlpha(0.8, 0.84, false);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(OPENING_EDGE_OPACITY);
    // An edge can never form before the graph-connect window (0.76) begins.
    expect(openingEdgeAlpha(OPENING_EDGE_WINDOW.start, 0.75, false)).toBe(0);
    // Reduced motion renders the calm fallback — faded, subordinate to nodes.
    expect(openingEdgeAlpha(OPENING_EDGE_WINDOW.start, 0.75, true)).toBe(
      0.7 * OPENING_EDGE_OPACITY,
    );
  });

  it("labels breathe in late on the resolve and never fully fade", () => {
    // Labels begin at 0.93, so the FIRST label alone has fully arrived by 1.
    expect(openingLabelAlpha(0, 0.92, false)).toBe(0);
    expect(openingLabelAlpha(0, 1, false)).toBeCloseTo(0.62, 10);
    // Later labels stagger in beyond p = 1 (their fade-in window runs past the
    // end) — they are present but never harsh: subordinate to the nodes.
    const second = openingLabelAlpha(1, 1, false);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(0.62);
    expect(openingLabelAlpha(0, 1, true)).toBe(0.6);
  });
});

describe("PR4 §I the shipped particle-size ramp keeps the deliberate climb", () => {
  it("holds the sharp-word default, then hits every art-directed anchor", () => {
    expect(openingParticleSizeAt(0.3)).toBeCloseTo(1, 10);
    expect(openingParticleSizeAt(0.5)).toBeCloseTo(1.57, 2);
    expect(openingParticleSizeAt(0.7)).toBeCloseTo(1.57, 2);
    expect(openingParticleSizeAt(0.8)).toBeCloseTo(2.37, 2);
    expect(openingParticleSizeAt(0.9)).toBeCloseTo(3.25, 2);
    expect(openingParticleSizeAt(1)).toBeCloseTo(3.25, 2);
  });

  it("is monotone and is NEVER flattened into one particle size", () => {
    const sizes = SAMPLES.map((p) => openingParticleSizeAt(p));
    assertMonotonic(sizes, "up");
    // The climb is real: the final graph exceeds the overlap by >1.5×.
    expect(openingParticleSizeAt(1)).toBeGreaterThan(
      openingParticleSizeAt(0.5) * 1.5,
    );
  });
});

describe("PR4 §F atmosphere stays subtle and grows only once", () => {
  it("haze starts faint and crests at 0.21", () => {
    expect(openingHazeAt(0)).toBeCloseTo(0.05, 10);
    expect(openingHazeAt(1)).toBeCloseTo(0.21, 10);
    assertMonotonic(SAMPLES.map((p) => openingHazeAt(p)), "up");
  });

  it("the ambient scale peaks gently at +5%", () => {
    expect(openingAmbientScale(0)).toBe(1);
    expect(openingAmbientScale(1)).toBeCloseTo(1.05, 10);
  });
});

describe("PR4 §G pointer gates unlock across the reveal: no → passive → limited → full", () => {
  it("none → passive → limited → full follow the phase windows", () => {
    expect(openingInteractionModeAt(0)).toBe("none");
    expect(openingInteractionModeAt(0.5)).toBe("none");
    expect(openingInteractionModeAt(0.7)).toBe("passive");
    expect(openingInteractionModeAt(0.8)).toBe("limited");
    expect(openingInteractionModeAt(0.95)).toBe("full");
    expect(openingInteractionModeAt(1)).toBe("full");
  });

  it("the interaction envelope is a smooth 0 → 1 ease across the same window", () => {
    expect(openingInteractionEnvelopeAt(0.5)).toBe(0);
    expect(openingInteractionEnvelopeAt(0.9)).toBe(1);
    assertMonotonic(
      SAMPLES.map((p) => openingInteractionEnvelopeAt(p)),
      "up",
    );
  });
});

describe("PR4 §H the snapshot is a pure, reduced-aware function of p", () => {
  it("same input ⇒ same frame (no hidden state)", () => {
    for (const p of [0, 0.33, 0.77, 1]) {
      expect(openingSnapshotAt(p, false)).toEqual(openingSnapshotAt(p, false));
      expect(openingSnapshotAt(p, true)).toEqual(openingSnapshotAt(p, true));
    }
  });

  it("the scrub is reversible: composing snapshots round-trips the timeline", () => {
    for (const p of SAMPLES) {
      const s = openingSnapshotAt(p, false);
      expect(s.camera.zoom).toBeCloseTo(openingWordmarkCues(p, false, s.camera.zoom).scale, 10);
    }
  });

  it("reduced motion kills the dissolve and the interaction door", () => {
    const s = openingSnapshotAt(1, true);
    expect(s.wordmark.opacity).toBe(1);
    expect(s.decompose).toBe(0);
    expect(s.decomposeVisual).toBe(0);
    expect(s.release).toBe(1);
    expect(s.interactionMode).toBe("none");
    expect(s.interactionEnvelope).toBe(0);
  });

  it("the phase progress wraps its phase exactly at the boundaries", () => {
    expect(openingPhaseProgressAt(0.12, "pullback")).toBe(0);
    expect(openingPhaseProgressAt(0.28, "pullback")).toBe(1);
    expect(openingPhaseProgressAt(0.4, "disintegration")).toBe(0);
    expect(openingPhaseProgressAt(0.68, "disintegration")).toBe(1);
    expect(openingPhaseProgressAt(0.28, "focusLoss")).toBe(0);
  });
});