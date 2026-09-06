// ============================================================================
// F-PR8 — Flow intelligence insight (Zone 5, Flow representation adapter)
//
// Component consumed by the InvestigativeIntelligence shell through an ADDITIVE
// adapter slot (the Zone 5 shell is not redesigned). Renders provider-backed
// flow findings inside the Overview tab: the deterministic summary, the entity
// count, and the CROSS-CASE COUNT ONLY (flow never reveals specific cross-case
// matches here — Zone 5 stays a count, the matrix owns the grid). Missing/
// sparse data renders honest absence, never invented numbers.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { FlowLoadState } from "@/lib/network/flow/use-flow-analysis";

interface FlowIntelligenceInsightProps {
  readonly meta: FlowLoadState;
}

export function FlowIntelligenceInsight({ meta }: FlowIntelligenceInsightProps) {
  return (
    <section
      aria-label="Flow insight"
      data-testid="flow-intelligence-insight"
      className="flex flex-col gap-2 rounded-xl border border-surface-200/60 bg-surface-50/80 p-3"
    >
      <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
        Adaptive Flow insight
      </h3>
      {meta.status === "ready" ? (
        <>
          <p className="type-caption text-surface-600" data-flow-intel-summary>
            {meta.meta.summary}
          </p>
          {meta.meta.crossCaseCount > 0 && (
            <p className="type-caption text-surface-600" data-flow-intel-cross-case>
              {meta.meta.crossCaseCount} of {meta.meta.entityCount} flow entit
              {meta.meta.entityCount === 1 ? "y" : "ies"} also appear in a
              cross-case match record (comparison grid in the Cross-Case
              Matrix).
            </p>
          )}
          {meta.meta.crossCaseCount === 0 && (
            <p className="type-caption text-surface-500" data-flow-intel-cross-case>
              No flow entity appears in a cross-case match record for this
              boundary set.
            </p>
          )}
        </>
      ) : meta.status === "error" ? (
        <p className="type-caption text-surface-500">{meta.error.message}</p>
      ) : (
        <LoadingSpinner size="sm" label="Building the flow analysis..." />
      )}
    </section>
  );
}