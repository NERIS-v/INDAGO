"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createCaseListProviders } from "@/lib/providers";
import { CaseList } from "@/components/case-list/case-list";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const providers = useMemo(() => createCaseListProviders(), []);

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">
            <span>Case workspace</span>
            <span className="h-px w-8 bg-surface-200" aria-hidden="true" />
            <span>INDAGO</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="type-title text-text-primary">Cases</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-surface-50 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  providers.mode === "live" ? "bg-success" : "bg-amber-400"
                }`}
                aria-hidden="true"
              />
              {providers.mode}
            </span>
          </div>
          <p className="type-caption mt-1.5 text-text-muted">
            Select a case to open its investigation workspace.
          </p>
        </div>
        <Link href="/investigations/new" className="shrink-0">
          <Button>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Investigation
          </Button>
        </Link>
      </header>

      <CaseList cases={providers.cases} mode={providers.mode} />
    </div>
  );
}