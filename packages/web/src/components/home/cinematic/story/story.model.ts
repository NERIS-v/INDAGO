// ============================================================================
// PR — INDAGO Cinematic Home Story Act · Model
//
// Everything the story act reads is a PURE function of the story scroll
// fraction s ∈ [0,1] plus the deterministic per-bundle focus set: the camera
// polyline, the spotlight dim, the pair sidelining, the edge emphasis and the
// amber hole gate. The scene per-frame consumes `handle.story` — written by the
// story scroll listener — through storyDimAt / storyProject / the pair offset /
// the edge emphasis loop, so reverse scrubbing reconstructs the exact arc.
//
// COORDINATE SPACE: the focus anchors live in BASE-FRACTION space — the same
// units the DOM rows use (row.worldX = fraction of half a stage width), computed
// at the intro's handoff frame (dive p = 1, shipped calibration). The camera
// centres carry those fractions; the scene re-expresses them as world offsets
// (×half-extent) and projects DOM rows with storyProject.
// ============================================================================

import { CINEMATIC_REDUCED_ZOOM } from "../cinematic.constants";
import {
  OPENING_FINAL_ZOOM,
  OPENING_GRAPH_SCALE,
  OPENING_GRAPH_VIEW_FRACTION,
  OPENING_LAYOUT_EDGE,
} from "../opening/opening.constants";
import { clamp01, lerp, smoothstep } from "../opening/opening.progress";
import type { OpeningGraphBundle } from "../opening/opening.types";
import {
  openingGraphZoomFrame,
  openingGraphZoomParallax,
  openingNodeDepth,
} from "../opening/opening.zoom";
import {
  STORY_CAMERA_ARRIVE,
  STORY_CAMERA_KEYS,
  STORY_EDGE_EMPHASIS_GAIN,
  STORY_EDGE_MIX_WINDOW,
  STORY_EDGE_PICK_A,
  STORY_EDGE_PICK_B,
  STORY_EMPHASIS_WINDOWS,
  STORY_HOLE_GRID_COLS,
  STORY_HOLE_GRID_ROWS,
  STORY_HOLE_WINDOW,
  STORY_MERGE_DISTANCE,
  STORY_MERGE_WINDOW,
  STORY_SECTION_COUNT,
  STORY_SECTION_LENGTHS_SVH,
  STORY_TOTAL_LENGTH_SVH,
  type StoryCameraCenterSource,
} from "./story.constants";
import type {
  CinematicStoryBase,
  CinematicStoryState,
  StoryCameraState,
  StoryFocus,
} from "./story.types";

/** Where one section of the story fraction axis sits (0-based slot, local 0..1). */
export interface StorySectionState {
  /** 0-based section slot (0 = beat 1). */
  readonly slot: number;
  /** 1-based beat (1..12). */
  readonly beat: number;
  /** Clamped progress WITHIN the section (0 at the start, 1 at the end). */
  readonly local: number;
  /** The section's start on the s axis (cumulative before it). */
  readonly start: number;
  /** The section's reserved length in svh. */
  readonly length: number;
}

/**
 * The 12 sections laid out across [0,1] in proportion to their reserved svh.
 * s = 0 is the very first frame of beat 1; s = 1 is the last frame of beat 12.
 */
export function storySectionAt(sValue: number): StorySectionState {
  const s = clamp01(sValue);
  const total = Math.max(STORY_TOTAL_LENGTH_SVH, 1);
  let cumulative = 0;
  for (let slot = 0; slot < STORY_SECTION_COUNT; slot += 1) {
    const length = STORY_SECTION_LENGTHS_SVH[slot]!;
    const start = cumulative / total;
    cumulative += length;
    const end = cumulative / total;
    if (s >= start && (s <= end || slot === STORY_SECTION_COUNT - 1)) {
      const span = Math.max(end - start, 1e-6);
      return {
        slot,
        beat: slot + 1,
        local: clamp01((s - start) / span),
        start,
        length,
      };
    }
  }
  const last = STORY_SECTION_COUNT - 1;
  return {
    slot: last,
    beat: last + 1,
    local: 1,
    start: (STORY_TOTAL_LENGTH_SVH - STORY_SECTION_LENGTHS_SVH[last]!) / total,
    length: STORY_SECTION_LENGTHS_SVH[last]!,
  };
}

