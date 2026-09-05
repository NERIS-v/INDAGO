"use client";

// ============================================================================
// PR-5 — Investigative Intelligence shared tab UI primitives
// ============================================================================

import type { ReactNode } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";

export function IntelligencePanel({ children }: { children: ReactNode }) {
  return <div data-intelligence-tab-body className="p-4">{children}</div>;
}

export function IntelligenceLoading({ label }: { label: string }) {
  return (
    <div
      data-intelligence-loading
      className="flex flex-col items-center justify-center gap-2 py-12"
    >
      <LoadingSpinner size="md" />
      <p className="text-[10px] font-mono uppercase tracking-widest text-surface-500 animate-pulse">
        {label}
      </p>
    </div>
  );
}

export function IntelligenceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-1" data-intelligence-error>
      <ErrorDisplay message={message} retry={onRetry} />
    </div>
  );
}

export function UnavailableState({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      data-intelligence-unavailable
      className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center"
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">{title}</p>
      <p className="type-caption max-w-md text-surface-400">{detail}</p>
    </div>
  );
}

export function EmptyIntelligenceState({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      data-intelligence-empty
      className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center"
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-surface-500">{title}</p>
      <p className="type-caption max-w-md text-surface-400">{detail}</p>
    </div>
  );
}

export function SelectOnGraphButton({
  onClick,
  id,
  label = "Select on graph",
}: {
  onClick: () => void;
  id: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      data-select-on-graph
      onClick={onClick}
      aria-label={`${label} (${id})`}
      className="shrink-0 rounded border border-brand-500/30 bg-brand-500/5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-brand-600 transition-colors hover:bg-brand-500/10 focus-visible:outline focus-visible:outline-brand-500"
    >
      {label}
    </button>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      data-context-stat
      className="flex flex-col gap-0.5 rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2"
    >
      <span className="type-caption text-surface-400">{label}</span>
      <span className="font-mono text-sm font-semibold text-surface-800" data-context-stat-value>
        {value}
      </span>
    </div>
  );
}

export function StatGrid({ stats }: { stats: readonly { label: string; value: string }[] }) {
  return (
    <div
      data-context-stat-grid
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {stats.map((s) => (
        <StatCard key={s.label} label={s.label} value={s.value} />
      ))}
    </div>
  );
}

export function ClauseList({ clauses }: { clauses: readonly string[] }) {
  return (
    <ul data-context-clauses className="space-y-1.5">
      {clauses.map((clause, i) => (
        <li key={i} className="type-caption text-surface-600">
          <span className="mr-2 text-brand-500" aria-hidden>
            —
          </span>
          {clause}
        </li>
      ))}
    </ul>
  );
}