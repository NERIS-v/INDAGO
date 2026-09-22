// ============================================================================
// PR — INDAGO Cinematic Home Opening · Graph zoom / depth phase
//
// The FINAL move: after the graph resolves (nodeScale 2.15, camera
// settled at 0.9), the last scroll window pushes the camera INTO the network.
// This module is the pure, browser-free model behind that dive:
//
//   * a window on the scrub axis (graphZoomStart → graphZoomEnd) normalises to
//     q ∈ [0,1] and eases into `ease` (graphZoomEase — slow, deliberate, no
//     bounce),
//   * the camera dolly moves the NEAR plane toward the viewer
//     (cameraZ = lerp(graphCameraStartZ, graphCameraEndZ, ease); 1 = ON the
//     graph, so entering the phase is seamless),
//   * each node carries a DETERMINISTIC depth (hash of its id + a radial bias,
//     so implied core nodes come closer and the periphery recedes) mapped
//     through the current depth allocation (graphDepthStart…graphDepthEnd) and
//     the perspective master (graphPerspective), giving a real distance per
//     node and a true scale = 1/distance,
//   * foreground/background extra multipliers (graphForegroundScale /
//     graphBackgroundScale) push the near/far separation further,
//   * parallax displaces each node's position outward by its depth gain
//     (graphParallax), so near nodes read as sliding past the camera,
//   * a world-constant expansion (graphWorldScaleStart/End) eases the whole
//     graph beyond the viewport, and the node/edge/label opacities blend to
//     their phase targets (graphZoomOpacity/EdgeOpacity/LabelOpacity).
//
// Everything is a pure function of scroll progress; no rAF, no three, no state.
// The scene only needs `openingGraphZoomFrame(p, calibration)` per frame plus
// the per-node depth to turn raw slots into the dived world.
// ============================================================================

import type { CinematicCalibration } from "../cinematic.calibration";
import { clamp01, lerp, smoothstep } from "./opening.progress";
import {
  OPENING_CONVERGE_AMOUNT,
  OPENING_CONVERGE_WINDOW,
  OPENING_GRAPH_BACKGROUND_SCALE,
  OPENING_GRAPH_CAMERA_END_Z,
  OPENING_GRAPH_CAMERA_START_Z,
  OPENING_GRAPH_DEPTH_END,
  OPENING_GRAPH_DEPTH_START,
  OPENING_GRAPH_FOREGROUND_SCALE,
  OPENING_GRAPH_PARALLAX,
  OPENING_GRAPH_PERSPECTIVE,
  OPENING_GRAPH_RESOLVE_WINDOW,
  OPENING_GRAPH_WORLD_SCALE_END,
  OPENING_GRAPH_WORLD_SCALE_START,
  OPENING_GRAPH_ZOOM_EASE,
  OPENING_GRAPH_ZOOM_EDGE_OPACITY,
  OPENING_GRAPH_ZOOM_LABEL_OPACITY,
  OPENING_GRAPH_ZOOM_OPACITY,
  OPENING_GRAPH_ZOOM_WINDOW,
  OPENING_NETWORK_DEPTH_CAP,
  OPENING_NETWORK_DEPTH_CAP_START,
  OPENING_NETWORK_DEPTH_FEATHER,
  OPENING_NETWORK_EDGE_FAR_DIM,
  OPENING_NETWORK_RESOLVE_EASE,
} from "./opening.constants";

/** One fully-resolved frame of the dive, derived purely from `p` + calibration. */
export interface OpeningGraphZoomFrame {
  /** True while the scrub sits inside the dive window (p in [start, end]). */
  readonly active: boolean;
  /** Clamped window progress at `p` (0 at start, 1 at end, clamped beyond). */
  readonly q: number;
  /** Eased progress — smoothstep raised by graphZoomEase. Monotone, no bounce. */
  readonly ease: number;
  /** Near-plane distance (camera dolly). 1 = ON the graph → closer as it dives. */
  readonly cameraZ: number;
  /** Current depth allocation (how deep into the periphery the depth reaches). */
  readonly allocation: number;
  /** World-constant expansion multiplier during the dive. */
  readonly plane: number;
  /** Parallax multiplier on positions (how strongly depth displaces). */
  readonly parallax: number;
  /** Near extra multiplier at this ease. */
  readonly foreground: number;
  /** Far extra multiplier at this ease. */
  readonly background: number;
  /** Perspective master (1 = natural distance, <1 flattened). */
  readonly perspective: number;
  /** Node alpha blend (1 → graphZoomOpacity). */
  readonly nodeBlend: number;
  /** Edge alpha blend (1 → graphZoomEdgeOpacity). */
  readonly edgeBlend: number;
  /** Label alpha blend (1 → graphZoomLabelOpacity). */
  readonly labelBlend: number;
  /** NETWORK RESOLVE: 0…1 crossfade of the soft constellation into the demo
   *  icon-node design. Shipped to complete just before the deepest dive point. */
  readonly resolve: number;
}

