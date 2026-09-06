"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import type { IntelligenceCandidateView, ObservationContradiction } from "@/lib/providers/types";

interface EntityResolutionPanelProps {
  investigationId: string;
  resolutionId: string;
  contradictions: readonly ObservationContradiction[];
  onClose: () => void;
  onOpenObservation?: (observationId: string) => void;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  UNRESOLVED: "warning",
  ACCEPTED: "accent",
  REJECTED: "danger",
  MERGED: "info",
  SPLIT: "info",
  PARTIALLY_RESOLVED: "info",
  RESOLVED: "info",
  CONTRADICTED: "danger",
  PROPOSED: "muted",
  REVERSED: "muted",
};

export function EntityResolutionPanel({
  investigationId,
  resolutionId,
  contradictions,
  onClose,
  onOpenObservation,
}: EntityResolutionPanelProps) {
  const workspace = useWorkspace();

  // F-PR16: Escape dismisses the modal resolution surface.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  const [view, setView] = useState<IntelligenceCandidateView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const v = await workspace.intelligence.getCandidate(
        investigationId,
        resolutionId,
      );
      setView(v);
    } catch (err) {
      setError(toProviderError(err).message);
    } finally {
      setLoading(false);
    }
  }, [workspace, investigationId, resolutionId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investigationId, resolutionId]);

  const decide = useCallback(
    async (action: "keep-unresolved" | "accept" | "reverse") => {
      setBusy(true);
      setError(null);
      try {
        let updated: IntelligenceCandidateView;
        if (action === "keep-unresolved") {
          updated = await workspace.intelligence.keepUnresolved(
            investigationId,
            resolutionId,
          );
        } else if (action === "accept") {
          updated = await workspace.intelligence.accept(investigationId, resolutionId);
        } else {
          updated = await workspace.intelligence.reverse(investigationId, resolutionId);
        }
        setView(updated);
      } catch (err) {
        setError(toProviderError(err).message);
      } finally {
        setBusy(false);
      }
    },
    [workspace, investigationId, resolutionId],
  );

  const status = view?.hypothesis.status ?? "UNRESOLVED";
  const relatedContradictions = view
    ? contradictions.filter((c) =>
        view.comparison.contradictingObservationIds?.includes(c.leftObservationId) ||
        view.comparison.contradictingObservationIds?.includes(c.rightObservationId),
      )
    : [];

  const comparisonEvidence = view?.comparison.comparisonEvidence ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-normal ease-restrained"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Entity resolution decision"
        className="relative flex h-full w-full max-w-lg flex-col bg-surface-50 border-l border-border-standard shadow-2xl animate-slide-in-right"
      >
        <div className="flex items-start justify-between border-b border-border-subtle bg-surface-0/50 p-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="warning" dot>Entity resolution</Badge>
              <span className="type-mono-small text-text-faint">
                {resolutionId.slice(0, 8)}
              </span>
            </div>
            {view && (
              <h2 className="type-title text-text-primary">
                Identity resolution candidate
              </h2>
            )}
          </div>
          <Button
            onClick={onClose}
            aria-label="Close panel"
            variant="quiet"
            size="sm"
            className="text-text-faint hover:text-text-primary hover:bg-surface-200 text-lg leading-none"
          >
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && !view && (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" label="Loading resolution" />
            </div>
          )}
          {error && !view && (
            <ErrorDisplay message={error} retry={() => void load()} />
          )}
          {!loading && !view && !error && (
            <EmptyState
              title="Resolution not available"
              description="The entity resolution candidate could not be loaded."
            />
          )}
          {view && (
            <div className="flex flex-col gap-6 animate-fade-in">
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="type-eyebrow">Decision status</h3>
                  <Badge variant={STATUS_VARIANT[status] ?? "muted"} dot>
                    {status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  The lifecycle status is set only by a deliberate analyst
                  decision below. A score never auto-resolves a candidate.
                </p>
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Pair under comparison</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CandidateCard
                    label="Left candidate"
                    text={view.left.text}
                    sourceId={view.left.provenance.sourceId}
                    linkedEntity={view.leftEntity}
                  />
                  <CandidateCard
                    label="Right candidate"
                    text={view.right.text}
                    sourceId={view.right.provenance.sourceId}
                    linkedEntity={view.rightEntity}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <ConfidenceIndicator value={view.comparison.score} label="Score" />
                  <span className="type-mono-small text-text-faint">
                    {view.comparison.scoreModelVersion}
                  </span>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Score is a ranking/support signal — it is not a probability and
                  does not decide status.
                </p>
              </section>

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Comparison evidence</h3>
                <div className="flex flex-col gap-2">
                  {comparisonEvidence.map((ev, idx) => (
                    <div
                      key={`${ev.feature}-${idx}`}
                      className="rounded-lg border border-border-standard bg-surface-0 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="type-mono-small text-text-strong uppercase">
                          {ev.feature}
                        </span>
                        <span className="type-mono-small text-text-muted">
                          {ev.relation} · weight {ev.weight}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-strong">{ev.reason}</p>
                    </div>
                  ))}
                </div>
              </section>

              {relatedContradictions.length > 0 && (
                <section className="border-t border-border-subtle pt-4">
                  <h3 className="type-eyebrow mb-3">Grounded contradiction</h3>
                  <div className="flex flex-col gap-3">
                    {relatedContradictions.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-danger/30 bg-danger/5 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="danger" dot>
                            {c.contradictionType.replace(/_/g, " ")}
                          </Badge>
                          <ConfidenceIndicator value={c.strength} label="Strength" />
                        </div>
                        <p className="mt-2 text-sm text-text-strong">{c.description}</p>
                        {onOpenObservation && (
                          <Button
                            variant="quiet"
                            size="sm"
                            className="mt-2"
                            onClick={() => onOpenObservation(c.leftObservationId)}
                          >
                            View observations
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="border-t border-border-subtle pt-4">
                <h3 className="type-eyebrow mb-3">Decide</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy || status === "ACCEPTED"}
                      onClick={() => void decide("accept")}
                    >
                      Accept identity
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={busy || status !== "ACCEPTED" && status !== "REJECTED"}
                      onClick={() => void decide("reverse")}
                    >
                      Reverse decision
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={busy}
                      onClick={() => void decide("keep-unresolved")}
                    >
                      Keep unresolved
                    </Button>
                  </div>
                  <p className="text-xs text-text-muted">
                    Decisions are deliberate and recorded in an audit trail. In
                    this demo, accepting a match records the decision only — it
                    does not merge canonical entities or rewire the graph.
                  </p>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateCard({
  label,
  text,
  sourceId,
  linkedEntity,
}: {
  label: string;
  text: string;
  sourceId: string;
  linkedEntity: { id: string; canonicalName: string } | null;
}) {
  return (
    <div className="rounded-lg border border-border-standard bg-surface-0 p-3">
      <div className="type-eyebrow mb-2">{label}</div>
      <p className="text-sm text-text-strong">{text}</p>
      <span className="type-mono-small text-text-faint">
        src:{sourceId.slice(0, 8)}
      </span>
      <div className="mt-2">
        {linkedEntity ? (
          <Badge variant="accent" dot>
            {linkedEntity.canonicalName}
          </Badge>
        ) : (
          <Badge variant="muted">No linked entity</Badge>
        )}
      </div>
    </div>
  );
}
