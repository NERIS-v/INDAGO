// ============================================================================
// PR — INDAGO Cinematic Home Opening · Scene controller
//
// Owns the pinned ScrollTrigger choreography and the (muted) pointer sampling.
// All animation state lives on a mutable CinematicSceneHandle so a scroll tick
// never triggers React re-renders. Every ScrollTrigger, listener and animation
// is created inside a gsap.context and reverted on unmount, which also makes
// React StrictMode's double-mount safe (the first mount fully tears down).
//
// The opening layer writes every moving field through openingSnapshotAt() — a
// pure function of (progress, reduced) — so the whole scrub is scroll-reversible
// and the controller stays framework-agnostic. Wordmark cues are ALSO written
// straight onto the live H1 element as custom properties (--opening-opacity /
// --opening-blur / --opening-scale) so the DOM wordmark and the particle
// wordmark shrink as ONE layer: both follow the camera zoom.
// ============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BASE_CINEMATIC_QUALITY,
  buildCinematicQuality,
  readCinematicEnvironment,
} from "./cinematic.config";
import {
  IS_DEV,
  CINEMATIC_PIN_END,
  CINEMATIC_REDUCED_ZOOM,
  clamp01,
  isCinematicDiagnosticsRequested,
} from "./cinematic.constants";
import { openingSnapshotAt } from "./opening/opening.progress";
import { createStoryBase, storyStateAt } from "./story/story.model";
import {
  STORY_SCROLL_CSS_DEFAULT,
  STORY_SCROLL_CSS_VAR,
} from "./story/story.constants";
import type { CinematicCalibration } from "./cinematic.calibration";
import type {
  CinematicCompletionState,
  CinematicQuality,
  CinematicSceneHandle,
  OpeningPhaseName,
} from "./cinematic.types";
import type { OpeningWordmarkCues } from "./cinematic.types";
import type { StoryFocus } from "./story/story.types";

// The story act is scrubbed by a PASSIVE window scroll listener (the track's
// post-intro extent), not by GSAP. Every frame of the act is a pure function
// of the story fraction (storyStateAt) written straight onto the handle, and
// the wrapper's progress is published to the CSS layer via these two handles —
// STORY_T_CSS_VAR (the scrubbed 0..1 fraction every beat's fade window reads)
// and the STAGE's attribute (which hides the "Scroll" cue once the act begins).
const STORY_T_CSS_VAR = "--story-t";
const STORY_WRAPPER_SELECTOR = "[data-cinematic-story-wrapper]";
const STORY_STAGE_ATTR = "data-cinematic-story";

// gsap.registerPlugin is idempotent, so this may safely run on every mount;
// keeping it call-site-local avoids module-level mutable state and stale flags
// across StrictMode double-mounts / HMR.
function ensureScrollTriggerRegistered(): void {
  gsap.registerPlugin(ScrollTrigger);
}

/** Pure derivation: the door flips "complete" exactly at the end of the scroll. */
function completionAt(progress: number): CinematicCompletionState {
  return progress >= 1 ? "complete" : "active";
}

/** Write the wordmark cues onto the live H1 element (no-op without one). */
function writeWordmarkCues(
  element: HTMLElement | null,
  cues: OpeningWordmarkCues,
): void {
  if (!element) return;
  element.style.setProperty("--opening-opacity", String(cues.opacity));
  element.style.setProperty("--opening-blur", `${cues.blurPx}px`);
  element.style.setProperty("--opening-scale", String(cues.scale));
}

/**
 * Write one immutable opening snapshot onto the mutable handle. Also fires the
 * phase-change listener on PHASE boundaries only — the single spot the stage's
 * semantic captions / labels hook into, so those re-render ~6 times per journey.
 */
function applySnapshot(
  handle: CinematicSceneHandle,
  progress: number,
  reduced: boolean,
  lastPhase: { current: OpeningPhaseName },
  onPhaseChange: ((phase: OpeningPhaseName) => void) | undefined,
  calibration: CinematicCalibration | null = null,
): void {
  const snapshot = openingSnapshotAt(progress, reduced, calibration);
  handle.progress = progress;
  handle.phase = snapshot.phase;
  handle.phaseProgress = snapshot.phaseProgress;
  handle.decompose = snapshot.decompose;
  handle.decomposeVisual = snapshot.decomposeVisual;
  handle.release = snapshot.release;
  handle.haze = snapshot.haze;
  handle.interactionMode = snapshot.interactionMode;
  handle.interactionEnvelope = snapshot.interactionEnvelope;
  handle.camera = snapshot.camera;
  handle.wordmark = snapshot.wordmark;
  if (snapshot.phase !== lastPhase.current) {
    lastPhase.current = snapshot.phase;
    onPhaseChange?.(snapshot.phase);
  }
}

