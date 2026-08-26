"use client";

import { STATUS_LABELS } from "@/lib/contracts/types";
import { StateBadge } from "./state-badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvestigationStatusResponse } from "@/lib/api/types";

interface InvestigationStatusProps {
  readonly investigation: InvestigationStatusResponse;
  readonly className?: string;
}

export function InvestigationStatus({
  investigation,
  className = "",
}: InvestigationStatusProps) {
  const statusLabel =
    STATUS_LABELS[investigation.status] ?? investigation.status;

  return (
    <Card className={className}>
      <CardHeader className="mb-4">
        <CardTitle>Status</CardTitle>
        <StateBadge state={investigation.state} />
      </CardHeader>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-500">Status</span>
          <span className="text-surface-700">{statusLabel}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-500">Run ID</span>
          <span className="font-mono text-[11px] text-surface-500">{investigation.id}</span>
        </div>
        {investigation.currentStage && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-500">Stage</span>
            <span className="text-surface-700">{investigation.currentStage}</span>
          </div>
        )}
        {investigation.error && (
          <div className="mt-2 rounded-lg bg-danger/10 p-3 text-xs text-danger/80 border border-danger/20">
            {investigation.error}
          </div>
        )}
        <div className="flex items-center justify-between text-[11px] text-surface-500 pt-1 border-t border-surface-200/30">
          <span>Last updated</span>
          <span>{new Date(investigation.updatedAt).toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}
