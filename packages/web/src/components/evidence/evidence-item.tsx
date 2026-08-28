"use client";

import type { Evidence } from "@indago/contracts";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

function statusBadge(status: Evidence["status"]): {
  variant: BadgeVariant;
  pulse: boolean;
} {
  switch (status) {
    case "INGESTED":
      return { variant: "accent", pulse: true };
    case "PROCESSING":
      return { variant: "accent", pulse: true };
    case "PROCESSED":
      return { variant: "info", pulse: false };
    case "UNDER_REVIEW":
      return { variant: "warning", pulse: false };
    case "VERIFIED":
      return { variant: "success", pulse: false };
    case "REJECTED":
      return { variant: "danger", pulse: false };
    case "ARCHIVED":
      return { variant: "muted", pulse: false };
  }
}

function formatEventTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

interface EvidenceItemProps {
  readonly evidence: Evidence;
  readonly index?: number;
}

export function EvidenceItem({ evidence, index = 0 }: EvidenceItemProps) {
  const badge = statusBadge(evidence.status);
  return (
    <li
      className="flex flex-col gap-3 rounded-xl border border-border-standard bg-surface-50 p-4 transition-colors duration-fast hover:border-border-emphasis"
      style={{ transform: `rotate(${[0, -0.5, 0.5, -0.25, 0.75][index % 5]}deg)` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-strong">{evidence.title}</p>
          {evidence.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
              {evidence.description}
            </p>
          )}
        </div>
        <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
          {evidence.status}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge variant="muted">{evidence.type}</Badge>
        <ConfidenceIndicator value={evidence.strength} label="Strength" />
        <span className="type-mono-small text-text-muted">
          {evidence.artifactIds.length} file
          {evidence.artifactIds.length === 1 ? "" : "s"}
        </span>
        {evidence.observedAt && (
          <span className="type-mono-small text-text-muted">
            Observed {formatEventTime(evidence.observedAt.value)}
          </span>
        )}
        <span className="type-mono-small ml-auto text-text-faint">
          src:{evidence.provenance.sourceId}
        </span>
      </div>
    </li>
  );
}