// ============================================================================
// PR — INDAGO Cinematic Home Opening · Development calibration model
//
// ONE pure, browser-free model behind the ?cinematicCalibrate=1 lab. It owns
// the complete observable surface of the opening as a flat, serialisable record
// (progress, wordmark, particles, decomposition, camera, graph, alignment),
// the production DEFAULTS (imported straight from the opening constants — the
// calibration never invents a second set of numbers), the hard BOUNDS every
// control clamps to, and the export/parse surface.
//
// The panel is only ever a VIEW over this record; the scene reads it through
// the existing handle/effects pipeline. Nothing here touches the DOM, GSAP or
// three, so the whole contract is unit-testable — and the production runtime
// carries no calibration state at all unless the dev query flag is present.
// ============================================================================

import {
  OPENING_CAMERA_PULLBACK_START,
  OPENING_CAMERA_PUSHIN_START,
  OPENING_DECOMPOSE_WINDOW,
  OPENING_EDGE_OPACITY,
  OPENING_EDGE_WINDOW,
  OPENING_FINAL_ZOOM,
  FRAG_LABEL_END,
  FRAG_LABEL_START,
  FRAG_TEXT_END,
  FRAG_TEXT_MAX_WIDTH,
  FRAG_TEXT_OPACITY,
  FRAG_TEXT_SCALE,
  FRAG_TEXT_START,
  FRAG_TEXT_X,
  FRAG_TEXT_Y,
  OPENING_GRAPH_BACKGROUND_SCALE,
  OPENING_GRAPH_CAMERA_END_Z,
  OPENING_GRAPH_CAMERA_START_Z,
  OPENING_GRAPH_DEPTH_END,
  OPENING_GRAPH_DEPTH_START,
  OPENING_GRAPH_FOREGROUND_SCALE,
  OPENING_GRAPH_PARALLAX,
  OPENING_GRAPH_PERSPECTIVE,
  OPENING_GRAPH_SCALE,
  OPENING_GRAPH_WORLD_SCALE_END,
  OPENING_GRAPH_WORLD_SCALE_START,
  OPENING_GRAPH_ZOOM_EASE,
  OPENING_GRAPH_ZOOM_EDGE_OPACITY,
  OPENING_GRAPH_ZOOM_LABEL_OPACITY,
  OPENING_GRAPH_ZOOM_OPACITY,
  OPENING_GRAPH_ZOOM_WINDOW,
  OPENING_HERO_ZOOM,
  OPENING_LABEL_START,
  OPENING_NETWORK_DEPTH_CAP,
  OPENING_NETWORK_NODE_SIZE,
  OPENING_NETWORK_RESOLVE_EASE,
  OPENING_NODE_SCALE,
  OPENING_POINT_SCALE_MAX,
  OPENING_RELEASE_CURL,
  OPENING_RELEASE_SPREAD,
  OPENING_RELEASE_WINDOW,
  OPENING_WIDE_ZOOM,
  OPENING_GRAPH_RESOLVE_WINDOW,
} from "./opening/opening.constants";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * Every tunable the lab exposes. Values are either ABSOLUTE (a zoom, a phase
 * boundary in [0,1], a px offset) or a MULTIPLIER of the production baseline
 * (wordOpacity, particleSize, brightness, …) with a default of exactly 1, so a
 * reset restores the shipped look byte-for-byte.
 */
export interface CinematicCalibration {
  /** Scrubbed progress held while `progressLocked` is on. */
  progress: number;
  /** Freeze the scene at `progress` (detaches the ScrollTrigger). */
  progressLocked: boolean;

  // --- WORDMARK -------------------------------------------------------------
  /** Multiplier on the wordmark/camera scale (1 = shipped). */
  wordScale: number;
  /** Multiplier on the DOM wordmark opacity (1 = shipped). */
  wordOpacity: number;
  /** Multiplier on the DOM wordmark blur (1 = shipped). */
  blurAmount: number;
  /** Explicit letter-spacing in px; null keeps the stylesheet value. */
  letterSpacing: number | null;

  // --- PARTICLES ------------------------------------------------------------
  /** Multiplier on every point radius (1 ≈ the shipped 2–4 CSS px). */
  particleSize: number;
  /** Multiplier on every point alpha (1 = shipped). */
  particleOpacity: number;
  /** Multiplier on the baked point colour (1 = shipped). */
  brightness: number;
  /** Absolute cap on the dissolve swell (production OPENING_POINT_SCALE_MAX). */
  particleScaleMax: number;
  /** Show ONLY the particle field (hide DOM wordmark + graph edges/labels). */
  particlesOnly: boolean;
  /** Draw the calibration world/stage guides over the scene. */
  worldSpace: boolean;

  // --- ALIGNMENT OVERLAYS ---------------------------------------------------
  /** Draw the live DOM wordmark box guide. */
  overlayDom: boolean;
  /** Draw the sampled raster/ink bounds guide. */
  overlayRaster: boolean;
  /** Draw the current particle bounds guide. */
  overlayParticles: boolean;
  /** Draw the stage centre crosshair. */
  overlayCenter: boolean;
  /** Draw every sampled particle as a 1px dot. */
  overlayPoints: boolean;

  // --- DECOMPOSITION --------------------------------------------------------
  /** Global glyph→particle window start (shipped 0.40). */
  decomposeStart: number;
  /** Global glyph→particle window end (shipped 0.68). */
  decomposeEnd: number;
  /** Global node release window start (shipped 0.63). */
  releaseStart: number;
  /** Global node release window end (shipped 0.84). */
  releaseEnd: number;
  /** Outward crack spread (shipped 1.6 — primary motion is outward). */
  releaseSpread: number;
  /** Seeded curl (shipped 0.35 — a subtle imperfection, no downward bias). */
  releaseCurl: number;

  // --- CAMERA ---------------------------------------------------------------
  /** Camera zoom on the hero frame (shipped 1.0). */
  heroZoom: number;
  /** Camera zoom during the wide hold (shipped 0.62). */
  pullbackZoom: number;
  /** Camera zoom on the final graph (shipped 0.9). */
  graphZoom: number;
  /** Where the pull-back begins on the scrub (shipped 0.14). */
  cameraPullbackStart: number;
  /** Where the push-in begins on the scrub (shipped 0.66). */
  cameraPushInStart: number;

