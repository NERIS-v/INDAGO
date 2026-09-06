// ============================================================================
// F-PR6 — Pulse intelligence insight (Zone 5, Entity Pulse representation adapter)
//
// Component consumed by the InvestigativeIntelligence shell through an ADDITIVE
// adapter slot (the Zone 5 shell is not redesigned). Renders provider-backed
// pulse findings inside the Overview tab: most active entity, dominant window
// activity, window concentration and the sparse case markers. Missing/sparse
// data renders honest absence, never invented numbers.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";

interface PulseIntelligenceInsightProps {
  readonly overview: EntityPulseLoadState;
}

function markerCount(
  overview: NonNullable<EntityPulseLoadState & { readonly status: "ready" }>["overview"],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const marker of overview.markers) {
    counts[marker.kind] = (counts[marker.kind] ?? 0) + 1;
  }
  return counts;
}

export function PulseIntelligenceInsight({ overview }: PulseIntelligenceInsightProps) {
  return (
    <section
      aria-label="Entity pulse insight"
      data-testid="pulse-intelligence-insight"
      className="flex flex-col gap-2 rounded-xl border border-surface-200/60 bg-surface-50/80 p-3"
    >
      <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
        Entity Pulse insight
      </h3>
      {overview.status === "ready" ? (
        <>
          <p className="type-caption text-surface-600" data-pulse-intel-summary>
            {overview.overview.summary}
          </p>
          {overview.overview.strongest && (
            <p className="type-caption text-surface-600">
              Most active: {overview.overview.strongest.label} —{" "}
              {overview.overview.strongest.observationCount} observation
              {overview.overview.strongest.observationCount === 1 ? "" : "s"} in window.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5" data-pulse-intel-markers>
            {Object.entries(markerCount(overview.overview))
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([kind, count]) => (
                <span
                  key={kind}
                  className="rounded-full border border-surface-200 bg-surface-100/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-surface-600"
                >
                  {kind.replace("-", " ")} ×{count}
                </span>
              ))}
            {overview.overview.markers.length === 0 && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-surface-500">
                No case signals in window
              </span>
            )}
          </div>
        </>
      ) : overview.status === "error" ? (
        <p className="type-caption text-surface-500">{overview.error.message}</p>
      ) : (
        <LoadingSpinner size="sm" label="Building the entity pulse..." />
      )}
    </section>
  );
}