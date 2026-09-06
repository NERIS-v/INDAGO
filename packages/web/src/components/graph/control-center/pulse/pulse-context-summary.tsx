// ============================================================================
// F-PR6 — Pulse context summary (Zone 3, Entity Pulse representation variant)
//
// The right-hand Context zone adapts to the Entity Pulse: when an entity is
// selected it shows that entity's pulse context (category, window activity,
// analytical salience) with the real "Open in Graph" seam; otherwise it shows
// the data-backed pulse overview. The base ContextualPanel is untouched — this
// is a representation variant composed at the shell, never an edit to it.
//
// Only provider-backed facts render. No invented labels or severity.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";
import type { EntityPulseField } from "@/lib/network/pulse/pulse-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { PanelToggle } from "../panel-toggle";

interface PulseContextSummaryProps {
  open: boolean;
  onToggle: () => void;
  /** Same shell-owned overview shared with every supporting zone. */
  readonly overview: EntityPulseLoadState;
  /** The canonical shell-owned selection. */
  readonly context: InvestigativeContext | null;
  /** "Open in Graph" — hands the selected entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
}

function EntityContextCard({
  field,
  onOpenInGraph,
}: {
  field: EntityPulseField;
  onOpenInGraph?: (entityId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-context-pulse-entity data-pulse-context-entity={field.entityId}>
      <div>
        <h3 className="text-base font-medium leading-tight text-surface-900" data-pulse-context-title>
          {field.label}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-surface-400">
          {field.categoryLabel} activity
        </p>
      </div>

      <dl className="flex flex-col gap-px overflow-hidden rounded-lg border border-surface-200 bg-surface-200/50">
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Observations in window
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800" data-pulse-context-window>
            {field.observationCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Total observations
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800">
            {field.totalObservationCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
            Analytical relevance
          </dt>
          <dd className="font-mono text-[12px] font-medium text-surface-800" data-pulse-context-salience>
            {field.salienceAvailable ? `${Math.round(field.salience * 100)}%` : "Unavailable"}
          </dd>
        </div>
      </dl>

      {onOpenInGraph && (
        <button
          type="button"
          onClick={() => onOpenInGraph(field.entityId)}
          data-testid="pulse-context-open-in-graph"
          className="rounded-md border border-surface-300 bg-surface-100/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose"
        >
          Open in Graph
        </button>
      )}
    </div>
  );
}

export function PulseContextSummary({
  open,
  onToggle,
  overview,
  context,
  onOpenInGraph,
}: PulseContextSummaryProps) {
  const selectedEntityId = context?.kind === "entity" ? context.id : null;
  const selectedField =
    overview.status === "ready" && selectedEntityId
      ? (overview.overview.entities.find(
          (field) => field.entityId === selectedEntityId,
        ) ?? null)
      : null;

  return (
    <aside
      id="pulse-context-panel"
      aria-label="Pulse context"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
      data-testid="pulse-context-summary"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-2.5">
        <div className="min-w-0">
          <span className="block text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-surface-500">
            Context
          </span>
          {selectedField && (
            <span className="block truncate text-[12px] font-medium text-surface-800">
              {selectedField.label}
            </span>
          )}
        </div>
        <PanelToggle
          open={open}
          onToggle={onToggle}
          label="Open right contextual panel"
          expandedActionLabel="Collapse right contextual panel"
          controlsId="pulse-context-panel"
          side="right"
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {overview.status === "ready" ? (
          selectedField ? (
            <EntityContextCard field={selectedField} onOpenInGraph={onOpenInGraph} />
          ) : (
            <div className="flex flex-col gap-2" data-pulse-context-overview>
              <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">
                Entity Pulse
              </p>
              <p className="type-caption text-surface-500">{overview.overview.summary}</p>
              <p className="type-caption text-surface-400">
                Select a pulse to inspect that entity's context. SELECT is distinct
                from FOCUS: this highlights the entity across the workspace.
              </p>
            </div>
          )
        ) : overview.status === "error" ? (
          <p className="type-caption text-surface-500">{overview.error.message}</p>
        ) : (
          <LoadingSpinner size="sm" label="Building the entity pulse..." />
        )}
      </div>
    </aside>
  );
}