  // --- FRAGMENTED DATA (the single restrained statement after disintegration) --
  /** Label fade-in window on the scrub: start (shipped 0.50). */
  fragLabelStart: number;
  /** Label fade-in window on the scrub: end (shipped 0.60). */
  fragLabelEnd: number;
  /** Statement fade-in window on the scrub: start (shipped 0.56). */
  fragTextStart: number;
  /** Statement fade-in window on the scrub: end (shipped 0.68). */
  fragTextEnd: number;
  /** Multiplier on the layer opacity (1 = shipped). */
  fragTextOpacity: number;
  /** Multiplier on the layer scale (1 = shipped). */
  fragTextScale: number;
  /** Layer CSS px offset X (0 = shipped). */
  fragTextX: number;
  /** Layer CSS px offset Y (0 = shipped). */
  fragTextY: number;
  /** Statement max-width in rem (responsiveness ceiling). */
  fragTextMaxWidth: number;

  // --- GRAPH ----------------------------------------------------------------
  /** Edge weave window start (shipped 0.76). */
  edgeStart: number;
  /** Edge weave window end (shipped 0.94). */
  edgeEnd: number;
  /** Edge alpha multiplier (shipped 0.22 — faded, always subordinate). */
  edgeOpacity: number;
  /** Label emergence start on the scrub (shipped 0.93). */
  labelStart: number;
  /** Multiplier on label alpha (1 = shipped). */
  labelOpacity: number;
  /** Multiplier on the graph's world extent (shipped 1.3). */
  graphScale: number;
  /** Multiplier on graph node radii (shipped 2.15 — intentionally LARGE). */
  nodeScale: number;

  // --- GRAPH ZOOM / DEPTH (the final camera dive into the network) -------------
  /** Dive window on the scrub: start (shipped 0.94) → end (shipped 1.00). */
  graphZoomStart: number;
  graphZoomEnd: number;
  /** Near-plane distance of the camera dolly: cameraStartZ 1 = ON the graph. */
  graphCameraStartZ: number;
  graphCameraEndZ: number;
  /** World-constant expansion of the whole graph during the dive. */
  graphWorldScaleStart: number;
  graphWorldScaleEnd: number;
  /** Depth chamber range (0 = flat, 1 = full periphery depth). */
  graphDepthStart: number;
  graphDepthEnd: number;
  /** Near/far extra multipliers on the depth scale. */
  graphForegroundScale: number;
  graphBackgroundScale: number;
  /** Depth-spread master (1 = natural, <1 flattened 2D, >1 exaggerated). */
  graphPerspective: number;
  /** How strongly depth displaces position (the flying-past parallax). */
  graphParallax: number;
  /** Easing exponent on the dive window (>1 = slower, more deliberate settle). */
  graphZoomEase: number;
  /** Node alpha during the dive (1 = unchanged). */
  graphZoomOpacity: number;
  /** Edge alpha during the dive (edges recede as the camera passes through). */
  graphZoomEdgeOpacity: number;
  /** Label alpha during the dive. */
  graphZoomLabelOpacity: number;

  // --- NETWORK RESOLVE (the constellation → demo icon-node design) -----------
  /** Resolve window on the scrub, inside the dive (shipped 0.947 → 0.997). */
  networkResolveStart: number;
  networkResolveEnd: number;
  /** Exponent on the resolve-window smoothstep (>1 snaps in at the end). */
  networkResolveEase: number;
  /** Size multiplier for the resolved DOM icon circles. */
  networkNodeSize: number;
  /** Max depth cap at full resolve: nearer nodes become icon circles. */
  networkDepthCap: number;

  // --- ALIGNMENT (overlay offset ONLY, never a mapping replacement) ---------
  /** Particle-only overlay offset in CSS px (0 = the real mapping). */
  alignmentX: number;
  /** Particle-only overlay offset in CSS px (0 = the real mapping). */
  alignmentY: number;

  // --- GRAPH ZOOM / DEPTH DEBUG (dev-guide toggles, excluded from exports) -----
  /** Draw the dolly axis and depth-chamber guides over the dive. */
  depthGuides: boolean;
  /** Highlight the FRONT nodes (deterministic depth ≤ 0.32). */
  depthShowForeground: boolean;
  /** Highlight the BACK nodes (deterministic depth ≥ 0.68). */
  depthShowBackground: boolean;
  /** Draw the camera / focal depth markers. */
  depthShowCamera: boolean;

  // --- MODES ----------------------------------------------------------------
  /** Frozen neutral side-by-side glyph inspection (excluded from exports). */
  glyphAudit: boolean;
}

export type CinematicCalibrationPresetName =
  | "hero"
  | "mid-decompose"
  | "particle-field"
  | "graph";

export interface CinematicCalibrationPreset {
  readonly name: CinematicCalibrationPresetName;
  readonly label: string;
  readonly patch: Partial<CinematicCalibration>;
}

// ---------------------------------------------------------------------------
// Defaults — imported from production, never re-declared as literals
// ---------------------------------------------------------------------------

