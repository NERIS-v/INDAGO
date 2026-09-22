// ============================================================================
// PR — INDAGO Cinematic Home Story Act · Model contracts
//
// The post-intro arc frozen as pure functions of the story scroll fraction s:
//   §A the twelve sections tile [0,1] proportionally to their reserved svh
//      (1630 total; beat 11 the shortest hold, beat 12 the longest),
//   §B the camera polyline is continuous across sections (key[i+1] reached at
//      every boundary), K0 is the intro's exact handoff identity, and every
//      key HOLDS past its arrive window,
//   §C reduced motion collapses to one static frame with a neutral dim,
//   §D the focus set is deterministic and structurally correct for the real
//      bundle (lead = max degree, pair NON-adjacent, edges are real slots,
//      the hole is an interior cell),
//   §E the driver windows: pair merge only in beat 3 (hold 1 from beat 4 on),
//      the hole gate stays 0 through beats 1–6 and holds 1 from beat 8,
//      edge emphasis only in its beats, the quiet-beat crossfade,
//   §F the dim falloff is monotone / centred / identity where disabled,
//      and storyProject is the exact handoff projection + inactive identity.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateOpeningGraph } from "@/components/home/cinematic/opening/opening.graph";
import { OPENING_FINAL_ZOOM } from "@/components/home/cinematic/opening/opening.constants";
import { CINEMATIC_REDUCED_ZOOM } from "@/components/home/cinematic/cinematic.constants";
import {
  STORY_CAMERA_KEYS,
  STORY_SECTION_COUNT,
  STORY_SECTION_LENGTHS_SVH,
  STORY_TOTAL_LENGTH_SVH,
  STORY_SCROLL_CSS_DEFAULT,
} from "@/components/home/cinematic/story/story.constants";
import {
  computeStoryFocus,
  createStoryBase,
  storyCameraAt,
  storyDimAt,
  storyEmphasizedSlot,
  storyFractionScale,
  storyPairOffset,
  storyProject,
  storySectionAt,
  storyStateAt,
} from "@/components/home/cinematic/story/story.model";
import type { OpeningGraphBundle } from "@/components/home/cinematic/opening/opening.types";
import type { StoryFocus } from "@/components/home/cinematic/story/story.types";

const TIERS = ["high", "medium", "mobile", "reduced-motion"] as const;

function cumulativeStarts(): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const length of STORY_SECTION_LENGTHS_SVH) {
    starts.push(acc / STORY_TOTAL_LENGTH_SVH);
    acc += length;
  }
  return starts;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const lengthOf = (index: number) =>
  STORY_SECTION_LENGTHS_SVH[index]! / STORY_TOTAL_LENGTH_SVH;

/** The exact story fraction s of `local`-into-`beat` (1-based). */
function sAtBeatLocal(beat: number, local: number): number {
  const starts = cumulativeStarts();
  return starts[beat - 1]! + local * lengthOf(beat - 1);
}

describe("story §A the twelve sections tile [0,1] proportionally", () => {
  it.each(TIERS)("the section table is fixed and totals the reserved svh (%s)", () => {
    expect(STORY_SECTION_COUNT).toBe(12);
    expect(STORY_SECTION_LENGTHS_SVH).toHaveLength(12);
    expect(STORY_TOTAL_LENGTH_SVH).toBe(1630);
    expect(STORY_SCROLL_CSS_DEFAULT).toBe("1630svh");
    expect(Math.max(...STORY_SECTION_LENGTHS_SVH)).toBe(
      STORY_SECTION_LENGTHS_SVH[11]!,
    );
    expect(Math.min(...STORY_SECTION_LENGTHS_SVH)).toBe(
      STORY_SECTION_LENGTHS_SVH[10]!,
    );
  });

  it("s = 0 is the first frame of beat 1; s = 1 is the last frame of beat 12", () => {
    const first = storySectionAt(0);
    expect(first.slot).toBe(0);
    expect(first.beat).toBe(1);
    expect(first.local).toBe(0);
    const last = storySectionAt(1);
    expect(last.slot).toBe(11);
    expect(last.beat).toBe(12);
    expect(last.local).toBe(1);
  });

  it("outside [0,1] clamps onto the endpoints", () => {
    expect(storySectionAt(-1)).toEqual(storySectionAt(0));
    expect(storySectionAt(2)).toEqual(storySectionAt(1));
  });

  it("every section boundary is seamless (local 0 at the start, 1 at the end)", () => {
    const starts = cumulativeStarts();
    for (let i = 0; i < 12; i += 1) {
      const start = storySectionAt(starts[i]! + 1e-9);
      expect(start.slot).toBe(i);
      expect(start.beat).toBe(i + 1);
      expect(start.local).toBeLessThan(1e-6);
    }
    for (let i = 0; i < 11; i += 1) {
      const end = storySectionAt(starts[i + 1]! - 1e-9);
      expect(end.slot).toBe(i);
      expect(end.local).toBeGreaterThan(0.999999);
    }
  });
});

