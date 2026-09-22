// ============================================================================
// PR — INDAGO Cinematic Home Opening · Dev debug readout
//
// Development-only: renders nothing unless NODE_ENV is development AND the URL
// carries ?cinematicDebug=1. Reads the mutable handle + opening statics on a
// 200ms interval via textContent (never React state), so the whole journey —
// progress, phase, camera zoom, dissolve/release, wordmark cues, mode, pointer
// and per-tier graph stats — can be inspected while building the opening.
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import {
  isCinematicDiagnosticsRequested,
  isCinematicGlyphAuditRequested,
} from "./cinematic.constants";
import type { CinematicSceneHandle } from "./cinematic.types";
import { OPENING_WORDMARK_TEXT } from "./opening/opening.constants";
import type { OpeningEffects } from "./opening/opening.types";
import type { OpeningWordmarkLayout } from "./opening/opening.types";

interface CinematicDebugOverlayProps {
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
}

type RowKey =
  | "progress"
  | "phase"
  | "camera"
  | "decompose"
  | "release"
  | "wordmark"
  | "blur"
  | "mode"
  | "pointer"
  | "viewport"
  | "quality"
  | "graph"
  | "visible"
  | "samples"
  | "wordmark-bounds"
  | "align"
  | "interaction";

interface DebugRow {
  readonly key: RowKey;
  readonly label: string;
}

const DEBUG_ROWS: readonly DebugRow[] = [
  { key: "progress", label: "progress" },
  { key: "phase", label: "phase" },
  { key: "camera", label: "camera" },
  { key: "decompose", label: "decompose" },
  { key: "release", label: "release" },
  { key: "wordmark", label: "wordmark" },
  { key: "blur", label: "blur" },
  { key: "mode", label: "mode" },
  { key: "pointer", label: "pointer" },
  { key: "viewport", label: "viewport" },
  { key: "quality", label: "quality" },
  { key: "graph", label: "graph" },
  { key: "visible", label: "visible" },
  { key: "samples", label: "samples" },
  { key: "wordmark-bounds", label: "wordmark bounds" },
  { key: "align", label: "letter align" },
  { key: "interaction", label: "interaction" },
];

/** Per-letter calibration readout for the 50%-overlay check: the live DOM span
 *  box (px), the raster ink bounds (scaled raster px) and the mapped WORLD
 *  bounds of the particles actually assigned to each letter. When the vertical
 *  model is right, `dom` top/bottom ≈ `wld` top/bottom after the px→world
 *  conversion; the two 50%-opacity layers should sit on top of each other. */
function formatLetterAlignment(wm: OpeningWordmarkLayout | null): string {
  if (!wm) return "—";
  const boxes = wm.measurement.letterBoxes;
  const ranges = wm.word.letterRanges;
  const n = ranges.length;
  const wx0 = new Array<number>(n).fill(Infinity);
  const wx1 = new Array<number>(n).fill(-Infinity);
  const wy0 = new Array<number>(n).fill(Infinity);
  const wy1 = new Array<number>(n).fill(-Infinity);
  for (let i = 0; i < wm.glyphX.length; i += 1) {
    const letter = wm.letter[i];
    if (letter === undefined || letter >= n) continue;
    const gx = wm.glyphX[i]!;
    const gy = wm.glyphY[i]!;
    if (gx < wx0[letter]!) wx0[letter] = gx;
    if (gx > wx1[letter]!) wx1[letter] = gx;
    if (gy < wy0[letter]!) wy0[letter] = gy;
    if (gy > wy1[letter]!) wy1[letter] = gy;
  }
  return ranges
    .map((range, i) => {
      const box = boxes?.[i];
      const dom = box
        ? `${box.left},${box.top} ${box.width}×${box.height}`
        : "—";
      const raster = `${Math.round(range.x0)}..${Math.round(range.x1)}`;
      const world = Number.isFinite(wx0[i])
        ? `${wx0[i]!.toFixed(3)}..${wx1[i]!.toFixed(3)}` +
          `/${wy0[i]!.toFixed(3)}..${wy1[i]!.toFixed(3)}`
        : "—";
      return (
        `${OPENING_WORDMARK_TEXT[range.letter]}: dom ${dom} · ras ${raster}` +
        ` · wld ${world}`
      );
    })
    .join("\n");
}