export const CINEMATIC_CALIBRATION_DEFAULTS: CinematicCalibration = {
  progress: 0,
  progressLocked: false,

  wordScale: 1,
  wordOpacity: 1,
  blurAmount: 1,
  letterSpacing: null,

  particleSize: 1,
  particleOpacity: 1,
  brightness: 1,
  particleScaleMax: OPENING_POINT_SCALE_MAX,
  particlesOnly: false,
  worldSpace: false,
  overlayDom: false,
  overlayRaster: false,
  overlayParticles: false,
  overlayCenter: false,
  overlayPoints: false,

  decomposeStart: OPENING_DECOMPOSE_WINDOW.start,
  decomposeEnd: OPENING_DECOMPOSE_WINDOW.end,
  releaseStart: OPENING_RELEASE_WINDOW.start,
  releaseEnd: OPENING_RELEASE_WINDOW.end,
  releaseSpread: OPENING_RELEASE_SPREAD,
  releaseCurl: OPENING_RELEASE_CURL,

  heroZoom: OPENING_HERO_ZOOM,
  pullbackZoom: OPENING_WIDE_ZOOM,
  graphZoom: OPENING_FINAL_ZOOM,
  cameraPullbackStart: OPENING_CAMERA_PULLBACK_START,
  cameraPushInStart: OPENING_CAMERA_PUSHIN_START,

  fragLabelStart: FRAG_LABEL_START,
  fragLabelEnd: FRAG_LABEL_END,
  fragTextStart: FRAG_TEXT_START,
  fragTextEnd: FRAG_TEXT_END,
  fragTextOpacity: FRAG_TEXT_OPACITY,
  fragTextScale: FRAG_TEXT_SCALE,
  fragTextX: FRAG_TEXT_X,
  fragTextY: FRAG_TEXT_Y,
  fragTextMaxWidth: FRAG_TEXT_MAX_WIDTH,

  edgeStart: OPENING_EDGE_WINDOW.start,
  edgeEnd: OPENING_EDGE_WINDOW.end,
  edgeOpacity: OPENING_EDGE_OPACITY,
  labelStart: OPENING_LABEL_START,
  labelOpacity: 1,
  graphScale: OPENING_GRAPH_SCALE,
  nodeScale: OPENING_NODE_SCALE,

  graphZoomStart: OPENING_GRAPH_ZOOM_WINDOW.start,
  graphZoomEnd: OPENING_GRAPH_ZOOM_WINDOW.end,
  graphCameraStartZ: OPENING_GRAPH_CAMERA_START_Z,
  graphCameraEndZ: OPENING_GRAPH_CAMERA_END_Z,
  graphWorldScaleStart: OPENING_GRAPH_WORLD_SCALE_START,
  graphWorldScaleEnd: OPENING_GRAPH_WORLD_SCALE_END,
  graphDepthStart: OPENING_GRAPH_DEPTH_START,
  graphDepthEnd: OPENING_GRAPH_DEPTH_END,
  graphForegroundScale: OPENING_GRAPH_FOREGROUND_SCALE,
  graphBackgroundScale: OPENING_GRAPH_BACKGROUND_SCALE,
  graphPerspective: OPENING_GRAPH_PERSPECTIVE,
  graphParallax: OPENING_GRAPH_PARALLAX,
  graphZoomEase: OPENING_GRAPH_ZOOM_EASE,
  graphZoomOpacity: OPENING_GRAPH_ZOOM_OPACITY,
  graphZoomEdgeOpacity: OPENING_GRAPH_ZOOM_EDGE_OPACITY,
  graphZoomLabelOpacity: OPENING_GRAPH_ZOOM_LABEL_OPACITY,

  networkResolveStart: OPENING_GRAPH_RESOLVE_WINDOW.start,
  networkResolveEnd: OPENING_GRAPH_RESOLVE_WINDOW.end,
  networkResolveEase: OPENING_NETWORK_RESOLVE_EASE,
  networkNodeSize: OPENING_NETWORK_NODE_SIZE,
  networkDepthCap: OPENING_NETWORK_DEPTH_CAP,

  depthGuides: false,
  depthShowForeground: false,
  depthShowBackground: false,
  depthShowCamera: false,

  alignmentX: 0,
  alignmentY: 0,

  glyphAudit: false,
};

/** Fresh mutable copy of the production defaults (safe to hand to React). */
export function createCinematicCalibration(): CinematicCalibration {
  return { ...CINEMATIC_CALIBRATION_DEFAULTS };
}

// ---------------------------------------------------------------------------
// Bounds + clamping
// ---------------------------------------------------------------------------

