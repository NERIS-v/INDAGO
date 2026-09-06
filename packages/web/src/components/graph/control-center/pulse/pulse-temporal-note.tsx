// ============================================================================
// F-PR6 — Pulse temporal note (Zone 4, Entity Pulse representation adapter)
//
// The Temporal/Case zone keeps its existing TimelinePanel — the shared
// workspace timeRange IS the only temporal controller for the pulse (start and
// end handle changes both morph glyph geometry through the derived overview).
// This PROVISIONAL note strip sits above the timeline inside the "time" tab and
// always reports data-backed window facts (never declares a window the data
// does not support). It composes above an unchanged TimelinePanel; the zone
// host itself is not edited.
// ============================================================================

"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { EntityPulseLoadState } from "@/lib/network/pulse/use-entity-pulse";

interface PulseTemporalNoteProps {
  readonly overview: EntityPulseLoadState;
}

export function PulseTemporalNote({ overview }: PulseTemporalNoteProps) {
  return (
    <div
      data-testid="pulse-temporal-note"
      className="mb-2 flex flex-col gap-1 rounded-lg border border-surface-200/60 bg-surface-100/60 px-3 py-2"
    >
      {overview.status === "ready" ? (
        <>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-surface-500">
            Window
          </p>
          <p className="type-caption text-surface-600" data-pulse-temporal-window>
            {overview.overview.windowLabel} · {overview.overview.totalObservationsInWindow} observations
            {overview.overview.concentrationPct !== null
              ? ` (${overview.overview.concentrationPct}% of ${overview.overview.totalObservationsFull} total)`
              : ""}
          </p>
          {overview.overview.strongest && (
            <p className="type-caption text-surface-600" data-pulse-temporal-strongest>
              Most active: {overview.overview.strongest.label} —{" "}
              {overview.overview.strongest.categoryLabel.toLowerCase()}
            </p>
          )}
          {overview.overview.mostChanged && (
            <p className="type-caption text-surface-600" data-pulse-temporal-changed>
              {overview.overview.mostChanged.description}
            </p>
          )}
        </>
      ) : overview.status === "loading" ? (
        <LoadingSpinner size="sm" label="Building the entity pulse..." />
      ) : null}
    </div>
  );
}