"use client";

// ============================================================================
// PR-3 Zone 4 — Right Contextual / Intelligence Panel (canonical consumer)
//
// Answers "why does this matter?" for the CURRENTLY SELECTED investigative
// object. PR-2 established the reusable structural container; PR-3 replaces
// the placeholder selectedContext seam with the canonical discriminated
// InvestigativeContext and resolves provider data through the ContextResolver
// bridge (context-resolver.ts → useWorkspace providers).
//
// Render-state contract — these are DISTINCT states, never collapsed:
//     empty       → nothing selected (quiet prompt)
//     loading     → selection set, resolve in flight
//     resolved    → provider data displayed (title/subtitle/summary/rows)
//     unsupported → selection has no adapter / data-mode unsupported
//     not-found   → object no longer exists
//     error       → provider failure
//
// No Demo/Live imports, no provider instantiation. Resolution happens through
// the canonical seam only.
// ============================================================================

import { PanelToggle } from "./panel-toggle";
import { ContextDetailsSlices } from "./context-details-slices";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useContextResolution } from "@/lib/context/use-context-resolution";
import { isResolved } from "@/lib/context/context-resolver";
import type { ContextResolution } from "@/lib/context/context-resolver";
import { useContextDetails } from "@/lib/context/use-context-details";
import { isContextDetailsResolved } from "@/lib/context/context-details";
import {
  contextKindLabel,
  type InvestigativeContext,
} from "@/lib/context/investigative-context";

export type ContextualPanelState =
  | "empty"
  | "loading"
  | "resolved"
  | "unsupported"
  | "not-found"
  | "error";

interface ContextualPanelProps {
  open: boolean;
  onToggle: () => void;
  /** The canonical discriminated selection; null renders the empty state. */
  context: InvestigativeContext | null;
  /** PR-5: canonical re-selection seam for linked objects surfaced by the
   *  detail slices (reveal semantics — selects + opens the panel). */
  onSelectContext?: (context: InvestigativeContext) => void;
  /** Reserved action/deep-link slot (renders nothing when unused). */
  footerSlot?: React.ReactNode;
}

function stateOf(
  context: InvestigativeContext | null,
  loading: boolean,
  resolution: ContextResolution | null,
): ContextualPanelState {
  if (!context) return "empty";
  if (loading) return "loading";
  if (isResolved(resolution)) return "resolved";
  switch (resolution?.status) {
    case "unsupported":
      return "unsupported";
    case "not-found":
      return "not-found";
    case "error":
      return "error";
    default:
      return "empty";
  }
}

function ResolvedContextView({ resolution }: { resolution: Extract<ContextResolution, { status: "resolved" }> }) {
  const { display } = resolution;
  return (
    <div className="flex flex-col gap-4" data-context-resolved>
      <div>
        <h3 className="text-base font-medium leading-tight text-surface-900" data-context-resolved-title>
          {display.title}
        </h3>
        <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-surface-400">
          {display.subtitle}
        </p>
      </div>

      <p className="type-caption text-surface-600">{display.summary}</p>

      <dl className="flex flex-col gap-px overflow-hidden rounded-lg border border-surface-200 bg-surface-200/50">
        {display.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 bg-surface-50 px-3 py-2">
            <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
              {row.label}
            </dt>
            <dd className="text-right text-[12px] font-medium text-surface-800" data-context-row-value>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ContextualPanel({
  open,
  onToggle,
  context,
  onSelectContext = () => undefined,
  footerSlot = null,
}: ContextualPanelProps) {
  const { resolution, loading } = useContextResolution(context);
  const detailsState = useContextDetails(context);
  const state = stateOf(context, loading, resolution);
  const details = detailsState.details;
  const detailsResolved = isContextDetailsResolved(details);

  return (
    <aside
      id="contextual-panel"
      aria-label="Contextual panel"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-2.5">
        <div className="min-w-0">
          <span className="block text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-surface-500">
            Context
          </span>
          {context && (
            <span className="block truncate text-[12px] font-medium text-surface-800" data-context-panel-kind>
              {contextKindLabel(context.kind)}
            </span>
          )}
        </div>
        <PanelToggle
          open={open}
          onToggle={onToggle}
          label="Open right contextual panel"
          expandedActionLabel="Collapse right contextual panel"
          controlsId="contextual-panel"
          side="right"
        />
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        data-context-region
        data-context-state={state}
        data-context-kind={context?.kind ?? ""}
      >
        {state === "loading" && (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner size="md" label="Loading context..." />
          </div>
        )}

        {state === "resolved" && isResolved(resolution) && (
          <div className="flex flex-col gap-4">
            <ResolvedContextView resolution={resolution} />
            {detailsResolved && details && (
              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-400" data-context-details-heading>
                  In context
                </h4>
                <ContextDetailsSlices details={details} onSelectContext={onSelectContext} />
              </div>
            )}
          </div>
        )}

        {state === "unsupported" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center" data-context-state-label>
            <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">
              Context unavailable
            </p>
            <p className="type-caption max-w-sm text-surface-500">
              This object has no context adapter in the current data mode. The selection is
              preserved — only its contextual view is unavailable.
            </p>
          </div>
        )}

        {state === "not-found" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center" data-context-state-label>
            <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">
              Object unavailable
            </p>
            <p className="type-caption max-w-sm text-surface-500">
              The selected object no longer exists in the current investigation or boundary.
            </p>
          </div>
        )}

        {state === "error" && (
          <ErrorDisplay message="Unable to load contextual information for this object." />
        )}

        {state === "empty" && (
          <EmptyState
            title="Nothing selected"
            description="Select an entity, relation, evidence item, gap, or other graph object to inspect its investigative context."
            className="min-h-0 border-0 bg-surface-100/20 py-10"
          />
        )}
      </div>

      {footerSlot && (
        <footer className="shrink-0 border-t border-surface-200/50 bg-surface-50/80 p-3">
          {footerSlot}
        </footer>
      )}
    </aside>
  );
}