export interface CinematicCalibrationBound {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Numeric keys only — the record's booleans and nullable fields are excluded. */
export type CinematicCalibrationNumericKey =
  | "progress"
  | "wordScale"
  | "wordOpacity"
  | "blurAmount"
  | "particleSize"
  | "particleOpacity"
  | "brightness"
  | "particleScaleMax"
  | "decomposeStart"
  | "decomposeEnd"
  | "releaseStart"
  | "releaseEnd"
  | "releaseSpread"
  | "releaseCurl"
  | "heroZoom"
  | "pullbackZoom"
  | "graphZoom"
  | "cameraPullbackStart"
  | "cameraPushInStart"
  | "fragLabelStart"
  | "fragLabelEnd"
  | "fragTextStart"
  | "fragTextEnd"
  | "fragTextOpacity"
  | "fragTextScale"
  | "fragTextX"
  | "fragTextY"
  | "fragTextMaxWidth"
  | "edgeStart"
  | "edgeEnd"
  | "edgeOpacity"
  | "labelStart"
  | "labelOpacity"
  | "graphScale"
  | "nodeScale"
  | "graphZoomStart"
  | "graphZoomEnd"
  | "graphCameraStartZ"
  | "graphCameraEndZ"
  | "graphWorldScaleStart"
  | "graphWorldScaleEnd"
  | "graphDepthStart"
  | "graphDepthEnd"
  | "graphForegroundScale"
  | "graphBackgroundScale"
  | "graphPerspective"
  | "graphParallax"
  | "graphZoomEase"
  | "graphZoomOpacity"
  | "graphZoomEdgeOpacity"
  | "graphZoomLabelOpacity"
  | "networkResolveStart"
  | "networkResolveEnd"
  | "networkResolveEase"
  | "networkNodeSize"
  | "networkDepthCap"
  | "alignmentX"
  | "alignmentY";

/** Hard bounds for every numeric control. 0.1–4 zoom keeps the camera sane;
 *  opacities stay in [0,1]; particle size stays well below the 15–25 px blobs
 *  the old swell produced (1 ≈ 2–4 CSS px). */
export const CINEMATIC_CALIBRATION_BOUNDS: Readonly<
  Record<CinematicCalibrationNumericKey, CinematicCalibrationBound>
> = {
  progress: { min: 0, max: 1, step: 0.001 },
  wordScale: { min: 0.1, max: 6, step: 0.01 },
  wordOpacity: { min: 0, max: 1, step: 0.01 },
  blurAmount: { min: 0, max: 4, step: 0.01 },
  particleSize: { min: 0.25, max: 4, step: 0.01 },
  particleOpacity: { min: 0, max: 1, step: 0.01 },
  brightness: { min: 0, max: 3, step: 0.01 },
  particleScaleMax: { min: 0.5, max: 3, step: 0.01 },
  decomposeStart: { min: 0, max: 1, step: 0.001 },
  decomposeEnd: { min: 0, max: 1, step: 0.001 },
  releaseStart: { min: 0, max: 1, step: 0.001 },
  releaseEnd: { min: 0, max: 1, step: 0.001 },
  releaseSpread: { min: 0, max: 4, step: 0.01 },
  releaseCurl: { min: -2, max: 2, step: 0.01 },
  heroZoom: { min: 0.1, max: 4, step: 0.01 },
  pullbackZoom: { min: 0.1, max: 4, step: 0.01 },
  graphZoom: { min: 0.1, max: 4, step: 0.01 },
  cameraPullbackStart: { min: 0, max: 1, step: 0.001 },
  cameraPushInStart: { min: 0, max: 1, step: 0.001 },
  fragLabelStart: { min: 0, max: 1, step: 0.001 },
  fragLabelEnd: { min: 0, max: 1, step: 0.001 },
  fragTextStart: { min: 0, max: 1, step: 0.001 },
  fragTextEnd: { min: 0, max: 1, step: 0.001 },
  fragTextOpacity: { min: 0, max: 1, step: 0.01 },
  fragTextScale: { min: 0.1, max: 3, step: 0.01 },
  fragTextX: { min: -600, max: 600, step: 1 },
  fragTextY: { min: -600, max: 600, step: 1 },
  fragTextMaxWidth: { min: 12, max: 72, step: 1 },
  edgeStart: { min: 0, max: 1, step: 0.001 },
  edgeEnd: { min: 0, max: 1, step: 0.001 },
  edgeOpacity: { min: 0, max: 1, step: 0.01 },
  labelStart: { min: 0, max: 1, step: 0.001 },
  labelOpacity: { min: 0, max: 1, step: 0.01 },
  graphScale: { min: 0.2, max: 3, step: 0.01 },
  nodeScale: { min: 0.2, max: 4, step: 0.01 },
  graphZoomStart: { min: 0.5, max: 1, step: 0.001 },
  graphZoomEnd: { min: 0.5, max: 1, step: 0.001 },
  graphCameraStartZ: { min: 0.25, max: 1, step: 0.01 },
  graphCameraEndZ: { min: 0.25, max: 1, step: 0.01 },
  graphWorldScaleStart: { min: 0.5, max: 2, step: 0.01 },
  graphWorldScaleEnd: { min: 0.5, max: 2, step: 0.01 },
  graphDepthStart: { min: 0.05, max: 1.5, step: 0.01 },
  graphDepthEnd: { min: 0.05, max: 1.5, step: 0.01 },
  graphForegroundScale: { min: 0.25, max: 4, step: 0.01 },
  graphBackgroundScale: { min: 0.25, max: 2, step: 0.01 },
  graphPerspective: { min: 0, max: 3, step: 0.01 },
  graphParallax: { min: 0, max: 2, step: 0.01 },
  graphZoomEase: { min: 0.25, max: 3, step: 0.01 },
  graphZoomOpacity: { min: 0, max: 1, step: 0.01 },
  graphZoomEdgeOpacity: { min: 0, max: 1, step: 0.01 },
  graphZoomLabelOpacity: { min: 0, max: 1, step: 0.01 },
  networkResolveStart: { min: 0.5, max: 1, step: 0.001 },
  networkResolveEnd: { min: 0.5, max: 1, step: 0.001 },
  networkResolveEase: { min: 0.3, max: 3, step: 0.01 },
  networkNodeSize: { min: 0.4, max: 2.5, step: 0.05 },
  networkDepthCap: { min: 0.2, max: 0.9, step: 0.01 },
  alignmentX: { min: -400, max: 400, step: 1 },
  alignmentY: { min: -400, max: 400, step: 1 },
};

export const CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND: CinematicCalibrationBound =
  { min: -20, max: 40, step: 0.1 };

const BOOLEAN_KEYS = [
  "progressLocked",
  "particlesOnly",
  "worldSpace",
  "overlayDom",
  "overlayRaster",
  "overlayParticles",
  "overlayCenter",
  "overlayPoints",
  "depthGuides",
  "depthShowForeground",
  "depthShowBackground",
  "depthShowCamera",
  "glyphAudit",
] as const;

/** Clamp one numeric value into its declared bound (NaN→default, ±∞→bound). */
export function clampCalibrationValue(
  key: CinematicCalibrationNumericKey,
  value: number,
): number {
  const bound = CINEMATIC_CALIBRATION_BOUNDS[key];
  if (!Number.isFinite(value)) return CINEMATIC_CALIBRATION_DEFAULTS[key];
  return Math.min(bound.max, Math.max(bound.min, value));
}

/** Force a window `[start, end]` to keep a minimum positive width. */
function normalizeWindow(
  start: number,
  end: number,
  key: CinematicCalibrationNumericKey,
  endKey: CinematicCalibrationNumericKey,
): [number, number] {
  const s = clampCalibrationValue(key, start);
  let e = clampCalibrationValue(endKey, end);
  const minWidth = 0.02;
  if (e - s < minWidth) e = clampCalibrationValue(endKey, s + minWidth);
  return [s, e];
}

/**
 * Merge an untrusted partial patch onto the defaults, clamping every numeric
 * key, coercing booleans, and repairing the decompose/release windows so they
 * can never invert. Unknown keys are ignored. This is the ONLY entry point the
 * panel/reset/paste paths use, so a bad value can never reach the scene.
 */
export function sanitizeCalibration(
  patch: Partial<CinematicCalibration> | null | undefined,
): CinematicCalibration {
  const next: CinematicCalibration = { ...CINEMATIC_CALIBRATION_DEFAULTS };
  if (!patch || typeof patch !== "object") return next;

  for (const key of Object.keys(
    CINEMATIC_CALIBRATION_BOUNDS,
  ) as CinematicCalibrationNumericKey[]) {
    const value = (patch as Record<string, unknown>)[key];
    if (typeof value === "number") next[key] = clampCalibrationValue(key, value);
  }

  for (const key of BOOLEAN_KEYS) {
    const value = (patch as Record<string, unknown>)[key];
    if (typeof value === "boolean") next[key] = value;
  }

  const spacing = (patch as Record<string, unknown>).letterSpacing;
  if (spacing === null) {
    next.letterSpacing = null;
  } else if (typeof spacing === "number" && Number.isFinite(spacing)) {
    next.letterSpacing = Math.min(
      CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND.max,
      Math.max(CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND.min, spacing),
    );
  }

  const [ds, de] = normalizeWindow(
    next.decomposeStart,
    next.decomposeEnd,
    "decomposeStart",
    "decomposeEnd",
  );
  next.decomposeStart = ds;
  next.decomposeEnd = de;

  const [rs, re] = normalizeWindow(
    next.releaseStart,
    next.releaseEnd,
    "releaseStart",
    "releaseEnd",
  );
  next.releaseStart = rs;
  next.releaseEnd = re;

  const [es, ee] = normalizeWindow(
    next.edgeStart,
    next.edgeEnd,
    "edgeStart",
    "edgeEnd",
  );
  next.edgeStart = es;
  next.edgeEnd = ee;

  next.labelStart = clampCalibrationValue("labelStart", next.labelStart);

  const [fl0, fl1] = normalizeWindow(
    next.fragLabelStart,
    next.fragLabelEnd,
    "fragLabelStart",
    "fragLabelEnd",
  );
  next.fragLabelStart = fl0;
  next.fragLabelEnd = fl1;

  const [ft0, ft1] = normalizeWindow(
    next.fragTextStart,
    next.fragTextEnd,
    "fragTextStart",
    "fragTextEnd",
  );
  next.fragTextStart = ft0;
  next.fragTextEnd = ft1;

  const [gz0, gz1] = normalizeWindow(
    next.graphZoomStart,
    next.graphZoomEnd,
    "graphZoomStart",
    "graphZoomEnd",
  );
  next.graphZoomStart = gz0;
  next.graphZoomEnd = gz1;

  const [nr0, nr1] = normalizeWindow(
    next.networkResolveStart,
    next.networkResolveEnd,
    "networkResolveStart",
    "networkResolveEnd",
  );
  next.networkResolveStart = nr0;
  next.networkResolveEnd = nr1;

  next.progress = clampCalibrationValue("progress", next.progress);
  return next;
}

/** One control changed: sanitize the whole record (cheap, ~30 numbers). */
export function applyCalibrationPatch(
  current: CinematicCalibration,
  patch: Partial<CinematicCalibration>,
): CinematicCalibration {
  return sanitizeCalibration({ ...current, ...patch });
}

export function resetCalibration(): CinematicCalibration {
  return createCinematicCalibration();
}

/** Structural equality (used to avoid redundant scene writes / rebuilds). */
export function calibrationEquals(
  a: CinematicCalibration,
  b: CinematicCalibration,
): boolean {
  for (const key of Object.keys(a) as (keyof CinematicCalibration)[]) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Geometry vs visual
// ---------------------------------------------------------------------------

/** Keys whose change alters the DOM↔particle SPATIAL mapping and therefore
 *  requires a (debounced) glyph-field resample. Everything else is visual. */
export const CINEMATIC_CALIBRATION_GEOMETRY_KEYS = [
  "wordScale",
  "letterSpacing",
] as const satisfies readonly (keyof CinematicCalibration)[];

export function calibrationNeedsRebuild(
  previous: CinematicCalibration,
  next: CinematicCalibration,
): boolean {
  return CINEMATIC_CALIBRATION_GEOMETRY_KEYS.some(
    (key) => previous[key] !== next[key],
  );
}

// ---------------------------------------------------------------------------
// Presets + inspection states
// ---------------------------------------------------------------------------

export const CINEMATIC_CALIBRATION_PRESETS: readonly CinematicCalibrationPreset[] =
  [
    {
      name: "hero",
      label: "HERO",
      patch: { progress: 0, progressLocked: true },
    },
    {
      name: "mid-decompose",
      label: "MID DECOMPOSE",
      patch: { progress: 0.5, progressLocked: true },
    },
    {
      name: "particle-field",
      label: "PARTICLE FIELD",
      patch: { progress: 0.7, progressLocked: true },
    },
    {
      name: "graph",
      label: "GRAPH",
      patch: { progress: 1, progressLocked: true },
    },
  ];

export interface CinematicInspectionState {
  readonly label: string;
  readonly progress: number;
}

/** The nine canonical inspection frames from the brief, in order. */
export const CINEMATIC_INSPECTION_STATES: readonly CinematicInspectionState[] = [
  { label: "HERO", progress: 0 },
  { label: "EARLY BLUR", progress: 0.3 },
  { label: "GLYPH PARTICLES", progress: 0.4 },
  { label: "MID DISINTEGRATION", progress: 0.5 },
  { label: "DECOMPOSITION", progress: 0.6 },
  { label: "RELEASED FIELD", progress: 0.7 },
  { label: "FIRST CONNECTIONS", progress: 0.8 },
  { label: "GRAPH FORMING", progress: 0.9 },
  { label: "FINAL GRAPH", progress: 1 },
];

export function applyCalibrationPreset(
  current: CinematicCalibration,
  name: CinematicCalibrationPresetName,
): CinematicCalibration {
  const preset = CINEMATIC_CALIBRATION_PRESETS.find((p) => p.name === name);
  if (!preset) return resolveCalibration(current);
  return applyCalibrationPatch(current, preset.patch);
}

/** Clamp/repair an already-trusted record (idempotent). */
export function resolveCalibration(
  calibration: CinematicCalibration,
): CinematicCalibration {
  return sanitizeCalibration(calibration);
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

const EXPORT_KEY_ORDER: readonly (keyof CinematicCalibration)[] = [
  "progress",
  "progressLocked",
  "wordScale",
  "wordOpacity",
  "blurAmount",
  "letterSpacing",
  "particleSize",
  "particleOpacity",
  "brightness",
  "particleScaleMax",
  "particlesOnly",
  "worldSpace",
  "decomposeStart",
  "decomposeEnd",
  "releaseStart",
  "releaseEnd",
  "releaseSpread",
  "releaseCurl",
  "heroZoom",
  "pullbackZoom",
  "graphZoom",
  "cameraPullbackStart",
  "cameraPushInStart",
  "fragLabelStart",
  "fragLabelEnd",
  "fragTextStart",
  "fragTextEnd",
  "fragTextOpacity",
  "fragTextScale",
  "fragTextX",
  "fragTextY",
  "fragTextMaxWidth",
  "edgeStart",
  "edgeEnd",
  "edgeOpacity",
  "labelStart",
  "labelOpacity",
  "graphScale",
  "nodeScale",
  "graphZoomStart",
  "graphZoomEnd",
  "graphCameraStartZ",
  "graphCameraEndZ",
  "graphWorldScaleStart",
  "graphWorldScaleEnd",
  "graphDepthStart",
  "graphDepthEnd",
  "graphForegroundScale",
  "graphBackgroundScale",
  "graphPerspective",
  "graphParallax",
  "graphZoomEase",
  "graphZoomOpacity",
  "graphZoomEdgeOpacity",
  "graphZoomLabelOpacity",
  "networkResolveStart",
  "networkResolveEnd",
  "networkResolveEase",
  "networkNodeSize",
  "networkDepthCap",
  "alignmentX",
  "alignmentY",
];

/** Clean, deterministic JSON — fixed key order so diffs stay readable. */
export function serializeCalibration(cal: CinematicCalibration): string {
  const resolved = resolveCalibration(cal);
  const out: Record<string, number | boolean | null> = {};
  for (const key of EXPORT_KEY_ORDER) {
    out[key] = resolved[key];
  }
  return JSON.stringify(out, null, 2);
}

export interface CalibrationParseResult {
  readonly ok: boolean;
  readonly value?: CinematicCalibration;
  readonly error?: string;
}

/**
 * Parse a pasted config. Rejects invalid JSON and non-finite numeric values;
 * out-of-range numbers are CLAMPED by `sanitizeCalibration` (documented choice:
 * clamping keeps the scene usable instead of black-screening on a typo).
 */
export function parseCalibration(json: string): CalibrationParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "config must be a JSON object" };
  }
  const record = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { ok: false, error: `${key} must be a finite number` };
    }
    if (typeof value === "string") {
      return { ok: false, error: `${key} must not be a string` };
    }
  }
  return { ok: true, value: sanitizeCalibration(record) };
}