/** Fresh mutable handle; created once per mounted scene instance. */
export function createCinematicSceneHandle(
  config: CinematicQuality,
): CinematicSceneHandle {
  const snapshot = openingSnapshotAt(0, config.motion === "reduced");
  return {
    config,
    progress: 0,
    phase: snapshot.phase,
    phaseProgress: snapshot.phaseProgress,
    state: "idle",
    completion: "active",
    decompose: snapshot.decompose,
    decomposeVisual: snapshot.decomposeVisual,
    release: snapshot.release,
    haze: snapshot.haze,
    interactionMode: snapshot.interactionMode,
    interactionEnvelope: snapshot.interactionEnvelope,
    wordmark: snapshot.wordmark,
    camera: snapshot.camera,
    story: createStoryBase(false),
    pointer: { x: 0, y: 0, normalizedX: 0, normalizedY: 0, isInside: false },
  };
}

export interface CinematicSceneController {
  stageRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  /** Bound to the semantic H1; rejected in reduced motion via CSS keyframes. */
  wordmarkRef: React.RefObject<HTMLHeadingElement | null>;
  handle: CinematicSceneHandle;
  quality: CinematicQuality;
  /** The story focus set — assign from the cinematic root each render so the
   *  act's camera/dim/pair/edge drivers stay locked to the live bundle. */
  focusRef: React.MutableRefObject<StoryFocus | null>;
  /**
   * Development-only calibration hook. Feed it the calibration record (or null
   * to restore production). It NEVER creates a second ScrollTrigger: it merely
   * enables/disables the existing one and re-applies the SAME pure snapshot —
   * so a locked progress is deterministic, reversible and framework-agnostic.
   */
  applyCalibration: (calibration: CinematicCalibration | null) => void;
}

/** Fired whenever the door lifecycle changes its state ("active" → "complete"). */
export type CinematicCompletionListener = (
  completion: CinematicCompletionState,
) => void;

/** Fired whenever the scrubbed progress crosses into a new opening phase. */
export type CinematicPhaseListener = (phase: OpeningPhaseName) => void;

