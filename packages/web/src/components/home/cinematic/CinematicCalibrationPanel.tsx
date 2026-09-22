// ============================================================================
// PR — INDAGO Cinematic Home Opening · Cinematic Calibration Lab (dev-only)
//
// A floating, collapsible control surface mounted ONLY when the dev query flag
// ?cinematicCalibrate=1 is present. It is a pure VIEW over the immutable
// CinematicCalibration record: every edit funnels through `applyCalibrationPatch`
// (clamped, window-repaired) and is handed back to the composition root, which
// pushes it into the EXISTING scene/handle. The panel never touches the canvas,
// ScrollTrigger or the graph.
//
// High-frequency per-frame values (progress, camera, particle counts) are read
// with a slow interval + textContent — never React state — so opening the lab
// costs no render loop.
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import {
  CINEMATIC_CALIBRATION_BOUNDS,
  CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND,
  CINEMATIC_INSPECTION_STATES,
  CINEMATIC_CALIBRATION_PRESETS,
  MOMENT_TOLERANCE,
  applyCalibrationPatch,
  calibrationSessionToCode,
  parseCalibrationSession,
  serializeCalibrationSession,
} from "./cinematic.calibration";
import type {
  CinematicCalibration,
  CinematicCalibrationNumericKey,
} from "./cinematic.calibration";
import type { CinematicCalibrationSession } from "./cinematic.calibration";
import type { CinematicSceneHandle } from "./cinematic.types";
import type { OpeningEffects } from "./opening/opening.types";

export interface CinematicCalibrationPanelProps {
  calibration: CinematicCalibration;
  session: CinematicCalibrationSession;
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
  rebuilding: boolean;
  onChange: (next: CinematicCalibration) => void;
  onApplySession: (session: CinematicCalibrationSession) => void;
  onSetMoment: () => void;
  onRemoveMoment: (progress: number) => void;
  onReset: () => void;
  onExit: () => void;
}

type StatusTone = "idle" | "ok" | "error";

function Slider({
  label,
  field,
  calibration,
  onChange,
  suffix = "",
}: {
  label: string;
  field: CinematicCalibrationNumericKey;
  calibration: CinematicCalibration;
  onChange: (next: CinematicCalibration) => void;
  suffix?: string;
}) {
  const bound = CINEMATIC_CALIBRATION_BOUNDS[field];
  const value = calibration[field];
  return (
    <label className="cinematic-cal__row">
      <span className="cinematic-cal__label">
        {label}
        <em>
          {value.toFixed(field === "progress" ? 3 : 2)}
          {suffix}
        </em>
      </span>
      <input
        type="range"
        min={bound.min}
        max={bound.max}
        step={bound.step}
        value={value}
        onChange={(event) =>
          onChange(
            applyCalibrationPatch(calibration, {
              [field]: Number(event.target.value),
            }),
          )
        }
      />
    </label>
  );
}

function Toggle({
  label,
  field,
  calibration,
  onChange,
}: {
  label: string;
  field:
    | "progressLocked"
    | "particlesOnly"
    | "worldSpace"
    | "overlayDom"
    | "overlayRaster"
    | "overlayParticles"
    | "overlayCenter"
    | "overlayPoints"
    | "depthGuides"
    | "depthShowForeground"
    | "depthShowBackground"
    | "depthShowCamera"
    | "glyphAudit";
  calibration: CinematicCalibration;
  onChange: (next: CinematicCalibration) => void;
}) {
  return (
    <label className="cinematic-cal__toggle">
      <input
        type="checkbox"
        checked={calibration[field]}
        onChange={(event) =>
          onChange(
            applyCalibrationPatch(calibration, {
              [field]: event.target.checked,
            }),
          )
        }
      />
      <span>{label}</span>
    </label>
  );
}

