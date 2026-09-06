// ============================================================================
// F-PR7 — Matrix operations rail (Zone 1, Matrix representation variant)
//
// Same five-zone geometry, representation content. Real actions only:
//   - mode toggle (within-case / cross-case)
//   - comparison boundary selector (cross-case) — deterministic options
//   - cross-case authorization flow (idle → confirming → authorized) — the
//     PURE frontend review fiction mirroring the cross-case signals seam
//   - Open in Graph  → hands the selected row entity to the graph focus seam
//   - Clear selection → releases the investigative selection
// plus a data-backed matrix overview (active cells / candidates / multi-signal
// / conflict / hidden candidates). NO fabricated commands or scores.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { MatrixLoadState } from "@/lib/network/matrix/use-matrix";
import type {
  MatrixAuthStep,
  MatrixMode,
} from "@/lib/network/matrix/matrix-model";
import {
  MATRIX_MODES,
  MATRIX_MODE_LABELS,
  matrixCellCounts,
  parseMatrixCellId,
} from "@/lib/network/matrix/matrix-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import type { GraphFilterState } from "@/lib/graph/graph-filter";
import { PanelToggle } from "../panel-toggle";

interface MatrixRailProps {
  open: boolean;
  onToggle: () => void;
  /** Same shell-owned matrix analysis shared with every supporting zone. */
  readonly meta: MatrixLoadState;
  readonly mode: MatrixMode;
  readonly onModeChange: (mode: MatrixMode) => void;
  readonly boundaryCaseId: string | null;
  readonly onBoundaryChange: (caseId: string | null) => void;
  /** Per-boundary authorization step (idle → confirming → authorized). */
  readonly authByBoundary: Readonly<Record<string, MatrixAuthStep>>;
  readonly onBeginAuthorize: (caseId: string) => void;
  readonly onConfirmAuthorize: (caseId: string) => void;
  readonly onCancelAuthorize: (caseId: string) => void;
  /** The canonical shell-owned selection (must resolve to an entity row). */
  readonly context: InvestigativeContext | null;
  /** "Open in Graph" — hands the selected row entity to the graph seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
  /** Releases the selection (SELECT ≠ FOCUS: clears the highlight only). */
  readonly onClearSelection: () => void;
  /** F-PR14: workspace readability filter. When `hideContradicted` is set the
   *  conflict stat reports the suppressed count (presentation-only; the model
   *  keeps `contradictionPresent`). `minSupport` stays edge-lens-only. */
  readonly filter?: GraphFilterState | null;
}

