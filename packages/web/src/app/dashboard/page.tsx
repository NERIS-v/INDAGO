"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createCaseListProviders } from "@/lib/providers";
import { CaseList } from "@/components/case-list/case-list";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const providers = useMemo(() => createCaseListProviders(), []);

  return (
    <div className="min-h-screen bg-semantic-surface animate-fade-in">
      <header className="border-b border-semantic-border px-10 py-8">
        <div className="mx-auto max-w-[1440px] flex items-end justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              <span>INDAGO</span>
              <span className="h-px w-12 bg-semantic-border" aria-hidden="true" />
              <span>Command Center</span>
            </div>
            <h1 className="font-display text-[1.75rem] font-light tracking-[-0.01em] text-semantic-foreground">
              Dashboard
            </h1>
            <p className="type-caption text-semantic-foreground-muted">
              Investigation workload and operational status
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/investigations/new">
              <Button>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Investigation
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-10 py-8">
        <CaseList
          cases={providers.cases}
          mode={providers.mode}
          enrichment={providers.enrichment}
          topology={providers.topology}
        />
      </main>
    </div>
  );
}