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

export function TimelinePanel({ onTimeRangeChange }: TimelinePanelProps) {
  const workspace = useWorkspace();
  const [timeline, setTimeline] = useState<InvestigationTimeline | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [rangePct, setRangePct] = useState<[number, number]>([0, 100]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverItem, setHoverItem] = useState<{ x: number; label: string; time: string; kind: TimelineBand["kind"] } | null>(null);
  
  const trackRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playAnimRef = useRef<number | null>(null);
  const lastPlayApplyRef = useRef(0);

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyRange(rangePct), 50);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rangePct, applyRange]);

  const spanD = domain.end - domain.start;
  const itemTimes = timeline ? timeline.items.map((it) => new Date(it.time).getTime()).filter((t) => !Number.isNaN(t)) : [];
  const nowTs = itemTimes.length > 0 ? Math.max(...itemTimes) : domain.end;
  const nowPct = Math.min(100, Math.max(0, ((nowTs - domain.start) / spanD) * 100));

  const stopPlay = useCallback(() => {
    if (playAnimRef.current !== null) { cancelAnimationFrame(playAnimRef.current); playAnimRef.current = null; }
    setIsPlaying(false);
  }, []);

  const startPlay = useCallback(() => {
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
  const bandsPresent = BAND_KIND_ORDER.filter((kind) => timeline.bands.some((b) => b.kind === kind));
  const hasItems = timeline.items.length > 0;

  const densityBins: number[] = new Array(DENSITY_BUCKETS).fill(0);
  for (const t of itemTimes) {
    const idx = Math.min(DENSITY_BUCKETS - 1, Math.max(0, Math.floor(((t - domain.start) / span) * DENSITY_BUCKETS)));
    densityBins[idx] = (densityBins[idx] ?? 0) + 1;
  }
  const maxDensity = Math.max(1, ...densityBins);

  return (
    <div className="w-full mt-4 glass-panel rounded-xl border border-surface-200/50 bg-surface-50/40 backdrop-blur-2xl flex flex-col overflow-hidden select-none shadow-2xl animate-slide-up">
      
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-300 bg-surface-100/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-5">
          {/* Action Play Button */}
          <button
            type="button"
            onClick={() => (isPlaying ? stopPlay() : startPlay())}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 ring-accent-rose shadow-md ${
              isPlaying
                ? "bg-accent-rose text-surface-0 shadow-[0_0_15px_var(--color-accent-rose)] border border-accent-rose"
                : "bg-surface-800 border border-surface-600 text-surface-0 hover:bg-surface-900 hover:border-accent-rose"
            }`}
          >
            {isPlaying ? (
              <span className="flex gap-1 h-3.5">
                <span className="w-0.5 h-full bg-current rounded-sm" />
                <span className="w-0.5 h-full bg-current rounded-sm" />
              </span>
            ) : (
              <svg className="w-4 h-4 ml-0.5 text-current" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest mb-1 font-bold">Investigation Window</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-surface-900 tracking-widest font-bold drop-shadow-sm">{formatDate(domain.start)}</span>
              <span className="w-4 h-[2px] bg-surface-400/50" />
              <span className="text-sm font-mono text-surface-900 tracking-widest font-bold drop-shadow-sm">{formatDate(domain.end)}</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden md:flex gap-5 bg-surface-0/50 px-4 py-2 rounded-lg border border-surface-200">
          {bandsPresent.map((kind) => (
            <div key={kind} className="flex items-center gap-2 text-[10px] font-mono text-surface-900 font-bold uppercase tracking-widest">
              <span className="w-2.5 h-2.5 rounded-sm rotate-45 shadow-sm" style={{ backgroundColor: BAND_COLORS[kind] }} />
              {BAND_LABELS[kind]}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full bg-surface-50 grid grid-cols-[140px_1fr] relative">
        <div 
          className="absolute inset-y-0 z-10 pointer-events-none transition-all duration-75 flex flex-col border-x border-accent-rose/60"
          style={{ 
            left: `calc(140px + ${rangePct[0]}% * calc(100% - 140px) / 100)`, 
            right: `calc((100 - ${rangePct[1]})% * calc(100% - 140px) / 100)` 
          }}
        >
          <div className="absolute inset-0 bg-accent-rose/10 backdrop-blur-[1px]" />
          
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-accent-rose text-surface-0 px-2 py-0.5 rounded shadow-lg text-[9px] font-mono font-bold tracking-widest whitespace-nowrap opacity-90">
             FOCUS: {formatDate(domain.start + span * (rangePct[0] / 100))} — {formatDate(domain.start + span * (rangePct[1] / 100))}
          </div>
        </div>

        {/* LEFT COLUMN: Sidebar Labels */}
        <div className="flex flex-col pt-10 pb-2 border-r border-surface-200/50 bg-surface-100/30 z-20">
          {hasItems ? bandsPresent.map((kind) => (
            <div key={`sidebar-${kind}`} className="h-10 flex items-center px-4 justify-end">
              <span className="text-[10px] font-mono text-surface-500 uppercase tracking-widest font-bold">
                {BAND_LABELS[kind]}
              </span>
            </div>
          )) : (
            <div className="h-32" />
          )}
        </div>

        {/* RIGHT COLUMN: The Data Tracks */}
        <div className="relative flex flex-col pt-10 pb-2 overflow-hidden bg-surface-50">
          
          {/* Vertical Grid Lines */}
          <div className="absolute inset-y-0 left-0 right-0 flex justify-between pointer-events-none opacity-[0.15] z-0">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={`grid-${i}`} className="h-full w-px bg-surface-500 border-r border-dashed border-surface-0/10" />
            ))}
          </div>

          {/* Data Lanes */}
          {hasItems && bandsPresent.map((kind) => {
            const bandIds = new Set(timeline.bands.filter((b) => b.kind === kind).map((b) => b.id));
            const items = timeline.items.filter((it) => bandIds.has(it.bandId));
            const color = BAND_COLORS[kind];
            
            return (
              <div key={`lane-${kind}`} className="relative h-10 w-full flex items-center group/lane z-20">
                {/* Horizontal Track Line */}
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-surface-300 -translate-y-1/2 group-hover/lane:bg-surface-400 transition-colors" />
                
                {/* Tactical Diamond Nodes */}
                {items.map((item) => {
                  const t = new Date(item.time).getTime();
                  if (Number.isNaN(t)) return null;
                  const pos = ((t - domain.start) / span) * 100;
                  const inRange = pos >= rangePct[0] && pos <= rangePct[1];
                  
                  return (
                    <div
                      key={item.id}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-40 transition-all duration-300"
                      style={{ left: `${pos}%` }}
                      onMouseEnter={() => setHoverItem({ x: pos, label: item.label, time: `${formatDate(t)} ${formatTime(t)}`, kind })}
                      onMouseLeave={() => setHoverItem(null)}
                    >
                      <div 
                        className={`w-3 h-3 rotate-45 border-[1.5px] border-surface-0 transition-all duration-300 ${inRange ? 'opacity-100 scale-100' : 'opacity-40 scale-75'}`}
                        style={{ 
                          backgroundColor: color,
                          boxShadow: inRange ? `0 0 12px ${color}` : 'none'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Hover Crosshair Tooltip - Isolated to the Data Grid */}
          {hoverItem && (
            <div className="absolute top-0 bottom-0 pointer-events-none z-[60] transition-all duration-75" style={{ left: `${hoverItem.x}%` }}>
              <div className="absolute top-0 bottom-0 w-[2px] bg-surface-0 -translate-x-1/2 shadow-[0_0_12px_rgba(255,255,255,1)]" />
              
              <div className="absolute top-1/2 -translate-y-1/2 left-4 bg-surface-900 border border-surface-600 shadow-2xl p-4 rounded-lg flex flex-col gap-2 w-max max-w-[300px]">
                <div className="flex items-center gap-2">
                   <span className="w-2.5 h-2.5 rotate-45 border border-surface-0 shadow-sm" style={{ backgroundColor: BAND_COLORS[hoverItem.kind] }} />
                   <span className="text-[11px] font-mono text-surface-300 font-bold uppercase tracking-widest">{hoverItem.time}</span>
                </div>
                <span className="text-sm font-sans text-surface-0 font-medium leading-relaxed">{hoverItem.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. HISTOGRAM & SCRUBBER SECTION */}
      <div className="relative h-16 w-full border-t border-surface-300 bg-surface-100/50 z-20 grid grid-cols-[140px_1fr]">
        <div className="border-r border-surface-200/50" />
        
        {/* Scrubber Area */}
        <div className="relative w-full h-full">
          {hasItems && (
            <div className="absolute inset-0 px-0.5 pt-2 flex items-end gap-[1px] pointer-events-none">
              {densityBins.map((count, i) => {
                const hPct = Math.max(5, (count / maxDensity) * 100);
                const xPct = (i / DENSITY_BUCKETS) * 100;
                const isActive = xPct >= rangePct[0] && xPct < rangePct[1];
                
                return (
                  <div 
                    key={`hist-${i}`} 
                    className={`flex-1 transition-colors duration-300 ${isActive ? 'bg-accent-rose' : 'bg-surface-400'}`}
                    style={{ 
                      height: `${hPct}%`,
                      opacity: isActive ? 1 : 0.3,
                      borderTopLeftRadius: '1px',
                      borderTopRightRadius: '1px'
                    }} 
                  />
                );
              })}
            </div>
          )}

          {/* Now Marker Flag */}
          {hasItems && (
            <div className="absolute bottom-0 h-20 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center justify-end pb-1" style={{ left: `${nowPct}%` }}>
              <div className="w-px h-full bg-surface-900 shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              <span className="absolute -top-4 bg-surface-900 text-surface-0 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-widest shadow-md">NOW</span>
            </div>
          )}

          {/* Interactive Drag Track */}
          <div ref={trackRef} className="absolute inset-0 z-40 cursor-pointer">
            {[0, 1].map((index) => (
              <button
                key={`handle-${index}`}
                type="button"
                className="absolute top-0 bottom-0 w-6 cursor-ew-resize hover:bg-surface-0/10 transition-colors flex flex-col items-center justify-center outline-none focus-visible:bg-accent-rose/20 z-50 -translate-x-1/2 group/handle"
                style={{ left: `${rangePct[index]}%` }}
                onPointerDown={handleDrag(index as 0 | 1)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setRangePct((p) => index === 0 ? [Math.max(0, p[0] - 1), p[1]] : [p[0], Math.max(p[0] + 1, p[1] - 1)]);
                  if (e.key === "ArrowRight") setRangePct((p) => index === 0 ? [Math.min(p[1] - 1, p[0] + 1), p[1]] : [p[0], Math.min(100, p[1] + 1)]);
                }}
              >
                {/* Visual Drag Handle */}
                <div className="w-[3px] h-full bg-accent-rose shadow-[0_0_10px_var(--color-accent-rose)] group-hover/handle:w-[4px] transition-all" />
                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-surface-0 border-2 border-accent-rose rounded shadow-xl flex flex-col items-center justify-center gap-[2px]">
                  <div className="w-[2px] h-3 bg-surface-400" />
                  <div className="w-[2px] h-3 bg-surface-400" />
                </div>
              </button>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}