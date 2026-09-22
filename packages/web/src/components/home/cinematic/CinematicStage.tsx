// ============================================================================
// PR — INDAGO Cinematic Home Opening · Pinned stage
//
// The visual viewport: a 100svh section ScrollTrigger pins while the deferred
// track scrolls beneath it. Contains the ONE R3F Canvas (foundation backdrop +
// haze + camera + the full opening journey), the semantic H1 wordmark whose
// scale/blur/opacity mirror the camera via --opening-* custom properties, a
// tiny "Scroll" cue, the DOM evidence-label layer and the CSS warm-dark
// vignette. If WebGL is unavailable the Canvas renders a static fallback — the
// H1 and cue sit OUTSIDE the canvas, so the opening never becomes a blank
// screen.
//
// The SECTION carries the real content (the wordmark IS the H1); only the
// canvas and scroll cue are aria-hidden.
// ============================================================================

"use client";

import { Canvas } from "@react-three/fiber";
import type { RefObject } from "react";
import { NetworkResolution } from "./NetworkResolution";
import { FoundationScene } from "./scenes/FoundationScene";
import { OPENING_LETTERS, OPENING_WORDMARK_TEXT } from "./opening/opening.constants";
import type { CinematicQuality, CinematicSceneHandle } from "./cinematic.types";
import type { OpeningEffects } from "./opening/opening.types";
import type { CinematicCalibration } from "./cinematic.calibration";

interface CinematicStageProps {
  stageRef: RefObject<HTMLDivElement | null>;
  wordmarkRef: RefObject<HTMLHeadingElement | null>;
  quality: CinematicQuality;
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
  calibration?: CinematicCalibration | null;
}

export function CinematicStage({
  stageRef,
  wordmarkRef,
  quality,
  handle,
  effects,
  calibration = null,
}: CinematicStageProps) {
  return (
    <section
      ref={stageRef}
      className="cinematic-scene"
      data-cinematic-stage=""
      data-cinematic-calibrating={calibration ? "true" : undefined}
    >
      {/* The real heading. Its scale/blur/opacity are driven by the controller
          via --opening-*; the glyph sampler reads THIS element's box + font
          so the particles and the letters never drift apart. */}
      <h1
        ref={wordmarkRef}
        className="cinematic-scene__wordmark"
        aria-label={OPENING_WORDMARK_TEXT}
      >
        {OPENING_LETTERS.map((letter) => (
          <span key={letter} data-letter={letter} aria-hidden="true">
            {letter}
          </span>
        ))}
      </h1>
      <div className="cinematic-scene__scroll-cue" aria-hidden="true">
        <span className="cinematic-scene__scroll-cue-label">Scroll</span>
      </div>
      {/* Warm-dark vignette: pure CSS, no GPU budget. */}
      <div className="cinematic-scene__vignette" data-cinematic-vignette="" />
      <div className="cinematic-scene__canvas-wrap" aria-hidden="true">
        <Canvas
          orthographic
          frameloop={quality.motion === "reduced" ? "demand" : "always"}
          dpr={[1, Math.max(1, quality.pixelRatio)]}
          camera={{ position: [0, 0, 10], near: -10, far: 40, zoom: 1 }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          fallback={
            <div
              className="cinematic-scene__fallback"
              data-cinematic-fallback=""
            />
          }
        >
          <FoundationScene
            handle={handle}
            effects={effects}
            calibration={calibration}
          />
        </Canvas>
      </div>
      {/* NETWORK RESOLUTION: the icon-node design layer, also read from the
          scene's shared buffer — appears as the dive resolves. */}
      <NetworkResolution
        effects={effects}
        animate={quality.motion !== "reduced"}
      />
    </section>
  );
}