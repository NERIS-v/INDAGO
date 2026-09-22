// ============================================================================
// PR — INDAGO Cinematic Home Opening · Composition root
//
//   <CinematicIntro>
//     └─ <CinematicScrollTrack>  viewport + reserved distance; wraps the stage
//          └─ <CinematicStage>   pinned 100svh viewport + R3F Canvas
//               └─ <FoundationScene>  WebGL backdrop + haze + camera
//                    ├─ <OpeningScene>        whole journey: wordmark particles
//                    │                        crack apart → travel → graph
//                    └─ <OpeningInteraction>  pointer emphasis (full motion)
//
// The stage runs the FULL opening journey from one effects object: the H1
// wordmark is sampled into a whole-word particle field, the letters dissolve
// outward into that field, the persistent nodes travel to their organic slots
// and the network weaves in. Reduced motion renders the same scene at its
// static end frame.
//
// The scene knows nothing about providers, cases, evidence or auth. The bundle
// is built synchronously per quality tier (deterministic, shared by every
// layer); the WORDMARK layout is built async — it needs the real H1 metrics
// and the loaded font, so it measures the live element after document.fonts has
// settled and rasterizes the SAME letters the H1 shows. StrictMode-safe: the
// async build cancels its stale run on unmount/retier.
// ============================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CinematicScrollTrack } from "./CinematicScrollTrack";
import { CinematicStage } from "./CinematicStage";
import { CinematicStory } from "./CinematicStory";
import { CinematicDebugOverlay } from "./CinematicDebugOverlay";
import { IS_DEV } from "./cinematic.constants";
import { CINEMATIC_CAMERA_HALF_EXTENT } from "./cinematic.constants";
import { isCinematicCalibrationRequested } from "./cinematic.constants";
import {
  CINEMATIC_CALIBRATION_BOUNDS,
  CINEMATIC_CALIBRATION_DEFAULTS,
  MOMENT_TOLERANCE,
  calibrationNeedsRebuild,
  createShippingCalibrationSession,
  momentAt,
  sessionEffective,
  sessionGlobals,
  stripSessionGlobals,
  upsertMoment,
} from "./cinematic.calibration";
import type { CinematicCalibration } from "./cinematic.calibration";
import type { CinematicCalibrationNumericKey } from "./cinematic.calibration";
import type { CinematicCalibrationSession } from "./cinematic.calibration";
import { useCinematicScene } from "./useCinematicScene";

// The lab is DEV-ONLY, so its panel and guide overlay are split into separate
// chunks and loaded on demand. A production visit to `/` never downloads them
// (and the flag that would mount them compiles to false anyway).
const CinematicCalibrationPanel = dynamic(
  () =>
    import("./CinematicCalibrationPanel").then((m) => m.CinematicCalibrationPanel),
  { ssr: false },
);
const CinematicCalibrationOverlay = dynamic(
  () =>
    import("./CinematicCalibrationOverlay").then(
      (m) => m.CinematicCalibrationOverlay,
    ),
  { ssr: false },
);
import { generateOpeningGraph, openingGraphStats } from "./opening/opening.graph";
import { createOpeningPoseView } from "./opening/opening.graph";
import { computeStoryFocus } from "./story/story.model";
import {
  createOpeningNetworkHoles,
  createOpeningNetworkView,
} from "./opening/opening.network";
import { createOpeningInteraction } from "./opening/opening.interaction";
import {
  fallbackGlyphSample,
  sampleWordmarkGlyphs,
} from "./opening/opening.glyph-sampler";
import { ensureWordmarkFontReady } from "./opening/opening.fonts";
import {
  buildOpeningWordmarkLayout,
  measureWordmarkElement,
  measureWordmarkLetterBoxes,
  openingWordmarkMeasurement,
  readWordmarkFontStyle,
} from "./opening/opening.wordmark";
import {
  OPENING_FONT_MAX_ATTEMPTS,
  OPENING_GLYPH_ALPHA_THRESHOLD,
  OPENING_GLYPH_SAMPLE_PX,
  OPENING_GLYPH_SAMPLE_SCALE,
  OPENING_LETTERS,
  OPENING_PARTICLE_COUNT,
  OPENING_WORDMARK_TEXT,
} from "./opening/opening.constants";
import type { OpeningEffects } from "./opening/opening.types";
import type { OpeningWordmarkLayout } from "./opening/opening.types";
import type { CinematicQualityTier } from "./cinematic.types";
import type { CinematicCompletionListener } from "./useCinematicScene";
import "./cinematic.css";

