"use client";

import type { Observation } from "@indago/contracts";
import { Badge } from "@/components/ui/badge";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import type { ObservationContradiction } from "@/lib/providers/types";

function formatDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

interface ObservationItemProps {
  readonly observation: Observation;
  /** Contradictions in which THIS observation is one of the two paired sides. */
  readonly contradictions?: readonly ObservationContradiction[];
  /** When set the item is selectable (opened as a panel / deep link). */
  readonly onSelect?: (observationId: string) => void;
}

export function ObservationItem({
  observation,
  contradictions = [],
  onSelect,
}: ObservationItemProps) {
  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-medium text-text-strong">{observation.content}</p>
        <div className="flex items-center gap-2">
          {contradictions.length > 0 && (
            <Badge variant="danger" dot>
              {contradictions.length} contradiction
              {contradictions.length === 1 ? "" : "s"}
            </Badge>
          )}
          <Badge variant="muted">{observation.type}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ConfidenceIndicator value={observation.strength} label="Strength" />
        {observation.entityIds.length > 0 && (
          <span className="type-mono-small text-text-muted">
            {observation.entityIds.length} linked entit
            {observation.entityIds.length === 1 ? "y" : "ies"}
          </span>
        )}
        {observation.observedAt && (
          <span className="type-mono-small text-text-muted">
            Observed {formatDay(observation.observedAt.value)}
          </span>
        )}
        <span className="type-mono-small ml-auto text-text-faint">
          obs:{observation.id.slice(0, 8)} eval:{observation.evidenceId.slice(0, 8)} src:{observation.sourceId.slice(0, 8)}
        </span>
      </div>
    </>
  );

  if (!onSelect) {
    return <li className="flex flex-col gap-3 rounded-xl border border-border-standard bg-surface-50 p-4">{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(observation.id)}
        aria-label={`Open observation ${observation.id.slice(0, 8)}`}
        className="flex w-full flex-col gap-3 rounded-xl border border-border-standard bg-surface-50 p-4 text-left transition-colors duration-fast ease-restrained hover:border-accent-rose/50 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-rose"
      >
        {body}
      </button>
    </li>
  );
}