/** Resolve a camera key's anchor to a fraction-space point from the focus set. */
export function storyCameraCenter(
  source: StoryCameraCenterSource,
  focus: StoryFocus,
): { readonly x: number; readonly y: number } {
  switch (source) {
    case "cluster":
      return { x: focus.clusterFx, y: focus.clusterFy };
    case "pair":
      return { x: focus.pairFx, y: focus.pairFy };
    case "edgeA":
      return { x: focus.edgeAFx, y: focus.edgeAFy };
    case "hole":
      return { x: focus.holeFx, y: focus.holeFy };
    case "leadEdge":
      return { x: focus.leadFx, y: focus.leadFy };
    case "edgeB":
      return { x: focus.edgeBFx, y: focus.edgeBFy };
    case "origin":
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * The interpolated spotlight camera at story fraction s. Section i moves from
 * STORY_CAMERA_KEYS[i] → [i+1] over the first STORY_CAMERA_ARRIVE of the
 * section (smoothstep — zero velocity at both ends), then holds. Reduced motion
 * keeps ONE static final frame for the whole act.
 */
export function storyCameraAt(
  s: number,
  focus: StoryFocus,
  reduced: boolean,
): StoryCameraState {
  if (reduced) {
    return {
      centerX: 0,
      centerY: 0,
      zoom: CINEMATIC_REDUCED_ZOOM,
      dimRadius: 1,
      dimFloor: 1,
    };
  }
  const section = storySectionAt(s);
  const from = STORY_CAMERA_KEYS[section.slot]!;
  const to = STORY_CAMERA_KEYS[Math.min(section.slot + 1, STORY_CAMERA_KEYS.length - 1)]!;
  const arrive = smoothstep(0, STORY_CAMERA_ARRIVE, section.local);
  const a = storyCameraCenter(from.source, focus);
  const b = storyCameraCenter(to.source, focus);
  return {
    centerX: lerp(a.x, b.x, arrive),
    centerY: lerp(a.y, b.y, arrive),
    zoom: lerp(from.zoom, to.zoom, arrive),
    dimRadius: lerp(from.dimRadius, to.dimRadius, arrive),
    dimFloor: lerp(from.dimFloor, to.dimFloor, arrive),
  };
}

/**
 * The fraction-scale factor: layout ±1 → half-extent fraction, at the shipped
 * graph scale. Equal on BOTH axes (the graph fills the same fraction of every
 * viewport half-extent), so the story's normalized d = hypot(fx, fy) is
 * aspect-independent in this space.
 */
export function storyFractionScale(): number {
  return (OPENING_GRAPH_VIEW_FRACTION / OPENING_LAYOUT_EDGE) * OPENING_GRAPH_SCALE;
}

/**
 * One node's BASE-FRACTION anchor at the handoff frame (intro dive p = 1,
 * shipping calibration): the exact position its DOM row renders at the moment
 * the story takes over. Computed ONCE per bundle — deterministic across rebuilds.
 */
export function storyNodeBaseFraction(
  nx: number,
  ny: number,
  depth: number,
): { readonly fx: number; readonly fy: number } {
  const frame = openingGraphZoomFrame(1);
  const parallax = openingGraphZoomParallax(frame, depth);
  const scale = storyFractionScale();
  return {
    fx: nx * scale * parallax * frame.plane,
    fy: ny * scale * parallax * frame.plane,
  };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * The deterministic per-bundle focus set. All anchors are derived from the
 * bundle alone (degree, adjacency, midpoint geometry, a fixed sparse-cell grid):
 * lead = max-degree node, cluster = lead + neighbours centroid, pair = closest
 * NON-adjacent node pair, hole = sparsest interior cell of an 8×6 grid over the
 * base-fraction plane, edgeA/edgeB = two fixed edge-slots (draw order), and
 * leadEdge = the first edge incident to the lead node — exactly the anchors the
 * camera keys and the dim spotlight centre on.
 */
export function computeStoryFocus(
  bundle: OpeningGraphBundle,
): StoryFocus {
  const nodes = bundle.nodes;
  const edges = bundle.edges;
  const n = nodes.length;

  // Edge adjacency + degree (deterministic order — ties resolve by lowest index).
  const edgeSet = new Set<string>();
  const degrees = new Array<number>(n).fill(0);
  for (const edge of edges) {
    edgeSet.add(pairKey(edge.sourceIndex, edge.targetIndex));
    degrees[edge.sourceIndex] = (degrees[edge.sourceIndex] ?? 0) + 1;
    degrees[edge.targetIndex] = (degrees[edge.targetIndex] ?? 0) + 1;
  }

  const leadIndex = degrees.reduce(
    (best, degree, index) => (degree > degrees[best]! ? index : best),
    0,
  );

  // Lead + neighbours — the beat 1 dossier fly targets (lead + up to three).
  const neighbors: number[] = [];
  for (const edge of edges) {
    if (edge.sourceIndex === leadIndex) neighbors.push(edge.targetIndex);
    else if (edge.targetIndex === leadIndex) neighbors.push(edge.sourceIndex);
  }
  const targets = [leadIndex, ...neighbors].slice(0, 4);
  const clusterMembers = [leadIndex, ...neighbors];

  // Base-fraction anchors for every node at the handoff frame.
  const fx = new Array<number>(n);
  const fy = new Array<number>(n);
  for (const node of nodes) {
    const depth = openingNodeDepth(node.id, node.nx, node.ny);
    const base = storyNodeBaseFraction(node.nx, node.ny, depth);
    fx[node.index] = base.fx;
    fy[node.index] = base.fy;
  }

  // Cluster centroid: the lead node + its neighbours, equally weighted.
  let clusterFx = 0;
  let clusterFy = 0;
  for (const index of clusterMembers) {
    clusterFx += fx[index]!;
    clusterFy += fy[index]!;
  }
  clusterFx /= clusterMembers.length;
  clusterFy /= clusterMembers.length;

  // Closest NON-adjacent pair (O(n²) — n ≤ 180, deterministic, first-found tie).
  let pairA = 0;
  let pairB = 1;
  let bestPairD2 = Infinity;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (edgeSet.has(pairKey(i, j))) continue;
      const d2 =
        (fx[i]! - fx[j]!) ** 2 + (fy[i]! - fy[j]!) ** 2;
      if (d2 < bestPairD2) {
        bestPairD2 = d2;
        pairA = i;
        pairB = j;
      }
    }
  }

  // Sparsest INTERIOR cell of an 8×6 grid over the base-fraction bounds.
  let minFx = Infinity;
  let maxFx = -Infinity;
  let minFy = Infinity;
  let maxFy = -Infinity;
  for (let i = 0; i < n; i += 1) {
    minFx = Math.min(minFx, fx[i]!);
    maxFx = Math.max(maxFx, fx[i]!);
    minFy = Math.min(minFy, fy[i]!);
    maxFy = Math.max(maxFy, fy[i]!);
  }
  const spanFx = Math.max(maxFx - minFx, 1e-6);
  const spanFy = Math.max(maxFy - minFy, 1e-6);
  const cellCount = new Array<number>(STORY_HOLE_GRID_COLS * STORY_HOLE_GRID_ROWS)
    .fill(0);
  for (let i = 0; i < n; i += 1) {
    const col = Math.min(
      STORY_HOLE_GRID_COLS - 1,
      Math.max(0, Math.floor(((fx[i]! - minFx) / spanFx) * STORY_HOLE_GRID_COLS)),
    );
    const row = Math.min(
      STORY_HOLE_GRID_ROWS - 1,
      Math.max(0, Math.floor(((fy[i]! - minFy) / spanFy) * STORY_HOLE_GRID_ROWS)),
    );
    cellCount[row * STORY_HOLE_GRID_COLS + col] =
      (cellCount[row * STORY_HOLE_GRID_COLS + col] ?? 0) + 1;
  }
  let holeCol = -1;
  let holeRow = -1;
  let bestCellCount = Infinity;
  let bestCenterD2 = Infinity;
  for (let row = 1; row < STORY_HOLE_GRID_ROWS - 1; row += 1) {
    for (let col = 1; col < STORY_HOLE_GRID_COLS - 1; col += 1) {
      const count = cellCount[row * STORY_HOLE_GRID_COLS + col] ?? 0;
      const cx = minFx + ((col + 0.5) / STORY_HOLE_GRID_COLS) * spanFx;
      const cy = minFy + ((row + 0.5) / STORY_HOLE_GRID_ROWS) * spanFy;
      const centerD2 = cx * cx + cy * cy;
      if (count < bestCellCount || (count === bestCellCount && centerD2 < bestCenterD2)) {
        bestCellCount = count;
        bestCenterD2 = centerD2;
        holeCol = col;
        holeRow = row;
      }
    }
  }
  const holeFx =
    holeCol >= 0
      ? minFx + ((holeCol + 0.5) / STORY_HOLE_GRID_COLS) * spanFx
      : 0;
  const holeFy =
    holeRow >= 0
      ? minFy + ((holeRow + 0.5) / STORY_HOLE_GRID_ROWS) * spanFy
      : 0;

  // The two fixed emphasis edges (draw-order SLOTS) + their midpoints.
  const edgeCount = edges.length;
  const pickA = Math.min(edgeCount - 1, Math.floor(STORY_EDGE_PICK_A * edgeCount));
  let pickB = Math.min(edgeCount - 1, Math.floor(STORY_EDGE_PICK_B * edgeCount));
  if (pickA === pickB) pickB = Math.min(edgeCount - 1, pickB + 1);
  const edgeA = edges[Math.max(0, pickA)];
  const edgeB = edges[Math.max(0, pickB)];

  // The lead node's rack-focus edge (first incident edge in construction order).
  let leadEdgeSlot = -1;
  let leadFx = fx[leadIndex] ?? 0;
  let leadFy = fy[leadIndex] ?? 0;
  for (const edge of edges) {
    if (edge.sourceIndex === leadIndex || edge.targetIndex === leadIndex) {
      leadEdgeSlot = edge.slot;
      leadFx = (fx[edge.sourceIndex]! + fx[edge.targetIndex]!) / 2;
      leadFy = (fy[edge.sourceIndex]! + fy[edge.targetIndex]!) / 2;
      break;
    }
  }

  return {
    leadIndex,
    clusterFx,
    clusterFy,
    targets,
    pairA,
    pairB,
    pairFx: (fx[pairA]! + fx[pairB]!) / 2,
    pairFy: (fy[pairA]! + fy[pairB]!) / 2,
    holeFx,
    holeFy,
    edgeA: edgeA?.slot ?? -1,
    edgeB: edgeB?.slot ?? -1,
    edgeAFx: edgeA ? (fx[edgeA.sourceIndex]! + fx[edgeA.targetIndex]!) / 2 : 0,
    edgeAFy: edgeA ? (fy[edgeA.sourceIndex]! + fy[edgeA.targetIndex]!) / 2 : 0,
    edgeBFx: edgeB ? (fx[edgeB.sourceIndex]! + fx[edgeB.targetIndex]!) / 2 : 0,
    edgeBFy: edgeB ? (fy[edgeB.sourceIndex]! + fy[edgeB.targetIndex]!) / 2 : 0,
    leadEdge: leadEdgeSlot,
    leadFx,
    leadFy,
  };
}

/** The emphasis amplitude for a beat (0 = none) — the edge-tint mix target. */
export function storyEdgeEmphasisAt(beat: number, local: number): number {
  const window = STORY_EMPHASIS_WINDOWS[beat];
  if (!window) return 0;
  return smoothstep(window.start, window.end, local);
}

/**
 * One fully-resolved story frame at fraction s — every driver the scene reads.
 * Pair/merge: beat 3 sidelines the pair 65% toward its midpoint and holds it
 * adjacent for the rest of the act; the amber hole stays 0 through the entire
 * intro and beat 7, then holds 1 across beats 8–12. Reduced motion: static
 * camera, no geometric merge (opacity-only highlights remain).
 */
export function storyStateAt(
  s: number,
  focus: StoryFocus,
  reduced: boolean,
): CinematicStoryState {
  const section = storySectionAt(s);
  const beat = section.beat;
  const local = section.local;

  let mergeT = 0;
  if (!reduced) {
    if (beat === 3) {
      mergeT = smoothstep(STORY_MERGE_WINDOW.start, STORY_MERGE_WINDOW.end, local);
    } else if (beat >= 4) {
      mergeT = 1;
    }
  }

  let edgeMix = 0;
  if (beat === 5) {
    edgeMix = smoothstep(STORY_EDGE_MIX_WINDOW.start, STORY_EDGE_MIX_WINDOW.end, local);
  }

  let holeOpen = 0;
  if (beat === 7) {
    holeOpen = smoothstep(STORY_HOLE_WINDOW.start, STORY_HOLE_WINDOW.end, local);
  } else if (beat >= 8) {
    holeOpen = 1;
  }

  return {
    active: true,
    beat,
    t: clamp01(s),
    reduced,
    camera: storyCameraAt(s, focus, reduced),
    pairA: focus.pairA,
    pairB: focus.pairB,
    mergeT,
    edgeA: focus.edgeA,
    edgeB: focus.edgeB,
    edgeEmphasis: storyEdgeEmphasisAt(beat, local),
    edgeMix,
    holeOpen,
  };
}

/** The neutral (inactive) story frame the intro matrices use. */
export function createStoryBase(reduced: boolean): CinematicStoryBase {
  return { active: false, beat: 0, t: 0, reduced };
}

/**
 * The spotlight dim at a base-fraction point: 1 inside the camera's lit region,
 * falling to `dimFloor` just outside the `dimRadius` circle (softened over the
 * outer 65%). Identity whenever the story is off, motion is reduced, or the key
 * disables dimming (dimFloor ≥ 1 or dimRadius ≤ 0).
 */
export function storyDimAt(
  state: CinematicStoryState,
  fx: number,
  fy: number,
): number {
  if (!state.active || state.reduced) return 1;
  const { dimRadius, dimFloor } = state.camera;
  if (dimFloor >= 1 || dimRadius <= 0) return 1;
  const d = Math.hypot(fx - state.camera.centerX, fy - state.camera.centerY);
  const gate = smoothstep(dimRadius * 0.35, dimRadius, d);
  return clamp01(dimFloor + (1 - dimFloor) * (1 - gate));
}

/**
 * Project a base-fraction value through the story camera (the DOM↔canvas
 * homothety): a point at world offset W renders at (W − C)·Z on screen, and the
 * shipped DOM sits 1.111× farther than the canvas (Z = 0.9). Re-expressing W in
 * fraction units gives D = (base − center)·(zoom / OPENING_FINAL_ZOOM). Applied
 * ONLY while the story is active — otherwise it is the identity, so the intro's
 * moving camera (0.62→0.9) never distorts the rows mid-intro. At K0 (centre 0,
 * zoom 0.9) the story projection equals the base exactly, so the handoff is
 * seamless.
 */
export function storyProject(
  base: number,
  center: number,
  zoom: number,
  active: boolean,
): number {
  return active ? (base - center) * (zoom / OPENING_FINAL_ZOOM) : base;
}

/** The emphasis strength the scene folds into an emphasised edge's colour:
 *  `alpha × (1 + STORY_EDGE_EMPHASIS_GAIN × state.edgeEmphasis)`. Exported for
 *  the engine loop + tests; kept pure so the tint mix is shared. */
export function storyEdgeEmphasis(emphasis: number): number {
  return 1 + STORY_EDGE_EMPHASIS_GAIN * Math.max(0, Math.min(1, emphasis));
}

/** The pair-motion fraction the scene applies to a node this frame: how far it
 *  travels toward the pair midpoint (0 outside the merge window or in reduced
 *  motion). Base-fraction unit (world = × half-extent). */
export function storyPairOffset(
  mergeT: number,
  reduced: boolean,
): number {
  return reduced ? 0 : mergeT * STORY_MERGE_DISTANCE;
}

/** The current emphasis slot (draw-order): edgeA until the quiet beat's
 *  crossfade hands it to edgeB — the blend of the two fixed slots by edgeMix. */
export function storyEmphasizedSlot(
  state: CinematicStoryState,
): number {
  return state.edgeMix >= 0.5 ? state.edgeB : state.edgeA;
}