export function useCinematicScene(
  onCompletion?: CinematicCompletionListener,
  onPhaseChange?: CinematicPhaseListener,
  focus?: StoryFocus | null,
): CinematicSceneController {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const wordmarkRef = useRef<HTMLHeadingElement | null>(null);
  const onCompletionRef = useRef(onCompletion);
  onCompletionRef.current = onCompletion;
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const focusRef = useRef<StoryFocus | null>(null);
  focusRef.current = focus ?? null;
  const lastCompletion = useRef<CinematicCompletionState>("active");
  const lastPhase = useRef<OpeningPhaseName>("hero");
  // Story geometry, cached after measure (svh resolves against the live
  // viewport; measured on mount + resize — never per frame).
  const introTopPx = useRef(0);
  const storyHeightPx = useRef(0);
  const [quality, setQuality] = useState<CinematicQuality>(BASE_CINEMATIC_QUALITY);
  const handleRef = useRef<CinematicSceneHandle | null>(null);
  if (handleRef.current === null) {
    handleRef.current = createCinematicSceneHandle(BASE_CINEMATIC_QUALITY);
  }
  const handle = handleRef.current;
  lastCompletion.current = handle.completion;

  // Development-only calibration transport. The record is kept in a ref (never
  // React state) so the ScrollTrigger effect is created EXACTLY ONCE and no
  // control change can ever spawn a second trigger.
  const calibrationRef = useRef<CinematicCalibration | null>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const reducedRef = useRef(false);
  const lockedRef = useRef(false);

  useEffect(() => {
    const env = readCinematicEnvironment();
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!env || !stage || !track) return;

    ensureScrollTriggerRegistered();

    const nextQuality = buildCinematicQuality(env);
    const reduced = nextQuality.motion === "reduced";
    reducedRef.current = reduced;

    handle.config = nextQuality;
    handle.progress = 0;
    handle.state = "idle";
    handle.completion = "active";
    handle.story = createStoryBase(reduced);
    lastCompletion.current = "active";
    lastPhase.current = openingSnapshotAt(0, reduced).phase;
    applySnapshot(
      handle,
      0,
      reduced,
      lastPhase,
      onPhaseChangeRef.current,
      calibrationRef.current,
    );
    // Reduced motion: the whole page — intro AND story act — is one calm wide
    // camera held static. The story's own static frame mirrors it, so there is
    // no 1.0 → 0.575 jump the moment the act scrolls in.
    if (reduced) {
      handle.camera = { centerX: 0, centerY: 0, zoom: CINEMATIC_REDUCED_ZOOM };
    }
    writeWordmarkCues(wordmarkRef.current, handle.wordmark);
    handle.pointer = { x: 0, y: 0, normalizedX: 0, normalizedY: 0, isInside: false };
    setQuality(nextQuality);

    // Deferred scroll length: applied post-hydration so the server and first
    // client paint stay identical (no SSR mismatch), and applied for EVERY tier
    // (reduced collapses it to 0 → the story wrapper starts at page top). The
    // track wraps the 100svh stage and stands it + intro distance + story
    // distance tall.
    track.style.setProperty(
      "--cinematic-scroll-length",
      `${nextQuality.scrollLength}svh`,
    );
    // The story distance is identical across tiers (the wrapper's height + the
    // twelve propeller-length spacers) — written from the single source
    // constant so the DOM and the model can never disagree.
    track.style.setProperty(STORY_SCROLL_CSS_VAR, STORY_SCROLL_CSS_DEFAULT);
    // Park every beat invisible until the intro hands the stage over: t = −1
    // makes every fade-in window negative (opacity 0). The scroll listener
    // writes the real 0..1 fraction once engaged.
    track.style.setProperty(STORY_T_CSS_VAR, "-1");

    const disposers: Array<() => void> = [];

    // --- Story act scroll driver (full AND reduced motion) ---------------
    // The story wrapper (inside the track, below the pinned stage) owns the
    // post-intro scroll extent. Its document top is where the intro ENDS on the
    // scroll axis — so:
    //   intro progress p   = scroll / wrapperTop
    //   story fraction  s  = (scroll − wrapperTop) / wrapperHeight
    // Both measured once + on resize and cached (svh resolves against the live
    // viewport); the scroll listener only writes, never measures.
    const measureStory = (): boolean => {
      const wrapper = track.querySelector<HTMLElement>(STORY_WRAPPER_SELECTOR);
      if (!wrapper) return false;
      const rect = wrapper.getBoundingClientRect();
      if (rect.height <= 0) return false;
      introTopPx.current = rect.top + window.scrollY;
      storyHeightPx.current = rect.height;
      return true;
    };

    const applyStory = (): void => {
      const focus = focusRef.current;
      if (!focus || storyHeightPx.current <= 0) {
        handle.story = createStoryBase(reduced);
        return;
      }
      const scrollY = window.scrollY;
      // Past the handoff → the act owns the stage. Inside it (or before), the
      // intro owns everything and the copy is parked invisible at t = −1.
      if (scrollY > introTopPx.current + 1) {
        // A locked calibration owns progress; the act must not move the scene.
        if (calibrationRef.current?.progressLocked) return;
        const s = clamp01(
          (scrollY - introTopPx.current) / Math.max(storyHeightPx.current, 1),
        );
        const state = storyStateAt(s, focus, reduced);
        handle.story = state;
        // Mirror the act's camera onto the shared handle so the canvas zoom,
        // point size and DOM radii all follow the spotlight automatically.
        handle.camera = state.camera;
        if (!reduced) handle.progress = 1;
        track.style.setProperty(STORY_T_CSS_VAR, s.toFixed(6));
        stage.setAttribute(STORY_STAGE_ATTR, "true");
      } else {
        handle.story = createStoryBase(reduced);
        track.style.setProperty(STORY_T_CSS_VAR, "-1");
        stage.removeAttribute(STORY_STAGE_ATTR);
      }
    };

    measureStory();
    const onScroll = (): void => applyStory();
    const onResize = (): void => {
      measureStory();
      applyStory();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    disposers.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    });

    const context = gsap.context(() => {
      // Reduced motion: calm presentation — the CSS sticky stage holds the
      // frame while the passive story listener above scrubs the copy. No pin,
      // no scrub, no long choreography to trap a keyboard user in.
      if (reduced) {
        handle.state = "active";
        writeWordmarkCues(wordmarkRef.current, handle.wordmark);
        return;
      }

      // Development-only diagnostics: ScrollTrigger start/end guides render
      // ONLY when a dev build carries the explicit ?cinematicDebug=1 flag.
      const enableDiagnostics =
        IS_DEV && isCinematicDiagnosticsRequested();

      /**
       * Map a REAL scroll position onto the intro scrub. The pin runs "max"
       * because the stage must stay pinned through the story's scroll extent
       * too — so self.progress would stretch the intro across the whole page.
       * Instead the intro's progress is <scroll / story-wrapper top>, which
       * fixes the scrub to the intro's own reserved distance, and once scroll
       * passes the wrapper top the intro freezes at p = 1 and the story act
       * owns the frame (applyScroll stops writing the intro then).
       */
      const applyScroll = (scrollPosition: number): void => {
        // A locked calibration owns progress; scroll must not move the scene.
        if (calibrationRef.current?.progressLocked) return;
        // Story owns the stage from the handoff on — never overwrite it.
        if (scrollPosition > introTopPx.current + 1) return;
        const progress = clamp01(
          scrollPosition / Math.max(introTopPx.current, 1),
        );
        applySnapshot(
          handle,
          progress,
          false,
          lastPhase,
          onPhaseChangeRef.current,
          calibrationRef.current,
        );
        writeWordmarkCues(wordmarkRef.current, handle.wordmark);
        handle.state = progress >= 1 ? "complete" : "active";
        const nextCompletion = completionAt(progress);
        if (nextCompletion !== lastCompletion.current) {
          lastCompletion.current = nextCompletion;
          onCompletionRef.current?.(nextCompletion);
        }
        handle.completion = nextCompletion;
      };

      handle.state = "active";

      const trigger = ScrollTrigger.create({
        // The track is the scroll container: its top is at document top, so
        // the pin engages at scroll 0. The pin runs to "max" (the document's
        // real max scroll) so the stage stays pinned through BOTH the intro
        // distance and the story act's extent; scroll DURATION stays owned by
        // the track height (viewport + intro + story, written via the two
        // --cinematic-* length vars) — that tracked extent is the only flow on
        // the home route, so the release position coincides with the document's
        // real max scroll. GSAP then holds the pinned stage at that boundary
        // (its "isAtMax" guard) and a reverse scroll re-enters the active pin
        // continuously: no unpin snap-back, no dark-track reveal, no
        // progress/reset mismatch. Intro progress is mapped from raw scroll in
        // applyScroll (see above) so the act's extent never stretches it.
        trigger: track,
        start: "top top",
        end: CINEMATIC_PIN_END,
        pin: stage,
        pinSpacing: false,
        anticipatePin: 1,
        markers: enableDiagnostics,
        onUpdate: (self) => applyScroll(self.scroll()),
        onRefresh: (self) => applyScroll(self.scroll()),
      });

      triggerRef.current = trigger;
      disposers.push(() => trigger.kill());
    }, stage);

    disposers.push(() => context.revert());
    disposers.push(() => {
      triggerRef.current = null;
    });

    // Pointer sampling — desktop only. Writes straight to the handle; never
    // renders. Coarse-pointer (touch) devices register nothing.
    if (!env.coarsePointer) {
      const onPointerMove = (event: PointerEvent): void => {
        if (event.pointerType === "touch") return;
        const rect = stage.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        handle.pointer = {
          x: event.clientX,
          y: event.clientY,
          normalizedX: clamp01((event.clientX - rect.left) / rect.width),
          normalizedY: clamp01((event.clientY - rect.top) / rect.height),
          isInside: inside,
        };
      };
      const onPointerLeave = (): void => {
        handle.pointer = { ...handle.pointer, isInside: false };
      };
      const onBlur = (): void => {
        handle.pointer = { ...handle.pointer, isInside: false };
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      stage.addEventListener("pointerleave", onPointerLeave, { passive: true });
      window.addEventListener("blur", onBlur, { passive: true });
      disposers.push(() => {
        window.removeEventListener("pointermove", onPointerMove);
        stage.removeEventListener("pointerleave", onPointerLeave);
        window.removeEventListener("blur", onBlur);
      });
    }

    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [handle]);

  /**
   * The calibration transport. Called from an effect whenever the record
   * changes. It never touches GSAP's construction: it toggles the existing
   * trigger and writes the handle through the same `openingSnapshotAt` the
   * scroll path uses. Locked progress is therefore a pure, reversible frame.
   */
  const applyCalibration = useCallback(
    (calibration: CinematicCalibration | null): void => {
      calibrationRef.current = calibration;
      const reduced = reducedRef.current;
      const trigger = triggerRef.current;
      const locked = calibration?.progressLocked ?? false;

      if (!trigger) {
        // Reduced motion (or pre-hydration): no trigger to gate — just lay the
        // static snapshot down at the requested frame.
        const progress = calibration
          ? reduced
            ? 0
            : calibration.progress
          : 0;
        applySnapshot(
          handle,
          progress,
          reduced,
          lastPhase,
          onPhaseChangeRef.current,
          calibration,
        );
        writeWordmarkCues(wordmarkRef.current, handle.wordmark);
        return;
      }

      // Toggle the EXISTING trigger only on a lock transition — never recreate.
      if (locked !== lockedRef.current) {
        if (locked) trigger.disable();
        else trigger.enable();
        lockedRef.current = locked;
      }

      const progress = locked
        ? calibration!.progress
        : clamp01(trigger.progress);
      applySnapshot(
        handle,
        progress,
        false,
        lastPhase,
        onPhaseChangeRef.current,
        calibration,
      );
      handle.state = progress >= 1 ? "complete" : "active";
      handle.completion = completionAt(progress);
      writeWordmarkCues(wordmarkRef.current, handle.wordmark);
    },
    [handle],
  );

  return {
    stageRef,
    trackRef,
    wordmarkRef,
    handle,
    quality,
    focusRef,
    applyCalibration,
  };
}