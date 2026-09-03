"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";

export interface LedgerEventMock {
  id: string;
  timestamp: string;
  title: string;
  context: string;
  evidenceRef?: string;
  status: "SYSTEM" | "HUMAN_REVIEWED" | "PENDING";
}

interface ReasoningLedgerProps {
  events: LedgerEventMock[];
}

const STATUS_CONFIG: Record<
  LedgerEventMock["status"],
  { label: string; badgeClass: string; dotClass: string; glowClass: string }
> = {
  SYSTEM: {
    label: "SYSTEM RUNTIME",
    badgeClass: "bg-accent-blue/10 border-accent-blue/30 text-accent-blue",
    dotClass: "bg-accent-blue",
    glowClass: "shadow-[0_0_10px_var(--color-accent-blue)]",
  },
  HUMAN_REVIEWED: {
    label: "HUMAN VERIFIED",
    badgeClass: "bg-success/10 border-success/30 text-success",
    dotClass: "bg-success",
    glowClass: "shadow-[0_0_10px_var(--color-success)]",
  },
  PENDING: {
    label: "ACTION REQUIRED",
    badgeClass: "bg-accent-amber/10 border-accent-amber/30 text-accent-amber",
    dotClass: "bg-accent-amber",
    glowClass: "shadow-[0_0_10px_var(--color-accent-amber)]",
  },
};

function formatIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " · ").substring(0, 21);
}

export function ReasoningLedger({ events }: ReasoningLedgerProps) {
  const [filter, setFilter] = useState<"ALL" | LedgerEventMock["status"]>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    if (filter === "ALL") return events;
    return events.filter((e) => e.status === filter);
  }, [events, filter]);

  const handleCopyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  if (!events.length) {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center rounded-xl border border-surface-200/50 bg-surface-50/40 p-6 backdrop-blur-md">
        <span className="font-mono text-xs uppercase tracking-widest text-surface-600">
          No ledger telemetry recorded
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Control Bar: Filter Pills & Total Counters */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-200/40 pb-4">
        <div className="flex items-center gap-1.5 rounded-lg border border-surface-200/50 bg-surface-50/60 p-1 backdrop-blur-md">
          {(["ALL", "HUMAN_REVIEWED", "PENDING", "SYSTEM"] as const).map((key) => {
            const isActive = filter === key;
            const label = key === "ALL" ? "All Entries" : STATUS_CONFIG[key].label;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all ${
                  isActive
                    ? "bg-surface-800 text-surface-0 font-bold shadow-sm"
                    : "text-surface-600 hover:bg-surface-100 hover:text-surface-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-surface-600">
          <span>Ledger Index</span>
          <span className="h-1 w-1 rounded-full bg-surface-400" />
          <span className="font-bold text-surface-900">{filteredEvents.length} Entries Filtered</span>
        </div>
      </div>

      {/* Main Ledger Stream */}
      <div className="relative flex flex-col gap-5 pl-6 sm:pl-8">
        {/* Continuous Backbone Rail */}
        <div className="absolute bottom-4 left-[11px] top-4 w-[1.5px] bg-gradient-to-b from-accent-rose/60 via-surface-300 to-surface-200 sm:left-[15px]" />

        {filteredEvents.map((ev, i) => {
          const cfg = STATUS_CONFIG[ev.status];
          const hashMock = ev.id.replace("evt-", "0x") + "a7f9";

          return (
            <div
              key={ev.id}
              className="group relative animate-slide-up"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              {/* Timeline Pin Node */}
              <div
                className={`absolute -left-[23px] top-5 h-3.5 w-3.5 rounded-full border-2 border-surface-0 ${cfg.dotClass} ${cfg.glowClass} transition-transform duration-300 group-hover:scale-125 sm:-left-[27px]`}
              />

              {/* Block Card */}
              <div className="glass-panel glass-panel-hover rounded-xl p-5 relative overflow-hidden transition-all duration-300 hover:border-surface-300 hover:shadow-xl">
                {/* Subtle top indicator bar */}
                <div className={`absolute left-0 top-0 h-[2px] w-full ${cfg.dotClass} opacity-70`} />

                {/* Card Header: Timestamp, Status Badge, Block Hash */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200/30 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] font-bold text-surface-900 tracking-wider">
                      {formatIso(ev.timestamp)}
                    </span>
                    <span className="text-surface-400 hidden sm:inline">|</span>
                    <Badge variant="muted" className={`border ${cfg.badgeClass} text-[9px] font-mono uppercase tracking-widest`}>
                      {cfg.label}
                    </Badge>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyId(ev.id)}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-surface-600 hover:text-surface-900 transition-colors uppercase tracking-widest cursor-pointer"
                    title="Click to copy event block ID"
                  >
                    <span>{copiedId === ev.id ? "COPIED!" : `BLOCK #${hashMock}`}</span>
                  </button>
                </div>

                {/* Event Core: Title & Context */}
                <div className="mt-3.5 space-y-2">
                  <h3 className="text-base font-semibold tracking-wide text-surface-900">
                    {ev.title}
                  </h3>
                  <p className="max-w-4xl text-xs font-sans leading-relaxed text-surface-700">
                    {ev.context}
                  </p>
                </div>

                {/* Evidence Tag & Verification Footnote */}
                {ev.evidenceRef && (
                  <div className="mt-4 flex items-center justify-between border-t border-surface-200/20 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-surface-600">
                        Evidence Reference:
                      </span>
                      <span className="rounded bg-surface-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-amber border border-accent-amber/30">
                        {ev.evidenceRef}
                      </span>
                    </div>

                    <span className="font-mono text-[9px] text-surface-500 uppercase tracking-widest hidden sm:inline">
                      Provenance Confirmed
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}