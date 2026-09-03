"use client";

import { ReasoningLedger, type LedgerEventMock } from "@/components/intel/reasoning-ledger";
import { Badge } from "@/components/ui/badge";

const DEMO_LEDGER: LedgerEventMock[] = [
  {
    id: "evt-004",
    timestamp: "2024-06-18T12:02:00.000Z",
    title: "Investigative Gap Classified",
    context:
      "System identified structural graph-hole around Meridian Transit Pvt Ltd. Ownership status unresolved. Evidence request queued.",
    status: "SYSTEM",
  },
  {
    id: "evt-003",
    timestamp: "2024-06-18T12:01:45.000Z",
    title: "Lead Generated: Covert Ownership",
    context:
      "Structural pattern indicates Victor Aldridge exercises covert ownership of Meridian Transit via intermediary accounts. Robustness score: 87/100.",
    status: "PENDING",
  },
  {
    id: "evt-002",
    timestamp: "2024-06-18T12:00:30.000Z",
    title: "Entity Resolved: Meridian Transit",
    context:
      "Extracted organization entity merged with known logistics shell cluster based on Panama registry identifiers.",
    evidenceRef: "live-evid-manifest",
    status: "HUMAN_REVIEWED",
  },
  {
    id: "evt-001",
    timestamp: "2024-06-18T12:00:00.000Z",
    title: "Evidence Ingested: Transit Manifests",
    context:
      "Batch of 4 documents parsed and vectorized. 12 factual observations extracted.",
    status: "SYSTEM",
  },
];

export default function LedgerPage() {
  return (
    <div className="relative mx-auto max-w-6xl space-y-8 p-8 animate-fade-in">
      {/* TACTICAL PAGE HEADER */}
      <header className="space-y-4 border-b border-surface-200/50 pb-6">
        <div className="flex flex-col gap-1">
          <span className="type-mono-small text-accent-rose font-bold uppercase tracking-widest">
            Audit Trail // Chain of Custody
          </span>

          <div className="flex flex-wrap items-center gap-4 mt-1">
            <h1 className="text-3xl font-light text-surface-900 tracking-tight">
              Reasoning Ledger
            </h1>
            <Badge variant="accent" dot className="bg-accent-rose/10 border-accent-rose/30 backdrop-blur-md">
              Append-Only Ledger
            </Badge>
          </div>
        </div>

        <p className="text-sm text-surface-700 max-w-3xl leading-relaxed font-sans">
          Immutable audit record tracing autonomous inference sequences, anomaly resolutions, and investigator interventions across the lifetime of this case.
        </p>
      </header>

      {/* MAIN MODULE MOUNT */}
      <div className="w-full">
        <ReasoningLedger events={DEMO_LEDGER} />
      </div>
    </div>
  );
}