"use client";

// ============================================================================
// PR-2 Zone 5 (right half) — Investigative Intelligence
//
// Bottom-right container with five tabs: Overview / Hypotheses / Signals /
// Evidence / Activity. PR-2 established ONLY the structural container and tab
// system with reserved, non-fabricated placeholders. PR-5 feeds every tab
// through the reasoning layer (context-details / provider seams) with zero
// invented data, and threads a single onSelectContext callback so any surface
// can re-materialize a REAL selection through the shell (single owner).
//
// No Demo/Live imports, no provider instantiation, no invented numbers.
// ============================================================================

import { IntelligenceTab } from "@/lib/layout/control-center";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { IntelligenceOverview } from "./intelligence/intelligence-overview";
import { IntelligenceHypotheses } from "./intelligence/intelligence-hypotheses";
import { IntelligenceSignals } from "./intelligence/intelligence-signals";
import { IntelligenceEvidence } from "./intelligence/intelligence-evidence";
import { IntelligenceActivity } from "./intelligence/intelligence-activity";

interface InvestigativeIntelligenceProps {
  tab: IntelligenceTab;
  onTabChange: (tab: IntelligenceTab) => void;
  /** PR-3: the canonical selection, surfaced so the panel knows WHAT is
   *  selected without fabricating reasoning-layer data (PR-5). */
  context?: InvestigativeContext | null;
  /** Re-materialize a canonical selection through the shell (single owner). */
  onSelectContext: (ctx: InvestigativeContext) => void;
}

const TABS: { id: IntelligenceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "signals", label: "Signals" },
  { id: "evidence", label: "Evidence" },
  { id: "activity", label: "Activity" },
];

const TAB_BODY_ID = "intelligence-tabpanel";

export function InvestigativeIntelligence({
  tab,
  onTabChange,
  context = null,
  onSelectContext,
}: InvestigativeIntelligenceProps) {
  return (
    <section
      aria-label="Investigative intelligence"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-0">
        <div
          role="tablist"
          aria-label="Investigative intelligence tabs"
          className="flex items-center gap-1"
        >
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                id={`intel-tab-${t.id}`}
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
                  document.getElementById(`intel-tab-${next.id}`)?.focus();
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
          Intelligence
        </span>
      </header>

      <div
        id={TAB_BODY_ID}
        role="tabpanel"
        aria-labelledby={`intel-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === "overview" ? (
          <IntelligenceOverview context={context} />
        ) : tab === "hypotheses" ? (
          <IntelligenceHypotheses context={context} onSelectContext={onSelectContext} />
        ) : tab === "signals" ? (
          <IntelligenceSignals onSelectContext={onSelectContext} />
        ) : tab === "evidence" ? (
          <IntelligenceEvidence context={context} onSelectContext={onSelectContext} />
        ) : (
          <IntelligenceActivity />
        )}
      </div>
    </section>
  );
}