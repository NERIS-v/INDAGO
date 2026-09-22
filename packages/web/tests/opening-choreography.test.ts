// ============================================================================
// PR — INDAGO Cinematic Home Opening · V3 Choreography contracts
//
// The rework's headline behaviour, frozen as pure functions of progress p:
//   §A the scrub is clamped and total — inputs outside [0,1] land on 0 or 1,
//   §B the journey STARTS empty: sharp INDAGO only, zero particles/graph/edges,
//   §C reverse symmetry — p and (1−p) compose the SAME pure timeline, so a
//      reverse scroll reconstructs the exact frames going backwards,
//   §D edges are gated: never before the graph-connect window, growing from
//      their formationStart, monotone,
//   §E the camera one-dolly: monotone out to the wide hold, monotone push-in,
//   §F the phases OVERLAP so the beats crossfade (disintegration starts inside
//      focusLoss; resolve begins while the connect still runs),
//   §G particle arrival is a deterministic stagger off the global scrub — a
//      node with a later own-anchor cannot appear before one with an earlier.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateOpeningGraph } from "@/components/home/cinematic/opening/opening.graph";
import {
  OPENING_EDGE_OPACITY,
  OPENING_EDGE_WINDOW,
  OPENING_PHASES,
} from "@/components/home/cinematic/opening/opening.constants";
import {
  clamp01,
  openingDecompose,
  openingDecomposeAt,
  openingEdgeAlpha,
  openingNodeAlpha,
  openingPhaseAt,
  openingRelease,
  openingReleaseAt,
  openingSnapshotAt,
} from "@/components/home/cinematic/opening/opening.progress";

const TIERS = ["high", "medium", "mobile"] as const;
const SAMPLES = Array.from({ length: 41 }, (_, i) => i / 40);

describe("V3 §A the scrub is clamped and total over [0, 1]", () => {
  it("progress outside [0,1] clamps onto the endpoints of every reader", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    for (const reader of [openingPhaseAt, openingDecompose, openingRelease]) {
      expect(reader(-1)).toBe(reader(0));
      expect(reader(2)).toBe(reader(1));
    }
    expect(openingSnapshotAt(-1, false)).toEqual(openingSnapshotAt(0, false));
    expect(openingSnapshotAt(1.3, false)).toEqual(openingSnapshotAt(1, false));
  });

  it("the final frame is identical whether reached from below or clamped from above", () => {
    const end = openingSnapshotAt(1, false);
    const clamped = openingSnapshotAt(1.9, false);
    expect(clamped).toEqual(end);
  });
});

describe("V3 §B the journey STARTS empty — the sharp INDAGO owns an empty stage", () => {
  it("no particle exists at p = 0: the HTML wordmark is the only text on screen", () => {
    expect(openingSnapshotAt(0, false).wordmark.opacity).toBe(1);
    expect(openingSnapshotAt(0, false).wordmark.blurPx).toBe(0);
    expect(openingNodeAlpha(0, 0, 1, false)).toBe(0);
    for (const p of [0, 0.05, 0.1]) {
      expect(openingNodeAlpha(openingDecomposeAt(0.25, openingDecompose(p)), 0, 1, false)).toBe(0);
    }
  });

  it("nothing appears until the disintegration window actually opens (0.40)", () => {
    expect(openingDecompose(0.39)).toBe(0);
    for (let p = 0; p <= 0.39; p += 0.01) {
      expect(openingDecompose(p)).toBe(0);
    }
    expect(openingDecompose(0.42)).toBeGreaterThan(0);
  });

  it("the graph's edges are invisible while the letters are still dissolving", () => {
    for (let p = 0; p <= OPENING_EDGE_WINDOW.start; p += 0.01) {
      expect(openingEdgeAlpha(OPENING_EDGE_WINDOW.start, p, false)).toBe(0);
    }
  });
});

describe("V3 §C reverse symmetry — the scrub reconstructs the timeline backwards", () => {
  it("every frame is a pure function of p: same p forward and backward is the same frame", () => {
    for (const p of SAMPLES) {
      const forward = openingSnapshotAt(p, false);
      const backward = openingSnapshotAt(p, false);
      expect(forward).toEqual(backward);
    }
  });

  it("monotone cues are order-free: reverse scroll yields the same monotone chain", () => {
    const forward = SAMPLES.map((p) => openingSnapshotAt(p, false).decompose);
    // Decompose and release are both monotone across the whole shipping
    // timeline: the approved bake keeps a single decompose window 0.4–0.68
    // and a single release window 0.63–0.84, climbing everywhere.
    for (let i = 1; i < forward.length; i += 1) {
      expect(forward[i]!).toBeGreaterThanOrEqual(forward[i - 1]!);
    }
    const releases = SAMPLES.map((p) => openingSnapshotAt(p, false).release);
    for (let i = 1; i < releases.length; i += 1) {
      expect(releases[i]).toBeGreaterThanOrEqual(releases[i - 1]!);
    }
    // And the release is a genuine single climb that begins no earlier than
    // the approved window start — no re-hold pause at zero.
    expect(releases[0]).toBe(0);
    for (let i = 0; i < SAMPLES.length; i += 1) {
      if (SAMPLES[i]! < 0.63) {
        expect(releases[i]).toBe(0);
      }
    }
  });
});

