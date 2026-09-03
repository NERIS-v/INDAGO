"use client";

import { useState } from "react";
import { GapsList, type GapMock } from "@/components/intel/gaps-list";
import { GapDrawer } from "@/components/drawers/gap-drawer";
import { Badge } from "@/components/ui/badge";

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
    <div className="relative mx-auto max-w-6xl space-y-8 p-8 animate-fade-in">
      
      {/* TACTICAL PAGE HEADER */}
      <header className="space-y-4 border-b border-surface-200/50 pb-6">
        <div className="flex flex-col gap-1">
          <span className="type-mono-small text-accent-amber font-bold uppercase tracking-widest">
            System Module // Structural Analysis
          </span>
          
          <div className="flex flex-wrap items-center gap-4 mt-1">
            <h1 className="text-3xl font-light text-surface-900 tracking-tight">
              Investigative Gaps
            </h1>
            {openCount > 0 ? (
              <Badge variant="warning" dot className="bg-warning/10 border-warning/30 backdrop-blur-md text-surface-900">
                {openCount} Vulnerabilities Detected
              </Badge>
            ) : (
              <Badge variant="success" dot className="bg-success/10 border-success/30 backdrop-blur-md text-surface-900">
                Graph Topology Stable
              </Badge>
            )}
          </div>
        </div>
        
        <p className="text-sm text-surface-700 max-w-3xl leading-relaxed font-sans">
          INDAGO continuously analyzes the case graph for structural holes, missing relationships, and isolated nodes. Unresolved gaps prevent the system from computing complete confidence scores across connected components.
        </p>
      </header>

      {/* MAIN MODULE MOUNT */}
      <div className="w-full">
        <GapsList 
          gaps={DEMO_GAPS} 
          onSelectGap={setSelectedGapId} 
        />
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