/** Read the zoom-phase keys with production fallbacks (never NaN). */
function zoomAt(
  calibration?: CinematicCalibration | null,
): {
  start: number;
  end: number;
  cameraStart: number;
  cameraEnd: number;
  worldStart: number;
  worldEnd: number;
  depthStart: number;
  depthEnd: number;
  foreground: number;
  background: number;
  perspective: number;
  parallax: number;
  easePower: number;
  nodeOpacity: number;
  edgeOpacity: number;
  labelOpacity: number;
  resolveStart: number;
  resolveEnd: number;
  resolveEase: number;
  depthCap: number;
} {
  return {
    start: calibration?.graphZoomStart ?? OPENING_GRAPH_ZOOM_WINDOW.start,
    end: calibration?.graphZoomEnd ?? OPENING_GRAPH_ZOOM_WINDOW.end,
    cameraStart:
      calibration?.graphCameraStartZ ?? OPENING_GRAPH_CAMERA_START_Z,
    cameraEnd: calibration?.graphCameraEndZ ?? OPENING_GRAPH_CAMERA_END_Z,
    worldStart:
      calibration?.graphWorldScaleStart ?? OPENING_GRAPH_WORLD_SCALE_START,
    worldEnd: calibration?.graphWorldScaleEnd ?? OPENING_GRAPH_WORLD_SCALE_END,
    depthStart: calibration?.graphDepthStart ?? OPENING_GRAPH_DEPTH_START,
    depthEnd: calibration?.graphDepthEnd ?? OPENING_GRAPH_DEPTH_END,
    foreground:
      calibration?.graphForegroundScale ?? OPENING_GRAPH_FOREGROUND_SCALE,
    background:
      calibration?.graphBackgroundScale ?? OPENING_GRAPH_BACKGROUND_SCALE,
    perspective: calibration?.graphPerspective ?? OPENING_GRAPH_PERSPECTIVE,
    parallax: calibration?.graphParallax ?? OPENING_GRAPH_PARALLAX,
    easePower: calibration?.graphZoomEase ?? OPENING_GRAPH_ZOOM_EASE,
    nodeOpacity: calibration?.graphZoomOpacity ?? OPENING_GRAPH_ZOOM_OPACITY,
    edgeOpacity:
      calibration?.graphZoomEdgeOpacity ?? OPENING_GRAPH_ZOOM_EDGE_OPACITY,
    labelOpacity:
      calibration?.graphZoomLabelOpacity ?? OPENING_GRAPH_ZOOM_LABEL_OPACITY,
    resolveStart:
      calibration?.networkResolveStart ?? OPENING_GRAPH_RESOLVE_WINDOW.start,
    resolveEnd:
      calibration?.networkResolveEnd ?? OPENING_GRAPH_RESOLVE_WINDOW.end,
    resolveEase:
      calibration?.networkResolveEase ?? OPENING_NETWORK_RESOLVE_EASE,
    depthCap: calibration?.networkDepthCap ?? OPENING_NETWORK_DEPTH_CAP,
  };
}

/** The eased window progress. Monotone in `p` and strictly {0 @ start, 1 @ end}. */
export function openingGraphZoomEase(
  p: number,
  exponent: number = OPENING_GRAPH_ZOOM_EASE,
): number {
  return Math.pow(clamp01(p), Math.max(0.01, exponent));
}

/** Resolve the full dive at scrub position `p` (0 outside the window start). */
export function openingGraphZoomFrame(
  p: number,
  calibration?: CinematicCalibration | null,
): OpeningGraphZoomFrame {
  const z = zoomAt(calibration);
  const span = Math.max(z.end - z.start, 1e-6);
  const q = clamp01((p - z.start) / span);
  const ease = openingGraphZoomEase(q, z.easePower);
  // cameraZ eases 1 → cameraEnd: distance to the near plane, so close nodes
  // grow to 1/cameraZ (2.5× at the shipped 0.4).
  const cameraZ = lerp(z.cameraStart, z.cameraEnd, ease);
  const allocation = lerp(z.depthStart, z.depthEnd, ease);
  return {
    active: p >= z.start - 1e-9,
    q,
    ease,
    cameraZ,
    allocation,
    plane: lerp(z.worldStart, z.worldEnd, ease),
    parallax: z.parallax,
    foreground: lerp(1, z.foreground, ease),
    background: lerp(1, z.background, ease),
    perspective: z.perspective,
    nodeBlend: lerp(1, z.nodeOpacity, ease),
    edgeBlend: lerp(1, z.edgeOpacity, ease),
    labelBlend: lerp(1, z.labelOpacity, ease),
    resolve: openingGraphResolveAt(p, calibration),
  };
}

// ---------------------------------------------------------------------------
// GRAPH GATHER: the persistent node discs slowly pull together BEFORE the dive
// (0.88 → 0.94 on the scrub, easing midpoint at 0.92). A pure positional scale
// about the stage centre: 1 before the window, falling to 1 − AMOUNT by 0.94.
// The factor multiplies the node SLOT mapping only (worldX/worldY), so the
// glyph dust and early particle density are untouched; reduced motion stays
// fully spread (identity).
// ---------------------------------------------------------------------------

