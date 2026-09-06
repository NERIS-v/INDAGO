"use client";

import { useState } from "react";
import { LeadsList, type LeadMock } from "@/components/intel/leads-list";
import { LeadDrawer } from "@/components/drawers/lead-drawer";

// Deterministic mock data for the Operation Financial Shadow demo case
const DEMO_LEADS: LeadMock[] = [
  {
    id: "lead-victor-meridian",
    claim: "Victor Aldridge exercises covert ownership of Meridian Transit via intermediary accounts.",
    structuralSignal: "HIGH",
    relevance: "MODERATE-HIGH",
    confidence: 0.87,
    coverage: 0.81,
    supportCount: 6,
    againstCount: 1,
    status: "REVIEW",
  },
  {
    id: "lead-shell-pattern",
    claim: "Northbridge Capital Ltd and Aldridge Holdings S.A. operate as a coordinated shell cluster.",
    structuralSignal: "MODERATE",
    relevance: "MODERATE",
    confidence: 0.65,
    coverage: 0.54,
    supportCount: 3,
    againstCount: 0,
    status: "AUTHORIZED",
  }
];

export default function LeadsPage() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const pendingReview = DEMO_LEADS.filter((l) => l.status === "REVIEW").length;

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Intelligence</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Pursuit queue</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Investigative leads
            </h1>
            {pendingReview > 0 && (
              <span className="rounded-full border border-semantic-warning/30 bg-semantic-warning/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-warning">
                {pendingReview} pending review
              </span>
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
              {String(DEMO_LEADS.length).padStart(2, "0")} total
            </span>
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Leads are candidate lines of inquiry derived from the case graph.
            Each carries a claim to be tested and a structural signal worth pursuing.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <LeadsList
            leads={DEMO_LEADS}
            onSelectLead={setSelectedLeadId}
          />
        </div>
      </div>

      {selectedLeadId && (
        <LeadDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}