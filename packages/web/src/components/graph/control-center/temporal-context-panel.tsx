"use client";

// ============================================================================
// PR-2 Zone 5 (left half) — Temporal / Case Context
//
// Bottom-left container with three tabs: TIME (existing TimelinePanel is
// composed as the child), ACTIVITY (realtime case-activity feed) and VERSIONS
// (honest graph-version list — no fake /as-of, never mutates a historical view).
//
// Structurally independent from the side rails: this is a sibling of the
// intelligence panel in the bottom band, never a child of a side rail.
// ============================================================================

import { useState } from "react";
import { TemporalTab } from "@/lib/layout/control-center";
import type { ReactNode } from "react";
import {
  CURRENT_VERSION_SELECTION,
  type TemporalVersionSelection,
} from "@/lib/context/temporal-workspace";
import { TemporalActivityFeed } from "./temporal/activity-feed";
import { TemporalVersionsPanel } from "./temporal/versions-panel";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";

interface TemporalContextPanelProps {
  tab: TemporalTab;
  onTabChange: (tab: TemporalTab) => void;
  /** Composed TimelinePanel, rendered for the "time" tab. */
  children: ReactNode;
  /** PR-10: OPTIONAL lifted version selection. When supplied the panel is
   *  controlled by the shell (so the authority footer can be gated honestly on
   *  historical selections) and never holds its own copy. Absent → identical
   *  pre-PR-10 local-state behavior (tests / standalone renders unchanged). */
  selection?: TemporalVersionSelection;
  onSelectionChange?: (selection: TemporalVersionSelection) => void;
}

const TABS: { id: TemporalTab; label: string }[] = [
  { id: "time", label: "Time" },
  { id: "activity", label: "Activity" },
  { id: "versions", label: "Versions" },
];

const TAB_BODY_ID = "temporal-context-tabpanel";

export function TemporalContextPanel({ tab, onTabChange, children, selection: selectionProp, onSelectionChange }: TemporalContextPanelProps) {
  const [localSelection, setLocalSelection] = useState<TemporalVersionSelection>(
    CURRENT_VERSION_SELECTION,
  );
  const selection = selectionProp ?? localSelection;
  const commitSelection = (next: TemporalVersionSelection) => {
    if (onSelectionChange) onSelectionChange(next);
    else setLocalSelection(next);
  };
  return (
    <section
      aria-label="Temporal and case context"
      className="cc-panel flex min-h-0 flex-col overflow-hidden"
    >
      <header className="cc-panel-header flex shrink-0 items-center justify-between px-3 py-0">
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
                className={`rounded-t-lg border-b-2 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus ${
                  active
                    ? "border-semantic-selection text-semantic-foreground"
                    : "border-transparent text-semantic-foreground-faint hover:text-semantic-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <span className="pr-3 text-[9px] font-mono uppercase tracking-[0.2em] text-semantic-foreground-faint">
          Temporal / Case
        </span>
      </header>

      <div
        id={TAB_BODY_ID}
        role="tabpanel"
        aria-labelledby={`temporal-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-1"
      >
        {tab === "time" ? (
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        ) : tab === "activity" ? (
          <PanelErrorBoundary label="Activity feed">
            <TemporalActivityFeed selection={selection} />
          </PanelErrorBoundary>
        ) : (
          <PanelErrorBoundary label="Versions panel">
            <TemporalVersionsPanel
              selection={selection}
              onSelectVersion={(versionId) => commitSelection({ mode: "historical", versionId })}
              onReturnCurrent={() => commitSelection(CURRENT_VERSION_SELECTION)}
            />
          </PanelErrorBoundary>
        )}
      </div>
    </section>
  );
}