/** Positional gather factor for the node discs at scrub position `p`.
 *  1 outside the window (fully spread), 1 − AMOUNT at/after the end (gathered).
 *  `reduced` motion keeps the identity — the calm final frame is never pulled. */
export function openingGraphConvergeAt(
  p: number,
  reduced: boolean,
): number {
  if (reduced) return 1;
  return 1 - OPENING_CONVERGE_AMOUNT * smoothstep(
    OPENING_CONVERGE_WINDOW.start,
    OPENING_CONVERGE_WINDOW.end,
    p,
  );
}

// ---------------------------------------------------------------------------
// NETWORK RESOLVE: the pure helpers behind the constellation → icon-network
// crossfade. Everything is a function of scroll progress + per-node depth.
// ---------------------------------------------------------------------------

/** The resolve crossfade at scrub position `p` (0 before its window, 1 after).
 *  `networkResolveEase` re-weights the window's smoothstep: >1 holds the morph
 *  back so the crisp nodes snap in at the very end, <1 starts the convert
 *  earlier. Still monotone + bounceless, still {0 @ start, 1 @ end}. */
export function openingGraphResolveAt(
  p: number,
  calibration?: CinematicCalibration | null,
): number {
  const z = zoomAt(calibration);
  const u = smoothstep(z.resolveStart, z.resolveEnd, p);
  return Math.pow(clamp01(u), Math.max(0.2, z.resolveEase));
}

/** The depth threshold that resolves at a given resolve strength: front nodes
 *  (low depth norm) turn into icon circles FIRST, then the cap widens toward
 *  the periphery as the resolve completes. */
export function openingNetworkDepthCapAt(
  resolve: number,
  calibration?: CinematicCalibration | null,
): number {
  const z = zoomAt(calibration);
  return lerp(OPENING_NETWORK_DEPTH_CAP_START, z.depthCap, clamp01(resolve));
}

/** Soft membership gate for a single node: 1 deep inside the resolved cap, 0
 *  at/beyond it, smooth across the feather width. */
export function openingNetworkResolvedDepth(
  depthNorm: number,
  cap: number,
): number {
  return smoothstep(cap, cap - OPENING_NETWORK_DEPTH_FEATHER, depthNorm);
}

/** Edge alpha restyle during the resolve: near edges (mid-distance ~0) stay
 *  crisp, far edges (mid-distance ~1) recede — the demo network's depth feel,
 *  applied to the existing single line buffer. 1 before the resolve starts. */
export function openingNetworkEdgeDepthAlpha(
  depthMid: number,
  resolve: number,
): number {
  const dim = clamp01(depthMid) * OPENING_NETWORK_EDGE_FAR_DIM;
  return lerp(1, 1 - dim, clamp01(resolve));
}

/**
 * Deterministic per-node depth. Stably mixes the node's own id hash with a
 * RADIAL bias (closer to the origin ⟹ closer to the camera), so the perceived
 * core of the network reads as foreground while the periphery recedes. Pure and
 * idempotent — the same id + slot always produces the same depth, unchanged
 * across tiers and rebuilds. Returns [0, 1] (0 = front, 1 = back).
 */
export function openingNodeDepth(id: string, nx: number, ny: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hash01 = (hash >>> 0) / 0xffffffff;
  const radius = Math.min(Math.hypot(nx, ny), 1);
  return clamp01(0.45 * hash01 + 0.55 * radius);
}

/**
 * The distance from the viewer to a node with deterministic depth `depthNorm`,
 * under the current dive frame. Far nodes (1) stay at the far plane; front
 * nodes (0) ride the near plane. `graphPerspective` scales the depth spread.
 */
export function openingGraphZoomDistance(
  frame: OpeningGraphZoomFrame,
  depthNorm: number,
): number {
  const spread = depthNorm * frame.allocation * frame.perspective;
  return Math.max(0.25, frame.cameraZ + (1 - frame.cameraZ) * spread);
}

/** The total visual scale multiplier for a node this frame (incl. fg/bg bias). */
export function openingGraphZoomScale(
  frame: OpeningGraphZoomFrame,
  depthNorm: number,
): number {
  const distance = openingGraphZoomDistance(frame, depthNorm);
  return (1 / distance) * lerp(frame.foreground, frame.background, depthNorm);
}

/** Lateral (parallax) multiplier on a node's world position this frame. */
export function openingGraphZoomParallax(
  frame: OpeningGraphZoomFrame,
  depthNorm: number,
): number {
  return 1 + (1 / openingGraphZoomDistance(frame, depthNorm) - 1) * frame.parallax;
}

/** Per-node depth-space z offset (world z style, − = farther from the camera). */
export function openingGraphZoomZOffset(
  frame: OpeningGraphZoomFrame,
  depthNorm: number,
): number {
  return (depthNorm * OPENING_GRAPH_DEPTH_END - frame.allocation) * 0.35;
}