export function MatrixRail({
  open,
  onToggle,
  meta,
  mode,
  onModeChange,
  boundaryCaseId,
  onBoundaryChange,
  authByBoundary,
  onBeginAuthorize,
  onConfirmAuthorize,
  onCancelAuthorize,
  context,
  onOpenInGraph,
  onClearSelection,
  filter = null,
}: MatrixRailProps) {
  const selectedEntityId =
    context?.kind === "entity"
      ? context.id
      : (context?.kind === "relation" || context?.kind === "cross-case")
        ? (parseMatrixCellId(context.id)?.row ?? null)
        : null;
  const canOpen = selectedEntityId !== null && onOpenInGraph !== undefined;
  const boundaryAuth: MatrixAuthStep = boundaryCaseId
    ? (authByBoundary[boundaryCaseId] ?? "idle")
    : "idle";
  const boundaryOptions = meta.status === "ready" ? meta.boundaryOptions : [];

  return (
    <aside
      id="matrix-rail"
      aria-label="Matrix operations"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
      data-testid="matrix-rail"
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
          controlsId="matrix-rail"
          side="left"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {meta.status === "ready" ? (
          <>
            <section aria-label="Matrix mode" className="flex flex-col gap-1.5">
              <div className="flex rounded-lg border border-surface-200/60 bg-surface-100/60 p-0.5">
                {MATRIX_MODES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => onModeChange(option)}
                    data-testid={`matrix-mode-${option}`}
                    className={`flex-1 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      mode === option
                        ? "bg-surface-800 text-surface-0"
                        : "text-surface-500 hover:bg-surface-200 hover:text-surface-800"
                    }`}
                  >
                    {MATRIX_MODE_LABELS[option]}
                  </button>
                ))}
              </div>
            </section>

            <section aria-label="Matrix overview" className="flex flex-col gap-1.5">
              {(() => {
                const counts = matrixCellCounts(meta.meta);
                return (
                  <>
                    <div className="flex flex-col gap-1.5 rounded-lg border border-surface-200/60 bg-surface-100/60 p-3" data-testid="matrix-rail-stats">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                          Active cells
                        </dt>
                        <dd className="font-mono text-[11px] text-surface-800">{counts.active}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                          Candidates
                        </dt>
                        <dd className="font-mono text-[11px] text-surface-800">{counts.candidate}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                          Multi-signal
                        </dt>
                        <dd className="font-mono text-[11px] text-surface-800">{counts.multiSignal}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                          Conflict / review
                        </dt>
                        <dd className="font-mono text-[11px] text-surface-800">{counts.conflict}</dd>
                      </div>
                      {mode === "cross-case" && !meta.meta.authorized && (
                        <div className="flex items-center justify-between gap-3 border-t border-surface-200/50 pt-1.5">
                          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                            Hidden candidates
                          </dt>
                          <dd className="font-mono text-[11px] text-accent-rose">
                            {meta.meta.hiddenCandidateCount}
                          </dd>
                        </div>
                      )}
                      {filter?.hideContradicted && counts.conflict > 0 && (
                        <div className="flex items-center justify-between gap-3 border-t border-surface-200/50 pt-1.5">
                          <dt className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                            Conflict cells hidden by filter
                          </dt>
                          <dd className="font-mono text-[11px] text-accent-rose">
                            {counts.conflict}
                          </dd>
                        </div>
                      )}
                    </div>
                    <p className="type-caption text-surface-400">{meta.meta.summary}</p>
                  </>
                );
              })()}
            </section>

            {mode === "cross-case" && (
              <section aria-label="Comparison boundary" className="flex flex-col gap-1.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-surface-500">
                    Comparison boundary
                  </span>
                  <select
                    data-testid="matrix-boundary-select"
                    value={boundaryCaseId ?? ""}
                    onChange={(event) =>
                      onBoundaryChange(event.target.value || null)
                    }
                    className="rounded-md border border-surface-200/60 bg-surface-50 px-2 py-1.5 font-mono text-[11px] text-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {boundaryOptions.map((option) => (
                      <option key={option.caseId} value={option.caseId}>
                        {option.label}
                        {option.hasMatch ? " · match" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {boundaryCaseId && (
                  <div
                    className="flex flex-col gap-2 rounded-lg border border-surface-200/60 bg-surface-100/60 p-3"
                    data-testid="matrix-auth-card-rail"
                  >
                    {boundaryAuth === "idle" && (
                      <>
                        <p className="type-caption text-surface-500">
                          Authorizing reveals provider-backed candidate cells for
                          this boundary only. Pre-authorization cells stay empty.
                        </p>
                        <button
                          type="button"
                          data-testid="matrix-auth-begin"
                          onClick={() => onBeginAuthorize(boundaryCaseId)}
                          className="self-start rounded-md border border-surface-300 bg-surface-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          Authorize boundary
                        </button>
                      </>
                    )}
                    {boundaryAuth === "confirming" && (
                      <div className="flex flex-col gap-2">
                        <p className="type-caption text-surface-600">
                          Confirm that this comparison boundary is authorized for
                          this review session.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            data-testid="matrix-auth-confirm"
                            onClick={() => onConfirmAuthorize(boundaryCaseId)}
                            className="rounded-md bg-surface-800 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-0 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            data-testid="matrix-auth-cancel"
                            onClick={() => onCancelAuthorize(boundaryCaseId)}
                            className="rounded-md border border-surface-300 bg-surface-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {boundaryAuth === "authorized" && (
                      <p
                        className="type-caption text-surface-600"
                        data-testid="matrix-auth-authorized"
                      >
                        Boundary authorized — provider-backed candidate cells are
                        revealed in the matrix.
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <section aria-label="Matrix actions" className="flex flex-col gap-1.5">
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
                    : "Select a cell first — the focus needs a graph target."
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
                    : "Clear the matrix selection."
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
              The timeline below is the single temporal controller for the matrix.
            </p>
          </>
        ) : meta.status === "error" ? (
          <p className="type-caption text-surface-500" data-testid="matrix-rail-error">
            {meta.error.message}
          </p>
        ) : (
          <LoadingSpinner size="sm" label="Building the relationship matrix..." />
        )}
      </div>
    </aside>
  );
}