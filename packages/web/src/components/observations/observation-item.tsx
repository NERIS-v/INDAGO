"use client";

import type { Observation } from "@indago/contracts";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import type { ObservationContradiction } from "@/lib/providers/types";

function formatDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).toUpperCase();
}

interface ObservationItemProps {
  readonly observation: Observation;
  readonly index?: number;
  readonly contradictions?: readonly ObservationContradiction[];
  readonly onSelect?: (observationId: string) => void;
}

export function ObservationItem({
  observation,
  index = 0,
  contradictions = [],
  onSelect,
}: ObservationItemProps) {
  const body = (
    <div className="py-6 border-b border-semantic-border-subtle">
      <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span className="h-px w-4 bg-semantic-border-subtle" aria-hidden="true" />
        <span className="text-accent-amber">{observation.type}</span>
        {contradictions.length > 0 && (
          <>
            <span className="h-px w-4 bg-semantic-border-subtle" aria-hidden="true" />
            <span className="text-semantic-contradiction">
              {contradictions.length} contradiction{contradictions.length === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>

      <p className="mt-3 text-[1.0625rem] font-light leading-relaxed text-semantic-foreground">
        {observation.content}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-semantic-foreground-faint">
        {observation.observedAt && (
          <span>
            <span className="font-bold uppercase tracking-widest">Observed </span>
            {formatDay(observation.observedAt.value)}
          </span>
        )}
        {observation.entityIds.length > 0 && (
          <span>
            <span className="font-bold uppercase tracking-widest">Entities </span>
            {observation.entityIds.length} linked entit
            {observation.entityIds.length === 1 ? "y" : "ies"}
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-widest">Strength</span>
          <ConfidenceIndicator value={observation.strength} showBar />
        </span>
        <span className="ml-auto font-mono text-[9px] text-semantic-foreground-faint">
          obs:{observation.id.slice(0, 8)}
        </span>
      </div>
    </div>
  );

  if (!onSelect) {
    return <li>{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(observation.id)}
        aria-label={`Open observation ${observation.id.slice(0, 8)}`}
        className="w-full text-left transition-colors duration-fast hover:bg-semantic-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-rose rounded-lg"
      >
        {body}
      </button>
    </li>
  );
}