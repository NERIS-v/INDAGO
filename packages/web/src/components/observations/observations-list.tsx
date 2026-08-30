"use client";

import type { Observation } from "@indago/contracts";
import { ObservationItem } from "./observation-item";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

interface ObservationsListProps {
  readonly items: Observation[] | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry?: () => void;
  /** Live mode surfaces an explicit "not available" state instead of pretending. */
  readonly unavailable?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
}

export function ObservationsList({
  items,
  loading,
  error,
  onRetry,
  unavailable = false,
  emptyTitle = "No observations yet",
  emptyDescription = "Observations extracted from ingested evidence will appear here.",
}: ObservationsListProps) {
  if (unavailable && !loading) {
    return (
      <EmptyState
        title="Observations listing not available in this mode"
        description="Observations could not be loaded for this investigation."
        action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : undefined}
      />
    );
  }

  if (loading && items === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner label="Loading observations" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Could not load observations"
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
      {items.map((observation) => (
        <ObservationItem key={observation.id} observation={observation} />
      ))}
    </ul>
  );
}