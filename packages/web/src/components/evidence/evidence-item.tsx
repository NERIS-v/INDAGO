"use client";

import type { EvidenceListItem } from "@/lib/api/types";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

const STATUS_TEXT: Record<EvidenceListItem["status"], string> = {
  INGESTED: "INGESTED",
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  UNDER_REVIEW: "UNDER REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
};

const STATUS_CLASS: Record<EvidenceListItem["status"], string> = {
  INGESTED: "text-accent-rose border-accent-rose/30 bg-accent-rose/5",
  PROCESSING: "text-accent-rose border-accent-rose/30 bg-accent-rose/5",
  PROCESSED: "text-accent-blue border-accent-blue/30 bg-accent-blue/5",
  UNDER_REVIEW: "text-accent-amber border-accent-amber/30 bg-accent-amber/5",
  VERIFIED: "text-semantic-foreground border-semantic-border bg-semantic-surface",
  REJECTED: "text-semantic-contradiction border-semantic-contradiction/30 bg-semantic-contradiction/5",
  ARCHIVED: "text-semantic-foreground-faint border-semantic-border bg-semantic-surface",
};

function formatEventTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).toUpperCase();
}

interface EvidenceItemProps {
  readonly evidence: EvidenceListItem;
  readonly index?: number;
}

export function EvidenceItem({ evidence, index = 0 }: EvidenceItemProps) {
  return (
    <li className="border-b border-semantic-border-subtle py-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span className="h-px w-4 bg-semantic-border-subtle" aria-hidden="true" />
            <span className="text-accent-amber">{evidence.type}</span>
          </div>

          <p className="mt-3 text-[1.0625rem] font-light leading-relaxed text-semantic-foreground">
            {evidence.title}
          </p>
          {evidence.description && (
            <p className="mt-1 line-clamp-2 max-w-[70ch] text-sm text-semantic-foreground-muted">
              {evidence.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] text-semantic-foreground-faint">
            {evidence.observedAt && (
              <span>
                <span className="font-bold uppercase tracking-widest">Observed </span>
                {formatEventTime(evidence.observedAt.value)}
              </span>
            )}
            {evidence.artifactIds.length > 0 && (
              <span>
                <span className="font-bold uppercase tracking-widest">Files </span>
                {evidence.artifactIds.length}
              </span>
            )}
            {evidence.observationCount !== undefined && (
              <span>
                <span className="font-bold uppercase tracking-widest">Observations </span>
                {evidence.observationCount}
              </span>
            )}
            {evidence.strength !== undefined && (
              <span className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-widest">Strength</span>
                <ConfidenceIndicator value={evidence.strength} showBar />
              </span>
            )}
          </div>

          <p className="mt-3 font-mono text-[9px] text-semantic-foreground-faint">
            src:{evidence.sourceRef}
          </p>
        </div>

        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${STATUS_CLASS[evidence.status]}`}>
          {STATUS_TEXT[evidence.status]}
        </span>      </div>
    </li>
  );
}