"use client";

import { useState } from "react";
import { GapsList, type GapMock } from "@/components/intel/gaps-list";
import { GapDrawer } from "@/components/drawers/gap-drawer";

// Deterministic mock data
const DEMO_GAPS: GapMock[] = [
  {
    id: "gap-meridian-ownership",
    holeType: "ISOLATED_NODE",
    missingRelationship: "Meridian Transit Pvt Ltd has no resolved ownership record — beneficial owner unconfirmed.",
    affectedEntities: ["Meridian Transit Pvt Ltd"],
    impact: "HIGH",
    status: "OPEN",
  },
  {
    id: "gap-witness-comm",
    holeType: "MISSING_COMPARISON",
    missingRelationship: "Unidentified Witness communication channel to Victor Aldridge is inferred but lacks direct CDR evidence.",
    affectedEntities: ["Unidentified Witness", "Victor Aldridge"],
    impact: "MODERATE",
    status: "EVIDENCE_REQUESTED",
  },
  {
    id: "gap-financial-bridge",
    holeType: "INFRASTRUCTURE_GAP",
    missingRelationship: "Payment routing between Aldridge Holdings S.A. and Intermediary Account 0093 is obscured by missing ledger.",
    affectedEntities: ["Aldridge Holdings S.A.", "Intermediary Account 0093"],
    impact: "HIGH",
    status: "RESOLVED",
  }
];

export default function GapsPage() {
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);

  const openCount = DEMO_GAPS.filter(g => g.status === "OPEN").length;

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Intelligence</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Structural analysis</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Investigative gaps
            </h1>
            <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
              {String(DEMO_GAPS.length).padStart(2, "0")} recorded
            </span>
            {openCount > 0 && (
              <span className="rounded-full border border-semantic-warning/30 bg-semantic-warning/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-warning">
                {openCount} open
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Structural holes, missing relationships, and unresolved dependencies
            across the case graph. Each gap represents an unknown that prevents
            complete analysis.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <GapsList
            gaps={DEMO_GAPS}
            onSelectGap={setSelectedGapId}
          />
        </div>
      </div>

      {selectedGapId && (
        <GapDrawer 
          gapId={selectedGapId} 
          onClose={() => setSelectedGapId(null)} 
        />
      )}
    </div>
  );
}