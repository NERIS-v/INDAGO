"use client";

import type { EvidenceListItem } from "@/lib/api/types";
import { EvidenceItem } from "./evidence-item";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

interface EvidenceListProps {
  readonly items: EvidenceListItem[] | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry?: () => void;
  /** Live mode surfaces an explicit "not available" state instead of pretending. */
  readonly unavailable?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
}

export function EvidenceList({
  items,
  loading,
  error,
  onRetry,
  unavailable = false,
  emptyTitle = "No evidence yet",
  emptyDescription = "Evidence submitted for this investigation will appear here.",
}: EvidenceListProps) {
  if (unavailable && !loading) {
    return (
      <EmptyState
        title="Evidence listing not available in this mode"
        description="Submit evidence through the intake flow. The evidence catalog could not be loaded for this investigation."
        action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : undefined}
      />
    );
  }

  if (loading && items === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading evidence" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Could not load evidence"
        message={error}
        retry={onRetry}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((evidence, i) => (
        <EvidenceItem key={`${evidence.id}-${i}`} evidence={evidence} index={i} />
      ))}
    </ul>
  );
}