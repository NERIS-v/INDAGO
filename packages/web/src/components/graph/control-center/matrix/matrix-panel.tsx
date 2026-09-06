// ============================================================================
// F-PR7 — Cross-Case / Relationship Matrix (Zone 2 representation)
//
// Rendered ONLY when the workspace capability resolution says the matrix is
// ready in the effective mode (DEMO / AUTO-demo). LIVE renders a typed
// not-ready pane at the shell instead. The matrix meta arrives from the
// SHELL-owned analysis (one source across all five zones) — this panel never
// fetches.
//
// Honesty contract (locked):
//   - A bright cell means "evidence suggests a candidate relationship worth
//     investigating" — NEVER "confirmed connected" or a risk/guilt score.
//   - Cells derive ONLY from provider-backed signals (shared observations,
//     relation hypotheses, match records). overlay bridgeSupport is NEVER
//     promoted into a cell value.
//   - Cross-case candidate cells are authorization-gated: pre-auth cells are
//     homogeneously empty and ONLY a count of hidden candidates is exposed
//     (never which cell is gated).
//   - The shared workspace timeRange is the single temporal controller.
//
// SELECT (click a cell) ≠ FOCUS (durable deep-link target). Clicking SELECTs
// through the shell context bridge. Keyboard: arrow keys rove the grid focus,
// Enter/Space activate (native button behavior).
// ============================================================================

"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import type { MatrixLoadState } from "@/lib/network/matrix/use-matrix";
import type { MatrixCell, MatrixEntityColumn, MatrixMode } from "@/lib/network/matrix/matrix-model";
import {
  cellFor,
  matrixCellFromContext,
  matrixContextForCell,
  matrixWindowLabel,
} from "@/lib/network/matrix/matrix-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";

interface MatrixPanelProps {
  /** Shell-owned matrix analysis shared with every supporting zone. */
  readonly meta: MatrixLoadState;
  /** Effective matrix mode (within-case / cross-case). */
  readonly mode: MatrixMode;
  /** The canonical shell-owned selection (derived highlight only). */
  readonly context?: InvestigativeContext | null;
  /** Shell handler that rematerializes matrix intents as context (SELECT). */
  readonly onSelectContext?: (context: InvestigativeContext | null) => void;
  /** "Open in Graph" — hands the row entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
  /** "Open in Pulse" — hands the row entity to the pulse focus seam. */
  readonly onOpenPulse?: (entityId: string) => void;
  /** Shell handler that starts the boundary authorization flow. */
  readonly onRequestAuthorization?: (caseId: string) => void;
}

function CellGlyphs({ cell }: { cell: MatrixCell }) {
  if (!cell.unresolved && !cell.contradictionPresent) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {cell.contradictionPresent && (
        <span
          aria-hidden
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent-rose font-mono text-[9px] font-black text-surface-0"
          title={cell.contradictionNote ?? "Contradicted evidence"}
        >
          !
        </span>
      )}
      {cell.unresolved && (
        <span
          aria-hidden
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-warning/80 font-mono text-[9px] font-black text-surface-900"
          title={cell.unresolvedNote ?? "Identity comparison unresolved"}
        >
          ?
        </span>
      )}
    </span>
  );
}

