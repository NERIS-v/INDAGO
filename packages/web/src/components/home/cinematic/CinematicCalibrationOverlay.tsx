// ============================================================================
// PR — INDAGO Cinematic Home Opening · Calibration alignment overlay (dev-only)
//
// A pure DOM guide layer drawn ON TOP of the single scene canvas when the lab
// asks for it. It never touches WebGL, never creates a Canvas and never runs a
// render loop: it re-reads the frozen wordmark layout + handle on a slow 150ms
// interval and writes percentage geometry straight into fixed boxes.
//
// The guides exist so the DOM box, the sampled raster/ink bounds and the
// particle anchors can be compared 1:1 while calibrating — exactly the data the
// glyph audit needs, without a second animation system.
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import { CINEMATIC_CAMERA_HALF_EXTENT } from "./cinematic.constants";
import type { CinematicCalibration } from "./cinematic.calibration";
import type { CinematicSceneHandle } from "./cinematic.types";
import type { OpeningEffects } from "./opening/opening.types";
import { OPENING_LAYOUT_FIT_MARGIN } from "./opening/opening.constants";
import {
  openingGraphZoomFrame,
  openingGraphZoomParallax,
  openingNodeDepth,
} from "./opening/opening.zoom";

const READ_MS = 150;
const MAX_POINTS = 500;
// The same per-axis slot mapping the scene uses (expressed to the viewport
// half-extents in world): node.nx × FRACTION / LAYOUT_EDGE × graphScale.
const GRAPH_X_FRACTION = 0.5;
const GRAPH_Y_FRACTION = 0.5;
const LAYOUT_EDGE = 1 - OPENING_LAYOUT_FIT_MARGIN;

