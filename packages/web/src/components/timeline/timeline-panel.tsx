"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import type { InvestigationTimeline, TimelineBand, TimelineItem } from "@/lib/providers/types";

interface TimelinePanelProps {
  onTimeRangeChange: (range: [number, number] | null) => void;
  /** PR-3 narrow seam: a timeline diamond ACTs as an intent to surface the
   *  linked object (evidence/observation) in the context bridge. Passed by
   *  the shell; TimelinePanel itself is not rewritten. */
  onEventActivate?: (item: TimelineItem) => void;
  /** F-PR5 narrow seam: the workspace-wide temporal scope this panel previously
   *  shared from a LOCAL rangePct. When the shell remounts (e.g. returning to
   *  the Graph route), rangePct would otherwise silently reset to [0,100] and
   *  overwrite the shared scope. When THIS prop is supplied, rangePct is seeded
   *  once from it (never re-seeded afterwards). Absent/null = existing default
   *  "full timeline" behavior, unchanged. */
  restoredTimeRange?: [number, number] | null;
}

const BAND_KIND_ORDER: TimelineBand["kind"][] = ["milestone", "evidence", "observation", "relationship"];

// F-PR17: the analyst surface renders THREE bands (milestones / evidence /
// observations). Relationship bands stay fully supported in the data seam
// (BAND_KIND_ORDER / BAND_LABELS / BAND_COLORS) but are not part of the
// display surface — the columns stay honest, never silently hidden data.
const DISPLAY_KINDS = BAND_KIND_ORDER.filter((kind) => kind !== "relationship");

const BAND_COLORS: Record<TimelineBand["kind"], string> = {
  milestone: "var(--color-accent-rose)",
  evidence: "var(--color-accent-amber)",
  observation: "var(--color-info)",
  relationship: "var(--color-success)",
};

const BAND_LABELS: Record<TimelineBand["kind"], string> = {
  milestone: "MILESTONES",
  evidence: "EVIDENCE",
  observation: "OBSERVATIONS",
  relationship: "RELATIONS",
};

const PLAY_DURATION_MS = 8000;
const DENSITY_BUCKETS = 120;