export function MatrixPanel({
  meta,
  mode,
  context = null,
  onSelectContext,
  onOpenInGraph,
  onOpenPulse,
  onRequestAuthorization,
}: MatrixPanelProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<[number, number] | null>(null);

  const selectedCell = useMemo(
    () => (meta.status === "ready" ? matrixCellFromContext(meta.meta, context) : null),
    [meta, context],
  );

  if (meta.status === "error") {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="matrix-panel">
        <ErrorDisplay message={meta.error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (meta.status !== "ready") {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="matrix-panel">
        <LoadingSpinner size="sm" label="Building the relationship matrix..." />
      </div>
    );
  }

  const matrix = meta.meta;
  const { rows, columns } = matrix;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    let [ri, ci] = focused ?? [0, 0];
    if (event.key === "ArrowDown") ri = Math.min(ri + 1, rows.length - 1);
    if (event.key === "ArrowUp") ri = Math.max(ri - 1, 0);
    if (event.key === "ArrowRight") ci = Math.min(ci + 1, columns.length - 1);
    if (event.key === "ArrowLeft") ci = Math.max(ci - 1, 0);
    setFocused([ri, ci]);
    const row = rows[ri];
    const column = columns[ci];
    if (row && column) {
      const target = gridRef.current?.querySelector(
        `[data-matrix-cell-index="${row.entityId}::${column.entityId}"]`,
      );
      (target as HTMLElement | null)?.focus();
    }
  }

  function selectCell(row: MatrixEntityColumn, column: MatrixEntityColumn) {
    onSelectContext?.(matrixContextForCell(mode, row.entityId, column.entityId));
  }

  return (
    <div
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overflow-x-auto p-4"
      data-testid="matrix-panel"
    >
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-400">
            Relationship Matrix
          </h2>
          <p className="truncate font-mono text-[11px] text-surface-500" data-testid="matrix-summary">
            {matrix.summary}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-surface-300 bg-surface-100/80 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-500">
          {mode === "within-case" ? "Within case" : "Cross case"}
        </span>
      </div>

      {mode === "cross-case" && !matrix.authorized && matrix.hiddenCandidateCount > 0 && (
        <div
          role="alert"
          className="flex shrink-0 flex-col gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3"
          data-testid="matrix-auth-card"
        >
          <div>
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-700">
              Authorization required
            </h3>
            <p className="type-caption text-surface-500">
              {matrix.boundaryLabel ?? "This boundary"} holds{" "}
              {matrix.hiddenCandidateCount} provider-backed comparison candidate
              {matrix.hiddenCandidateCount === 1 ? "" : "s"}. Nothing is shown before
              authorization — the honest count is all that is revealed.
            </p>
          </div>
          <button
            type="button"
            data-testid="matrix-request-auth"
            onClick={() =>
              matrix.boundaryCaseId
                ? onRequestAuthorization?.(matrix.boundaryCaseId)
                : undefined
            }
            className="self-start rounded-md border border-surface-300 bg-surface-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Authorize comparison boundary
          </button>
        </div>
      )}

      <div
        ref={gridRef}
        role="grid"
        aria-label="Relationship matrix"
        onKeyDown={handleKeyDown}
        className="min-w-max shrink-0"
        data-testid="matrix-grid"
      >
        <div role="row" className="flex gap-1">
          <div
            role="columnheader"
            className="w-40 shrink-0 rounded-md border border-surface-200/60 bg-surface-100/60 px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-500"
          >
            {mode === "within-case" ? "Entity × Entity" : "Case A × Boundary"}
          </div>
            {columns.map((column) => (
              <div
                role="columnheader"
                key={column.entityId}
                className="flex w-40 shrink-0 flex-col rounded-md border border-surface-200/60 bg-surface-100/60 px-2 py-1.5"
                title={column.label}
              >
                <span className="truncate text-[10px] font-medium text-surface-700">
                  {column.label}
                </span>
                <span className="truncate font-mono text-[8px] uppercase tracking-widest text-surface-400">
                  {column.caseLabel}
                </span>
              </div>
            ))}
          </div>

        {rows.map((row, ri) => (
          <div role="row" className="mt-1 flex gap-1" key={row.entityId}>
            <div
              role="rowheader"
              className="flex w-40 shrink-0 flex-row items-center rounded-md border border-surface-200/60 bg-surface-100/60 px-2 py-1.5"
              title={row.label}
            >
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-surface-700">
                {row.label}
              </span>
            </div>
            {columns.map((column, ci) => {
              const cell = cellFor(matrix, row.entityId, column.entityId);
              if (!cell) return null;
              const isFocusedCell =
                focused !== null && focused[0] === ri && focused[1] === ci;
              const selected =
                selectedCell !== null &&
                selectedCell.rowEntityId === row.entityId &&
                selectedCell.colEntityId === column.entityId;

              if (cell.self) {
                return (
                  <div
                    role="gridcell"
                    key={column.entityId}
                    data-matrix-cell
                    data-matrix-self="true"
                    className="flex w-40 shrink-0 items-center justify-center rounded-md border border-surface-200/40 bg-surface-50/40 px-2 py-1.5"
                  >
                    <span className="truncate font-mono text-[9px] text-surface-400">
                      {row.label}
                    </span>
                  </div>
                );
              }

              const title = [
                cell.ariaDescription,
                cell.contradictionNote ?? "",
                cell.unresolvedNote ?? "",
                cell.candidateNote ?? "",
              ]
                .filter(Boolean)
                .join(" — ");

              return (
                <button
                  type="button"
                  key={column.entityId}
                  role="gridcell"
                  tabIndex={isFocusedCell ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={`${row.label} to ${column.label}, ${cell.stateLabel}. ${cell.ariaDescription}`}
                  data-matrix-cell
                  data-matrix-state={cell.state}
                  data-matrix-row-id={row.entityId}
                  data-matrix-col-id={column.entityId}
                  data-matrix-cell-index={`${row.entityId}::${column.entityId}`}
                  onClick={() => selectCell(row, column)}
                  onFocus={() => setFocused([ri, ci])}
                  title={title}
                  className={`flex h-10 w-40 shrink-0 items-center justify-between gap-1 rounded-md border px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? "ring-1 ring-brand-500" : ""} ${
                    cell.state === "conflict"
                      ? "border-accent-rose/50 bg-accent-rose/10"
                      : cell.state === "multi-signal"
                        ? "border-brand-500/40 bg-brand-500/10"
                        : cell.state === "candidate"
                          ? "border-surface-300 bg-surface-100/50"
                          : "border-surface-200/40 bg-surface-50/30"
                  }`}
                >
                  <span
                    className={`truncate font-mono text-[8px] font-bold uppercase tracking-widest ${
                      cell.state === "empty" ? "text-surface-300" : "text-surface-600"
                    }`}
                  >
                    {cell.stateLabel}
                  </span>
                  <CellGlyphs cell={cell} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        className="relative shrink-0"
        data-testid="matrix-panel-actions"
      >
        {selectedCell && selectedCell.state !== "empty" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-surface-500">
              Selected cell window:
            </span>
            <span className="font-mono text-[10px] text-surface-700">
              {matrixWindowLabel(selectedCell.window) ?? "Not event-timed (comparison record)"}
            </span>
            {onOpenInGraph && (
              <button
                type="button"
                data-testid="matrix-open-in-graph"
                onClick={() => onOpenInGraph(selectedCell.rowEntityId)}
                className="rounded-md border border-surface-300 bg-surface-100/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Open in Graph
              </button>
            )}
            {onOpenPulse && (
              <button
                type="button"
                data-testid="matrix-open-in-pulse"
                onClick={() => onOpenPulse(selectedCell.rowEntityId)}
                className="rounded-md border border-surface-300 bg-surface-100/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Open in Pulse
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}