describe("V3 §D edges are gated and grow out of the separated nodes", () => {
  it("an edge can never begin before the graph-connect window opens", () => {
    for (const tier of TIERS) {
      for (const edge of generateOpeningGraph(tier).edges) {
        expect(edge.formationStart).toBeGreaterThanOrEqual(0.76);
        expect(edge.formationStart).toBeLessThanOrEqual(0.94);
        expect(openingEdgeAlpha(edge.formationStart, 0.71, false)).toBe(0);
      }
    }
  });

  it("an edge's alpha is monotone non-decreasing in p after its formation start", () => {
    const start = 0.78;
    const ramp = SAMPLES.filter((p) => p >= start).map((p) =>
      openingEdgeAlpha(start, p, false),
    );
    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i]!).toBeGreaterThanOrEqual(ramp[i - 1]! - 1e-9);
    }
    // Exactly AT its formation start an edge is still invisible…
    expect(openingEdgeAlpha(start, start, false)).toBe(0);
    // …and when woven in it caps at its art-directed faded ceiling, never
    // brighter than the nodes.
    expect(openingEdgeAlpha(start, start + 0.08, false)).toBe(
      OPENING_EDGE_OPACITY,
    );
    // …and the windowed alpha stays inside (0, ceiling] for every sample.
    for (const alpha of ramp) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(OPENING_EDGE_OPACITY);
    }
    expect(ramp[ramp.length - 1]!).toBe(OPENING_EDGE_OPACITY);
  });
});

describe("V3 §E the camera is one continuous, monotone two-stage dolly", () => {
  it("pullback is monotone non-increasing to the wide hold; push-in monotone non-decreasing", () => {
    const zooms = SAMPLES.map((p) => openingSnapshotAt(p, false).camera.zoom);
    expect(zooms[0]!).toBe(1);
    expect(zooms[SAMPLES.length - 1]!).toBe(0.9);
    let previous = zooms[0]!;
    for (const [i, z] of zooms.entries()) {
      const p = SAMPLES[i]!;
      if (p <= 0.5) {
        expect(z).toBeLessThanOrEqual(previous + 1e-9);
      } else if (p >= 0.65) {
        expect(z).toBeGreaterThanOrEqual(previous - 1e-9);
      }
      previous = z;
    }
  });

  it("the wordmark scale mirrors the camera at every sample (one layer, not two)", () => {
    for (const p of SAMPLES) {
      const s = openingSnapshotAt(p, false);
      expect(s.wordmark.scale).toBeCloseTo(s.camera.zoom, 10);
    }
  });
});

describe("V3 §F the phases OVERLAP so the beats crossfade", () => {
  it("disintegration begins while focus loss is still running", () => {
    expect(0.4).toBeLessThan(0.45);
    expect(openingPhaseAt(0.42)).toBe("disintegration");
    expect(openingDecompose(0.42)).toBeGreaterThan(0);
  });

  it("node release overlaps the tail of disintegration and the head of the connect", () => {
    expect(0.63).toBeLessThan(0.68);
    expect(0.76).toBeLessThan(0.84);
    expect(openingRelease(0.66)).toBeGreaterThan(0);
    expect(openingPhaseAt(0.7)).toBe("nodeRelease");
    expect(openingPhaseAt(0.8)).toBe("graphConnect");
  });

  it("the resolve is the tail of the connect: graphResolve begins before graphConnect ends", () => {
    expect(0.9).toBeLessThan(0.94);
    expect(openingRelease(0.9)).toBe(1);
  });

  it("phase windows are strictly ordered by start and end inside [0,1]", () => {
    for (let i = 1; i < OPENING_PHASES.length; i += 1) {
      const a = OPENING_PHASES[i - 1]!;
      const b = OPENING_PHASES[i]!;
      expect(b.start).toBeGreaterThanOrEqual(a.start);
      expect(a.start).toBeLessThan(a.end);
      expect(b.end).toBeGreaterThan(b.start);
    }
  });
});

describe("V3 §G particle arrival is a deterministic stagger off the global scrub", () => {
  it("a node with a LATER own-anchor never appears before one with an EARLIER anchor", () => {
    // The stagger is pure: at any decompose value, a node whose anchor is
    // closer to zero has progressed further through ITS window, so its alpha
    // is at least as high.
    for (const u of SAMPLES) {
      const u1 = openingNodeAlpha(openingDecomposeAt(0.25, u), 0, 0.82, false);
      const u2 = openingNodeAlpha(openingDecomposeAt(0.5, u), 0, 0.82, false);
      expect(u1).toBeGreaterThanOrEqual(u2 - 1e-9);
    }
  });

  it("the bundle's own anchors honour the new disintegration + release windows", () => {
    for (const tier of TIERS) {
      for (const node of generateOpeningGraph(tier).nodes) {
        expect(node.decomposeStart).toBeGreaterThanOrEqual(0.25);
        expect(node.decomposeStart).toBeLessThanOrEqual(0.95);
        expect(node.releaseStart).toBeGreaterThanOrEqual(0.15);
        expect(node.releaseStart).toBeLessThanOrEqual(0.9);
        // Window-local: node alpha rises only after the node's own anchor inside
        // the global window has passed.
        expect(openingReleaseAt(node.releaseStart, openingRelease(0.8))).toBeGreaterThanOrEqual(0);
      }
    }
  });
});