export function CinematicDebugOverlay({
  handle,
  effects,
}: CinematicDebugOverlayProps) {
  const [enabled, setEnabled] = useState(false);
  const [align, setAlign] = useState(false);
  const cells = useRef<Partial<Record<RowKey, HTMLSpanElement | null>>>({});

  useEffect(() => {
    setEnabled(isCinematicDiagnosticsRequested());
    // ?cinematicGlyphAudit=1 opens the overlay with the 50%-layer comparison
    // already on, so the DOM wordmark and the sampled particle field can be
    // inspected on top of each other without a click.
    setAlign(isCinematicGlyphAuditRequested());
  }, []);

  // Flips .cinematic-debug-align on <html>: both the HTML wordmark and the
  // particle canvas drop to 50% opacity so the two layers can be compared
  // directly while tuning the glyph sampling.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cinematic-debug-align", align);
    return () => root.classList.remove("cinematic-debug-align");
  }, [align]);

  useEffect(() => {
    if (!enabled) return;
    const update = (): void => {
      const set = (key: RowKey, value: string): void => {
        if (cells.current[key]) cells.current[key]!.textContent = value;
      };

      set("progress", handle.progress.toFixed(3));
      set(
        "phase",
        `${handle.phase} · ${handle.phaseProgress.toFixed(3)} · ${handle.state} · ${handle.completion}`,
      );
      set(
        "camera",
        `z ${handle.camera.zoom.toFixed(3)} · ${handle.camera.centerX.toFixed(2)} / ${handle.camera.centerY.toFixed(2)}`,
      );
      set(
        "decompose",
        `${handle.decompose.toFixed(3)} · vis ${handle.decomposeVisual.toFixed(3)}`,
      );
      set("release", `${handle.release.toFixed(3)} · haze ${handle.haze.toFixed(3)}`);
      set(
        "wordmark",
        `particles ${effects.wordmark ? effects.wordmark.glyphX.length : "—"} · nodes ${effects.bundle.nodes.length} · ${handle.wordmark.opacity.toFixed(3)} · scale ${handle.wordmark.scale.toFixed(3)}`,
      );
      set(
        "blur",
        `wordmark ${handle.wordmark.blurPx.toFixed(2)}px · haze ${handle.haze.toFixed(3)}`,
      );
      set(
        "mode",
        `${handle.interactionMode} · env ${handle.interactionEnvelope.toFixed(3)}`,
      );
      set(
        "pointer",
        handle.pointer.isInside
          ? `${handle.pointer.normalizedX.toFixed(3)} / ${handle.pointer.normalizedY.toFixed(3)}`
          : "—",
      );
      set("viewport", `${window.innerWidth}×${window.innerHeight}`);
      set(
        "quality",
        `${handle.config.tier} · dpr ${handle.config.pixelRatio} · ${handle.config.motion} · pointer ${handle.config.interaction ? "on" : "off"}`,
      );
      set(
        "graph",
        `${effects.stats.tier} · ${effects.stats.nodeCount}N · ${effects.stats.edgeCount}E · seed ${effects.stats.seed}`,
      );
      set(
        "visible",
        `${effects.stats.visibleNodeCount}/${effects.stats.nodeCount}·${effects.stats.edgeCount}E`,
      );
      set("samples", String(effects.stats.sampleCount));
      const wm = effects.wordmark;
      set(
        "wordmark-bounds",
        wm
          ? `${wm.bounds.left.toFixed(2)}…${wm.bounds.right.toFixed(2)} / ${wm.bounds.bottom.toFixed(2)}…${wm.bounds.top.toFixed(2)}`
          : "—",
      );
      set("align", formatLetterAlignment(effects.wordmark));
      const it = effects.interaction;
      set(
        "interaction",
        it
          ? `${it.coarse ? "coarse " : ""}hover ${it.hoveredId ?? "—"} focus ${it.focusedId ?? "—"} rev ${it.focusRevision}`
          : "off",
      );
    };
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [enabled, handle, effects]);

  if (!enabled) return null;

  return (
    <div className="cinematic-scene__debug" data-cinematic-debug="" aria-hidden="true">
      <dl>
        {DEBUG_ROWS.map((row) => (
          <div
            key={row.key}
            className={row.key === "align" ? "cinematic-debug-align-row" : undefined}
          >
            <dt>{row.label}</dt>
            <dd>
              <span
                ref={(el) => {
                  cells.current[row.key] = el;
                }}
              >
                —
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="cinematic-scene__debug-toggle">
        <button
          type="button"
          aria-pressed={align}
          onClick={() => setAlign((v) => !v)}
        >
          align layers 50%
        </button>
      </div>
    </div>
  );
}