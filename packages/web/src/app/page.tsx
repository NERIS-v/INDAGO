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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-title text-text-primary">Cases</h1>
          <p className="type-caption mt-1">
            Select a case to open its investigation workspace.
          </p>
        </div>
        <Link href="/investigations/new">
          <Button>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Investigation
          </Button>
        </Link>
      </div>

      <CaseList cases={providers.cases} mode={providers.mode} />
    </div>
  );
}