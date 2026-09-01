"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import type { DiscoveryCandidate } from "@/lib/providers/types";

interface DiscoveryPanelProps {
  investigationId: string;
  onFocusNode?: (nodeId: string) => void;
}

export function DiscoveryPanel({ investigationId, onFocusNode }: DiscoveryPanelProps) {
  const workspace = useWorkspace();
  const [items, setItems] = useState<DiscoveryCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.intelligence.listDiscovery(
        investigationId,
        { pageSize: 20 },
      );
      setItems(page.items);
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setItems([]);
      } else {
        setError(pe.message);
      }
    } finally {
      setLoading(false);
    }
  }, [workspace, investigationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="type-title text-text-primary">Discovery Mode</h2>
          <p className="text-xs text-text-muted">
            Structural exploration of the graph — not a relevance or "most
            involved" ranking.
          </p>
        </div>
        <Button variant="quiet" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {unavailable && !loading && (
        <EmptyState
          title="Discovery not available in this mode"
          description="Discovery Mode requires the full graph topology."
        />
      )}
      {loading && items === null && (
        <div className="flex justify-center py-10">
          <LoadingSpinner size="md" label="Deriving candidates" />
        </div>
      )}
      {error && <ErrorDisplay message={error} retry={() => void load()} />}
      {items && items.length === 0 && !loading && (
        <EmptyState
          title="No discovery candidates"
          description="The graph topology produced no structural candidates."
        />
      )}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((candidate, idx) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={onFocusNode ? () => onFocusNode(candidate.nodeId) : undefined}
                disabled={!onFocusNode}
                className="w-full rounded-xl border border-border-standard bg-surface-50 p-4 text-left transition-colors duration-fast ease-restrained hover:border-accent-rose/50 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-accent-rose disabled:opacity-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="type-mono-small text-text-faint">#{idx + 1}</span>
                    <span className="text-sm font-medium text-text-strong">
                      {candidate.label}
                    </span>
                  </div>
                  <Badge variant={candidate.contradictedEdgeIds.length ? "danger" : "muted"} dot>
                    {candidate.contradictedEdgeIds.length
                      ? `${candidate.contradictedEdgeIds.length} contradicted`
                      : "stable"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="type-mono-small text-text-muted">
                    degree {candidate.degree}
                  </span>
                  <ConfidenceIndicator
                    value={candidate.structuralImportance}
                    label="Importance"
                  />
                  <span className="type-mono-small text-text-muted">
                    {candidate.observationCount} obs · {candidate.sourceCount} sources
                  </span>
                </div>
                {candidate.bridgeNote && (
                  <p className="mt-2 text-xs text-accent-amber">
                    {candidate.bridgeNote}
                  </p>
                )}
                {candidate.reasons.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {candidate.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
                        <span aria-hidden className="mt-0.5 select-none">·</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
