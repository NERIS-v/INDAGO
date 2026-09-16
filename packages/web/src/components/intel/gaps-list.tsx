"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Button } from "@/components/ui/button";

export interface GapMock {
  id: string;
  holeType: "ISOLATED_NODE" | "MISSING_COMPARISON" | "INFRASTRUCTURE_GAP";
  missingRelationship: string;
  affectedEntities: string[];
  impact: "HIGH" | "MODERATE" | "LOW";
  status: "OPEN" | "EVIDENCE_REQUESTED" | "RESOLVED";
}

interface GapsListProps {
  gaps: GapMock[];
  onSelectGap: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  /** Live bundle surfaces an explicit "not available" state instead of pretending. */
  unavailable?: boolean;
  onRetry?: () => void;
}

const IMPACT_CLASS: Record<GapMock["impact"], string> = {
  HIGH: "text-semantic-contradiction",
  MODERATE: "text-semantic-warning",
  LOW: "text-semantic-info",
};

const STATUS_META: Record<GapMock["status"], { label: string; className: string }> = {
  OPEN: { label: "Open", className: "text-semantic-warning border-semantic-warning/30 bg-semantic-warning/5" },
  EVIDENCE_REQUESTED: { label: "Evidence requested", className: "text-semantic-info border-semantic-info/30 bg-semantic-info/5" },
  RESOLVED: { label: "Resolved", className: "text-semantic-foreground-faint border-semantic-border bg-semantic-surface" },
};

export function GapsList({ gaps, onSelectGap, loading, error, unavailable, onRetry }: GapsListProps) {
  if (loading) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-semantic-border border-t-accent-amber animate-spin" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">Reviewing unknowns...</span>
      </div>
    );
  }

  if (unavailable) {
    return (
      <EmptyState
        title="Gap analysis not available in this mode"
        description="Structural gap analysis is not served for this investigation in the current data mode."
        action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : undefined}
      />
    );
  }

  if (error) {
    return (
      <ErrorDisplay title="Could not load gaps" message={error} retry={onRetry} />
    );
  }

  if (!gaps.length) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-semantic-border">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
          No structural gaps
        </p>
        <p className="mt-2 text-sm text-semantic-foreground-faint">No unknowns remain unresolved in this investigation.</p>
      </div>
    );
  }

  return (
    <div>
      {gaps.map((gap, i) => {
        const isResolved = gap.status === "RESOLVED";
        return (
          <button
            key={gap.id}
            onClick={() => onSelectGap(gap.id)}
            className={`w-full border-b border-semantic-border-subtle py-6 text-left transition-colors duration-fast hover:bg-semantic-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-rose rounded-lg px-2 -mx-2 ${isResolved ? "opacity-50" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className="h-px w-4 bg-semantic-border-subtle" aria-hidden="true" />
                  <span>{gap.holeType.replace(/_/g, " ")}</span>
                  <span className={`h-px w-4 bg-semantic-border-subtle`} aria-hidden="true" />
                  <span className={IMPACT_CLASS[gap.impact]}>{gap.impact} IMPACT</span>
                </div>

                <p className={`mt-3 text-[1.0625rem] font-light leading-relaxed ${isResolved ? "text-semantic-foreground-faint" : "text-semantic-foreground"}`}>
                  {gap.missingRelationship}
                </p>

                {gap.affectedEntities.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-semantic-foreground-faint">
                      Affected
                    </span>
                    {gap.affectedEntities.map((entity) => (
                      <span key={entity} className="rounded-full border border-semantic-border-subtle px-2.5 py-0.5 font-mono text-[10px] text-semantic-foreground-muted">
                        {entity}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${STATUS_META[gap.status].className}`}>
                {STATUS_META[gap.status].label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}