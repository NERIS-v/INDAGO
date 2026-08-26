"use client";

import { STATE_LABELS } from "@/lib/contracts/types";

interface StateBadgeProps {
  readonly state: string;
  readonly className?: string;
}

const VARIANT_MAP: Record<string, string> = {
  CREATED: "bg-surface-200/50 text-surface-500 border-surface-300/30",
  INGESTING: "bg-info/10 text-info/80 border-info/20",
  NORMALIZING: "bg-warning/10 text-warning/80 border-warning/20",
  ANALYZING: "bg-brand-500/10 text-brand-500/80 border-brand-500/20",
  DISCOVERING: "bg-info/10 text-info/80 border-info/20",
  COMPLETED: "bg-success/10 text-success/80 border-success/20",
  FAILED: "bg-danger/10 text-danger/80 border-danger/20",
  PAUSED: "bg-surface-200/30 text-surface-500 border-surface-300/20",
};

export function StateBadge({ state, className = "" }: StateBadgeProps) {
  const label = STATE_LABELS[state] ?? state;
  const variant = VARIANT_MAP[state] ?? "bg-surface-200/50 text-surface-500 border-surface-300/30";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase border ${variant} ${className}`}
      data-testid="state-badge"
    >
      {label}
    </span>
  );
}
