// ============================================================================
// PR — INDAGO Cinematic Home Opening · Progress pipeline
//
// Every visible thing that moves on the scrub axis is a PURE function of
// progress p ∈ [0,1] — no state, no rAF, no three. This is the single source
// of truth the controller, the scenes and the debug overlay all share, and it
// is exactly the surface the progress/phase choreography suites freeze.
//
// The seven phases are OVERLAPPING windows that crossfade instead of gluing:
//   hero           0.00 – 0.12   large, sharp, COMPLETELY stable INDAGO
//   pullback       0.12 – 0.28   the viewer moves away — the word shrinks
//   focusLoss      0.28 – 0.45   the wordmark progressively loses focus
//   disintegration 0.40 – 0.68   glyph structure breaks apart into particles
//   nodeRelease    0.63 – 0.84   those particles separate toward organic slots
//   graphConnect   0.76 – 0.94   edges weave in as the camera pushes back in
//   graphResolve   0.90 – 1.00   sharp, clean organic graph — camera settles
//
// The camera is ONE continuous dolly: close on the hero (1.0), out to a wide
// 0.62 held through the disintegration and the start of the release, then a
// slow push back IN to 0.9 at the final graph. Node visibility is gated — the
// letters begin with ZERO particles; the glyph-derived nodes appear only
// inside the disintegration window, hold their letter positions, then travel
// to their organic slots during the release.
//
// Reduced motion collapses the journey into a static, calm final frame: the
// wordmark stays as a title, the graph is already there, and nothing blurs.
// ============================================================================

import type {
  CinematicInteractionMode,
  OpeningPhaseName,
  OpeningPhaseRange,
} from "../cinematic.types";
import {
  OPENING_CAMERA_PULLBACK_START,
  OPENING_CAMERA_PUSHIN_START,
  OPENING_DECOMPOSE_WINDOW,
  OPENING_EDGE_OPACITY,
  OPENING_EDGE_WINDOW,
  OPENING_FINAL_ZOOM,
  OPENING_HERO_ZOOM,
  OPENING_LABEL_OPACITY,
  OPENING_LABEL_START,
  OPENING_PARTICLE_SIZE_RAMP,
  OPENING_PHASES,
  OPENING_WIDE_ZOOM,
} from "./opening.constants";
import type { CinematicCalibration } from "../cinematic.calibration";
import { shippingCalibrationAt } from "../cinematic.calibration";
import type {
  OpeningCameraState,
  OpeningSnapshot,
  OpeningWordmarkCues,
} from "./opening.types";

/** Fixed dolly durations (the calibration only moves their START on the axis). */
const CAMERA_PULLBACK_DURATION = 0.3 - OPENING_CAMERA_PULLBACK_START;
const CAMERA_PUSH_IN_DURATION = 0.92 - OPENING_CAMERA_PUSHIN_START;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const PHASE_ORDER: readonly OpeningPhaseName[] = [
  "hero",
  "pullback",
  "focusLoss",
  "disintegration",
  "nodeRelease",
  "graphConnect",
  "graphResolve",
];

/** Named range from the single source of truth. */
function openingPhaseRange(name: OpeningPhaseName): OpeningPhaseRange {
  const range = OPENING_PHASES.find((phase) => phase.name === name);
  if (!range) throw new Error(`unknown opening phase: ${name}`);
  return range;
}

/** Self-check the phase table: ordered, in-bounds, covering [0,1] — overlaps are by design. */
export function assertOpeningPhasesValid(): boolean {
  if (OPENING_PHASES.length !== PHASE_ORDER.length) return false;
  if (OPENING_PHASES.length === 0) return false;
  for (const name of PHASE_ORDER) {
    if (openingPhaseRange(name).name !== name) return false;
  }
  const first = OPENING_PHASES[0]!;
  const last = OPENING_PHASES[OPENING_PHASES.length - 1]!;
  if (!(first.start === 0)) return false;
  if (!(last.end === 1)) return false;
  for (const phase of OPENING_PHASES) {
    if (!(phase.start < phase.end)) return false;
    if (!(phase.start >= 0 && phase.end <= 1)) return false;
  }
  for (let i = 1; i < OPENING_PHASES.length; i++) {
    if (OPENING_PHASES[i]!.start < OPENING_PHASES[i - 1]!.start) return false;
  }
  return true;
}

/**
 * The phase that OWNS a scrub position: the most-recently-BEGUN window that
 * still contains `p`. Because windows overlap, late windows (graphConnect,
 * graphResolve) take over as soon as they begin, which is what makes the
 * crossfades read.
 */
export function openingPhaseAt(p: number): OpeningPhaseName {
  const t = clamp01(p);
  let current: OpeningPhaseName = PHASE_ORDER[0]!;
  for (const name of PHASE_ORDER) {
    if (t >= openingPhaseRange(name).start) {
      current = name;
    } else {
      break;
    }
  }
  return current;
}

