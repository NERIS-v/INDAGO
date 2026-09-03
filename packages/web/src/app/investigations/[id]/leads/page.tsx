"use client";

import { useState } from "react";
import { LeadsList, type LeadMock } from "@/components/intel/leads-list";
import { LeadDrawer } from "@/components/drawers/lead-drawer";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-surface-900">Investigative Leads</h1>
        <Badge variant="muted">Canonical Leads</Badge>
        <Badge variant="warning" dot>
          1 Pending Review
        </Badge>
      </div>

      <div className="w-full">
        <LeadsList 
          leads={DEMO_LEADS} 
          onSelectLead={setSelectedLeadId} 
        />
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