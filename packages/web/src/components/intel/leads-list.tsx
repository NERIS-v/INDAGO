"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Button } from "@/components/ui/button";

export interface LeadMock {
  id: string;
  claim: string;
  structuralSignal: "HIGH" | "MODERATE" | "LOW";
  relevance: "HIGH" | "MODERATE-HIGH" | "MODERATE" | "LOW";
  confidence: number;
  coverage: number;
  supportCount: number;
  againstCount: number;
  status: "REVIEW" | "AUTHORIZED" | "REJECTED";
}

interface LeadsListProps {
  leads: LeadMock[];
  onSelectLead: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  /** Live bundle surfaces an explicit "not available" state instead of pretending. */
  unavailable?: boolean;
  onRetry?: () => void;
}

const STATUS_META: Record<LeadMock["status"], { label: string; className: string }> = {
  REVIEW: { label: "Under review", className: "text-semantic-warning border-semantic-warning/30 bg-semantic-warning/5" },
  AUTHORIZED: { label: "Authorized", className: "text-semantic-accent border-semantic-accent/30 bg-semantic-accent/5" },
  REJECTED: { label: "Rejected", className: "text-semantic-foreground-faint border-semantic-border bg-semantic-surface" },
};

export function LeadsList({ leads, onSelectLead, loading, error, unavailable, onRetry }: LeadsListProps) {
  if (loading) {
    return <div className="flex items-center justify-center py-16 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">Loading leads...</div>;
  }

  if (unavailable) {
    return (
      <EmptyState
        title="Leads not available in this mode"
        description="Lead generation is not served for this investigation in the current data mode."
        action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : undefined}
      />
    );
  }

  if (error) {
    return (
      <ErrorDisplay title="Could not load leads" message={error} retry={onRetry} />
    );
  }

  if (!leads.length) {
    return (
      <div className="rounded-lg border border-dashed border-semantic-border px-6 py-10 text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
          No leads yet
        </p>
        <p className="mt-2 text-sm text-semantic-foreground-faint">
          Leads emerge as evidence is processed and analyzed.
        </p>
      </div>
    );
  }

  return (
    <div>
      {leads.map((lead, i) => (
        <button
          key={lead.id}
          onClick={() => onSelectLead(lead.id)}
          className="w-full border-b border-semantic-border-subtle py-6 text-left transition-colors duration-fast hover:bg-semantic-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-rose rounded-lg px-2 -mx-2"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className="h-px w-4 bg-semantic-border-subtle" aria-hidden="true" />
                <span>Signal {lead.structuralSignal}</span>
                <span className="h-px w-4 bg-semantic-border-subtle" aria-hidden="true" />
                <span>Relevance {lead.relevance}</span>
              </div>

              <p className="mt-3 text-[1.0625rem] font-light leading-relaxed text-semantic-foreground">
                {lead.claim}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] text-semantic-foreground-faint">
                <span>
                  <span className="font-bold uppercase tracking-widest">Confidence </span>
                  {(lead.confidence * 100).toFixed(0)}%
                </span>
                <span>
                  <span className="font-bold uppercase tracking-widest">Coverage </span>
                  {(lead.coverage * 100).toFixed(0)}%
                </span>
                <span>
                  <span className="font-bold uppercase tracking-widest">Support </span>
                  {lead.supportCount}
                </span>
                <span>
                  <span className="font-bold uppercase tracking-widest">Against </span>
                  {lead.againstCount}
                </span>
              </div>
            </div>

            <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${STATUS_META[lead.status].className}`}>
              {STATUS_META[lead.status].label}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}