export function openingPhaseProgressAt(p: number, phase?: OpeningPhaseName): number {
  const t = clamp01(p);
  const name = phase ?? openingPhaseAt(t);
  const bounds = openingPhaseRange(name);
  return clamp01((t - bounds.start) / (bounds.end - bounds.start));
}

/** One continuous dolly: hero 1.0 → wide 0.62 (during pullback) → hold → 0.9.
 *  Strictly derived from p — reverse/rapid scroll yanks the camera with it.
 *  A calibration override may retune the three zooms and the two window starts
 *  (the durations stay fixed), but the curve shape is unchanged. */
export function openingCameraAt(
  p: number,
  calibration?: CinematicCalibration | null,
): OpeningCameraState {
  const heroZoom = calibration?.heroZoom ?? OPENING_HERO_ZOOM;
  const wideZoom = calibration?.pullbackZoom ?? OPENING_WIDE_ZOOM;
  const finalZoom = calibration?.graphZoom ?? OPENING_FINAL_ZOOM;
  const pullStart = calibration?.cameraPullbackStart ?? OPENING_CAMERA_PULLBACK_START;
  const pushStart = calibration?.cameraPushInStart ?? OPENING_CAMERA_PUSHIN_START;
  const pull = smoothstep(pullStart, pullStart + CAMERA_PULLBACK_DURATION, p);
  const rise = smoothstep(pushStart, pushStart + CAMERA_PUSH_IN_DURATION, p);
  return {
    centerX: 0,
    centerY: 0,
    zoom: heroZoom + (wideZoom - heroZoom) * pull + (finalZoom - wideZoom) * rise,
  };
}

export function openingWordmarkCues(
  p: number,
  reduced: boolean,
  zoom: number = openingCameraAt(p).zoom,
  calibration?: CinematicCalibration | null,
): OpeningWordmarkCues {
  if (reduced) {
    return { opacity: 1, blurPx: 0, scale: 1 };
  }
  const wordScale = calibration?.wordScale ?? 1;
  const wordOpacity = calibration?.wordOpacity ?? 1;
  const blurAmount = calibration?.blurAmount ?? 1;
  // STEP 2: the font begins to fade EXACTLY when the word breaks apart — the
  // fade and the in-place crack share one window, so the letters burst into
  // their pieces instead of dissolving with nothing breaking.
  const settle = 1 - smoothstep(
    calibration?.decomposeStart ?? OPENING_DECOMPOSE_WINDOW.start,
    calibration?.decomposeEnd ?? OPENING_DECOMPOSE_WINDOW.end,
    p,
  );
  return {
    opacity: settle * wordOpacity,
    blurPx:
      (6 * smoothstep(0.28, 0.45, p) + 9 * smoothstep(0.47, 0.58, p)) *
      blurAmount,
    scale: zoom * wordScale,
  };
}

export function openingDecompose(
  p: number,
  calibration?: CinematicCalibration | null,
): number {
  return smoothstep(
    calibration?.decomposeStart ?? OPENING_DECOMPOSE_WINDOW.start,
    calibration?.decomposeEnd ?? OPENING_DECOMPOSE_WINDOW.end,
    p,
  );
}

/** Three interleaved smoothsteps — reads as a slower, richer dissolve. */
export function openingDecomposeVisual(
  p: number,
  calibration?: CinematicCalibration | null,
): number {
  const u = openingDecompose(p, calibration);
  return (
    (smoothstep(0, 0.3, u) + smoothstep(0.2, 0.6, u) + smoothstep(0.5, 1, u)) / 3
  );
}

export function openingRelease(
  p: number,
  calibration?: CinematicCalibration | null,
): number {
  return smoothstep(
    calibration?.releaseStart ?? 0.63,
    calibration?.releaseEnd ?? 0.84,
    p,
  );
}

/** Shipped particle-size ramp: the deliberate, never-flattened climb from the
 *  sharp-word default (1.0) through the INDAGO overlap (1.57) into the large
 *  final graph (3.25). Piecewise-linear between the art-directed keys; before
 *  the first key and after the last the nearest key holds. */
export function openingParticleSizeAt(p: number): number {
  const ramp = OPENING_PARTICLE_SIZE_RAMP;
  const t = clamp01(p);
  if (t <= ramp[0]!.at) return ramp[0]!.size;
  if (t >= ramp[ramp.length - 1]!.at) return ramp[ramp.length - 1]!.size;
  for (let i = 1; i < ramp.length; i += 1) {
    const a = ramp[i - 1]!;
    const b = ramp[i]!;
    if (t <= b.at) {
      return lerp(a.size, b.size, (t - a.at) / (b.at - a.at));
    }
  }
  return ramp[ramp.length - 1]!.size;
}

export function openingGlyphPresence(u: number): number {
  return 1 - smoothstep(0.5, 1, u);
}