export function CinematicCalibrationOverlay({
  calibration,
  handle,
  effects,
}: {
  calibration: CinematicCalibration;
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
}) {
  const domRef = useRef<HTMLDivElement | null>(null);
  const rasterRef = useRef<HTMLDivElement | null>(null);
  const particleRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<HTMLDivElement | null>(null);
  const guideAxisRef = useRef<HTMLDivElement | null>(null);
  const camRingRef = useRef<HTMLDivElement | null>(null);
  const focalRef = useRef<HTMLDivElement | null>(null);
  const depthNodesRef = useRef<HTMLDivElement | null>(null);

  const enabled =
    calibration.overlayDom ||
    calibration.overlayRaster ||
    calibration.overlayParticles ||
    calibration.overlayCenter ||
    calibration.overlayPoints ||
    calibration.worldSpace ||
    calibration.depthGuides ||
    calibration.depthShowForeground ||
    calibration.depthShowBackground ||
    calibration.depthShowCamera;

  useEffect(() => {
    if (!enabled) return;
    const apply = (): void => {
      const width = window.innerWidth;
      const height = Math.max(window.innerHeight, 1);
      const halfH = CINEMATIC_CAMERA_HALF_EXTENT;
      const halfW = halfH * (width / height);
      const zoom = Math.max(handle.camera.zoom, 0.01);
      const toX = (wx: number): number => 50 + ((wx * zoom) / halfW) * 50;
      const toY = (wy: number): number => 50 - ((wy * zoom) / halfH) * 50;
      // alignmentX/Y are overlay-ONLY offsets: they shift the particle-derived
      // guides (raster ink, particle bounds, points) by CSS px against the
      // fixed DOM wordmark box, so the correction you dial is visible directly.
      // The real field is never moved (the scene mapping stays exact).
      const shiftXPct = (calibration.alignmentX / width) * 100;
      const shiftYPct = (calibration.alignmentY / height) * 100;
      const setRect = (
        el: HTMLDivElement | null,
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
        shiftX = 0,
        shiftY = 0,
      ): void => {
        if (!el) return;
        const x0 = toX(minX);
        const x1 = toX(maxX);
        const y0 = toY(maxY);
        const y1 = toY(minY);
        el.style.left = `${(Math.min(x0, x1) + shiftX).toFixed(3)}%`;
        el.style.top = `${(Math.min(y0, y1) + shiftY).toFixed(3)}%`;
        el.style.width = `${Math.abs(x1 - x0).toFixed(3)}%`;
        el.style.height = `${Math.abs(y1 - y0).toFixed(3)}%`;
        el.style.display = "";
      };

      const wm = effects.wordmark;
      if (calibration.overlayDom && wm) {
        setRect(
          domRef.current,
          wm.bounds.left,
          wm.bounds.bottom,
          wm.bounds.right,
          wm.bounds.top,
        );
      } else if (domRef.current) domRef.current.style.display = "none";

      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      if (wm) {
        for (let i = 0; i < wm.glyphX.length; i += 1) {
          const gx = wm.glyphX[i]!;
          const gy = wm.glyphY[i]!;
          if (gx < x0) x0 = gx;
          if (gx > x1) x1 = gx;
          if (gy < y0) y0 = gy;
          if (gy > y1) y1 = gy;
        }
      }
      const hasBounds = Number.isFinite(x0) && Number.isFinite(x1);
      if (calibration.overlayRaster && hasBounds) {
        setRect(rasterRef.current, x0, y0, x1, y1, shiftXPct, shiftYPct);
      } else if (rasterRef.current) rasterRef.current.style.display = "none";

      if (calibration.overlayParticles && hasBounds) {
        setRect(particleRef.current, x0, y0, x1, y1, shiftXPct, shiftYPct);
      } else if (particleRef.current) particleRef.current.style.display = "none";

      if (calibration.worldSpace) {
        setRect(worldRef.current, -halfH * 2, -halfH * 2, halfH * 2, halfH * 2);
      } else if (worldRef.current) worldRef.current.style.display = "none";

      if (calibration.overlayPoints && wm && pointsRef.current) {
        const pool = pointsRef.current.children;
        const count = Math.min(pool.length, wm.glyphX.length, MAX_POINTS);
        for (let i = 0; i < pool.length; i += 1) {
          const dot = pool[i] as HTMLDivElement;
          if (i < count) {
            dot.style.left = `${(toX(wm.glyphX[i]!) + shiftXPct).toFixed(3)}%`;
            dot.style.top = `${(toY(wm.glyphY[i]!) + shiftYPct).toFixed(3)}%`;
            dot.style.display = "";
          } else {
            dot.style.display = "none";
          }
        }
      }

      // --- GRAPH ZOOM / DEPTH debug guides -------------------------------------
      // The dive projection recomputed here (same pure model the scene uses) so
      // the markers sit EXACTLY on the dived nodes. Deterministic depth decides
      // front/back; the camera ring visualises the near-plane dolly.
      if (guideAxisRef.current) {
        guideAxisRef.current.style.display = calibration.depthGuides ? "" : "none";
      }
      const zoomFrame = openingGraphZoomFrame(handle.progress, calibration);
      if (camRingRef.current) {
        const showCamera = calibration.depthShowCamera;
        camRingRef.current.style.display = showCamera ? "" : "none";
        if (showCamera) {
          const ringDiam = 46 * zoomFrame.cameraZ;
          camRingRef.current.style.width = `${ringDiam.toFixed(1)}%`;
          camRingRef.current.style.height = `${ringDiam.toFixed(1)}%`;
          camRingRef.current.style.left = `${(50 - ringDiam / 2).toFixed(1)}%`;
          camRingRef.current.style.top = `${(50 - ringDiam / 2).toFixed(1)}%`;
        }
      }
      if (focalRef.current) {
        focalRef.current.style.display = calibration.depthShowCamera ? "" : "none";
      }
      const showFore = calibration.depthShowForeground;
      const showBack = calibration.depthShowBackground;
      if (depthNodesRef.current && (showFore || showBack)) {
        const pool = depthNodesRef.current.children;
        const nodes = effects.bundle.nodes;
        const baseX = (halfW * GRAPH_X_FRACTION) / LAYOUT_EDGE;
        const baseY = (halfH * GRAPH_Y_FRACTION) / LAYOUT_EDGE;
        for (let i = 0; i < pool.length; i += 1) {
          const marker = pool[i] as HTMLDivElement;
          const node = nodes[i];
          if (!node || (!showFore && !showBack)) {
            marker.style.display = "none";
            continue;
          }
          const depthNorm = openingNodeDepth(node.id, node.nx, node.ny);
          const isFront = showFore && depthNorm <= 0.32;
          const isBack = showBack && depthNorm >= 0.68;
          if (!isFront && !isBack) {
            marker.style.display = "none";
            continue;
          }
          const zPar = openingGraphZoomParallax(zoomFrame, depthNorm);
          const wx = node.nx * baseX * calibration.graphScale * zPar * zoomFrame.plane;
          const wy = node.ny * baseY * calibration.graphScale * zPar * zoomFrame.plane;
          marker.style.left = `${toX(wx).toFixed(3)}%`;
          marker.style.top = `${toY(wy).toFixed(3)}%`;
          marker.className = isFront
            ? "cinematic-cal-overlay__depth-node is-front"
            : "cinematic-cal-overlay__depth-node is-back";
          marker.style.display = "";
        }
      } else if (depthNodesRef.current) {
        for (let i = 0; i < depthNodesRef.current.children.length; i += 1) {
          (depthNodesRef.current.children[i] as HTMLDivElement).style.display =
            "none";
        }
      }
    };

    apply();
    const interval = window.setInterval(apply, READ_MS);
    return () => window.clearInterval(interval);
  }, [enabled, calibration, handle, effects]);

  if (!enabled) return null;

  const poolSize = effects.wordmark
    ? Math.min(effects.wordmark.glyphX.length, MAX_POINTS)
    : 0;

  return (
    <div className="cinematic-cal-overlay" aria-hidden="true">
      <div ref={domRef} className="cinematic-cal-overlay__box is-dom" />
      <div ref={rasterRef} className="cinematic-cal-overlay__box is-raster" />
      <div ref={particleRef} className="cinematic-cal-overlay__box is-particle" />
      <div ref={worldRef} className="cinematic-cal-overlay__box is-world" />
      {calibration.overlayCenter ? (
        <div className="cinematic-cal-overlay__center" />
      ) : null}
      <div ref={pointsRef} className="cinematic-cal-overlay__points">
        {Array.from({ length: poolSize }, (_, i) => (
          <span key={i} className="cinematic-cal-overlay__point" />
        ))}
      </div>
      {/* GRAPH ZOOM / DEPTH debug guides — the dive axis, dolly ring + focal
          dot, and the front/back node markers (depthGuides / depthShowCamera /
          depthShowForeground / depthShowBackground). */}
      <div
        ref={guideAxisRef}
        className="cinematic-cal-overlay__depth-guide"
        style={{ display: "none" }}
      />
      <div
        ref={camRingRef}
        className="cinematic-cal-overlay__depth-cam"
        style={{ display: "none" }}
      />
      <div
        ref={focalRef}
        className="cinematic-cal-overlay__depth-focal"
        style={{ display: "none" }}
      />
      <div ref={depthNodesRef}>
        {effects.bundle.nodes.map((node) => (
          <span
            key={node.id}
            className="cinematic-cal-overlay__depth-node"
            style={{ display: "none" }}
          />
        ))}
      </div>
    </div>
  );
}
