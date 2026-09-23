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
  const handleExportPdf = () => {
    window.print();
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          .ledger-print-root, .ledger-print-root * { visibility: visible !important; }

          html, body, main, #__next, .layout-wrapper {
            display: block !important;
            position: static !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          .ledger-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 32px !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #1a1815 !important;
          }

          .ledger-print-root .glass-panel {
            background: #ffffff !important;
            border: 1px solid #d8d2c8 !important;
            box-shadow: none !important;
            break-inside: avoid !important;
          }

          .ledger-print-root .text-surface-900,
          .ledger-print-root .text-surface-800,
          .ledger-print-root .text-semantic-foreground,
          .ledger-print-root .text-semantic-foreground-muted { color: #1a1815 !important; }

          .ledger-print-root .text-surface-700,
          .ledger-print-root .text-surface-600,
          .ledger-print-root .text-surface-500,
          .ledger-print-root .text-surface-400,
          .ledger-print-root .text-semantic-foreground-faint { color: #45403a !important; }

          .ledger-print-root .border-surface-200\\/30,
          .ledger-print-root .border-surface-200\\/40,
          .ledger-print-root .border-surface-200\\/60,
          .ledger-print-root .border-surface-200\\/70 { border-color: #d8d2c8 !important; }

          .ledger-print-root .border-surface-0 { border-color: #1a1815 !important; }

          .ledger-print-hide, .ledger-print-hide * { display: none !important; visibility: hidden !important; }
          .ledger-print-root .lg\\:p-0, .ledger-print-root .sm\\:pl-8 { padding: 0 !important; }
          .ledger-print-root .pl-6 { padding-left: 0 !important; }
        }
      ` }} />

      <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background ledger-print-root">
        <div className="mx-auto max-w-[1080px]">
          <header className="border-b border-semantic-border-subtle pb-8">
            <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              <span>Traceability</span>
              <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
              <span>Chain of custody</span>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
                  Reasoning ledger
                </h1>
                <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
                  Immutable audit record of autonomous inference, anomaly resolution, and
                  investigator intervention across the lifetime of this case.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportPdf}
                className="ledger-print-hide flex items-center gap-2 rounded-lg border border-semantic-border-subtle bg-semantic-surface-elevated px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-semantic-foreground transition-colors hover:bg-semantic-surface-soft hover:text-semantic-selection focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
                </svg>
                <span>Export PDF</span>
              </button>
            </div>
          </header>

          <div className="flex w-full flex-col pt-6">
            <ReasoningLedger events={DEMO_LEDGER} />
          </div>
        </div>
      </div>
    </>
  );
}