function TimelineBar({
  label,
  start,
  end,
  progress,
  active = false,
}: {
  label: string;
  start: number;
  end: number;
  progress: number;
  active?: boolean;
}) {
  const from = Math.max(0, Math.min(100, start * 100));
  const to = Math.max(from + 1, Math.min(100, end * 100));
  const marker = Math.max(0, Math.min(100, progress * 100));
  return (
    <div className="cinematic-cal__timeline">
      <span className="cinematic-cal__timeline-label">{label}</span>
      <div className="cinematic-cal__timeline-track">
        <span
          className={`cinematic-cal__timeline-phase${active ? " is-active" : ""}`}
          style={{ left: `${from.toFixed(1)}%`, width: `${(to - from).toFixed(1)}%` }}
        />
        <span
          className="cinematic-cal__timeline-marker"
          style={{ left: `${marker.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

export function CinematicCalibrationPanel({
  calibration,
  session,
  handle,
  effects,
  rebuilding,
  onChange,
  onApplySession,
  onSetMoment,
  onRemoveMoment,
  onReset,
  onExit,
}: CinematicCalibrationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: "idle",
    text: "",
  });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const readout = useRef<Record<string, HTMLSpanElement | null>>({});
  const statusTimer = useRef(0);

  const flash = (tone: StatusTone, text: string): void => {
    setStatus({ tone, text });
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(
      () => setStatus({ tone: "idle", text: "" }),
      2200,
    );
  };

  // Slow debug readout: textContent only, never React state.
  useEffect(() => {
    const update = (): void => {
      const set = (key: string, value: string): void => {
        const cell = readout.current[key];
        if (cell) cell.textContent = value;
      };
      const wm = effects.wordmark;
      set("progress", `${handle.progress.toFixed(3)} · ${handle.phase}`);
      set(
        "camera",
        `zoom ${handle.camera.zoom.toFixed(3)} · state ${handle.state}/${handle.completion}`,
      );
      set(
        "wordmark",
        `${handle.wordmark.scale.toFixed(3)} · op ${handle.wordmark.opacity.toFixed(3)} · blur ${handle.wordmark.blurPx.toFixed(2)}px`,
      );
      set(
        "particles",
        `${wm ? wm.glyphX.length : 0} samples · ${effects.stats.visibleNodeCount} visible`,
      );
      set(
        "graph",
        `${effects.bundle.nodes.length}N · ${effects.bundle.edges.length}E · vis ${effects.stats.visibleNodeCount}`,
      );
      set("viewport", `${window.innerWidth}×${window.innerHeight}`);
      if (wm) {
        const b = wm.bounds;
        set(
          "dom",
          `x ${b.left.toFixed(3)}..${b.right.toFixed(3)} · y ${b.bottom.toFixed(3)}..${b.top.toFixed(3)}`,
        );
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < wm.glyphX.length; i += 1) {
          const gx = wm.glyphX[i]!;
          const gy = wm.glyphY[i]!;
          if (gx < x0) x0 = gx;
          if (gx > x1) x1 = gx;
          if (gy < y0) y0 = gy;
          if (gy > y1) y1 = gy;
        }
        set(
          "particle-bounds",
          `x ${x0.toFixed(3)}..${x1.toFixed(3)} · y ${y0.toFixed(3)}..${y1.toFixed(3)}`,
        );
        set(
          "align-delta",
          `dx ${calibration.alignmentX}px · dy ${calibration.alignmentY}px (overlay)`,
        );
      } else {
        set("dom", "—");
        set("particle-bounds", "—");
        set("align-delta", "—");
      }
    };
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [handle, effects]);

  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const copy = async (text: string, what: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      flash("ok", `${what} copied`);
    } catch {
      flash("error", "clipboard unavailable");
    }
  };

  const applyPaste = (): void => {
    const result = parseCalibrationSession(pasteText);
    if (!result.ok || !result.value) {
      flash("error", result.error ?? "invalid config");
      return;
    }
    onApplySession(result.value);
    setPasteOpen(false);
    flash("ok", "timeline applied");
  };

  const bound = CINEMATIC_CALIBRATION_BOUNDS;

  return (
    <aside
      className="cinematic-cal"
      data-cinematic-calibration=""
      aria-label="Cinematic calibration lab"
    >
      <header className="cinematic-cal__header">
        <strong>
          CALIBRATION LAB
          <span className="cinematic-cal__badge">DEV</span>
        </strong>
        <div className="cinematic-cal__header-actions">
          {calibration.progressLocked ? (
            <span className="cinematic-cal__lock">PROGRESS LOCKED</span>
          ) : null}
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "⌃" : "⌄"}
          </button>
          <button type="button" onClick={onExit}>
            EXIT
          </button>
        </div>
      </header>

      {collapsed ? null : (
        <div className="cinematic-cal__body">
          {rebuilding ? (
            <p className="cinematic-cal__rebuild">REBUILDING GLYPH FIELD…</p>
          ) : null}

          <details open>
            <summary>PROGRESS</summary>
            <Slider
              label="progress"
              field="progress"
              calibration={calibration}
              onChange={(next) =>
                // Scrubbing the master progress always owns the frame: freeze
                // scroll so the value is deterministic and freely reversible.
                onChange(applyCalibrationPatch(next, { progressLocked: true }))
              }
            />
            <Toggle
              label="freeze scene (lock progress)"
              field="progressLocked"
              calibration={calibration}
              onChange={onChange}
            />
            <div className="cinematic-cal__presets">
              {CINEMATIC_CALIBRATION_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    onChange(
                      applyCalibrationPatch(calibration, {
                        ...preset.patch,
                      }),
                    )
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="cinematic-cal__states">
              {CINEMATIC_INSPECTION_STATES.map((state) => (
                <button
                  key={state.label}
                  type="button"
                  onClick={() =>
                    onChange(
                      applyCalibrationPatch(calibration, {
                        progress: state.progress,
                        progressLocked: true,
                      }),
                    )
                  }
                >
                  {state.label} {state.progress.toFixed(2)}
                </button>
              ))}
            </div>
          </details>

          <details>
            <summary>MOMENTS (keyframes)</summary>
            <p className="cinematic-cal__note">
              Set separate values at each frozen phase, then use the progress
              slider to scrub the WHOLE animation — every value interpolates
              smoothly between moments. COPY CONFIG / COPY CODE export each
              moment. With no moments the production defaults run everywhere.
            </p>
            <div className="cinematic-cal__moments">
              {[...session.keyframes]
                .sort((a, b) => a.progress - b.progress)
                .map((moment) => {
                  const current =
                    Math.abs(moment.progress - calibration.progress) <=
                    MOMENT_TOLERANCE;
                  return (
                    <span key={moment.progress} className="cinematic-cal__moment">
                      <button
                        type="button"
                        onClick={() =>
                          onChange(
                            applyCalibrationPatch(calibration, {
                              progress: moment.progress,
                              progressLocked: true,
                            }),
                          )
                        }
                      >
                        p {moment.progress.toFixed(3)}
                        {current ? " ◂" : ""}
                      </button>
                      <button
                        type="button"
                        className="cinematic-cal__mini"
                        aria-label={`remove moment at ${moment.progress.toFixed(3)}`}
                        onClick={() => onRemoveMoment(moment.progress)}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
            </div>
            {session.keyframes.length === 0 ? (
              <p className="cinematic-cal__note">
                No moments yet — tune a phase, then press SET KEYFRAME (or just
                adjust any slider here; it stamps a moment at the current phase).
              </p>
            ) : null}
            <button
              type="button"
              className="cinematic-cal__wide"
              onClick={onSetMoment}
            >
              SET KEYFRAME AT p {calibration.progress.toFixed(3)}
            </button>
          </details>

          <details>
            <summary>WORDMARK</summary>
            <Slider label="scale ×" field="wordScale" calibration={calibration} onChange={onChange} />
            <Slider label="opacity ×" field="wordOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="blur ×" field="blurAmount" calibration={calibration} onChange={onChange} />
            <label className="cinematic-cal__row">
              <span className="cinematic-cal__label">
                letter-spacing (px, triggers resample)
                <em>{calibration.letterSpacing === null ? "auto" : calibration.letterSpacing.toFixed(1)}</em>
              </span>
              <input
                type="range"
                min={CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND.min}
                max={CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND.max}
                step={CINEMATIC_CALIBRATION_LETTER_SPACING_BOUND.step}
                value={calibration.letterSpacing ?? 0}
                onChange={(event) =>
                  onChange(
                    applyCalibrationPatch(calibration, {
                      letterSpacing: Number(event.target.value),
                    }),
                  )
                }
              />
              <button
                type="button"
                className="cinematic-cal__mini"
                onClick={() =>
                  onChange(
                    applyCalibrationPatch(calibration, { letterSpacing: null }),
                  )
                }
              >
                auto
              </button>
            </label>
          </details>

          <details>
            <summary>PARTICLES</summary>
            <Slider label="size ×" field="particleSize" calibration={calibration} onChange={onChange} />
            <Slider label="opacity ×" field="particleOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="brightness ×" field="brightness" calibration={calibration} onChange={onChange} />
            <Slider label="scale cap" field="particleScaleMax" calibration={calibration} onChange={onChange} />
            <Toggle label="particles only" field="particlesOnly" calibration={calibration} onChange={onChange} />
            <Toggle label="world space guides" field="worldSpace" calibration={calibration} onChange={onChange} />
            <p className="cinematic-cal__note">
              The DOM wordmark sits over the field until it blurs away, so
              size/opacity changes are invisible at the frozen early phases.
              Tick PARTICLES ONLY above (or run GLYPH AUDIT for the 50/50
              compare) to see every particle tweak at ANY frozen phase.
            </p>
          </details>

          <details>
            <summary>DECOMPOSITION</summary>
            <Slider label="decompose start" field="decomposeStart" calibration={calibration} onChange={onChange} />
            <Slider label="decompose end" field="decomposeEnd" calibration={calibration} onChange={onChange} />
            <Slider label="release start" field="releaseStart" calibration={calibration} onChange={onChange} />
            <Slider label="release end" field="releaseEnd" calibration={calibration} onChange={onChange} />
            <Slider label="spread ×" field="releaseSpread" calibration={calibration} onChange={onChange} />
            <Slider label="curl ×" field="releaseCurl" calibration={calibration} onChange={onChange} />
          </details>

          <details>
            <summary>FRAGMENTED DATA</summary>
            <Slider label="label start" field="fragLabelStart" calibration={calibration} onChange={onChange} />
            <Slider label="label end" field="fragLabelEnd" calibration={calibration} onChange={onChange} />
            <Slider label="text start" field="fragTextStart" calibration={calibration} onChange={onChange} />
            <Slider label="text end" field="fragTextEnd" calibration={calibration} onChange={onChange} />
            <Slider label="text opacity ×" field="fragTextOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="text scale ×" field="fragTextScale" calibration={calibration} onChange={onChange} />
            <Slider label="text x (px)" field="fragTextX" calibration={calibration} onChange={onChange} />
            <Slider label="text y (px)" field="fragTextY" calibration={calibration} onChange={onChange} />
            <Slider label="text max width (rem)" field="fragTextMaxWidth" calibration={calibration} onChange={onChange} />
            <p className="cinematic-cal__note">
              The single restrained statement after INDAGO disintegrates. The
              label/text windows are intro progress: both fade in over the
              disintegration → node-release transition and leave before the
              graph resolves. Graph dimming and fragment spread are NOT
              exposed — the scattered field keeps its shipped deterministic
              layout.
            </p>
          </details>

          <details>
            <summary>CAMERA</summary>
            <Slider label="hero zoom" field="heroZoom" calibration={calibration} onChange={onChange} />
            <Slider label="pullback zoom" field="pullbackZoom" calibration={calibration} onChange={onChange} />
            <Slider label="graph zoom" field="graphZoom" calibration={calibration} onChange={onChange} />
            <Slider label="pullback start" field="cameraPullbackStart" calibration={calibration} onChange={onChange} />
            <Slider label="push-in start" field="cameraPushInStart" calibration={calibration} onChange={onChange} />
          </details>

          <details>
            <summary>GRAPH</summary>
            <Slider label="edge start" field="edgeStart" calibration={calibration} onChange={onChange} />
            <Slider label="edge end" field="edgeEnd" calibration={calibration} onChange={onChange} />
            <Slider label="edge opacity ×" field="edgeOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="label start" field="labelStart" calibration={calibration} onChange={onChange} />
            <Slider label="label opacity ×" field="labelOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="graph scale ×" field="graphScale" calibration={calibration} onChange={onChange} />
            <Slider label="node scale ×" field="nodeScale" calibration={calibration} onChange={onChange} />
            <p className="cinematic-cal__note">
              graphScale, edges and labels are phase-gated: they render only after
              the field releases, from edge start {calibration.edgeStart.toFixed(2)}
              to edge end {calibration.edgeEnd.toFixed(2)}. At earlier frozen
              phases they correctly do nothing. Preview the graph where it lives:
            </p>
            <div className="cinematic-cal__states">
              {CINEMATIC_INSPECTION_STATES.filter((state) => state.progress >= 0.8).map((state) => (
                <button
                  key={state.label}
                  type="button"
                  onClick={() =>
                    onChange(
                      applyCalibrationPatch(calibration, {
                        progress: state.progress,
                        progressLocked: true,
                      }),
                    )
                  }
                >
                  {state.label}
                </button>
              ))}
            </div>
            <p className="cinematic-cal__note">
              node scale DOES apply live at any frozen phase: it rescales only the
              first {effects.bundle.nodes.length} particles, the ones that become
              graph nodes after release.
            </p>
          </details>

          <details>
            <summary>GRAPH ZOOM / DEPTH</summary>
            <p className="cinematic-cal__note">
              The final camera dive INTO the formed network (window{' '}
              {calibration.graphZoomStart.toFixed(2)} →{' '}
              {calibration.graphZoomEnd.toFixed(2)}). Nodes carry deterministic
              depth, foreground swells and slides out on parallax while the
              periphery recedes, and edges recede as the camera passes through.
              At frozen phases before the window, nothing here does anything —
              scrub to {calibration.graphZoomStart.toFixed(2)}+ to see the dive.
            </p>
            <Slider label="zoom start" field="graphZoomStart" calibration={calibration} onChange={onChange} />
            <Slider label="zoom end" field="graphZoomEnd" calibration={calibration} onChange={onChange} />
            <Slider label="camera start z" field="graphCameraStartZ" calibration={calibration} onChange={onChange} />
            <Slider label="camera end z" field="graphCameraEndZ" calibration={calibration} onChange={onChange} />
            <Slider label="world scale start ×" field="graphWorldScaleStart" calibration={calibration} onChange={onChange} />
            <Slider label="world scale end ×" field="graphWorldScaleEnd" calibration={calibration} onChange={onChange} />
            <Slider label="depth start" field="graphDepthStart" calibration={calibration} onChange={onChange} />
            <Slider label="depth end" field="graphDepthEnd" calibration={calibration} onChange={onChange} />
            <Slider label="foreground scale ×" field="graphForegroundScale" calibration={calibration} onChange={onChange} />
            <Slider label="background scale ×" field="graphBackgroundScale" calibration={calibration} onChange={onChange} />
            <Slider label="perspective" field="graphPerspective" calibration={calibration} onChange={onChange} />
            <Slider label="parallax" field="graphParallax" calibration={calibration} onChange={onChange} />
            <Slider label="ease" field="graphZoomEase" calibration={calibration} onChange={onChange} />
            <Slider label="node opacity ×" field="graphZoomOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="edge opacity ×" field="graphZoomEdgeOpacity" calibration={calibration} onChange={onChange} />
            <Slider label="label opacity ×" field="graphZoomLabelOpacity" calibration={calibration} onChange={onChange} />
            <p className="cinematic-cal__note">
              DEBUG GUIDES — nearest layer, over the live dive:
            </p>
            <div className="cinematic-cal__overlays">
              <Toggle label="depth guides" field="depthGuides" calibration={calibration} onChange={onChange} />
              <Toggle label="foreground nodes" field="depthShowForeground" calibration={calibration} onChange={onChange} />
              <Toggle label="background nodes" field="depthShowBackground" calibration={calibration} onChange={onChange} />
              <Toggle label="camera / focal" field="depthShowCamera" calibration={calibration} onChange={onChange} />
            </div>
          </details>

<details>
            <summary>NETWORK RESOLVE</summary>
            <p className="cinematic-cal__note">
              Inside the dive's tail, the soft constellation cedes to the DEMO
              icon-node design (window{' '}
              {calibration.networkResolveStart.toFixed(3)} →{' '}
              {calibration.networkResolveEnd.toFixed(3)}). Front nodes resolve
              into ringed icon bodies + edges restyle by depth; 'depth cap'
              sets the max depth that still gains an icon. Ease {'>'}{' '}1 holds
              the convert back so it snaps in at the window's end, {'<'} 1 begins
              earlier; 'node size' scales the icon circles up/down. Reduced-
              motion lands fully resolved. Scrub past the zoom start to watch it.
            </p>
            <Slider label="resolve start" field="networkResolveStart" calibration={calibration} onChange={onChange} />
            <Slider label="resolve end" field="networkResolveEnd" calibration={calibration} onChange={onChange} />
            <Slider label="resolve ease" field="networkResolveEase" calibration={calibration} onChange={onChange} />
            <Slider label="node size ×" field="networkNodeSize" calibration={calibration} onChange={onChange} />
            <Slider label="depth cap" field="networkDepthCap" calibration={calibration} onChange={onChange} />
          </details>

          <details>
            <summary>TIMELINE DEBUG</summary>
            <p className="cinematic-cal__note">
              Phase bars over the whole scroll. The scrub marker tracks
              progress; lock progress to hold a frame.
            </p>
            <TimelineBar
              label="GRAPH FORMATION"
              start={0.63}
              end={1.0}
              progress={calibration.progress}
            />
            <TimelineBar
              label="GRAPH ZOOM / DEPTH"
              start={calibration.graphZoomStart}
              end={calibration.graphZoomEnd}
              progress={calibration.progress}
              active
            />
            <TimelineBar
              label="NETWORK RESOLVE"
              start={calibration.networkResolveStart}
              end={calibration.networkResolveEnd}
              progress={calibration.progress}
              active
            />
          </details>

          <details>
            <summary>ALIGNMENT (overlay only)</summary>
            <Slider label="offset X (CSS px)" field="alignmentX" calibration={calibration} onChange={onChange} />
            <Slider label="offset Y (CSS px)" field="alignmentY" calibration={calibration} onChange={onChange} />
            <p className="cinematic-cal__note">
              Offsets shift ONLY the particle guide layer (raster/particle
              bounds + points) against the fixed DOM wordmark box — the real
              field never moves and the DOM→world mapping stays exact. Turn on
              DOM box + particle bounds to see the correction. They must stay 0
              in production.
            </p>
            <div className="cinematic-cal__overlays">
              <Toggle label="DOM box" field="overlayDom" calibration={calibration} onChange={onChange} />
              <Toggle label="raster/ink" field="overlayRaster" calibration={calibration} onChange={onChange} />
              <Toggle label="particle bounds" field="overlayParticles" calibration={calibration} onChange={onChange} />
              <Toggle label="stage centre" field="overlayCenter" calibration={calibration} onChange={onChange} />
              <Toggle label="particle points" field="overlayPoints" calibration={calibration} onChange={onChange} />
            </div>
            <button
              type="button"
              className="cinematic-cal__wide"
              onClick={() =>
                onChange(
                  applyCalibrationPatch(calibration, {
                    glyphAudit: !calibration.glyphAudit,
                  }),
                )
              }
            >
              {calibration.glyphAudit ? "EXIT GLYPH AUDIT" : "GLYPH AUDIT (50% DOM + particles)"}
            </button>
          </details>

          <details>
            <summary>DEBUG</summary>
            <dl className="cinematic-cal__debug">
              {[
                ["progress", "progress"],
                ["camera", "camera"],
                ["wordmark", "wordmark"],
                ["particles", "particles"],
                ["graph", "graph"],
                ["viewport", "viewport"],
                ["dom bounds", "dom"],
                ["particle bounds", "particle-bounds"],
                ["alignment delta", "align-delta"],
              ].map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    <span
                      ref={(el) => {
                        readout.current[key!] = el;
                      }}
                    >
                      —
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </details>

          <details>
            <summary>ACTIONS</summary>
            <div className="cinematic-cal__actions">
              <button type="button" onClick={onReset}>
                RESET DEFAULTS
              </button>
              <button
                type="button"
                onClick={() =>
                  void copy(serializeCalibrationSession(session), "timeline config")
                }
              >
                COPY CONFIG
              </button>
              <button
                type="button"
                onClick={() =>
                  void copy(calibrationSessionToCode(session), "timeline code")
                }
              >
                COPY CODE
              </button>
              <button
                type="button"
                onClick={() => setPasteOpen((v) => !v)}
              >
                PASTE CONFIG
              </button>
              <button type="button" onClick={onExit}>
                EXIT CALIBRATION
              </button>
            </div>
            {pasteOpen ? (
              <div className="cinematic-cal__paste">
                <textarea
                  value={pasteText}
                  spellCheck={false}
                  placeholder='{"progress":0.5,"keyframes":[{"progress":0,"values":{...}}]}'
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <button type="button" onClick={applyPaste}>
                  APPLY PASTED CONFIG
                </button>
              </div>
            ) : null}
            <p className="cinematic-cal__note">
              Mobile tuning must not overwrite desktop defaults. Bounds: zooms
              0.1–4, opacity 0–1, particle size {bound.particleSize.min}–
              {bound.particleSize.max}×, blur 0–{bound.blurAmount.max}×.
            </p>
          </details>

          {status.tone !== "idle" ? (
            <p className={`cinematic-cal__status is-${status.tone}`}>
              {status.text}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