/** TypeScript source the calibrator can paste straight into the codebase. */
export function calibrationToCode(cal: CinematicCalibration): string {
  const resolved = resolveCalibration(cal);
  const lines = EXPORT_KEY_ORDER.map(
    (key) => `  ${key}: ${JSON.stringify(resolved[key])},`,
  );
  return `export const CALIBRATED_CINEMATIC = {\n${lines.join("\n")}\n} as const;\n`;
}

// ---------------------------------------------------------------------------
// Timeline — a separate calibration for EACH moment (keyframes)
// ---------------------------------------------------------------------------

/** One moment on the calibration timeline: the scene-shaping values that apply
 *  AT `progress`. `values` is a normalised CinematicCalibration record whose
 *  session-global fields (progress, overlays, glyphAudit…) are left at their
 *  defaults; only the scene keys are actually read. */
export interface CinematicCalibrationMoment {
  readonly progress: number;
  readonly values: CinematicCalibration;
}

/** Session-global fields (viewer controls, never interpolated): the scrub
 *  position, the lock, and the guide/audit toggles. */
export interface CinematicCalibrationSessionGlobals {
  progress: number;
  progressLocked: boolean;
  worldSpace: boolean;
  overlayDom: boolean;
  overlayRaster: boolean;
  overlayParticles: boolean;
  overlayCenter: boolean;
  overlayPoints: boolean;
  depthGuides: boolean;
  depthShowForeground: boolean;
  depthShowBackground: boolean;
  depthShowCamera: boolean;
  glyphAudit: boolean;
}

