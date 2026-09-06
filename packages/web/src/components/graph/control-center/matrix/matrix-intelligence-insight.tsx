// ============================================================================
// F-PR7 — Matrix intelligence insight (Zone 5, Matrix representation adapter)
//
// A small insight adapter rendered inside the Intelligence zone's Overview tab
// while the Matrix representation is active. It summarizes the signal classes
// actually present in the meta — never fabricated scores or risk language —
// plus the number of cells that need analyst review (conflict / unresolved).
// ============================================================================

"use client";

import type { MatrixLoadState } from "@/lib/network/matrix/use-matrix";
import {
  MATRIX_SIGNAL_CLASS_LABELS,
  matrixCellCounts,
} from "@/lib/network/matrix/matrix-model";

interface MatrixIntelligenceInsightProps {
  /** Shell-owned matrix analysis consumed by every supporting zone. */
  readonly meta: MatrixLoadState;
}

export function MatrixIntelligenceInsight({ meta }: MatrixIntelligenceInsightProps) {
  if (meta.status !== "ready") return null;

  const counts = matrixCellCounts(meta.meta);
  const classCounts = new Map<string, number>();
  for (const cell of meta.meta.cells) {
    for (const signal of cell.signals) {
      classCounts.set(signal.class, (classCounts.get(signal.class) ?? 0) + 1);
    }
  }
  const classes = [...classCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const unresolvedCells = meta.meta.cells.filter(
    (cell) => !cell.self && cell.state !== "empty" && cell.unresolved,
  ).length;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-surface-200/60 bg-surface-50/70 p-3"
      data-testid="matrix-intelligence-insight"
    >
      <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
        Matrix signals
      </h3>
      {classes.length === 0 ? (
        <p className="type-caption text-surface-400">
          No active signal classes in the current window / comparison boundary.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {classes.map(([signalClass, cellCount]) => (
            <li
              key={signalClass}
              className="rounded-md border border-surface-300 bg-surface-100/60 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-600"
              data-matrix-insight-class={signalClass}
            >
              {MATRIX_SIGNAL_CLASS_LABELS[signalClass as keyof typeof MATRIX_SIGNAL_CLASS_LABELS]}{" "}
              · {cellCount} cell{cellCount === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      )}
      {(counts.conflict > 0 || unresolvedCells > 0) && (
        <p className="type-caption text-surface-500">
          {counts.conflict > 0
            ? `${counts.conflict} cell${counts.conflict === 1 ? "" : "s"} need review (supporting and contradicting observations present). `
            : ""}
          {unresolvedCells > 0
            ? `${unresolvedCells} cell${unresolvedCells === 1 ? "" : "s"} involve an unresolved identity comparison — not identity-confirmed.`
            : ""}
        </p>
      )}
    </div>
  );
}