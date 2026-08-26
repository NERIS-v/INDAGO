"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const recentInvestigations = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    caseId: "case-042",
    state: "ANALYZING",
    status: "RUNNING",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440001",
    caseId: "case-043",
    state: "CREATED",
    status: "QUEUED",
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
  {
    id: "770e8400-e29b-41d4-a716-446655440002",
    caseId: "case-044",
    state: "COMPLETED",
    status: "COMPLETED",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

const STATE_BADGE_VARIANT: Record<string, "info" | "success" | "warning" | "danger" | "muted"> = {
  CREATED: "muted",
  INGESTING: "info",
  NORMALIZING: "warning",
  ANALYZING: "info",
  DISCOVERING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  PAUSED: "muted",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-wide text-surface-800">Dashboard</h1>
          <p className="text-xs text-surface-500 mt-1">
            Overview of your investigations and recent activity.
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card padding="md">
          <p className="text-[11px] font-medium tracking-wide uppercase text-surface-500">Total Investigations</p>
          <p className="mt-2 text-2xl font-light text-surface-800">{recentInvestigations.length}</p>
        </Card>
        <Card padding="md">
          <p className="text-[11px] font-medium tracking-wide uppercase text-surface-500">Active</p>
          <p className="mt-2 text-2xl font-light text-brand-500">
            {recentInvestigations.filter((i) => i.status === "RUNNING").length}
          </p>
        </Card>
        <Card padding="md">
          <p className="text-[11px] font-medium tracking-wide uppercase text-surface-500">Completed</p>
          <p className="mt-2 text-2xl font-light text-success/80">
            {recentInvestigations.filter((i) => i.status === "COMPLETED").length}
          </p>
        </Card>
      </div>

      <Card padding="none">
        <div className="border-b border-surface-200/40 px-6 py-4">
          <h2 className="text-xs font-medium tracking-wide uppercase text-surface-500">Recent Investigations</h2>
        </div>
        <div className="divide-y divide-surface-200/30">
          {recentInvestigations.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg className="mx-auto h-10 w-10 text-surface-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <p className="mt-3 text-sm font-medium text-surface-600">No investigations yet</p>
              <p className="mt-1 text-xs text-surface-500">Get started by creating your first investigation.</p>
              <div className="mt-4">
                <Link href="/investigations/new">
                  <Button size="sm">New Investigation</Button>
                </Link>
              </div>
            </div>
          ) : (
            recentInvestigations.map((inv) => (
              <Link
                key={inv.id}
                href={`/investigations/${inv.id}?caseId=${encodeURIComponent(inv.caseId)}`}
                className="flex items-center justify-between px-6 py-4 transition-all duration-500 hover:bg-surface-100/50"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-200/50 text-surface-500">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-surface-700 truncate">{inv.caseId}</p>
                    <p className="text-[11px] text-surface-500 font-mono truncate">{inv.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={STATE_BADGE_VARIANT[inv.state] ?? "default"}>
                    {inv.state}
                  </Badge>
                  <span className="text-[11px] text-surface-500 whitespace-nowrap">{timeAgo(inv.createdAt)}</span>
                  <svg className="h-3.5 w-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
