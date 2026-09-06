// ============================================================================
// F-PR8 — Flow operations rail (Zone 1, Flow representation variant)
//
// Same five-zone geometry, representation content. Real actions only:
//   - adaptive mode toggle (FINANCIAL / MOVEMENT / COMMUNICATION) — rendered
//     only when the case holds more than one available mode (a single-mode
//     case hides the toggle: there is nothing to adapt to)
//   - entity-role filter (all / sources / intermediaries / destinations)
//   - data-backed flow overview (segments / gaps / paths / entities / conflict)
//   - Open in Graph  → hands the selected entity to the graph focus seam
//   - Clear selection → releases the investigative selection
//
// NO fabricated commands or scores. Amounts render compact per currency and
// are NEVER summed across currencies (mixed currencies are listed separately).
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { FlowLoadState } from "@/lib/network/flow/use-flow-analysis";
import { FLOW_DOMAINS, FLOW_DOMAIN_COLORS, FLOW_DOMAIN_LABELS, FLOW_ROLE_FILTERS, FLOW_ROLE_LABELS } from "@/lib/network/flow/flow-model";
import type { FlowDomain, FlowRoleFilter } from "@/lib/network/flow/flow-model";
import { formatFlowAmountCompact } from "@/lib/network/flow/flow-model";
import { flowEntityFromContext } from "@/lib/network/flow/flow-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { PanelToggle } from "../panel-toggle";

interface FlowRailProps {
  open: boolean;
  onToggle: () => void;
  /** Same shell-owned flow analysis shared with every supporting zone. */
  readonly meta: FlowLoadState;
  readonly mode: FlowDomain | null;
  readonly onModeChange: (mode: FlowDomain | null) => void;
  readonly roleFilter: FlowRoleFilter;
  readonly onRoleFilterChange: (filter: FlowRoleFilter) => void;
  /** The canonical shell-owned selection (must resolve to a flow entity). */
  readonly context: InvestigativeContext | null;
  /** "Open in Graph" — hands the selected flow entity to the graph seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
  /** Releases the selection (SELECT ≠ FOCUS: clears the highlight only). */
  readonly onClearSelection: () => void;
}

export function FlowRail({
  open,
  onToggle,
  meta,
  mode,
  onModeChange,
  roleFilter,
  onRoleFilterChange,
  context,
  onOpenInGraph,
  onClearSelection,
}: FlowRailProps) {
  const selectedEntityId =
    meta.status === "ready"
      ? (flowEntityFromContext(meta.meta.entities, context)?.entityId ?? null)
      : null;
  const canOpen = selectedEntityId !== null && onOpenInGraph !== undefined;
  const availableModes = meta.status === "ready" ? meta.meta.availableModes : [];

  return (
    <aside
      id="flow-rail"
      aria-label="Flow operations"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
      data-testid="flow-rail"
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
          controlsId="flow-rail"
          side="left"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {meta.status === "ready" ? (
          <>
            {availableModes.length > 1 && (
              <section aria-label="Flow mode" className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1 rounded-lg border border-surface-200/60 bg-surface-100/60 p-1">
                  {FLOW_DOMAINS.filter((domain) => availableModes.includes(domain)).map(
                    (domain) => (
                      <button
                        key={domain}
                        type="button"
                        aria-pressed={mode === domain}
                        onClick={() => onModeChange(domain)}
                        data-testid={`flow-mode-${domain.toLowerCase()}`}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          mode === domain
                            ? "bg-surface-800 text-surface-0"
                            : "text-surface-500 hover:bg-surface-200 hover:text-surface-800"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: FLOW_DOMAIN_COLORS[domain] }}
                        />
                        {FLOW_DOMAIN_LABELS[domain]}
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}

            <section aria-label="Entity role filter" className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                  Role filter
                </span>
                <select
                  data-testid="flow-role-filter-select"
                  value={roleFilter}
                  onChange={(event) =>
                    onRoleFilterChange(event.target.value as FlowRoleFilter)
                  }
                  className="rounded-md border border-surface-200/60 bg-surface-50 px-2 py-1.5 font-mono text-[11px] text-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {FLOW_ROLE_FILTERS.map((filter) => (
                    <option key={filter} value={filter}>
                      {FLOW_ROLE_LABELS[filter]}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section aria-label="Flow overview" className="flex flex-col gap-1.5">
              <div
                className="flex flex-col gap-1.5 rounded-lg border border-surface-200/60 bg-surface-100/60 p-3"
                data-testid="flow-rail-stats"
              >
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Segments
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-800">
                    {meta.meta.segmentCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Outflow gaps
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-800">
                    {meta.meta.gapCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Entities
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-800">
                    {meta.meta.entityCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Active paths
                  </dt>
                  <dd className="font-mono text-[11px] text-surface-800">
                    {meta.meta.pathCount}
                  </dd>
                </div>
                {meta.meta.conflictCount > 0 && (
                  <div className="flex items-center justify-between gap-3 border-t border-surface-200/50 pt-1.5">
                    <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                      Contradicted segments
                    </dt>
                    <dd className="font-mono text-[11px] text-accent-rose">
                      {meta.meta.conflictCount}
                    </dd>
                  </div>
                )}
                {meta.meta.observedAmounts.length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-surface-200/50 pt-1.5">
                    <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                      Observed {meta.meta.observedAmounts.length > 1 ? "amounts" : "amount"}
                    </dt>
                    {meta.meta.observedAmounts.map((amount) => (
                      <dd
                        key={amount.currency}
                        className="font-mono text-[11px] text-surface-800"
                        data-testid={`flow-rail-amount-${amount.currency}`}
                      >
                        {formatFlowAmountCompact(amount.total, amount.currency)}
                      </dd>
                    ))}
                  </div>
                )}
              </div>
              <p className="type-caption text-surface-400" data-testid="flow-rail-summary">
                {meta.meta.summary}
              </p>
            </section>

            <section aria-label="Flow actions" className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!canOpen}
                data-slot="open-in-graph"
                onClick={
                  canOpen
                    ? () => onOpenInGraph!(selectedEntityId!)
                    : undefined
                }
                title={
                  canOpen
                    ? "Switch to the Network graph and focus this entity"
                    : "Select a flow entity first — the focus needs a graph target."
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
                    : "Clear the flow selection."
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
              The timeline below is the single temporal controller for the flow.
            </p>
          </>
        ) : meta.status === "error" ? (
          <p className="type-caption text-surface-500" data-testid="flow-rail-error">
            {meta.error.message}
          </p>
        ) : (
          <LoadingSpinner size="sm" label="Building the flow analysis..." />
        )}
      </div>
    </aside>
  );
}