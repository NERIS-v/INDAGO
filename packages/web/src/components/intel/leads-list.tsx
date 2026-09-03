"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
}

export function LeadsList({ leads, onSelectLead, loading }: LeadsListProps) {
  if (loading) {
    return <div className="animate-pulse space-y-3 p-4">Loading leads...</div>;
  }

  if (!leads.length) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-lg border border-surface-200/60 bg-surface-50 p-5">
        <span className="text-xs text-surface-500">
          No leads yet. Leads emerge as evidence is processed and analyzed.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {leads.map((lead, i) => (
        <button
          key={lead.id}
          onClick={() => onSelectLead(lead.id)}
          className="group w-full animate-fade-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <Card className="border-surface-200/60 bg-surface-50 p-5 transition-colors duration-fast hover:border-brand-500/20 hover:bg-surface-100">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                {/* Visual Hierarchy 1: Lead Statement */}
                <h3 className="font-sans text-sm font-medium text-surface-800 leading-snug">
                  {lead.claim}
                </h3>
                
                {/* Visual Hierarchy 2: Confidence / Signals */}
                <div className="flex items-center gap-3 font-mono text-xs text-brand-500">
                  <span>Confidence: {(lead.confidence * 100).toFixed(0)}%</span>
                  <span className="text-surface-400">·</span>
                  <span className="text-surface-600">Signal: {lead.structuralSignal}</span>
                  <span className="text-surface-400">·</span>
                  <span className="text-surface-600">Coverage: {(lead.coverage * 100).toFixed(0)}%</span>
                </div>

                {/* Visual Hierarchy 3: Evidence Context */}
                <div className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-widest text-surface-500">
                  <span>{lead.supportCount} Supporting</span>
                  <span className="text-surface-300">|</span>
                  <span>{lead.againstCount} Against</span>
                </div>
              </div>

              <Badge variant={lead.status === "REVIEW" ? "warning" : "muted"} dot>
                {lead.status}
              </Badge>
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}