/** The dev-lab session: scrub state + the ordered keyframe timeline. */
export interface CinematicCalibrationSession
  extends CinematicCalibrationSessionGlobals {
  readonly keyframes: readonly CinematicCalibrationMoment[];
}

export const CINEMATIC_CALIBRATION_GLOBAL_KEYS = [
  "progress",
  "progressLocked",
  "worldSpace",
  "overlayDom",
  "overlayRaster",
  "overlayParticles",
  "overlayCenter",
  "overlayPoints",
  "depthGuides",
  "depthShowForeground",
  "depthShowBackground",
  "depthShowCamera",
  "glyphAudit",
] as const;

export type CinematicCalibrationGlobalKey =
  (typeof CINEMATIC_CALIBRATION_GLOBAL_KEYS)[number];

export function createCinematicCalibrationSession(): CinematicCalibrationSession {
  return {
    progress: 0,
    progressLocked: false,
    worldSpace: false,
    overlayDom: false,
    overlayRaster: false,
    overlayParticles: false,
    overlayCenter: false,
    overlayPoints: false,
    depthGuides: false,
    depthShowForeground: false,
    depthShowBackground: false,
    depthShowCamera: false,
    glyphAudit: false,
    keyframes: [],
  };
}

export function sessionGlobals(
  session: CinematicCalibrationSession,
): CinematicCalibrationSessionGlobals {
  return {
    progress: session.progress,
    progressLocked: session.progressLocked,
    worldSpace: session.worldSpace,
    overlayDom: session.overlayDom,
    overlayRaster: session.overlayRaster,
    overlayParticles: session.overlayParticles,
    overlayCenter: session.overlayCenter,
    overlayPoints: session.overlayPoints,
    depthGuides: session.depthGuides,
    depthShowForeground: session.depthShowForeground,
    depthShowBackground: session.depthShowBackground,
    depthShowCamera: session.depthShowCamera,
    glyphAudit: session.glyphAudit,
  };
}

/** Reset the session-global fields of any record to their neutral values, so a
 *  stored moment never leaks viewer state into the scene or the export. */
export function stripSessionGlobals(
  record: CinematicCalibration,
): CinematicCalibration {
  return {
    ...record,
    progress: 0,
    progressLocked: false,
    worldSpace: false,
    overlayDom: false,
    overlayRaster: false,
    overlayParticles: false,
    overlayCenter: false,
    overlayPoints: false,
    depthGuides: false,
    depthShowForeground: false,
    depthShowBackground: false,
    depthShowCamera: false,
    glyphAudit: false,
  };
}

export const MOMENT_TOLERANCE = 0.001;

export function momentAt(
  keyframes: readonly CinematicCalibrationMoment[],
  progress: number,
): CinematicCalibrationMoment | undefined {
  for (const moment of keyframes) {
    if (Math.abs(moment.progress - progress) <= MOMENT_TOLERANCE) return moment;
  }
  return undefined;
}

/** Add or replace the moment at `progress` in place (append; sorted on use). */
export function upsertMoment(
  keyframes: readonly CinematicCalibrationMoment[],
  moment: CinematicCalibrationMoment,
): CinematicCalibrationMoment[] {
  const cleaned: CinematicCalibrationMoment = {
    progress: clampCalibrationValue("progress", moment.progress),
    values: stripSessionGlobals(resolveCalibration(moment.values)),
  };
  const rest = keyframes.filter(
    (existing) => Math.abs(existing.progress - cleaned.progress) > MOMENT_TOLERANCE,
  );
  return [...rest, cleaned];
}

function sortedMoments(
  keyframes: readonly CinematicCalibrationMoment[],
): CinematicCalibrationMoment[] {
  return [...keyframes].sort((a, b) => a.progress - b.progress);
}

/** Numeric scene keys that lerp between moments (everything except `progress`,
 *  which is session state). */
export const CINEMATIC_CALIBRATION_INTERPOLATED_KEYS: readonly CinematicCalibrationNumericKey[] =
  (Object.keys(CINEMATIC_CALIBRATION_BOUNDS) as CinematicCalibrationNumericKey[]).filter(
    (key) => key !== "progress",
  );

/** Evaluate the timeline AT a scrub position: linear interpolation of every
 *  numeric scene key between the two bracketing moments; booleans are held on
 *  the preceding moment (a 0/1 toggle can't lerp); before the first / after
 *  the last moment the nearest moment's values hold. Session globals overlay
 *  the result so the caller gets a complete, scene-ready record. */
