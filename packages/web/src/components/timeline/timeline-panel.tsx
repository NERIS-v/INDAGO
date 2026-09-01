"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import type { InvestigationTimeline, TimelineBand } from "@/lib/providers/types";

interface TimelinePanelProps {
  onTimeRangeChange: (range: [number, number] | null) => void;
}

const BAND_KIND_ORDER: TimelineBand["kind"][] = ["milestone", "evidence", "observation", "relationship"];

const BAND_KIND_STYLE: Record<TimelineBand["kind"], string> = {
  milestone: "bg-accent-rose",
  evidence: "bg-accent-amber",
  observation: "bg-info",
  relationship: "bg-success",
};

// How long a full play sweep (start → now) takes in milliseconds.
const PLAY_DURATION_MS = 8000;

// Number of buckets in the activity density strip above the scrubber track.
const DENSITY_BUCKETS = 32;

function formatDate(t: number) {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TimelinePanel({ onTimeRangeChange }: TimelinePanelProps) {
  const workspace = useWorkspace();
  const [timeline, setTimeline] = useState<InvestigationTimeline | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [rangePct, setRangePct] = useState<[number, number]>([0, 100]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverItem, setHoverItem] = useState<{ x: number; label: string; time: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playAnimRef = useRef<number | null>(null);
  const lastPlayApplyRef = useRef(0);

  // 1. Initial Load
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

  // 2. LIVE LISTENER: Adds the Evidence Dot dynamically the moment upload triggers!
  useEffect(() => {
    const unsubscribe = workspace.realtime.subscribe((event) => {
      // Listen for the specific event ID from our F3 upload sequence
      if (event.id === "upload-evt-1") {
        setTimeline((prev) => {
          if (!prev) return prev;
          
          const evBand = prev.bands.find((b) => b.kind === "evidence");
          const bandId = evBand ? evBand.id : "band-evidence";
          
          const newBands = evBand 
            ? prev.bands 
            : [...prev.bands, { id: bandId, kind: "evidence" as const, label: "Evidence" }];

          const newDot = {
            id: "live-upload-dot",
            bandId: bandId,
            time: "2024-06-18T12:02:00.000Z", // Matches our F3 demo date
            label: "Uploaded Evidence: ROC Filing & Call Records",
            precision: "exact" as const,
          };

          // Prevent adding it twice
          if (prev.items.some((it) => it.id === newDot.id)) return prev;

          return {
            ...prev,
            bands: newBands,
            items: [...prev.items, newDot],
          };
        });
      }
    });
    
    return () => unsubscribe();
  }, [workspace.realtime]);

  // ROCK-SOLID DOMAIN FALLBACK
  const domain = useMemo(() => {
    if (timeline && timeline.items.length > 0) {
      const times = timeline.items.map((it) => new Date(it.time).getTime()).filter((t) => !Number.isNaN(t));
      if (times.length > 0) {
        const min = Math.min(...times);
        const max = Math.max(...times);
        const pad = Math.max((max - min) * 0.04, 1000 * 60 * 60 * 24 * 7); // 7 day min padding
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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyRange(rangePct), 50);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rangePct, applyRange]);

  const spanD = domain.end - domain.start;
  const itemTimes = timeline
    ? timeline.items.map((it) => new Date(it.time).getTime()).filter((t) => !Number.isNaN(t))
    : [];
  const nowTs = itemTimes.length > 0 ? Math.max(...itemTimes) : domain.end;
  const nowPct = Math.min(100, Math.max(0, ((nowTs - domain.start) / spanD) * 100));

  // Play: sweep the range from the start (left edge at start) to "now" so the
  // graph is progressively built up — nodes enter the window left→right and
  // fly in from outside the canvas in time order (Obsidian-style).
  const stopPlay = useCallback(() => {
    if (playAnimRef.current !== null) {
      cancelAnimationFrame(playAnimRef.current);
      playAnimRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlay = useCallback(() => {
    const startTime = performance.now();
    const beginPct = 0;
    // Sweep to the latest known data point ("now"), not the padded domain end,
    // so the sweep agrees with the "now" marker on the density strip.
    const targetEnd = nowPct;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / PLAY_DURATION_MS);
      // Left handle pinned to the start; right handle sweeps to "now".
      const end = beginPct + progress * targetEnd;
      setRangePct((prev) => [beginPct, Math.max(end, prev[1] < beginPct ? beginPct : prev[1])]);
      // The 50ms debounce on rangePct resets on every frame (16ms), so it never
      // fires while the sweep is running. Persist the sweep into the graph from
      // here at a readable cadence so nodes stream in as the range advances.
      if (now - lastPlayApplyRef.current >= 40) {
        lastPlayApplyRef.current = now;
        applyRange([beginPct, end]);
      }
      if (progress < 1) {
        playAnimRef.current = requestAnimationFrame(step);
      } else {
        playAnimRef.current = null;
        setIsPlaying(false);
      }
    };
    setRangePct([beginPct, beginPct + 1]); // collapse to the start point first
    setIsPlaying(true);
    lastPlayApplyRef.current = 0;
    playAnimRef.current = requestAnimationFrame(step);
  }, [applyRange, nowPct]);

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
      <div className="w-full h-40 flex items-center justify-center bg-surface-50 rounded-lg border border-surface-200 mt-4">
        <ErrorDisplay message={error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="w-full h-40 flex items-center justify-center bg-surface-50 rounded-lg border border-surface-200 mt-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const span = domain.end - domain.start;
  const bandsPresent = BAND_KIND_ORDER.filter((kind) => timeline.bands.some((b) => b.kind === kind));
  const hasItems = timeline.items.length > 0;

  const densityBins: number[] = new Array(DENSITY_BUCKETS).fill(0);
  for (const t of itemTimes) {
    const idx = Math.min(DENSITY_BUCKETS - 1, Math.max(0, Math.floor(((t - domain.start) / span) * DENSITY_BUCKETS)));
    densityBins[idx] = (densityBins[idx] ?? 0) + 1;
  }
  const maxDensity = Math.max(1, ...densityBins);
  const axisLabels = Array.from({ length: 4 }, (_, i) => domain.start + (span * i) / 3);

  return (
    <div className="w-full bg-surface-50 rounded-lg border border-surface-200 mt-4 p-5 animate-fade-in shadow-sm">
      
      {/* Typography matches Evidence tab headers */}
      <div className="flex justify-between items-baseline w-full mb-4">
        <span className="text-[11px] font-sans text-surface-500 uppercase tracking-widest">{formatDate(domain.start)}</span>
        <span className="text-[11px] font-sans text-surface-500 uppercase tracking-widest">
          Selected:{" "}
          <span className="font-mono text-surface-800 ml-1">
            {formatDate(domain.start + span * (rangePct[0] / 100))} — {formatDate(domain.start + span * (rangePct[1] / 100))}
          </span>
        </span>
        <span className="text-[11px] font-sans text-surface-500 uppercase tracking-widest">{formatDate(domain.end)}</span>
      </div>

      {/* Play / pause: sweep the range start → now so the graph builds in time order */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => (isPlaying ? stopPlay() : startPlay())}
          aria-label={isPlaying ? "Pause timeline sweep" : "Play timeline sweep"}
          className={`w-8 h-8 flex items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 ring-accent-rose ${
            isPlaying
              ? "bg-accent-rose border-accent-rose text-surface-0"
              : "bg-surface-100 border-surface-300 text-surface-700 hover:bg-surface-200 hover:border-accent-rose hover:text-accent-rose"
          }`}
        >
          {isPlaying ? (
            <span className="block w-2.5 h-2.5">
              <span className="block h-full w-[3px] mr-[2px] float-left bg-current" />
              <span className="block h-full w-[3px] float-left bg-current" />
            </span>
          ) : (
            <span className="block w-0 h-0 ml-0.5 border-y-[5px] border-y-transparent border-l-[9px] border-l-current" />
          )}
        </button>
        <span className="text-[10px] font-mono text-surface-500 uppercase tracking-widest">
          {isPlaying ? "Building graph…" : "Play — watch the graph build from start to now"}
        </span>
      </div>

      {/* Date axis — even steps across the case-wide range */}
      <div className="flex justify-between mb-2">
        {axisLabels.map((t, i) => (
          <span key={i} className="text-[10px] font-mono text-surface-500 uppercase tracking-wide">
            {formatDate(t)}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {hasItems ? bandsPresent.map((kind) => {
          const bandIds = new Set(timeline.bands.filter((b) => b.kind === kind).map((b) => b.id));
          const items = timeline.items.filter((it) => bandIds.has(it.bandId));
          return (
            <div key={kind} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[10px] font-mono text-surface-500 uppercase tracking-wide">
                {kind}
              </span>
              <div className="relative flex-1 h-3">
                <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-surface-200" />
                {items.map((item) => {
                  const t = new Date(item.time).getTime();
                  if (Number.isNaN(t)) return null;
                  const pos = ((t - domain.start) / span) * 100;
                  const inRange = pos >= rangePct[0] && pos <= rangePct[1];
                  return (
                    <div
                      key={item.id}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full transition-opacity cursor-pointer shadow-sm ${BAND_KIND_STYLE[kind]}`}
                      style={{ left: `${pos}%`, opacity: inRange ? 1 : 0.2 }}
                      onMouseEnter={() => setHoverItem({ x: pos, label: item.label, time: formatDate(t) })}
                      onMouseLeave={() => setHoverItem(null)}
                    />
                  );
                })}
              </div>
            </div>
          );
        }) : (
           <div className="w-full flex items-center justify-center py-4">
             <span className="text-xs text-surface-500">Timeline events will appear as evidence is ingested.</span>
           </div>
        )}
      </div>

      {/* Activity density strip — histogram of item density across the case-wide range */}
      {hasItems && (
        <div className="relative mt-4 mb-1 h-8">
          <div className="absolute inset-0 flex items-end gap-px overflow-hidden rounded">
            {densityBins.map((count, i) => (
              <span
                key={i}
                className={`flex-1 rounded-t transition-colors ${
                  (i / DENSITY_BUCKETS) * 100 <= rangePct[1] ? "bg-accent-rose/30" : "bg-surface-200"
                }`}
                style={{ height: `${Math.max(8, (count / maxDensity) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <div ref={trackRef} className="w-full h-2 bg-surface-200 rounded-full mt-2 relative z-10">
        <div
          className="absolute h-full bg-accent-rose/30 border-y border-accent-rose/50 rounded-full"
          style={{ left: `${rangePct[0]}%`, right: `${100 - rangePct[1]}%` }}
        />

        {/* Now marker */}
        {hasItems && (
          <div
            className="absolute -top-3 -translate-x-1/2 pointer-events-none z-20"
            style={{ left: `${nowPct}%` }}
            aria-hidden
          >
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono text-surface-700 uppercase tracking-widest mb-0.5">now</span>
              <span className="block w-px h-6 bg-surface-600/70" />
            </div>
          </div>
        )}

        {/* Hover Tooltip */}
        {hoverItem && (
          <div
            className="absolute -top-8 -translate-x-1/2 px-2.5 py-1 bg-surface-800 text-surface-0 font-mono text-[10px] rounded whitespace-nowrap pointer-events-none z-50 shadow-lg"
            style={{ left: `${hoverItem.x}%` }}
          >
            {hoverItem.label} · {hoverItem.time}
          </div>
        )}

        {/* Scrubber Handles with Keyboard Accessibility */}
        {[0, 1].map((index) => (
          <button
            key={index}
            type="button"
            aria-label={index === 0 ? "Adjust range start" : "Adjust range end"}
            className="absolute top-1/2 -translate-y-1/2 w-3 h-5 bg-surface-100 border border-surface-400 rounded cursor-ew-resize hover:border-accent-rose hover:bg-surface-200 shadow-sm transition-colors flex items-center justify-center touch-none outline-none focus-visible:ring-2 ring-accent-rose"
            style={{ left: `calc(${rangePct[index]}% - 6px)` }}
            onPointerDown={handleDrag(index as 0 | 1)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                setRangePct((p) => index === 0 
                  ? [Math.max(0, p[0] - 1), p[1]] 
                  : [p[0], Math.max(p[0] + 1, p[1] - 1)]);
              }
              if (e.key === "ArrowRight") {
                setRangePct((p) => index === 0 
                  ? [Math.min(p[1] - 1, p[0] + 1), p[1]] 
                  : [p[0], Math.min(100, p[1] + 1)]);
              }
            }}
          >
            <div className="w-px h-2.5 bg-surface-400 rounded-full" />
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-4 border-t border-surface-200">
        {bandsPresent.map((kind) => (
          <div key={kind} className="flex items-center gap-1.5 text-[10px] font-mono text-surface-500 uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${BAND_KIND_STYLE[kind]}`} />
            {kind}
          </div>
        ))}
      </div>
    </div>
  );
}