describe("story §B the camera polyline", () => {
  const bundle = generateOpeningGraph("high");
  const focus = computeStoryFocus(bundle);

  it("K0 is the intro's handoff identity (centre 0, zoom 0.9, no dim)", () => {
    const handoff = storyCameraAt(0, focus, false);
    expect(handoff.centerX).toBe(0);
    expect(handoff.centerY).toBe(0);
    expect(handoff.zoom).toBe(OPENING_FINAL_ZOOM);
    expect(handoff.dimRadius).toBe(1);
    expect(handoff.dimFloor).toBe(1);
  });

  it("the polyline has one key past the last section, K0 at the handoff, with deliberate holds", () => {
    expect(STORY_CAMERA_KEYS).toHaveLength(STORY_SECTION_COUNT + 1);
    expect(STORY_CAMERA_KEYS[0]!.zoom).toBe(OPENING_FINAL_ZOOM);
    expect(STORY_CAMERA_KEYS[4]!.zoom).toBe(STORY_CAMERA_KEYS[5]!.zoom); // quiet hold
    expect(STORY_CAMERA_KEYS[7]!.zoom).toBe(STORY_CAMERA_KEYS[8]!.zoom); // hole hold
    const zooms = new Set(STORY_CAMERA_KEYS.map((key) => key.zoom));
    expect(zooms.size).toBeGreaterThan(2); // the act is a real journey, not one zoom
  });

  it("each section reaches the NEXT key at its end — continuous zoom across boundaries", () => {
    const starts = cumulativeStarts();
    for (let i = 0; i < 11; i += 1) {
      const atEnd = storyCameraAt(starts[i + 1]! - 1e-9, focus, false);
      const atStart = storyCameraAt(starts[i + 1]! + 1e-9, focus, false);
      expect(atEnd.zoom).toBeCloseTo(STORY_CAMERA_KEYS[i + 1]!.zoom, 10);
      expect(atStart.zoom).toBeCloseTo(atEnd.zoom, 10);
    }
  });

  it("after the arrive window the key HOLDS (no drift while a headline is up)", () => {
    // Section 0 (beat 1): local 0.7 is past STORY_CAMERA_ARRIVE → K1 exactly.
    const lengthFirst = STORY_SECTION_LENGTHS_SVH[0]! / STORY_TOTAL_LENGTH_SVH;
    const midHold = storySectionAt(0 + 0.7 * lengthFirst);
    expect(midHold.beat).toBe(1);
    const framed = storyCameraAt(midHold.slot === 0 ? 0.7 * lengthFirst : 0, focus, false);
    expect(framed.zoom).toBe(STORY_CAMERA_KEYS[1]!.zoom);
    expect(framed.centerX).toBeCloseTo(focus.clusterFx, 10);
    expect(framed.centerY).toBeCloseTo(focus.clusterFy, 10);
  });

  it("beat 12 ends on the resolution key (0.57, dim floor 0)", () => {
    const closing = storyCameraAt(1, focus, false);
    expect(closing.zoom).toBe(STORY_CAMERA_KEYS[12]!.zoom);
    expect(closing.dimFloor).toBe(0);
    expect(closing.dimRadius).toBe(1);
  });
});

describe("story §C reduced motion is one static frame", () => {
  const bundle = generateOpeningGraph("medium");
  const focus = computeStoryFocus(bundle);
  for (const sValue of [0, 0.1, 0.5, 1]) {
    it(`s = ${sValue} keeps the calm final frame`, () => {
      const camera = storyCameraAt(sValue, focus, true);
      expect(camera).toEqual({
        centerX: 0,
        centerY: 0,
        zoom: CINEMATIC_REDUCED_ZOOM,
        dimRadius: 1,
        dimFloor: 1,
      });
      const dim = storyDimAt(storyStateAt(sValue, focus, true), 0.9, -0.9);
      expect(dim).toBe(1);
      expect(storyPairOffset(1, true)).toBe(0);
      expect(storyStateAt(sValue, focus, true).mergeT).toBe(0);
    });
  }
});