const FALLBACK_FONT =
  "normal 600 1px 'Cormorant Garamond', 'Cormorant', serif";

/**
 * Deterministic, synchronous per-tier statics. The wordmark layout is filled
 * in by the async measurer; until then the scene renders the organic fallback
 * (perfectly fine — nothing stale, nothing half-painted).
 */
function openingEffectsFor(tier: CinematicQualityTier): OpeningEffects {
  const bundle = generateOpeningGraph(tier);
  const stats = openingGraphStats(bundle);
  const pose = createOpeningPoseView(bundle);
  const network = createOpeningNetworkView(bundle);
  network.holes = createOpeningNetworkHoles(bundle, network.rows);
  const interaction =
    tier === "reduced-motion"
      ? null
      : createOpeningInteraction(bundle, tier === "mobile");
  return { bundle, stats, pose, network, interaction, wordmark: null };
}

export interface CinematicIntroProps {
  /** Fired when the door flips to "complete" at the end of the scroll. */
  onCompletion?: CinematicCompletionListener;
}

export function CinematicIntro({ onCompletion }: CinematicIntroProps = {}) {
  const {
    stageRef,
    trackRef,
    wordmarkRef,
    handle,
    quality,
    focusRef,
    applyCalibration,
  } = useCinematicScene(onCompletion);

  const baseEffects = useMemo(
    () => openingEffectsFor(quality.tier),
    [quality.tier],
  );

  // The story act's deterministic focus set, derived from the SAME bundle the
  // scene renders — locked into the controller's focusRef every render so the
  // act's camera keys / pair sideline / edge emphasis / hole all track the live
  // graph (render-phase ref write; the type-only "forget nothing" guarantee).
  const focus = useMemo(
    () => computeStoryFocus(baseEffects.bundle),
    [baseEffects],
  );
  focusRef.current = focus;

  const [wordmark, setWordmark] = useState<OpeningWordmarkLayout | null>(null);

  // --- Development-only calibration lab ------------------------------------
  // Activation is deferred to an effect (SSR-safe: false on the server) and is
  // gated by NODE_ENV inside isCinematicCalibrationRequested(), so a production
  // bundle can never mount the panel or carry overrides. The session owns the
  // keyframe TIMELINE: a separate calibration per moment, smoothly
  // interpolated while scrubbing. `effective` is the scene-ready record at the
  // current scrub position; `active` is the panel's edit target (the stored
  // moment's values when one sits exactly at the current progress, else the
  // running curve).
  const [session, setSession] = useState<CinematicCalibrationSession | null>(
    null,
  );
  const [rebuilding, setRebuilding] = useState(false);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const prevEffectiveRef = useRef<CinematicCalibration | null>(null);
  const rebuildTimer = useRef(0);

  useEffect(() => {
    if (isCinematicCalibrationRequested()) {
      setSession(createShippingCalibrationSession());
    }
  }, []);

  const effective = useMemo<CinematicCalibration | null>(
    () => (session ? sessionEffective(session) : null),
    [session],
  );

  const active = useMemo<CinematicCalibration | null>(() => {
    if (!session || !effective) return null;
    const stored = momentAt(session.keyframes, session.progress);
    const sceneBase = stored ? stored.values : stripSessionGlobals(effective);
    return { ...sceneBase, ...sessionGlobals(session) };
  }, [session, effective]);

  // Push the record into the ONE existing scene controller (never a new
  // trigger/loop): this freezes/unfreezes progress and re-applies the snapshot.
  useEffect(() => {
    applyCalibration(effective);
  }, [effective, applyCalibration]);

  // Only SPATIAL changes (wordScale / letterSpacing) need the glyph field
  // rebuilt; they are debounced into a single resample and surfaced as a
  // "REBUILDING GLYPH FIELD" state rather than thrashing the sampler per tick.
  useEffect(() => {
    const previous = prevEffectiveRef.current;
    prevEffectiveRef.current = effective;
    const prevGeo = previous ?? CINEMATIC_CALIBRATION_DEFAULTS;
    const nextGeo = effective ?? CINEMATIC_CALIBRATION_DEFAULTS;
    if (!calibrationNeedsRebuild(prevGeo, nextGeo)) return;
    setRebuilding(true);
    window.clearTimeout(rebuildTimer.current);
    rebuildTimer.current = window.setTimeout(() => {
      setGeometryRevision((revision) => revision + 1);
      setRebuilding(false);
    }, 180);
    return () => window.clearTimeout(rebuildTimer.current);
  }, [effective]);

  // Presentation-only <html> flags (particles-only, glyph audit 50/50, scroll
  // freeze). Removed on exit/unmount; nothing here survives a production load.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cinematic-calibrate", session !== null);
    root.classList.toggle(
      "cinematic-particles-only",
      effective?.particlesOnly ?? false,
    );
    root.classList.toggle(
      "cinematic-debug-align",
      effective?.glyphAudit ?? false,
    );
    root.classList.toggle(
      "cinematic-progress-locked",
      effective?.progressLocked ?? false,
    );
    return () => {
      root.classList.remove(
        "cinematic-calibrate",
        "cinematic-particles-only",
        "cinematic-debug-align",
        "cinematic-progress-locked",
      );
    };
  }, [session, effective]);

  // One control changed in the panel: route session-global edits (scrub, lock,
  // guides) to the session, and scene-shaping edits into the moment at the
  // current scrub position (created from the running curve so a new keyframe
  // never kinks the timeline).
  const handleChange = (next: CinematicCalibration): void => {
    if (!session || !active || !effective) return;
    const globals = sessionGlobals(session);
    globals.progress = next.progress;
    globals.progressLocked = next.progressLocked;
    globals.worldSpace = next.worldSpace;
    globals.overlayDom = next.overlayDom;
    globals.overlayRaster = next.overlayRaster;
    globals.overlayParticles = next.overlayParticles;
    globals.overlayCenter = next.overlayCenter;
    globals.overlayPoints = next.overlayPoints;
    globals.glyphAudit = next.glyphAudit;

    let sceneChanged =
      next.letterSpacing !== active.letterSpacing ||
      next.particlesOnly !== active.particlesOnly;
    if (!sceneChanged) {
      for (const key in CINEMATIC_CALIBRATION_BOUNDS) {
        if (key === "progress") continue;
        if (next[key as CinematicCalibrationNumericKey] !== active[key as CinematicCalibrationNumericKey]) {
          sceneChanged = true;
          break;
        }
      }
    }

    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...globals,
        keyframes: sceneChanged
          ? upsertMoment(prev.keyframes, {
              progress: globals.progress,
              values: stripSessionGlobals(next),
            })
          : prev.keyframes,
      };
    });
  };

  // Capture the running curve at the current scrub position as a new moment
  // (or refresh the one already sitting there).
  const handleSetMoment = (): void => {
    if (!session) return;
    setSession((prev) => {
      if (!prev) return prev;
      const base = sessionEffective(prev);
      return {
        ...prev,
        keyframes: upsertMoment(prev.keyframes, {
          progress: prev.progress,
          values: stripSessionGlobals(base),
        }),
      };
    });
  };

  const handleRemoveMoment = (progress: number): void => {
    if (!session) return;
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        keyframes: prev.keyframes.filter(
          (moment) => Math.abs(moment.progress - progress) > MOMENT_TOLERANCE,
        ),
      };
    });
  };

  // Async wordmark build: needs the live H1 box + the loaded font. Runs on
  // mount, whenever the tier changes, and again once when the stage
  // dimensions change significantly (ResizeObserver); each run cancels
  // cleanly on StrictMode teardown / retier. `geometryRevision` re-runs it
  // when a calibration changes the DOM↔particle spatial mapping.
  useEffect(() => {
    let cancelled = false;
    let stageSize = { width: 0, height: 0 };

    const publish = (layout: OpeningWordmarkLayout | null): void => {
      if (cancelled) return;
      setWordmark(layout);
    };

    const h1 = wordmarkRef.current;
    const stage = stageRef.current;
    // Calibration letter-spacing is a GEOMETRY control: apply it to the live
    // element BEFORE measuring so the raster advances match the painted word.
    if (h1) {
      const spacing = effective?.letterSpacing ?? null;
      h1.style.letterSpacing = spacing === null ? "" : `${spacing}px`;
    }
    if (!h1 || typeof document === "undefined" || !("fonts" in document)) {
      // No measurement possible (SSR/test) — deterministic skeleton fallback.
      publish(fallbackLayout(baseEffects.bundle, effective?.wordScale ?? 1));
      return;
    }

    let fontAttempts = 0;
    const run = async (): Promise<void> => {
      if (cancelled) return;
      const element = measureWordmarkElement(h1);
      if (!element || element.widthPx <= 0 || element.heightPx <= 0) {
        publish(fallbackLayout(baseEffects.bundle, effective?.wordScale ?? 1));
        return;
      }
      const font = readWordmarkFontStyle(h1, FALLBACK_FONT);
      // FIX #3 (font guard): never rasterize a half-loaded @font-face — the
      // canvas would fall back to a system face and the particles would keep
      // the wrong silhouette permanently. Wait (up to a bounded number of
      // frames) and re-measure next frame instead.
      if (!(await ensureWordmarkFontReady(font, OPENING_WORDMARK_TEXT))) {
        if (cancelled) return;
        fontAttempts += 1;
        if (fontAttempts < OPENING_FONT_MAX_ATTEMPTS) {
          raf = window.requestAnimationFrame(() => {
            void run();
          });
          return;
        }
        if (IS_DEV) {
          console.warn(
            `[cinematic] wordmark font not ready after ${OPENING_FONT_MAX_ATTEMPTS} frames; sampling with the currently active face`,
          );
        }
      }
      const stageRect = stage?.getBoundingClientRect();
      const stageWidth = stageRect?.width ?? window.innerWidth;
      const stageHeight = stageRect?.height ?? window.innerHeight;
      stageSize = { width: stageWidth, height: stageHeight };
      // World units per CSS px: the stage's half height is the fixed design
      // unit, so a 100svh stage maps 2×HALF_EXTENT world units onto its
      // height. The denominator orientation keeps the DOM wordmark inside the
      // same ±half-extent world box the camera frames.
      const pxToWorld = (2 * CINEMATIC_CAMERA_HALF_EXTENT) / stageHeight;

      const samplePx =
        baseEffects.bundle.tier === "mobile"
          ? OPENING_GLYPH_SAMPLE_PX.mobile
          : OPENING_GLYPH_SAMPLE_PX.desktop;
      const rasterHeight = Math.max(
        8,
        Math.round(samplePx * (element.heightPx / element.widthPx)),
      );
      const style = typeof getComputedStyle !== "undefined" ? getComputedStyle(h1) : null;
      const letterSpacing = parseFloat(style?.letterSpacing ?? "0") || 0;

      const particleCount =
        OPENING_PARTICLE_COUNT[baseEffects.bundle.tier] ??
        baseEffects.bundle.nodes.length;
      const sample =
        sampleWordmarkGlyphs({
          letters: OPENING_LETTERS,
          font,
          letterSpacingPx: letterSpacing,
          heightPx: rasterHeight,
          scale: OPENING_GLYPH_SAMPLE_SCALE,
          threshold: OPENING_GLYPH_ALPHA_THRESHOLD,
          count: particleCount,
        }) ?? fallbackGlyphSample(particleCount);

      // The particle mapping is WHOLE-WORD: it reads only the live H1 box and
      // the raster word metrics. The per-letter boxes are a debug readout.
      const letterBoxes = measureWordmarkLetterBoxes(h1);
      const measurement = openingWordmarkMeasurement(
        element,
        pxToWorld,
        letterBoxes,
      );
      const layout = buildOpeningWordmarkLayout({
        nodes: baseEffects.bundle.nodes,
        sample,
        measurement,
        wordScale: effective?.wordScale ?? 1,
      });
      publish(layout);
    };

    let raf = 0;
    const fonts = document.fonts as FontFaceSet | undefined;
    const start = (): void => {
      raf = window.requestAnimationFrame(run);
    };
    if (fonts && typeof fonts.ready?.then === "function") {
      fonts.ready.then(start).catch(() => start());
    } else {
      start();
    }

    // Resample once per significant dimension change — re-rasterising the
    // letters for the new stage height. Never per-frame.
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && stage) {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (
          Math.abs(width - stageSize.width) >= 48 ||
          Math.abs(height - stageSize.height) >= 48
        ) {
          if (cancelled) return;
          stageSize = { width, height };
          start();
        }
      });
      resizeObserver.observe(stage);
    }

    return () => {
      cancelled = true;
      if (raf > 0) window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
    };
  }, [wordmarkRef, stageRef, baseEffects, geometryRevision, effective]);

  // The scene always receives one effects object; wordmark lands when ready.
  const effects = useMemo<OpeningEffects>(
    () => ({ ...baseEffects, wordmark }),
    [baseEffects, wordmark],
  );

  return (
    <>
      <CinematicScrollTrack ref={trackRef}>
        <CinematicStage
          stageRef={stageRef}
          wordmarkRef={wordmarkRef}
          quality={quality}
          handle={handle}
          effects={effects}
          calibration={effective}
        />
        {/* The act's scroll surface: starts where the intro's reserved distance
            ends and stretches to the document's max scroll. It sits AFTER the
            pinned stage in flow, so the stage keeps its viewport while this
            extents the track. */}
        <CinematicStory />
      </CinematicScrollTrack>
      {session && effective ? (
        <CinematicCalibrationOverlay
          calibration={effective}
          handle={handle}
          effects={effects}
        />
      ) : null}
      {session && effective && active ? (
        <CinematicCalibrationPanel
          calibration={active}
          session={session}
          handle={handle}
          effects={effects}
          rebuilding={rebuilding}
          onChange={handleChange}
          onApplySession={setSession}
          onSetMoment={handleSetMoment}
          onRemoveMoment={handleRemoveMoment}
          onReset={() => setSession(createShippingCalibrationSession())}
          onExit={() => setSession(null)}
        />
      ) : null}
      {IS_DEV ? <CinematicDebugOverlay handle={handle} effects={effects} /> : null}
    </>
  );
}

/** Deterministic no-canvas wordmark: whole-word skeleton sample + uniform map. */
function fallbackLayout(
  bundle: OpeningEffects["bundle"],
  wordScale = 1,
): OpeningWordmarkLayout {
  const particleCount =
    OPENING_PARTICLE_COUNT[bundle.tier] ?? bundle.nodes.length;
  const sample = fallbackGlyphSample(particleCount);
  const measurement = {
    widthPx: 600,
    heightPx: 148,
    // Nominal 900px stage → world-per-px, so the fallback occupies the same
    // ±half-extent world box as the measured path on any real stage height.
    pxToWorld: (2 * CINEMATIC_CAMERA_HALF_EXTENT) / 900,
  };
  return buildOpeningWordmarkLayout({
    nodes: bundle.nodes,
    sample,
    measurement,
    wordScale,
  });
}