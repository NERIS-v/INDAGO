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
  clamp01,
  isCinematicDiagnosticsRequested,
} from "./cinematic.constants";
import { openingSnapshotAt } from "./opening/opening.progress";
import type { CinematicCalibration } from "./cinematic.calibration";
import type {
  CinematicCompletionState,
  CinematicQuality,
  CinematicSceneHandle,
  OpeningPhaseName,
} from "./cinematic.types";
import type { OpeningWordmarkCues } from "./cinematic.types";

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
): CinematicSceneController {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const wordmarkRef = useRef<HTMLHeadingElement | null>(null);
  const onCompletionRef = useRef(onCompletion);
  onCompletionRef.current = onCompletion;
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const lastCompletion = useRef<CinematicCompletionState>("active");
  const lastPhase = useRef<OpeningPhaseName>("hero");
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
    writeWordmarkCues(wordmarkRef.current, handle.wordmark);
    handle.pointer = { x: 0, y: 0, normalizedX: 0, normalizedY: 0, isInside: false };
    setQuality(nextQuality);

    const disposers: Array<() => void> = [];

    const context = gsap.context(() => {
      // Deferred scroll length: applied post-hydration so the server and first
      // client paint stay identical (no SSR mismatch). The track wraps the
      // 100svh stage and stands viewport + distance tall.
      track.style.setProperty("--cinematic-scroll-length", `${nextQuality.scrollLength}svh`);

      // Reduced motion: calm single-viewport presentation — no pin, no scrub,
      // no long choreography to trap a keyboard user in. The static snapshot
      // laid down above keeps the graph present and the wordmark legible.
      if (reduced) {
        handle.state = "active";
        writeWordmarkCues(wordmarkRef.current, handle.wordmark);
        return;
      }

      // Development-only diagnostics: ScrollTrigger start/end guides render
      // ONLY when a dev build carries the explicit ?cinematicDebug=1 flag.
      const enableDiagnostics =
        IS_DEV && isCinematicDiagnosticsRequested();

      const updateFromProgress = (progress: number): void => {
        // A locked calibration owns progress; scroll must not move the scene.
        if (calibrationRef.current?.progressLocked) return;
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
        // the pin engages at scroll 0. The scroll DURATION is the track's own
        // height (viewport + CINEMATIC_SCROLL_DISTANCE_SVH svh, written via
        // --cinematic-scroll-length) — that tracked extent is the ONLY flow
        // on the home route, so pinning "max" makes the release position R
        // exactly coincide with the document's real max scroll. GSAP then
        // holds the pinned stage at that boundary (its "isAtMax" guard) and a
        // reverse scroll re-enters the active pin continuously: no unpin
        // snap-back, no dark-track reveal, no progress/reset mismatch.
        trigger: track,
        start: "top top",
        end: CINEMATIC_PIN_END,
        pin: stage,
        pinSpacing: false,
        anticipatePin: 1,
        markers: enableDiagnostics,
        onUpdate: (self) => updateFromProgress(self.progress),
        onRefresh: (self) => updateFromProgress(self.progress),
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

      const progress = locked ? calibration!.progress : clamp01(trigger.progress);
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

  return { stageRef, trackRef, wordmarkRef, handle, quality, applyCalibration };
}