// ============================================================================
// F-PR6 — Pulse operations rail (Zone 1, Entity Pulse representation variant)
//
// Same five-zone geometry, representation content. Real actions only:
//   - Open in Graph  → hands the selected entity to the graph focus seam
//   - Clear selection → releases the investigative selection
// plus a data-backed pulse overview (entities shown / observations in window /
// dominant activity / window concentration). NO fabricated commands: unlike
// the graph rail there is nothing else the pulse genuinely executes. The base
// graph OperationalRail is untouched (this is a representation variant, not an
// edit to that rail).
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { PanelToggle } from "../panel-toggle";

interface PulseRailProps {
  open: boolean;
  onToggle: () => void;
  /** Same shell-owned overview shared with every supporting zone. */
  readonly overview: EntityPulseLoadState;
  /** The canonical shell-owned selection (must be an entity to open). */
  readonly context: InvestigativeContext | null;
  /** "Open in Graph" — hands the selected entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
  /** Releases the selection (SELECT ≠ FOCUS: this clears the highlight only). */
  readonly onClearSelection: () => void;
}

export function PulseRail({
  open,
  onToggle,
  overview,
  context,
  onOpenInGraph,
  onClearSelection,
}: PulseRailProps) {
  const selectedEntityId = context?.kind === "entity" ? context.id : null;
  const canOpen = selectedEntityId !== null && onOpenInGraph !== undefined;

  return (
    <aside
      id="pulse-rail"
      aria-label="Pulse operations"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
      data-testid="pulse-rail"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-2.5">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-surface-500">
          Operations
        </span>
        <PanelToggle
          open={open}
          onToggle={onToggle}
          label="Open left operational rail"
          expandedActionLabel="Collapse left operational rail"
          controlsId="pulse-rail"
          side="left"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {overview.status === "ready" ? (
          <>
            <section
              aria-label="Pulse overview"
              className="flex flex-col gap-1.5 rounded-lg border border-surface-200/60 bg-surface-100/60 p-3"
              data-testid="pulse-rail-stats"
            >
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                  Entities shown
                </dt>
                <dd className="font-mono text-[11px] text-surface-800">
                  {overview.overview.entities.length} of {overview.overview.entityNodeCount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                  Observations in window
                </dt>
                <dd className="font-mono text-[11px] text-surface-800" data-pulse-rail-window>
                  {overview.overview.totalObservationsInWindow}
                </dd>
              </div>
              {overview.overview.dominantCategoryLabel && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Dominant activity
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-800">
                    {overview.overview.dominantCategoryLabel}
                  </dd>
                </div>
              )}
              {overview.overview.concentrationPct !== null && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Window concentration
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-800">
                    {overview.overview.concentrationPct}% of {overview.overview.totalObservationsFull}
                  </dd>
                </div>
              )}
            </section>

            <section aria-label="Pulse actions" className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!canOpen}
                data-slot="open-in-graph"
                onClick={
                  canOpen && selectedEntityId
                    ? () => onOpenInGraph!(selectedEntityId)
                    : undefined
                }
                title={
                  canOpen
                    ? "Switch to the Network graph and focus this entity"
                    : selectedEntityId === null
                      ? "Select a pulse first — the focus needs a graph target."
                      : "The workspace view seam is not wired."
                }
                className="w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
              >
                <span className="block text-[11px] font-medium uppercase tracking-wider text-surface-700">
                  Open in Graph
                </span>
                <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-surface-400">
                  Focus the selected entity in the network
                </span>
              </button>

              <button
                type="button"
                disabled={selectedEntityId === null}
                data-slot="clear-selection"
                onClick={onClearSelection}
                title={
                  selectedEntityId === null
                    ? "Nothing is selected."
                    : "Clear the pulse selection."
                }
                className="w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
              >
                <span className="block text-[11px] font-medium uppercase tracking-wider text-surface-700">
                  Clear selection
                </span>
                <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-surface-400">
                  Release the highlight
                </span>
              </button>
            </section>

            <p className="type-caption text-surface-400">
              The timeline below is the single temporal controller for the pulse.
            </p>
          </>
        ) : overview.status === "error" ? (
          <p className="type-caption text-surface-500" data-testid="pulse-rail-error">
            {overview.error.message}
          </p>
        ) : (
          <LoadingSpinner size="sm" label="Building the entity pulse..." />
        )}
      </div>
    </aside>
  );
}