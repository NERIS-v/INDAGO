// ============================================================================
// PR — INDAGO Cinematic Home Story Act · Types
//
// The post-intro narrative arc: twelve camera "beats" scrubbed inside the same
// pinned stage track. The story SCROLL is owned by the DOM scroll listener on
// the story wrapper; the CAMERA / dim / pair / edge / hole drivers are written
// into handle.story by that listener and read per-frame by the opening scene.
// Every value below is a pure function of story scroll — no rAF, no React
// state, no GSAP — so the whole act is scroll-reversible and framework-agnostic.
// ============================================================================

import type { OpeningCameraState } from "../opening/opening.types";

/**
 * The spotlight camera during the story. The orthographic centre is expressed
 * as a fraction of the horizontal/vertical HALF-EXTENTS (camera.position =
 * centre·halfExtent), and the dim keys describe a soft focus falloff around
 * that centre in the SAME normalized space the DOM rows use (row.worldX =
 * fraction of half a stage width).
 */
export interface StoryCameraState extends OpeningCameraState {
  /** Radius (in centre-fraction units) of the lit region. ≥1 = covers the field. */
  readonly dimRadius: number;
  /** Brightness floor outside the lit region; 1 = no dimming at all. */
  readonly dimFloor: number;
}

/** One fully-resolved story frame — pure function of the story scroll fraction. */
export interface CinematicStoryState {
  /** Story listener engaged (its scroll listener owns the camera past intro). */
  readonly active: boolean;
  /** Current beat 1…12; 0 while the intro still owns the stage. */
  readonly beat: number;
  /** Global story scroll fraction 0 → 1 across all twelve sections. */
  readonly t: number;
  /** Motion preference snapshot (reduced → static camera, no geometric moves). */
  readonly reduced: boolean;
  /** The interpolated spotlight camera (+ dim keys) at this frame. */
  readonly camera: StoryCameraState;
  /** PAIR beat (3): the two unlinked candidate nodes sidelined toward their
   *  shared midpoint during the merge window, then held adjacent. */
  readonly pairA: number;
  readonly pairB: number;
  /** 0 → 1 merge progress (0 outside the pair beat). */
  readonly mergeT: number;
  /** Edge-emphasis drivers. `edgeA`/`edgeB` are draw-order SLOTS (-1 = none);
   *  the emphasized slot is the blend of edgeA→edgeB by `edgeMix`. */
  readonly edgeA: number;
  readonly edgeB: number;
  /** 0 → 1 amplitude of the current edge emphasis (0 = none). */
  readonly edgeEmphasis: number;
  /** 0 = all weight on edgeA, 1 = all weight on edgeB. */
  readonly edgeMix: number;
  /** GAP beat (7): the amber hole gate — 0 through the whole intro, then a
   *  smooth open in beat 7 and a hold at 1 across beats 8–12. */
  readonly holeOpen: number;
}

/** The inactive (intro-owned) story frame — every driver neutral. */
export interface CinematicStoryBase {
  readonly active: false;
  readonly beat: 0;
  readonly t: 0;
  readonly reduced: boolean;
}

/**
 * Deterministic per-bundle focus set, in BASE-FRACTION space: the same units
 * the DOM rows use (row.worldX = fraction of half a stage width), computed at
 * the handoff frame (dive p = 1). Camera keys centre on these anchors.
 */
export interface StoryFocus {
  /** The max-degree ("lead") node index. */
  readonly leadIndex: number;
  /** Cluster centroid of the lead node + its neighbours. */
  readonly clusterFx: number;
  readonly clusterFy: number;
  /** LEAD + up to three neighbours — the beat 1 dossier fly targets. */
  readonly targets: readonly number[];
  /** Closest NON-adjacent candidate pair (the possible-match sidelining). */
  readonly pairA: number;
  readonly pairB: number;
  /** Pair midpoint. */
  readonly pairFx: number;
  readonly pairFy: number;
  /** Sparsest interior cell centre — the topology hole the gap beat digs into. */
  readonly holeFx: number;
  readonly holeFy: number;
  /** Edge driver slots INTO bundle.edges (edge[slot].slot = draw order). */
  readonly edgeA: number;
  readonly edgeB: number;
  readonly edgeAFx: number;
  readonly edgeAFy: number;
  readonly edgeBFx: number;
  readonly edgeBFy: number;
  /** First edge incident to the lead node (the lead beat's rack-focus edge). */
  readonly leadEdge: number;
  readonly leadFx: number;
  readonly leadFy: number;
}