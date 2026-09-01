"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { Observation } from "@indago/contracts";
import { ObservationsList } from "@/components/observations/observations-list";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IntelligenceDetailPanel } from "@/components/intelligence/intelligence-detail-panel";
import { EntityResolutionPanel } from "@/components/intelligence/entity-resolution-panel";
import type {
  ObservationContradiction,
  IntelligenceCandidateView,
} from "@/lib/providers/types";

type Selection =
  | { kind: "observation"; observationId: string }
  | { kind: "resolution"; resolutionId: string };

export default function ObservationsPage() {
  return (
    <Suspense fallback={null}>
      <ObservationsContent />
    </Suspense>
  );
}

function ObservationsContent() {
  const workspace = useWorkspace();
  const searchParams = useSearchParams();
  const entityFilter = searchParams?.get("entity") ?? null;
  const [items, setItems] = useState<Observation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [contradictions, setContradictions] = useState<ObservationContradiction[]>([]);
  const [contradictionsUnavailable, setContradictionsUnavailable] = useState(false);
  const [resolutions, setResolutions] = useState<IntelligenceCandidateView[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await workspace.observations.listByInvestigation(
        workspace.investigationId,
        { pageSize: 100 },
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
  }, [workspace]);

  const loadContradictions = useCallback(async () => {
    try {
      const page = await workspace.intelligence.listContradictions(
        workspace.investigationId,
        { pageSize: 100 },
      );
      setContradictions(page.items);
      setContradictionsUnavailable(false);
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") setContradictionsUnavailable(true);
    }
  }, [workspace]);

  const loadResolutions = useCallback(async () => {
    try {
      const page = await workspace.intelligence.listCandidates(
        workspace.investigationId,
        { pageSize: 100 },
      );
      setResolutions(page.items);
    } catch {
      // Resolution queue is supplementary; ignore failures here.
    }
  }, [workspace]);

  useEffect(() => {
    void load();
    void loadContradictions();
    void loadResolutions();
  }, [load, loadContradictions, loadResolutions]);

  const contradictionsById = useCallback(() => {
    const map = new Map<string, ObservationContradiction[]>();
    for (const c of contradictions) {
      map.set(c.leftObservationId, [...(map.get(c.leftObservationId) ?? []), c]);
      map.set(c.rightObservationId, [...(map.get(c.rightObservationId) ?? []), c]);
    }
    return map;
  }, [contradictions]);

  const selectedObservation =
    selection?.kind === "observation" ? selection.observationId : null;
  const selectedResolution =
    selection?.kind === "resolution" ? selection.resolutionId : null;

  // ?entity=<id> deep link: narrow the feed to observations linked to one
  // canonical entity (used by the entity drawer "View linked observations").
  const filteredItems = entityFilter
    ? (items ?? []).filter((o) => o.entityIds.includes(entityFilter))
    : items;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-text-primary">Observations</h1>
        <Badge variant="muted">Canonical Observations</Badge>
        {entityFilter && (
          <Badge variant="info" dot>
            filtered to entity {entityFilter.slice(0, 8)}
          </Badge>
        )}
        {!contradictionsUnavailable && contradictions.length > 0 && (
          <Badge variant="danger" dot>
            {contradictions.length} contradiction
            {contradictions.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {!contradictionsUnavailable && contradictions.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border-subtle px-6 py-4">
            <CardTitle>Detected contradictions</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 p-6">
            {contradictions.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-danger/30 bg-danger/5 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="danger" dot>
                    {c.contradictionType.replace(/_/g, " ")}
                  </Badge>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() =>
                      setSelection({ kind: "observation", observationId: c.leftObservationId })
                    }
                  >
                    Open observations
                  </Button>
                </div>
                <p className="mt-2 text-sm text-text-strong">{c.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border-subtle px-6 py-4">
          <CardTitle>Observations in this investigation</CardTitle>
        </CardHeader>
        <div className="p-6">
          <ObservationsList
            items={filteredItems}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
            contradictionsById={contradictionsById()}
            onSelectObservation={(id) =>
              setSelection({ kind: "observation", observationId: id })
            }
            emptyTitle={
              entityFilter
                ? "No observations linked to this entity"
                : undefined
            }
            emptyDescription={
              entityFilter
                ? "This canonical entity has no observations in the current feed."
                : undefined
            }
          />
        </div>
      </Card>

      {resolutions.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border-subtle px-6 py-4">
            <CardTitle>Entity resolution queue</CardTitle>
          </CardHeader>
          <div className="p-6">
            <ul className="flex flex-col gap-3">
              {resolutions.map((candidate) => (
                <li key={candidate.resolutionId}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelection({
                        kind: "resolution",
                        resolutionId: candidate.resolutionId,
                      })
                    }
                    className="w-full rounded-xl border border-border-standard bg-surface-50 p-4 text-left transition-colors duration-fast ease-restrained hover:border-accent-rose/50 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-accent-rose"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-text-strong">
                        Unresolved identity: {candidate.left.text} vs{" "}
                        {candidate.right.text}
                      </span>
                      <Badge
                        variant={candidate.hypothesis.status === "ACCEPTED" ? "accent" : "warning"}
                        dot
                      >
                        {candidate.hypothesis.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      score {candidate.comparison.score} ·{" "}
                      {candidate.left.provenance.sourceId.slice(0, 8)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {selectedObservation && (
        <IntelligenceDetailPanel
          investigationId={workspace.investigationId}
          observationId={selectedObservation}
          contradictions={contradictions}
          onClose={() => setSelection(null)}
          onSelectObservation={(id) => setSelection({ kind: "observation", observationId: id })}
        />
      )}
      {selectedResolution && (
        <EntityResolutionPanel
          investigationId={workspace.investigationId}
          resolutionId={selectedResolution}
          contradictions={contradictions}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}
