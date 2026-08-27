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
          <span className="type-caption">Status</span>
          <span className="text-sm text-text-secondary">{statusLabel}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="type-caption">Run ID</span>
          <span className="type-mono-small truncate">{investigation.id}</span>
        </div>
        {investigation.currentStage && (
          <div className="flex items-center justify-between text-sm">
            <span className="type-caption">Stage</span>
            <span className="text-sm text-text-secondary">{investigation.currentStage}</span>
          </div>
        )}
        {investigation.error && (
          <div
            role="alert"
            className="mt-2 rounded-lg border border-danger/15 bg-danger/5 p-3 text-xs text-danger"
          >
            {investigation.error}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border-subtle pt-1 type-mono-small">
          <span>Last updated</span>
          <span>{new Date(investigation.updatedAt).toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}
