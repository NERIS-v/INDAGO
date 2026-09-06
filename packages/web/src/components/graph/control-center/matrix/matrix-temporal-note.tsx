// ============================================================================
// F-PR7 — Matrix temporal note (Zone 4, Matrix representation variant)
//
// Joins the shared timeline controller (the TemporalContextPanel) as a small
// representation-specific note strip. It narrates what the shared timeRange
// means for this matrix and — when a cell is selected — its observed signal
// window. Cross-case matches are comparison records (not event-timed), so they
// persist across the window; that is stated, never hidden.
// ============================================================================

"use client";

import type { MatrixLoadState } from "@/lib/network/matrix/use-matrix";
import {
  matrixCellFromContext,
  matrixWindowLabel,
} from "@/lib/network/matrix/matrix-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";

interface MatrixTemporalNoteProps {
  /** Shell-owned matrix analysis (the selected cell's window is resolved here). */
  readonly meta: MatrixLoadState;
  /** The canonical shell-owned selection. */
  readonly context: InvestigativeContext | null;
}

export function MatrixTemporalNote({ meta, context }: MatrixTemporalNoteProps) {
  const cell =
    meta.status === "ready"
      ? matrixCellFromContext(meta.meta, context)
      : null;

  const windowLabel =
    cell && cell.window ? matrixWindowLabel(cell.window) : null;

  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg border border-surface-200/60 bg-surface-50/70 px-3 py-2"
      data-testid="matrix-temporal-note"
    >
      {meta.status === "ready" ? (
        <>
          <p className="font-mono text-[10px] uppercase tracking-widest text-surface-500">
            Relationship matrix · {meta.meta.windowLabel} ·{" "}
            {meta.meta.inRangeObservationCount} of{" "}
            {meta.meta.totalObservationCount} observations in scope
          </p>
          <p className="type-caption text-surface-400">
            {windowLabel
              ? `Selected cell window: ${windowLabel}`
              : "Selected cell: no event-timed window (cross-case matches are comparison records, not event-timed signals)."}
          </p>
        </>
      ) : (
        <p className="type-caption text-surface-400">Relationship matrix…</p>
      )}
    </div>
  );
}