export function openingGlyphHold(p: number): number {
  return smoothstep(0.12, 0.2, p);
}

/** Window-local dissolve saturation for one node (0 → still a glyph). */
export function openingDecomposeAt(start: number, decompose: number): number {
  return clamp01((decompose - start) / (1 - start));
}

/** Window-local release saturation for one node (0 → still a glyph). */
export function openingReleaseAt(start: number, release: number): number {
  return clamp01((release - start) / (1 - start));
}

/**
 * Node visibility. The letters START with ZERO particles: a node stays fully
 * invisible until its own decompose anchor passes inside the disintegration
 * window, then it arrives holding its glyph position (so the particle wordmark
 * replaces the dissolving HTML letters just as those fade). It stays visible
 * through the release travel and finishes at its class's decorative alpha.
 * Purely monotone — nothing pokes or flickers between phases.
 */
export function openingNodeAlpha(
  decomposeLocal: number,
  releaseLocal: number,
  classAlpha: number,
  reduced: boolean,
): number {
  if (reduced) return classAlpha;
  const appear = smoothstep(0, 0.55, decomposeLocal);
  const settle = smoothstep(0.2, 0.9, releaseLocal);
  return classAlpha * Math.min(1, appear + settle * 0.25);
}

export function openingEdgeAlpha(
  formationStart: number,
  p: number,
  reduced: boolean,
  window?: { readonly start: number; readonly end: number },
  opacity: number = OPENING_EDGE_OPACITY,
): number {
  if (reduced) return 0.7 * opacity;
  const win = window ?? OPENING_EDGE_WINDOW;
  // Re-express the per-edge ASTAGGER (authored inside the production window)
  // proportionally inside the calibration window, so retuning the global window
  // moves every edge together without destroying the weave order.
  const span = OPENING_EDGE_WINDOW.end - OPENING_EDGE_WINDOW.start;
  const norm = clamp01(
    (formationStart - OPENING_EDGE_WINDOW.start) / Math.max(span, 1e-6),
  );
  const start = win.start + norm * (win.end - win.start);
  return smoothstep(start, Math.min(start + 0.08, 0.98), p) * opacity;
}

export function openingLabelAlpha(
  index: number,
  p: number,
  reduced: boolean,
  labelStart: number = OPENING_LABEL_START,
  opacity: number = 1,
): number {
  if (reduced) return 0.6 * opacity;
  const start = labelStart + index * 0.03;
  return smoothstep(start, start + 0.06, p) * OPENING_LABEL_OPACITY * opacity;
}

export function openingHazeAt(p: number): number {
  return 0.05 + 0.16 * smoothstep(0.5, 0.85, p);
}

export function openingAmbientScale(p: number): number {
  return 1 + 0.05 * smoothstep(0.55, 0.8, p);
}

export function openingInteractionModeAt(p: number): CinematicInteractionMode {
  const t = clamp01(p);
  const nodeRelease = openingPhaseRange("nodeRelease").start;
  const graphConnect = openingPhaseRange("graphConnect").start;
  const graphResolve = openingPhaseRange("graphResolve").start;
  if (t < nodeRelease) return "none";
  if (t < graphConnect) return "passive";
  if (t < graphResolve) return "limited";
  return "full";
}

export function openingInteractionEnvelopeAt(p: number): number {
  const nodeRelease = openingPhaseRange("nodeRelease").start;
  const graphResolve = openingPhaseRange("graphResolve").start;
  return smoothstep(nodeRelease, graphResolve, p);
}

/** One immutable snapshot of the whole scrub — pure function of p (and mode).
 *  `calibration` is the dev-lab record (null in production). A null record
 *  evaluates the APPROVED SHIPPING TIMELINE at `p` (at the final frame for
 *  reduced motion), so the public scroll and the lab scrubbing share one truth.
 *  Callers that want the pre-bake baseline constants must pass an explicit
 *  `CINEMATIC_CALIBRATION_DEFAULTS` record. */
export function openingSnapshotAt(
  p: number,
  reduced: boolean,
  calibration?: CinematicCalibration | null,
): OpeningSnapshot {
  const effective = calibration ?? shippingCalibrationAt(reduced ? 1 : p);
  const camera = openingCameraAt(p, effective);
  const decompose = reduced ? 0 : openingDecompose(p, effective);
  const release = reduced ? 1 : openingRelease(p, effective);
  const interactionMode = reduced ? "none" : openingInteractionModeAt(p);
  return {
    phase: openingPhaseAt(p),
    phaseProgress: openingPhaseProgressAt(p),
    wordmark: openingWordmarkCues(p, reduced, camera.zoom, effective),
    decompose,
    decomposeVisual: reduced ? 0 : openingDecomposeVisual(p, effective),
    release,
    haze: openingHazeAt(p),
    interactionMode,
    interactionEnvelope: reduced ? 0 : openingInteractionEnvelopeAt(p),
    camera,
  };
}