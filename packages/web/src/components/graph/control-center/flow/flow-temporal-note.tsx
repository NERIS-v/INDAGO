// ============================================================================
// F-PR8 — Flow temporal note (Zone 4, Flow representation adapter)
//
// The Temporal/Case zone keeps its existing TimelinePanel — the shared
// workspace timeRange IS the only temporal controller for the flow (start and
// end handle changes both morph segment scoping through the derived meta).
// This PROVISIONAL note strip sits above the timeline inside the "time" tab
// and always reports data-backed window facts (never declares a window the
// data does not support). It composes above an unchanged TimelinePanel; the
// zone host itself is not edited.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { FlowLoadState } from "@/lib/network/flow/use-flow-analysis";
import { formatFlowAmount } from "@/lib/network/flow/flow-model";

interface FlowTemporalNoteProps {
  readonly meta: FlowLoadState;
}

export function FlowTemporalNote({ meta }: FlowTemporalNoteProps) {
  return (
    <div
      data-testid="flow-temporal-note"
      className="mb-2 flex flex-col gap-1 rounded-lg border border-surface-200/60 bg-surface-100/60 px-3 py-2"
    >
      {meta.status === "ready" ? (
        <>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
            Flow window
          </p>
          <p className="type-caption text-surface-600" data-flow-temporal-summary>
            {meta.meta.summary}
          </p>
          {meta.meta.observedAmounts.length > 0 && (
            <p className="type-caption text-surface-600" data-flow-temporal-amounts>
              {meta.meta.observedAmounts
                .map((amount) => formatFlowAmount(amount.total, amount.currency))
                .join(" + ")}{" "}
              observed across {meta.meta.segmentCount} segment
              {meta.meta.segmentCount === 1 ? "" : "s"}
            </p>
          )}
        </>
      ) : meta.status === "error" ? (
        <p className="type-caption text-surface-500">{meta.error.message}</p>
      ) : meta.status === "loading" ? (
        <LoadingSpinner size="sm" label="Building the flow analysis..." />
      ) : null}
    </div>
  );
}