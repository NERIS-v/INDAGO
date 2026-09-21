// ============================================================================
// PR1 · Cinematic Home — Foundation · Constants
//
// Pure module (no DOM, no GSAP, no R3F) so the scroll contract is
// unit-testable without a browser. The opening choreography and its phase
// table live in the opening modules — this file keeps only the
// framework-level scroll/geometry contract.
// ============================================================================

export const IS_DEV = process.env.NODE_ENV !== "production";

/** Query parameter that activates the development-only debug overlay. */
export const CINEMATIC_DEBUG_QUERY_PARAM = "cinematicDebug";

/** Query parameter that activates the glyph-audit view: the debug overlay plus
 *  the 50%-opacity layer comparison, so the DOM wordmark and the sampled
 *  particle field can be inspected on top of each other without clicking. */
export const CINEMATIC_GLYPH_AUDIT_QUERY_PARAM = "cinematicGlyphAudit";

/** Query parameter that activates the development-only Cinematic Calibration
 *  Lab (?cinematicCalibrate=1). Never honored outside development. */
export const CINEMATIC_CALIBRATE_QUERY_PARAM = "cinematicCalibrate";

/**
 * Reserved scroll DISTANCE (in svh) scrubbed by the pinned stage, full motion.
 * The track wraps the stage and stands viewport + this distance tall, so the
 * 100svh stage is pinned from "top top" across this many svh of real scroll.
 * STEP 2 of the rebuild: the pinned journey is LIMITED to the break moment —
 * the wordmark is shown sharp, pulls back, then fades exactly as it cracks
 * into its pieces IN PLACE (with later phases frozen). The scroll is sized so
 * the break lands well before the track ends and the remaining distance is a
 * short, calm hold on the broken pieces rather than a full graph journey.
 * Reduced motion collapses it to 0 (the track = the stage).
 */
export const CINEMATIC_SCROLL_DISTANCE_SVH = 360;

/**
 * Pin END position — the standard ScrollTrigger "max" keyword, i.e. the
 * scroller's real maximum scroll (scrollHeight − viewport, re-derived on every
 * refresh). Locking the end to the document's actual scroll extent (instead of
 * a px distance recomputed from window.innerHeight) is what makes the release
 * point R coincide with the current scroll position P on every device:
 * GSAP's anti-flash guard holds the pinned stage at the boundary, so reversing
 * from the end re-enters the pin continuously instead of snapping the stage
 * back up from its natural flow position (the "reverse-scroll pin release
 * jump"). The explicit scroll DURATION stays owned by the track height
 * (CINEMATIC_SCROLL_DISTANCE_SVH), which is the only thing taller than the
 * viewport on the home route.
 */
export const CINEMATIC_PIN_END = "max";

/**
 * Reserved scroll distance in reduced motion: the track collapses to the
 * stage (distance 0 ⇒ no pin, no blank space, nothing to scrub).
 */
export const CINEMATIC_SCROLL_DISTANCE_COLLAPSED_SVH = 0;

/** Convert a scroll distance in svh units into px for a given viewport. */
export function cinematicScrollDistancePx(
  scrollDistanceVh: number,
  viewportHeightPx: number,
): number {
  return (scrollDistanceVh / 100) * Math.max(0, viewportHeightPx);
}

/**
 * True when the URL explicitly requests the cinematic diagnostics output
 * (?cinematicDebug=1). SSR-safe (returns false without a window), so markers
 * and the debug overlay share one source of truth and both default to off.
 */
export function isCinematicDiagnosticsRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get(CINEMATIC_DEBUG_QUERY_PARAM) === "1" ||
      params.get(CINEMATIC_GLYPH_AUDIT_QUERY_PARAM) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * True when the URL requests the glyph audit (?cinematicGlyphAudit=1). This
 * implies the diagnostics overlay AND turns on the 50%-opacity layer compare.
 */
export function isCinematicGlyphAuditRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      new URLSearchParams(window.location.search).get(
        CINEMATIC_GLYPH_AUDIT_QUERY_PARAM,
      ) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * True when the URL requests the Calibration Lab (?cinematicCalibrate=1). The
 * lab is development-only: a production build always returns false, so the
 * panel and its overrides can never ship.
 */
export function isCinematicCalibrationRequested(): boolean {
  if (!IS_DEV) return false;
  if (typeof window === "undefined") return false;
  try {
    return (
      new URLSearchParams(window.location.search).get(
        CINEMATIC_CALIBRATE_QUERY_PARAM,
      ) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * Orthographic camera design bounds. The vertical half-extent is the fixed
 * design unit; the horizontal half-extent follows the aspect ratio. The graph
 * and the wordmark both live comfortably inside the same world units, which
 * keeps the narrative transitions free of perspective distortion.
 */
export const CINEMATIC_CAMERA_HALF_EXTENT = 3;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Clamp arbitrary scroll-derived values into the normalized 0 → 1 range. */
export function normalizeProgress(value: number): number {
  return clamp01(value);
}

/** Centered orthographic bounds for a given aspect ratio (world units). */
export function cinematicCameraBounds(aspect: number): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const halfH = CINEMATIC_CAMERA_HALF_EXTENT;
  const halfW = halfH * Math.max(aspect, 0.01);
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}