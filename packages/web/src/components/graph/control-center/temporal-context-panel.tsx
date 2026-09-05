"use client";

// ============================================================================
// PR-2 Zone 5 (left half) — Temporal / Case Context
//
// Bottom-left container with three tabs: TIME (existing TimelinePanel is
// composed as the child), ACTIVITY and VERSIONS (structural surfaces only —
// PR-7 wires the realtime activity feed and graph version history/replay).
//
// Structurally independent from the side rails: this is a sibling of the
// intelligence panel in the bottom band, never a child of a side rail.
// ============================================================================

import { TemporalTab } from "@/lib/layout/control-center";
import type { ReactNode } from "react";

interface TemporalContextPanelProps {
  tab: TemporalTab;
  onTabChange: (tab: TemporalTab) => void;
  /** Composed TimelinePanel, rendered for the "time" tab. */
  children: ReactNode;
}

const TABS: { id: TemporalTab; label: string }[] = [
  { id: "time", label: "Time" },
  { id: "activity", label: "Activity" },
  { id: "versions", label: "Versions" },
];

const TAB_BODY_ID = "temporal-context-tabpanel";

export function TemporalContextPanel({ tab, onTabChange, children }: TemporalContextPanelProps) {
  return (
    <section
      aria-label="Temporal and case context"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-0">
        <div role="tablist" aria-label="Temporal context tabs" className="flex items-center gap-1">
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                id={`temporal-tab-${t.id}`}
                aria-selected={active}
                aria-controls={TAB_BODY_ID}
                tabIndex={active ? 0 : -1}
                onClick={() => onTabChange(t.id)}
                onKeyDown={(e) => {
                  const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
                  if (!dir) return;
                  e.preventDefault();
                  const next = TABS[(i + dir + TABS.length) % TABS.length]!;
                  onTabChange(next.id);
                  document.getElementById(`temporal-tab-${next.id}`)?.focus();
                }}
                className={`rounded-t-lg border-b-2 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  active
                    ? "border-brand-500 text-surface-900"
                    : "border-transparent text-surface-400 hover:text-surface-700"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <span className="pr-3 text-[9px] font-mono uppercase tracking-[0.2em] text-surface-400">
          Temporal / Case
        </span>
      </header>

      <div
        id={TAB_BODY_ID}
        role="tabpanel"
        aria-labelledby={`temporal-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-1"
      >
        {tab === "time" ? (
          children
        ) : tab === "activity" ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">
              Activity
            </p>
            <p className="type-caption max-w-md text-surface-400">
              Realtime case activity will stream here when the event pipeline is connected (PR-7).
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">
              Versions
            </p>
            <p className="type-caption max-w-md text-surface-400">
              Graph version list, historical view, and replay will surface here (PR-7).
            </p>
          </div>
        )}
      </div>
    </section>
  );
}