export function interpolateCalibrationAt(
  keyframes: readonly CinematicCalibrationMoment[],
  progress: number,
  globals: CinematicCalibrationSessionGlobals,
): CinematicCalibration {
  const p = clampCalibrationValue("progress", progress);
  const base: CinematicCalibration = {
    ...CINEMATIC_CALIBRATION_DEFAULTS,
    ...globals,
    progress: p,
  };
  const sorted = sortedMoments(keyframes);
  if (sorted.length === 0) return base;

  const first = sorted[0]!;
  if (first && p <= first.progress) {
    return {
      ...CINEMATIC_CALIBRATION_DEFAULTS,
      ...first.values,
      ...globals,
      progress: p,
    };
  }
  const last = sorted[sorted.length - 1]!;
  if (last && p >= last.progress) {
    return {
      ...CINEMATIC_CALIBRATION_DEFAULTS,
      ...last.values,
      ...globals,
      progress: p,
    };
  }

  let index = 0;
  while (index < sorted.length - 2 && sorted[index + 1]!.progress <= p) {
    index += 1;
  }
  const k0 = sorted[index]!;
  const k1 = sorted[index + 1]!;
  const span = k1.progress - k0.progress;
  const t = span <= 0 ? 0 : (p - k0.progress) / span;

  for (const key of CINEMATIC_CALIBRATION_INTERPOLATED_KEYS) {
    const key0 = k0.values[key];
    const key1 = k1.values[key];
    base[key] = key0 + (key1 - key0) * t;
  }

  const left = k0.values.letterSpacing;
  const right = k1.values.letterSpacing;
  base.letterSpacing =
    left === null || right === null
      ? (left ?? right)
      : left + (right - left) * t;
  base.particlesOnly = k0.values.particlesOnly;
  return base;
}

/** The full scene-ready record for a session's current scrub position. */
export function sessionEffective(
  session: CinematicCalibrationSession,
): CinematicCalibration {
  return interpolateCalibrationAt(
    session.keyframes,
    session.progress,
    sessionGlobals(session),
  );
}

/** The moments' own keys (scene values only — never session-global fields). */
export const CINEMATIC_MOMENT_EXPORT_KEYS: readonly (keyof CinematicCalibration)[] =
  EXPORT_KEY_ORDER.filter(
    (key) =>
      key !== "progress" &&
      key !== "progressLocked" &&
      (CINEMATIC_CALIBRATION_GLOBAL_KEYS as readonly string[]).indexOf(key) === -1,
  );

function momentExportValues(moment: CinematicCalibrationMoment): Record<string, number | boolean | null> {
  const resolved = resolveCalibration(moment.values);
  const out: Record<string, number | boolean | null> = {};
  for (const key of CINEMATIC_MOMENT_EXPORT_KEYS) out[key] = resolved[key];
  return out;
}

/** Deterministic JSON: session globals on top, then every moment in order. */
export function serializeCalibrationSession(
  session: CinematicCalibrationSession,
): string {
  return JSON.stringify(
    {
      ...sessionGlobals(session),
      keyframes: sortedMoments(session.keyframes).map((moment) => ({
        progress: moment.progress,
        values: momentExportValues(moment),
      })),
    },
    null,
    2,
  );
}

export interface CalibrationSessionParseResult {
  readonly ok: boolean;
  readonly value?: CinematicCalibrationSession;
  readonly error?: string;
}

function rejectInvalidValues(
  record: Record<string, unknown>,
): string | null {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") return `${key} must not be a string`;
    if (typeof value === "number" && !Number.isFinite(value)) {
      return `${key} must be a finite number`;
    }
  }
  return null;
}

/** Reverse of `serializeCalibrationSession`. Out-of-range numbers are clamped
 *  (never rejected); strings / non-finite values are rejected, exactly like the
 *  single-record parser. */
export function parseCalibrationSession(
  json: string,
): CalibrationSessionParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "config must be a JSON object" };
  }
  const record = raw as Record<string, unknown>;
  const invalid = rejectInvalidValues(record);
  if (invalid) return { ok: false, error: invalid };

  const session = createCinematicCalibrationSession();
  if (typeof record.progress === "number") {
    session.progress = clampCalibrationValue("progress", record.progress);
  }
  const sessionRecord = session as unknown as Record<string, unknown>;
  for (const key of CINEMATIC_CALIBRATION_GLOBAL_KEYS) {
    if (key === "progress") continue;
    const value = record[key];
    if (typeof value === "boolean") sessionRecord[key] = value;
  }

  let keyframes: CinematicCalibrationMoment[] = [];
  if (record.keyframes !== undefined) {
    if (!Array.isArray(record.keyframes)) {
      return { ok: false, error: "keyframes must be an array" };
    }
    for (const entry of record.keyframes) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return { ok: false, error: "each keyframe must be an object" };
      }
      const frame = entry as Record<string, unknown>;
      const frameInvalid = rejectInvalidValues(frame);
      if (frameInvalid) return { ok: false, error: frameInvalid };
      const values = frame.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return { ok: false, error: "each keyframe needs a values object" };
      }
      const valuesInvalid = rejectInvalidValues(values as Record<string, unknown>);
      if (valuesInvalid) return { ok: false, error: valuesInvalid };
      if (typeof frame.progress !== "number") {
        return { ok: false, error: "keyframe progress must be a number" };
      }
      keyframes = upsertMoment(keyframes, {
        progress: frame.progress,
        values: sanitizeCalibration(values as Record<string, unknown>),
      });
    }
  }
  return { ok: true, value: { ...session, keyframes } };
}

// ---------------------------------------------------------------------------
// Shipping timeline — the production bake (approved in the calibration lab)
// ---------------------------------------------------------------------------

/** Neutral session globals for the baked timeline: the shipped scene never
 *  carries viewer/lab state (scrub position, lock, guide toggles). */
const OPENING_SHIPPING_GLOBALS: CinematicCalibrationSessionGlobals = {
  progress: 0,
  progressLocked: false,
  worldSpace: false,
  overlayDom: false,
  overlayRaster: false,
  overlayParticles: false,
  overlayCenter: false,
  overlayPoints: false,
  depthGuides: false,
  depthShowForeground: false,
  depthShowBackground: false,
  depthShowCamera: false,
  glyphAudit: false,
};

/** The scene fields that every approved moment shares verbatim (1 = shipped).
 *  Each moment below only carries its deltas on top of this record, so a retune
 *  of one field stays a one-line edit and cannot drift the rest. */
