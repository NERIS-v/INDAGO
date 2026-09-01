"use client";

import { Badge } from "@/components/ui/badge";

/** A single node in the provenance breadcrumb trail. */
export interface Hop {
  readonly key: string;
  readonly label: string;
  readonly targetId: string;
}

/** Map contradiction type to a distinct badge variant + label (never color only). */
export function contradictionKindLabel(
  kind: ObservationContradiction["contradictionType"],
): string {
  switch (kind) {
    case "DIRECT_REFUTATION":
      return "Direct refutation";
    case "TEMPORAL_IMPOSSIBILITY":
      return "Temporal impossibility";
    case "LOGICAL_INCONSISTENCY":
      return "Logical inconsistency";
    case "SOURCE_CREDIBILITY":
      return "Source credibility";
    case "INCOMPLETE_INFORMATION":
      return "Incomplete information";
  }
}

import type { ObservationContradiction } from "@/lib/providers/types";

interface KindBadgeProps {
  readonly kind: ObservationContradiction["contradictionType"];
}

export function ObservationContradictionKindBadge({ kind }: KindBadgeProps) {
  const variant =
    kind === "DIRECT_REFUTATION" || kind === "TEMPORAL_IMPOSSIBILITY"
      ? "danger"
      : kind === "LOGICAL_INCONSISTENCY"
      ? "warning"
      : "muted";
  return <Badge variant={variant} dot>{contradictionKindLabel(kind)}</Badge>;
}

interface HopTrailProps {
  readonly hops: readonly Hop[];
  readonly activeKey: string;
}

/**
 * A left-to-right provenance breadcrumb: Observation → Evidence → Source →
 * Artifact → Entity → Relation. Each hop is shown with the active step
 * highlighted; no hop is a working link — the trail is a labeled map of the
 * recorded provenance chain, and the panel below is the navigation surface.
 */
export function HopTrail({ hops, activeKey }: HopTrailProps) {
  return (
    <nav aria-label="Provenance trail" className="flex flex-wrap items-center gap-y-2">
      {hops.map((hop, idx) => {
        const isActive = hop.key === activeKey;
        return (
          <span key={hop.key} className="flex items-center gap-2">
            {idx > 0 && (
              <span aria-hidden className="text-text-faint select-none">→</span>
            )}
            <span
              className={
                isActive
                  ? "rounded-full border border-accent-rose/40 bg-accent-rose/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent-rose"
                  : "rounded-full border border-border-standard bg-surface-0 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted"
              }
            >
              {hop.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
