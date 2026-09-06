// ============================================================================
// F-PR7 — Matrix context (Zone 3, Matrix representation variant)
//
// Contextual inspection for the SELECTED matrix cell: the Case A entity ↔ the
// column entity, the signal classes with honest provenance (observations /
// relations / provider-backed matches), contradiction + unresolved-identity
// caveats, the observed cell window and the authorized cross-case provenance
// note. Actions are real commands only:
//   - Open in Graph  → hands the row entity to the graph focus seam
//   - Open Pulse     → hands the row entity to the pulse focus seam
//   - View Evidence  → deep link preserving ?caseId= (row entity filter)
// ============================================================================

"use client";

import type { MatrixLoadState } from "@/lib/network/matrix/use-matrix";
import type { MatrixCell, MatrixMode } from "@/lib/network/matrix/matrix-model";
import {
  MATRIX_CELL_STATE_LABELS,
  MATRIX_SIGNAL_CLASS_LABELS,
  matrixCellFromContext,
  matrixWindowLabel,
} from "@/lib/network/matrix/matrix-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { PanelToggle } from "../panel-toggle";

interface MatrixContextSummaryProps {
  open: boolean;
  onToggle: () => void;
  /** Shell-owned matrix analysis (the selected cell is resolved here). */
  readonly meta: MatrixLoadState;
  /** The canonical shell-owned selection. */
  readonly context: InvestigativeContext | null;
  /** Effective matrix mode (labels the row/column boundary). */
  readonly mode: MatrixMode;
  /** "Open in Graph" — row entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
  /** "Open Pulse" — row entity to the pulse focus seam. */
  readonly onOpenPulse?: (entityId: string) => void;
  /** Builds the evidence deep-link href for a row entity (preserves ?caseId=). */
  readonly viewEvidenceHref?: (entityId: string) => string;
}

function SignalList({ cell }: { cell: MatrixCell }) {
  if (cell.signals.length === 0) {
    return (
      <p className="type-caption text-surface-400">
        No provider-backed relationship signal in this cell.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {cell.signals.map((signal) => (
        <li
          key={signal.class}
          className="flex flex-col gap-0.5 rounded-md border border-surface-200/60 bg-surface-100/60 px-2 py-1.5"
          data-matrix-signal-class={signal.class}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700">
              {MATRIX_SIGNAL_CLASS_LABELS[signal.class]}
            </span>
            <span className="font-mono text-[9px] text-surface-400">
              ×{signal.count}
            </span>
          </span>
          <span className="type-caption text-surface-500">{signal.provenance}</span>
          {signal.observationIds.length > 0 && (
            <span className="truncate font-mono text-[9px] text-surface-400">
              {signal.observationIds.join(" · ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MatrixContextSummary({
  open,
  onToggle,
  meta,
  context,
  mode,
  onOpenInGraph,
  onOpenPulse,
  viewEvidenceHref,
}: MatrixContextSummaryProps) {
  const cell =
    meta.status === "ready"
      ? matrixCellFromContext(meta.meta, context)
      : null;

  const row = cell
    ? (meta.status === "ready"
        ? meta.meta.rows.find((r) => r.entityId === cell.rowEntityId)
        : undefined)
    : undefined;
  const column = cell
    ? (meta.status === "ready"
        ? meta.meta.columns.find((c) => c.entityId === cell.colEntityId)
        : undefined)
    : undefined;

  const hasSignals = cell !== null && cell.state !== "empty";
  const rowLabel = row?.label ?? cell?.rowEntityId ?? "—";
  const columnLabel = column?.label ?? cell?.colEntityId ?? "—";
  const columnCase = column?.caseLabel ?? "Case A";

  return (
    <aside
      id="matrix-context-aside"
      aria-label="Matrix context"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-50/60 shadow-sm backdrop-blur-md"
      data-testid="matrix-context-summary"
      data-matrix-context-cell={cell ? `${cell.rowEntityId}::${cell.colEntityId}` : ""}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-surface-200/50 bg-surface-50/80 px-3 py-2.5">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-surface-500">
          Matrix context
        </span>
        <PanelToggle
          open={open}
          onToggle={onToggle}
          label="Open right context panel"
          expandedActionLabel="Collapse right context panel"
          controlsId="matrix-context-aside"
          side="right"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {!cell ? (
          <p className="type-caption text-surface-400" data-testid="matrix-context-empty">
            Select a cell to inspect its relationship signals.
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-1.5 rounded-lg border border-surface-200/60 bg-surface-100/60 p-3">
              <div className="flex items-center gap-2 text-[10px] font-medium text-surface-700">
                <span className="rounded-md bg-surface-800 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-surface-0">
                  {mode === "within-case" ? "Case A" : "Case A"}
                </span>
                <span className="truncate">{rowLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-surface-700">
                <span className="rounded-md bg-surface-200 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-surface-600">
                  {columnCase}
                </span>
                <span className="truncate">{columnLabel}</span>
              </div>
              <span className="mt-1 self-start rounded-md border border-surface-300 bg-surface-50 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-600">
                {MATRIX_CELL_STATE_LABELS[cell.state]}
              </span>
            </section>

            <section aria-label="Relationship signals">
              <SignalList cell={cell} />
            </section>

            {hasSignals && (
              <section aria-label="Cell caveats" className="flex flex-col gap-1.5">
                {cell.contradictionPresent && (
                  <p className="type-caption rounded-md border border-accent-rose/30 bg-accent-rose/5 px-2 py-1.5 text-surface-600" data-testid="matrix-cell-caveat-conflict">
                    {cell.contradictionNote}
                  </p>
                )}
                {cell.unresolved && cell.unresolvedNote && (
                  <p className="type-caption rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-surface-600" data-testid="matrix-cell-caveat-unresolved">
                    {cell.unresolvedNote}
                  </p>
                )}
                {cell.candidateNote && (
                  <p className="type-caption rounded-md border border-surface-300 bg-surface-100/60 px-2 py-1.5 text-surface-600" data-testid="matrix-cell-candidate-note">
                    {cell.candidateNote}
                  </p>
                )}
                <p className="type-caption text-surface-400" data-testid="matrix-cell-window">
                  Observed window:{" "}
                  {matrixWindowLabel(cell.window) ?? "Not event-timed (comparison record)"}
                </p>
              </section>
            )}

            <section aria-label="Matrix actions" className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!onOpenInGraph}
                data-testid="matrix-ctx-open-in-graph"
                onClick={
                  onOpenInGraph ? () => onOpenInGraph(cell.rowEntityId) : undefined
                }
                className="w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
              >
                <span className="block text-[11px] font-medium uppercase tracking-wider text-surface-700">
                  Open in Graph
                </span>
                <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-surface-400">
                  Focus {rowLabel} in the network
                </span>
              </button>

              <button
                type="button"
                disabled={!onOpenPulse}
                data-testid="matrix-ctx-open-pulse"
                onClick={
                  onOpenPulse ? () => onOpenPulse(cell.rowEntityId) : undefined
                }
                className="w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
              >
                <span className="block text-[11px] font-medium uppercase tracking-wider text-surface-700">
                  Open Pulse
                </span>
                <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-surface-400">
                  Inspect {rowLabel} in the entity pulse
                </span>
              </button>

              {viewEvidenceHref ? (
                <a
                  href={viewEvidenceHref(cell.rowEntityId)}
                  data-testid="matrix-ctx-view-evidence"
                  className="w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-surface-700">
                    View Evidence
                  </span>
                  <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-surface-400">
                    Evidence records involving {rowLabel}
                  </span>
                </a>
              ) : null}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}