const OPENING_SHIPPING_STATIC: CinematicCalibration = {
  progress: 0,
  progressLocked: false,
  wordScale: 1,
  wordOpacity: 1,
  blurAmount: 1,
  letterSpacing: null,
  particleSize: 1,
  particleOpacity: 1,
  brightness: 1,
  particleScaleMax: OPENING_POINT_SCALE_MAX,
  particlesOnly: false,
  worldSpace: false,
  overlayDom: false,
  overlayRaster: false,
  overlayParticles: false,
  overlayCenter: false,
  overlayPoints: false,
  decomposeStart: OPENING_DECOMPOSE_WINDOW.start,
  decomposeEnd: OPENING_DECOMPOSE_WINDOW.end,
  releaseStart: OPENING_RELEASE_WINDOW.start,
  releaseEnd: OPENING_RELEASE_WINDOW.end,
  releaseSpread: OPENING_RELEASE_SPREAD,
  releaseCurl: OPENING_RELEASE_CURL,
  heroZoom: 1,
  pullbackZoom: 0.62,
  graphZoom: 0.9,
  cameraPullbackStart: 0.14,
  cameraPushInStart: OPENING_CAMERA_PUSHIN_START,
  fragLabelStart: FRAG_LABEL_START,
  fragLabelEnd: FRAG_LABEL_END,
  fragTextStart: FRAG_TEXT_START,
  fragTextEnd: FRAG_TEXT_END,
  fragTextOpacity: FRAG_TEXT_OPACITY,
  fragTextScale: FRAG_TEXT_SCALE,
  fragTextX: FRAG_TEXT_X,
  fragTextY: FRAG_TEXT_Y,
  fragTextMaxWidth: FRAG_TEXT_MAX_WIDTH,
  edgeStart: OPENING_EDGE_WINDOW.start,
  edgeEnd: OPENING_EDGE_WINDOW.end,
  edgeOpacity: OPENING_EDGE_OPACITY,
  labelStart: OPENING_LABEL_START,
  labelOpacity: 1,
  graphScale: OPENING_GRAPH_SCALE,
  nodeScale: OPENING_NODE_SCALE,
  graphZoomStart: OPENING_GRAPH_ZOOM_WINDOW.start,
  graphZoomEnd: OPENING_GRAPH_ZOOM_WINDOW.end,
  graphCameraStartZ: OPENING_GRAPH_CAMERA_START_Z,
  graphCameraEndZ: OPENING_GRAPH_CAMERA_END_Z,
  graphWorldScaleStart: OPENING_GRAPH_WORLD_SCALE_START,
  graphWorldScaleEnd: OPENING_GRAPH_WORLD_SCALE_END,
  graphDepthStart: OPENING_GRAPH_DEPTH_START,
  graphDepthEnd: OPENING_GRAPH_DEPTH_END,
  graphForegroundScale: OPENING_GRAPH_FOREGROUND_SCALE,
  graphBackgroundScale: OPENING_GRAPH_BACKGROUND_SCALE,
  graphPerspective: OPENING_GRAPH_PERSPECTIVE,
  graphParallax: OPENING_GRAPH_PARALLAX,
  graphZoomEase: OPENING_GRAPH_ZOOM_EASE,
  graphZoomOpacity: OPENING_GRAPH_ZOOM_OPACITY,
  graphZoomEdgeOpacity: OPENING_GRAPH_ZOOM_EDGE_OPACITY,
  graphZoomLabelOpacity: OPENING_GRAPH_ZOOM_LABEL_OPACITY,
  networkResolveStart: OPENING_GRAPH_RESOLVE_WINDOW.start,
  networkResolveEnd: OPENING_GRAPH_RESOLVE_WINDOW.end,
  networkResolveEase: OPENING_NETWORK_RESOLVE_EASE,
  networkNodeSize: OPENING_NETWORK_NODE_SIZE,
  networkDepthCap: OPENING_NETWORK_DEPTH_CAP,
  alignmentX: 0,
  alignmentY: 0,
  depthGuides: false,
  depthShowForeground: false,
  depthShowBackground: false,
  depthShowCamera: false,
  glyphAudit: false,
};

/** Compose one approved moment from its deltas over the static record. */
function shippingMoment(
  progress: number,
  patch: Partial<CinematicCalibration>,
): CinematicCalibrationMoment {
  return {
    progress,
    values: { ...OPENING_SHIPPING_STATIC, ...patch },
  };
}

/** The 7 approved moments from the lab, reproduced EXACTLY — the values the
 *  artist scrubbed on ?cinematicCalibrate=1. The production runtime evaluates
 *  this table through the same `interpolateCalibrationAt` the panel uses, so
 *  the public scroll reproduces the approved choreography byte-for-byte. */
export const OPENING_SHIPPING_MOMENTS: readonly CinematicCalibrationMoment[] = [
  shippingMoment(0.722, {
    // Rest state: every field here equals the static record (particles at their
    // sharp-word baseline, neutral brightness/tint, art-directed edges/labels).
    particleSize: 1,
    particleScaleMax: 2.16,
    brightness: 1,
    edgeStart: 0.76,
    edgeEnd: 0.94,
    labelStart: 0.93,
  }),
  shippingMoment(0.746, {
    particleSize: 1.83,
  }),
  shippingMoment(0.795, {
    particleSize: 2.32,
  }),
  shippingMoment(0.868, {
    particleSize: 3.25,
  }),
  shippingMoment(0.917, {
    particleSize: 3.85,
    brightness: 0.95,
    particleScaleMax: 2.56,
  }),
  shippingMoment(0.965, {
    particleSize: 4,
    brightness: 0.73,
    particleScaleMax: 3,
  }),
  shippingMoment(1, {
    particleSize: 4,
    particleOpacity: 0.3,
    brightness: 0.73,
    particleScaleMax: 3,
    graphZoomStart: 0.912,
    graphPerspective: 1.92,
  }),
];

/** The approved production choreography AT a scrub position — the immutable
 *  timeline the shipped Home evaluates when no dev calibration session is open.
 *  Reduced motion pins the evaluation to the final approved frame (p = 1). */
export function shippingCalibrationAt(progress: number): CinematicCalibration {
  return interpolateCalibrationAt(
    OPENING_SHIPPING_MOMENTS,
    progress,
    OPENING_SHIPPING_GLOBALS,
  );
}

/** A dev-lab session seeded with the approved production timeline, so a fresh
 *  (or reset) calibration-lab load reproduces the shipped choreography instead
 *  of running the neutral defaults — the ramp, dim and dive are visible on
 *  scrub immediately. */
export function createShippingCalibrationSession(): CinematicCalibrationSession {
  return {
    ...createCinematicCalibrationSession(),
    keyframes: OPENING_SHIPPING_MOMENTS,
  };
}

/** TypeScript source for the whole timeline, pasted straight into the repo. */
export function calibrationSessionToCode(
  session: CinematicCalibrationSession,
): string {
  const globals = sessionGlobals(session);
  const topLines = CINEMATIC_CALIBRATION_GLOBAL_KEYS.map(
    (key) =>
      `  ${key}: ${JSON.stringify(globals[key])},`,
  );
  const momentLines = sortedMoments(session.keyframes).map((moment) => {
    const values = momentExportValues(moment);
    const body = Object.entries(values)
      .map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`)
      .join("\n");
    return `  {\n    progress: ${JSON.stringify(moment.progress)},\n    values: {\n${body}\n    },\n  },`;
  });
  return `export const CALIBRATED_CINEMATIC_SESSION = {\n${topLines.join(
    "\n",
  )}\n  keyframes: [\n${momentLines.join("\n")}\n  ],\n} as const;\n`;
}
