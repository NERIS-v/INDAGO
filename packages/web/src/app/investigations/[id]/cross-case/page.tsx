"use client";

import { CrossCaseSignals } from "@/components/intel/cross-case-signals";

export default function CrossCasePage() {
  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Analysis</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Comparative</span>
          </div>
          <h1 className="mt-4 font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            Cross-case signals
          </h1>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Potential overlaps between this investigation and the global case
            registry — entities, communication channels, and financial infrastructure
            that recur across otherwise-isolated operations.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <CrossCaseSignals />
        </div>
      </div>
    </div>
  );
}