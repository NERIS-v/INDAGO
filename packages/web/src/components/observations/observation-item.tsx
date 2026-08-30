"use client";

import type { Observation } from "@indago/contracts";
import { Badge } from "@/components/ui/badge";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

function formatDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

interface ObservationItemProps {
  readonly observation: Observation;
}

export function ObservationItem({ observation }: ObservationItemProps) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border-standard bg-surface-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-medium text-text-strong">{observation.content}</p>
        <Badge variant="muted">{observation.type}</Badge>
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
    </li>
  );
}