describe("story §D the focus set is deterministic and structurally correct", () => {
  it.each(TIERS)("a real %s bundle produces a valid focus", (tier) => {
    const bundle: OpeningGraphBundle = generateOpeningGraph(tier);
    const focus: StoryFocus = computeStoryFocus(bundle);
    const again = computeStoryFocus(bundle);
    expect(again).toEqual(focus);

    // Lead = max degree node.
    const degrees = new Array<number>(bundle.nodes.length).fill(0);
    for (const edge of bundle.edges) {
      degrees[edge.sourceIndex] += 1;
      degrees[edge.targetIndex] += 1;
    }
    for (let i = 0; i < bundle.nodes.length; i += 1) {
      expect(degrees[focus.leadIndex]!).toBeGreaterThanOrEqual(degrees[i]!);
    }
    expect(focus.targets[0]).toBe(focus.leadIndex);
    expect(focus.targets.length).toBeLessThanOrEqual(4);

    // The pair share NO direct edge.
    const edgeSet = new Set<string>();
    for (const edge of bundle.edges) {
      edgeSet.add(pairKey(edge.sourceIndex, edge.targetIndex));
    }
    expect(edgeSet.has(pairKey(focus.pairA, focus.pairB))).toBe(false);

    // edgeA/edgeB/leadEdge are real draw-order slots and distinct where required.
    const slots = new Set(bundle.edges.map((edge) => edge.slot));
    expect(slots.has(focus.edgeA)).toBe(true);
    expect(slots.has(focus.edgeB)).toBe(true);
    expect(focus.edgeA).not.toBe(focus.edgeB);
    expect(focus.leadEdge).toBeGreaterThanOrEqual(0);
    const leadEdge = bundle.edges.find((edge) => edge.slot === focus.leadEdge);
    expect(leadEdge).toBeDefined();
    expect(
      leadEdge!.sourceIndex === focus.leadIndex ||
        leadEdge!.targetIndex === focus.leadIndex,
    ).toBe(true);

    // The hole sits in an interior grid cell (inside the base-fraction bounds).
    expect(Number.isFinite(focus.holeFx)).toBe(true);
    expect(Number.isFinite(focus.holeFy)).toBe(true);
  });
});

describe("story §E the driver windows", () => {
  const bundle = generateOpeningGraph("high");
  const focus = computeStoryFocus(bundle);

  it("the pair merge runs only in beat 3 and HOLDS at 1 from beat 4", () => {
    expect(storyStateAt(sAtBeatLocal(1, 0.5), focus, false).mergeT).toBe(0);
    expect(storyStateAt(sAtBeatLocal(2, 0.5), focus, false).mergeT).toBe(0);
    expect(storyStateAt(sAtBeatLocal(3, 0.2), focus, false).mergeT).toBe(0);
    const ramp55 = storyStateAt(sAtBeatLocal(3, 0.55), focus, false).mergeT;
    expect(ramp55).toBeGreaterThan(0);
    expect(ramp55).toBeLessThan(1);
    expect(storyStateAt(sAtBeatLocal(3, 0.9), focus, false).mergeT).toBe(1);
    expect(storyStateAt(sAtBeatLocal(3, 1), focus, false).mergeT).toBe(1);
    expect(storyStateAt(sAtBeatLocal(4, 0.2), focus, false).mergeT).toBe(1);
    expect(storyStateAt(sAtBeatLocal(12, 0.5), focus, false).mergeT).toBe(1);
  });

  it("the amber hole gate stays closed through beats 1–6 and holds open from 8", () => {
    for (const beat of [1, 2, 3, 4, 5, 6]) {
      expect(storyStateAt(sAtBeatLocal(beat, 0.5), focus, false).holeOpen).toBe(0);
    }
    expect(storyStateAt(sAtBeatLocal(7, 0.2), focus, false).holeOpen).toBe(0);
    expect(storyStateAt(sAtBeatLocal(7, 0.7), focus, false).holeOpen).toBeGreaterThan(0);
    expect(storyStateAt(sAtBeatLocal(7, 1), focus, false).holeOpen).toBe(1);
    for (const beat of [8, 9, 10, 11, 12]) {
      expect(storyStateAt(sAtBeatLocal(beat, 0.4), focus, false).holeOpen).toBe(1);
    }
  });

  it("edge emphasis lights only its beats and the quiet beat crossfades A→B", () => {
    for (const beat of [1, 3, 6, 7, 8, 9, 11, 12]) {
      expect(storyStateAt(sAtBeatLocal(beat, 0.5), focus, false).edgeEmphasis).toBe(0);
    }
    expect(storyStateAt(sAtBeatLocal(2, 0.5), focus, false).edgeEmphasis).toBe(1);
    expect(storyStateAt(sAtBeatLocal(4, 0.5), focus, false).edgeEmphasis).toBe(1);
    expect(storyStateAt(sAtBeatLocal(10, 0.5), focus, false).edgeEmphasis).toBe(1);

    const quietEarly = storyStateAt(sAtBeatLocal(5, 0.1), focus, false);
    expect(quietEarly.edgeEmphasis).toBeGreaterThan(0);
    expect(quietEarly.edgeMix).toBe(0);
    expect(storyEmphasizedSlot(quietEarly)).toBe(focus.edgeA);
    const quietLate = storyStateAt(sAtBeatLocal(5, 0.95), focus, false);
    expect(quietLate.edgeMix).toBe(1);
    expect(storyEmphasizedSlot(quietLate)).toBe(focus.edgeB);
  });

  it("beats and camera stay pure functions of s (reverse scrub-safe)", () => {
    for (const sValue of [0, 0.25, 0.5, 0.75, 1]) {
      expect(storyStateAt(sValue, focus, false)).toEqual(
        storyStateAt(sValue, focus, false),
      );
    }
  });
});