function formatDate(t: number) {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function TimelinePanel({ onTimeRangeChange, onEventActivate, restoredTimeRange }: TimelinePanelProps) {
  const workspace = useWorkspace();
  const [timeline, setTimeline] = useState<InvestigationTimeline | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [rangePct, setRangePct] = useState<[number, number]>([0, 100]);
  // True once the restored-scope seed has COMMITTED (see seed effect below). The
  // debounce effect gates on this state (not a ref) so the mount-default
  // [0,100] can never schedule a publish in the same effect pass the seed runs:
  // a ref would already be flipped by the time the debounce effect reads it,
  // letting a stale full-range timer fire ahead of the seeded window.
  const [restoredSeeded, setRestoredSeeded] = useState(false);
  // The debounce callback must never publish a STALE rangePct. On a restored
  // mount the seed projects the shared scope into rangePct in the same pass an
  // earlier debounce could be scheduled from the mount-default [0,100]; if that
  // 50ms timer fires before the effect cleanup cancels it, the full range would
  // be published briefly ahead of the seeded window. The callback reads the ref
  // (latest committed value), so a pending publish always carries the current
  // temporal scope, never the mount-time default.
  const rangePctRef = useRef<[number, number]>(rangePct);
  rangePctRef.current = rangePct;
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverItem, setHoverItem] = useState<{ x: number; label: string; time: string; kind: TimelineBand["kind"] } | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playAnimRef = useRef<number | null>(null);
  const lastPlayApplyRef = useRef(0);
  const hasRestored = restoredTimeRange !== undefined && restoredTimeRange !== null;
  const restoredAppliedRef = useRef(false);
  // Regression (PR-6 §T): a fresh mount must NOT auto-publish a window. Before
  // the timeline resolves, domain is the fallback [now-90d, now]; publishing
  // even the "full" [0,100] selection maps to that fallback epoch window, which
  // excludes every historical node (all case data predates it) -> the graph
  // renders with every node out-of-range until the analyst presses play. The
  // workspace temporal scope stays null ("current status of everything") until
  // a real restore is applied or the analyst explicitly drags/plays/scrubs.
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchTimeline() {
      try {
        const data = await workspace.timeline.getTimeline(workspace.investigationId);
        if (isMounted) setTimeline(data);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err : new Error("Failed to load timeline"));
      }
    }
    fetchTimeline();
    return () => { isMounted = false; };
  }, [workspace]);

  // LIVE LISTENER
  useEffect(() => {
    const unsubscribe = workspace.realtime.subscribe((event) => {
      setTimeline((prev) => {
        if (!prev) return prev;

        let kind: TimelineBand["kind"] | null = null;
        let label = "";
        const time = event.timestamp;

        if (!time) return prev;

        switch (event.id) {
          case "upload-evt-courier-node":
            kind = "observation"; label = "Discovered: Meridian Transit Pvt Ltd"; break;
          case "upload-evt-burst-hole":
            kind = "observation"; label = "Gap Identified: Unresolved Ownership"; break;
          case "upload-evt-resolve-hole":
            kind = "evidence"; label = "Evidence Reviewed: Victor Aldridge ROC Filing"; break;
          case "upload-evt-sim-node":
            kind = "observation"; label = "Discovered: Unregistered SIM"; break;
          default:
            return prev;
        }

        const existingBand = prev.bands.find((b) => b.kind === kind);
        const bandId = existingBand ? existingBand.id : `band-${kind}`;
        const newBands = existingBand ? prev.bands : [...prev.bands, { id: bandId, kind, label: kind.charAt(0).toUpperCase() + kind.slice(1) }];
        const newDot = { id: `live-${event.id}`, bandId, time, label, precision: "exact" as const };

        if (prev.items.some((it) => it.id === newDot.id)) return prev;

        const nextItems = [...prev.items, newDot].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        return { ...prev, bands: newBands, items: nextItems };
      });
    });
    return () => unsubscribe();
  }, [workspace.realtime]);

  const domain = useMemo(() => {
    if (timeline && timeline.items.length > 0) {
      const times = timeline.items.map((it) => new Date(it.time).getTime()).filter((t) => !Number.isNaN(t));
      if (times.length > 0) {
        const min = Math.min(...times);
        const max = Math.max(...times);
        const pad = Math.max((max - min) * 0.04, 1000 * 60 * 60 * 24 * 7);
        return { start: min - pad, end: max + pad };
      }
    }
    const now = new Date().getTime();
    return { start: now - (1000 * 60 * 60 * 24 * 90), end: now };
  }, [timeline]);

  const applyRange = useCallback((pct: [number, number]) => {
      const span = domain.end - domain.start;
      onTimeRangeChange([domain.start + span * (pct[0] / 100), domain.start + span * (pct[1] / 100)]);
    }, [domain, onTimeRangeChange]
  );

  // F-PR5: seed rangePct ONCE from the shared workspace scope once the timeline
  // domain is known. Without this, a shell remount silent-resets rangePct to
  // [0,100], which would overwrite the shared temporal scope as if the analyst
  // had never narrowed it. Seeding is a one-time projection of the restored
  // epoch range into domain percent space. The debounce below is gated while a
  // restore is pending so the defaulted [0,100] never emits a spurious
  // full-range onChange ahead of the seed.
  useEffect(() => {
    if (!hasRestored || restoredAppliedRef.current) return;
    if (!timeline || timeline.items.length === 0) return;
    const span = domain.end - domain.start;
    if (span <= 0) return;
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    restoredAppliedRef.current = true;
    setRangePct([
      clamp(((restoredTimeRange![0] - domain.start) / span) * 100),
      clamp(((restoredTimeRange![1] - domain.start) / span) * 100),
    ]);
    setRestoredSeeded(true);
  }, [hasRestored, timeline, domain, restoredTimeRange]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (hasRestored && !restoredSeeded) return;
    if (!hasRestored && !hasInteractedRef.current) return;
    debounceRef.current = setTimeout(() => applyRange(rangePctRef.current), 50);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rangePct, applyRange, hasRestored, restoredSeeded]);

  const spanD = domain.end - domain.start;
  const itemTimes = timeline ? timeline.items.map((it) => new Date(it.time).getTime()).filter((t) => !Number.isNaN(t)) : [];
  const nowTs = itemTimes.length > 0 ? Math.max(...itemTimes) : domain.end;
  const nowPct = Math.min(100, Math.max(0, ((nowTs - domain.start) / spanD) * 100));

  const stopPlay = useCallback(() => {
    if (playAnimRef.current !== null) { cancelAnimationFrame(playAnimRef.current); playAnimRef.current = null; }
    setIsPlaying(false);
  }, []);

  // F-PR17: reduced-motion preference read once at mount. Guarded so the
  // panel behaves identically in test DOMs where matchMedia is unstubbed.
  const reducedMotionPref = useMemo(() => {
    if (typeof window.matchMedia !== "function") return false;
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  }, []);

  const startPlay = useCallback(() => {
    hasInteractedRef.current = true;
    if (reducedMotionPref) {
      // F-PR17: reduced motion PUBLISHES the full analytical window instantly —
      // no rAF stepping, no sweeping playback, no intermediate frames.
      setRangePct([0, nowPct]);
      applyRange([0, nowPct]);
      return;
    }
    const startTime = performance.now();
    const targetEnd = nowPct;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / PLAY_DURATION_MS);
      const end = progress * targetEnd;

      setRangePct((prev) => [0, Math.max(end, prev[1] < 0 ? 0 : prev[1])]);
      if (now - lastPlayApplyRef.current >= 40) {
        lastPlayApplyRef.current = now;
        applyRange([0, end]);
      }

      if (progress < 1) playAnimRef.current = requestAnimationFrame(step);
      else { playAnimRef.current = null; setIsPlaying(false); }
    };

    setRangePct([0, 1]);
    setIsPlaying(true);
    lastPlayApplyRef.current = 0;
    playAnimRef.current = requestAnimationFrame(step);
  }, [applyRange, nowPct, reducedMotionPref]);

  useEffect(() => () => {
    if (playAnimRef.current !== null) cancelAnimationFrame(playAnimRef.current);
  }, []);

  const handleDrag = (index: 0 | 1) => () => {
    if (!trackRef.current) return;
    const track = trackRef.current;
    stopPlay();

    const onMove = (moveEvent: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      let newPct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      newPct = Math.max(0, Math.min(100, newPct));

      hasInteractedRef.current = true;
      setRangePct((prev) => {
        const newRange = [...prev] as [number, number];
        newRange[index] = newPct;
        if (index === 0 && newRange[0] > newRange[1]) newRange[0] = newRange[1] - 1;
        if (index === 1 && newRange[1] < newRange[0]) newRange[1] = newRange[0] + 1;
        return newRange;
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (error) {
    return (
      <div className="w-full h-32 flex items-center justify-center glass-panel rounded-xl mt-4 border border-danger/30">
        <ErrorDisplay message={error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="w-full h-32 flex items-center justify-center glass-panel rounded-xl mt-4">
        <LoadingSpinner size="sm" label="Calibrating timeline telemetry..." />
      </div>
    );
  }

  const span = domain.end - domain.start;
  const bandsPresent = DISPLAY_KINDS.filter((kind) => timeline.bands.some((b) => b.kind === kind));
  const hasItems = timeline.items.length > 0;

  const densityBins: number[] = new Array(DENSITY_BUCKETS).fill(0);
  for (const t of itemTimes) {
    const idx = Math.min(DENSITY_BUCKETS - 1, Math.max(0, Math.floor(((t - domain.start) / span) * DENSITY_BUCKETS)));
    densityBins[idx] = (densityBins[idx] ?? 0) + 1;
  }
  const maxDensity = Math.max(1, ...densityBins);

  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col select-none overflow-hidden rounded-xl border border-surface-200/50 bg-surface-50/40 backdrop-blur-2xl shadow-2xl"
      data-timeline-panel
    >
      {/* COMPACT HEADER — one ~46px row, never wraps */}
      <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 border-b border-surface-300 bg-surface-100/80 px-3 backdrop-blur-md z-20">
        <div className="flex min-w-0 items-center gap-3">
          {/* Action Play Button */}
          <button
            type="button"
            aria-label={isPlaying ? "Pause timeline replay" : "Play timeline replay"}
            onClick={() => (isPlaying ? stopPlay() : startPlay())}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 ring-accent-rose ${
              isPlaying
                ? "bg-accent-rose text-surface-0 shadow-[0_0_12px_var(--color-accent-rose)] border border-accent-rose"
                : "bg-surface-800 border border-surface-600 text-surface-0 hover:bg-surface-900 hover:border-accent-rose"
            }`}
          >
            {isPlaying ? (
              <span className="flex gap-1 h-3">
                <span className="w-0.5 h-full bg-current rounded-sm" />
                <span className="w-0.5 h-full bg-current rounded-sm" />
              </span>
            ) : (
              <svg className="w-3.5 h-3.5 ml-0.5 text-current" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <div className="min-w-0 leading-tight">
            <span className="block text-[8px] font-mono text-surface-400 uppercase tracking-widest font-bold">Investigation Window</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-surface-900 tracking-widest font-bold">{formatDate(domain.start)}</span>
              <span className="w-3 h-[2px] bg-surface-400/50" />
              <span className="text-[11px] font-mono text-surface-900 tracking-widest font-bold">{formatDate(domain.end)}</span>
            </div>
          </div>
        </div>

        {/* Inline M/E/O legend */}
        <div className="hidden md:flex shrink-0 items-center gap-3">
          {bandsPresent.map((kind) => (
            <div key={kind} className="flex items-center gap-1.5 text-[9px] font-mono text-surface-900 font-bold uppercase tracking-widest">
              <span className="w-2 h-2 rounded-sm rotate-45 shadow-sm" style={{ backgroundColor: BAND_COLORS[kind] }} />
              {BAND_LABELS[kind]}
            </div>
          ))}
        </div>
      </div>

      {/* TRACK + AXIS BLOCK — fills the panel (min-h-0 flex-1), never scrolls */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-surface-50" data-timeline-block>
        {/* Analytical window overlay — plain % bounds over the WHOLE tracks */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 flex transition-all duration-75"
          style={{ left: `${rangePct[0]}%`, right: `${100 - rangePct[1]}%` }}
          data-timeline-window
        >
          <div className="absolute inset-0 bg-accent-rose/10" />
          <div className="absolute inset-y-0 left-0 w-px bg-accent-rose/80" />
          <div className="absolute inset-y-0 right-0 w-px bg-accent-rose/80" />
          <div className="absolute left-1/2 top-[3px] -translate-x-1/2 whitespace-nowrap rounded bg-accent-rose px-1.5 py-[1px] text-[8px] font-mono font-bold uppercase tracking-widest text-surface-0 opacity-90 shadow" data-timeline-focus-label>
            FOCUS: {formatDate(domain.start + span * (rangePct[0] / 100))} — {formatDate(domain.start + span * (rangePct[1] / 100))}
          </div>
        </div>

        {/* THREE DATA LANES */}
        <div className="z-20 flex min-h-0 flex-1 flex-col gap-[3px] px-3 pb-1 pt-7">
          {hasItems ? bandsPresent.map((kind) => {
            const bandIds = new Set(timeline.bands.filter((b) => b.kind === kind).map((b) => b.id));
            const items = timeline.items.filter((it) => bandIds.has(it.bandId));
            const color = BAND_COLORS[kind];

            return (
              <div key={`lane-${kind}`} className="group/lane relative flex min-h-[9px] flex-1 items-center" data-timeline-lane={kind}>
                {/* Horizontal Track Line */}
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-surface-300 -translate-y-1/2 transition-colors group-hover/lane:bg-surface-400" />

                {/* Tactical Diamond Nodes */}
                {items.map((item) => {
                  const t = new Date(item.time).getTime();
                  if (Number.isNaN(t)) return null;
                  const pos = ((t - domain.start) / span) * 100;
                  const inRange = pos >= rangePct[0] && pos <= rangePct[1];

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Activate ${item.label}`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-40 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
                      style={{ left: `${pos}%` }}
                      onClick={() => onEventActivate?.(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEventActivate?.(item);
                        }
                      }}
                      onMouseEnter={() => setHoverItem({ x: pos, label: item.label, time: `${formatDate(t)} ${formatTime(t)}`, kind })}
                      onMouseLeave={() => setHoverItem(null)}
                    >
                      <div
                        className={`w-2.5 h-2.5 rotate-45 border-[1.5px] border-surface-0 transition-opacity ${inRange ? 'opacity-100' : 'opacity-40'}`}
                        style={{ backgroundColor: color, boxShadow: inRange ? `0 0 10px ${color}` : 'none' }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          }) : (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-[9px] font-mono uppercase tracking-widest text-surface-400">No temporal events resolved</span>
            </div>
          )}
        </div>

        {/* Hover Crosshair Tooltip — Isolated to the Lanes Block */}
        {hoverItem && (
          <div className="pointer-events-none absolute top-0 bottom-8 z-[60] transition-all duration-75" style={{ left: `${hoverItem.x}%` }}>
            <div className="absolute top-0 bottom-0 w-[2px] bg-surface-0 -translate-x-1/2 shadow-[0_0_12px_rgba(255,255,255,1)]" />
            <div className="absolute top-2 left-4 bg-surface-900 border border-surface-600 shadow-2xl p-2.5 rounded-lg flex flex-col gap-1.5 w-max max-w-[260px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rotate-45 border border-surface-0 shadow-sm" style={{ backgroundColor: BAND_COLORS[hoverItem.kind] }} />
                <span className="text-[9px] font-mono text-surface-300 font-bold uppercase tracking-widest">{hoverItem.time}</span>
              </div>
              <span className="text-xs font-sans text-surface-0 font-medium leading-relaxed">{hoverItem.label}</span>
            </div>
          </div>
        )}

        {/* MONO TIME AXIS — density strip + minor/major ticks + NOW marker */}
        <div className="relative z-20 h-[34px] shrink-0 border-t border-surface-300 bg-surface-100/60" data-timeline-axis>
          {hasItems && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[3px] items-end gap-[1px] px-0.5">
              {densityBins.map((count, i) => {
                const xPct = (i / DENSITY_BUCKETS) * 100;
                const isActive = xPct >= rangePct[0] && xPct < rangePct[1];
                return (
                  <div
                    key={`hist-${i}`}
                    className={`flex-1 ${isActive ? 'bg-accent-rose' : 'bg-surface-400'}`}
                    style={{ height: `${count > 0 ? Math.max(1.5, 3 * (count / maxDensity)) : 1.5}px`, opacity: isActive ? 1 : 0.35 }}
                  />
                );
              })}
            </div>
          )}

          {/* Minor ticks */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[18px] flex justify-between">
            {Array.from({ length: 17 }).map((_, i) => (
              <div key={`minor-${i}`} className="w-px h-1 bg-surface-400/70" />
            ))}
          </div>

          {/* Major ticks + mono labels */}
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between">
            {[0, 25, 50, 75, 100].map((f) => (
              <div key={`major-${f}`} className="flex flex-col items-center">
                <div className="h-2 w-px bg-surface-500" />
                <span className="mt-[3px] text-[7px] font-mono font-bold uppercase tracking-wider text-surface-500">{formatDate(domain.start + span * (f / 100))}</span>
              </div>
            ))}
          </div>

          {/* NOW marker */}
          {hasItems && (
            <div className="pointer-events-none absolute bottom-[3px] z-30 flex -translate-x-1/2 flex-col items-center" style={{ left: `${nowPct}%` }}>
              <div className="h-[14px] w-px bg-surface-900 shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
              <span className="text-[7px] font-mono font-bold uppercase tracking-widest text-surface-900">NOW</span>
            </div>
          )}
        </div>

        {/* KEYBOARD-ACCESSIBLE DRAG HANDLES — span the whole track block */}
        <div ref={trackRef} className="absolute inset-0 z-40 cursor-pointer">
          {[0, 1].map((index) => (
            <button
              key={`handle-${index}`}
              type="button"
              aria-label={index === 0 ? "Timeline window start handle. Use arrow keys to adjust." : "Timeline window end handle. Use arrow keys to adjust."}
              className="group/handle absolute top-0 bottom-0 z-50 flex w-5 -translate-x-1/2 cursor-ew-resize flex-col items-center justify-center focus-visible:outline-none focus-visible:bg-accent-rose/20"
              style={{ left: `${rangePct[index]}%` }}
              onPointerDown={handleDrag(index as 0 | 1)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") { hasInteractedRef.current = true; setRangePct((p) => index === 0 ? [Math.max(0, p[0] - 1), p[1]] : [p[0], Math.max(p[0] + 1, p[1] - 1)]); }
                if (e.key === "ArrowRight") { hasInteractedRef.current = true; setRangePct((p) => index === 0 ? [Math.min(p[1] - 1, p[0] + 1), p[1]] : [p[0], Math.min(100, p[1] + 1)]); }
              }}
            >
              {/* Visual Drag Handle */}
              <div className="h-full w-[3px] bg-accent-rose shadow-[0_0_8px_var(--color-accent-rose)] transition-all group-hover/handle:w-[4px]" data-timeline-handle-bar />
              <div className="absolute top-1/2 -translate-y-1/2 flex h-7 w-3.5 flex-col items-center justify-center gap-[2px] rounded border-2 border-accent-rose bg-surface-0 shadow-xl">
                <div className="h-3 w-[2px] bg-surface-400" />
                <div className="h-3 w-[2px] bg-surface-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}