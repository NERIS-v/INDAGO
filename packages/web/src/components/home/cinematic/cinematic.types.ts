// ============================================================================
// PR — INDAGO Cinematic Home Opening · Foundation types
//
// The scene controller contract plus the SHARED opening vocabulary (phase
// names/ranges, interaction modes, camera state, wordmark cues). Everything
// here is framework-agnostic and deliberately small: the opening modules
// import these from `../cinematic.types` so there is exactly one owner for the
// identifiers the whole timeline reads.
// ============================================================================

import type {
  CinematicStoryBase,
  CinematicStoryState,
} from "./story/story.types";

/** Lifecycle state of the pinned scene (distinct from the active phase). */
export type CinematicLifecycleState = "idle" | "active" | "complete";

/** Door lifecycle. The opening ends on the wide, calm graph — the door flips
 *  "complete" exactly when the scroll reaches the end. */
export type CinematicCompletionState = "active" | "complete";

export type CinematicQualityTier =
  | "high"
  | "medium"
  | "mobile"
  | "reduced-motion";

export type CinematicMotionPreference = "full" | "reduced";

/**
 * Per-device rendering/motion budget. Resolved once from the environment so
 * desktop and mobile never share a single hard-coded configuration, and the
 * opening can hang graph density / effect flags off the same tier.
 */
export interface CinematicQuality {
  readonly tier: CinematicQualityTier;
  /** Cap for the renderer devicePixelRatio. */
  readonly pixelRatio: number;
  /** "reduced" collapses continuous atmosphere + pinned choreography. */
  readonly motion: CinematicMotionPreference;
  /** Whether the pointer may drive the scene (desktop only). */
  readonly interaction: boolean;
  /** Reserved scroll distance in svh the pinned stage scrubs through. */
  readonly scrollLength: number;
}

/** Pure snapshot of the environment used to resolve a quality tier. */
export interface CinematicEnvironment {
  readonly prefersReducedMotion: boolean;
  readonly pointerFine: boolean;
  readonly coarsePointer: boolean;
  readonly devicePixelRatio: number;
  readonly smallViewport: boolean;
}

// ---------------------------------------------------------------------------
// Opening timeline vocabulary
// ---------------------------------------------------------------------------

/** One named range on the scrub axis. */
export interface OpeningPhaseRange {
  readonly name: OpeningPhaseName;
  readonly start: number;
  readonly end: number;
}

export type OpeningPhaseName =
  | "hero"
  | "pullback"
  | "focusLoss"
  | "disintegration"
  | "nodeRelease"
  | "graphConnect"
  | "graphResolve";

/** Pointer gating across the journey: none → passive → limited → full. */
export type CinematicInteractionMode = "none" | "passive" | "limited" | "full";

/** CSS-settable wordmark cues (write into --opening-* custom properties). */
export interface OpeningWordmarkCues {
  readonly opacity: number;
  readonly blurPx: number;
  readonly scale: number;
}

export interface OpeningCameraState {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
}

/** Raw pointer position plus normalized stage-space coordinates. */
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly isInside: boolean;
}

/**
 * Mutable scene magnitude. Written directly by ScrollTrigger and the pointer
 * handlers from inside an effect — deliberately NOT React state, so a scroll
 * tick never triggers a React re-render.
 */
export interface CinematicSceneHandle {
  /** Effective quality tier (may be recomputed once after hydration). */
  config: CinematicQuality;
  /** Normalized scroll progress 0 → 1. */
  progress: number;
  /** The named phase owning `progress` (hero → graphResolve). */
  phase: OpeningPhaseName;
  /** Normalized 0 → 1 progress across the CURRENT phase. */
  phaseProgress: number;
  /** Pin lifecycle: idle before pin, active while pinned, complete at 1. */
  state: CinematicLifecycleState;
  /** Door lifecycle: "active" until progress 1, then "complete". */
  completion: CinematicCompletionState;
  /** Wordmark → organic decomposition: 0 = wordmark, 1 = gone. */
  decompose: number;
  /** Eased visual of the decomposition (drives glyph fade + droop feel). */
  decomposeVisual: number;
  /** Organic graph assembly: 0 → 1 across the release window. */
  release: number;
  /** Subtle warm haze over the whole journey. */
  haze: number;
  /** Pointer gating of the moment (none/passive/limited/full). */
  interactionMode: CinematicInteractionMode;
  /** 0 → 1 as the graph settles and pointer interaction becomes available. */
  interactionEnvelope: number;
  /** CSS wordmark cues (opacity/blur/scale) written onto --opening-*. */
  wordmark: OpeningWordmarkCues;
  /** The scroll-scrubbed orthographic camera (zoom multiplies everything). */
  camera: OpeningCameraState;
  /** The post-intro story act. The neutral inactive base while the intro owns
   *  the stage; the story scroll listener writes the full state past the
   *  handoff (and mirrors its camera here so every existing handle.camera
   *  consumer — canvas zoom, point size, DOM radii — follows the act). */
  story: CinematicStoryState | CinematicStoryBase;
  /** Latest pointer sample. No-ops on touch devices. */
  pointer: PointerState;
}