describe("story §F the dim falloff and the DOM projection", () => {
  const bundle = generateOpeningGraph("mobile");
  const focus = computeStoryFocus(bundle);

  it("the dim falloff is monotone and centred on the camera", () => {
    // Beat 4 (edge rack): dimRadius 0.4 / floor 0.5, centre at the edgeA midpoint.
    const frame = storyStateAt(sAtBeatLocal(4, 0.9), focus, false);
    expect(frame.camera.dimRadius).toBe(0.4);
    expect(frame.camera.dimFloor).toBe(0.5);
    const cx = frame.camera.centerX;
    const cy = frame.camera.centerY;
    expect(storyDimAt(frame, cx, cy)).toBe(1);
    const soft = storyDimAt(frame, cx + frame.camera.dimRadius * 0.5, cy);
    expect(soft).toBeGreaterThan(0.9);
    expect(soft).toBeLessThan(1);
    expect(storyDimAt(frame, cx + frame.camera.dimRadius, cy)).toBeCloseTo(
      frame.camera.dimFloor,
      6,
    );
    const far = storyDimAt(frame, cx + 3, cy);
    const farther = storyDimAt(frame, cx + 5, cy);
    expect(far).toBeCloseTo(frame.camera.dimFloor, 6);
    expect(farther).toBeLessThanOrEqual(far);
    // monotone: a point inside the soft falloff (d = 0.5·r) is brighter than far.
    expect(storyDimAt(frame, cx + frame.camera.dimRadius * 0.5, cy)).toBeGreaterThan(far);
  });

  it("a disabled dim key (dimRadius 1 / floor 1) is identity", () => {
    const handoff = storyStateAt(0, focus, false);
    expect(storyDimAt(handoff, 0.7, -0.7)).toBe(1);
  });

  it("storyProject is the handoff homothety and the inactive identity", () => {
    // (base − center) × zoom/0.9
    expect(storyProject(0.5, 0.2, 1.8, true)).toBeCloseTo(0.6, 10);
    // handoff frame: identity exactly.
    expect(storyProject(0.4, 0, OPENING_FINAL_ZOOM, true)).toBe(0.4);
    // inactive: raw base regardless of camera centre/zoom (intro screens).
    expect(storyProject(0.4, 0.1, 0.62, false)).toBe(0.4);
  });

  it("the pair motion is 65% toward the midpoint only when merged", () => {
    expect(storyPairOffset(0, false)).toBe(0);
    expect(storyPairOffset(1, false)).toBe(0.65);
    expect(storyPairOffset(1, true)).toBe(0);
  });

  it("the fraction scale is the shared per-axis mapping factor", () => {
    expect(storyFractionScale()).toBeCloseTo(
      (0.5 / (1 - 0.42)) * 1.3,
      10,
    );
  });

  it("the inactive base is fully neutral", () => {
    expect(createStoryBase(true)).toEqual({ active: false, beat: 0, t: 0, reduced: true });
    expect(createStoryBase(false)).toEqual({ active: false, beat: 0, t: 0, reduced: false });
  });
});