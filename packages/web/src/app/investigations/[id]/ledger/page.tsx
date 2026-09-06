"use client";

import { ReasoningLedger, type LedgerEventMock } from "@/components/intel/reasoning-ledger";

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
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Traceability</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Chain of custody</span>
          </div>
          <h1 className="mt-4 font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            Reasoning ledger
          </h1>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Immutable audit record of autonomous inference, anomaly resolution, and
            investigator intervention across the lifetime of this case.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <ReasoningLedger events={DEMO_LEDGER} />
        </div>
      </div>
    </div>
  );
}