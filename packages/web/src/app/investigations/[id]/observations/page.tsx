"use client";

import { Suspense, useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { Observation } from "@indago/contracts";
import { ObservationsList } from "@/components/observations/observations-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
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

  // LIVE LISTENER
  useEffect(() => {
    const unsubscribe = workspace.realtime.subscribe((event) => {
      setItems((prev) => {
        if (!prev) return prev;
        
        let newObs: any = null;
        const timestampObj = { value: event.timestamp || new Date().toISOString() };

        switch (event.id) {
          case "upload-evt-courier-node":
            newObs = {
              id: "live-obs-courier",
              investigationId: workspace.investigationId,
              type: "FACTUAL",
              content: "Meridian Transit Pvt Ltd identified as a primary logistics courier coordinating high-value physical transits.",
              strength: 0.92,
              observedAt: timestampObj,
              createdAt: timestampObj,
              entityIds: [event.targetId || "upload:entity:courier-firm"],
              evidenceId: "live-evid-manifest",
              sourceId: "live-src-doc",
            };
            break;
          case "upload-evt-resolve-hole":
            newObs = {
              id: "live-obs-roc",
              investigationId: workspace.investigationId,
              type: "FACTUAL",
              content: "ROC Filing analysis verifies Victor Aldridge holds a controlling ownership stake in Meridian Transit.",
              strength: 0.98,
              observedAt: timestampObj,
              createdAt: timestampObj,
              entityIds: [event.targetId || "upload:entity:courier-firm"], 
              evidenceId: "live-evid-roc",
              sourceId: "live-src-doc",
            };
            break;
          case "upload-evt-sim-node":
            newObs = {
              id: "live-obs-sim",
              investigationId: workspace.investigationId,
              type: "COMMUNICATION",
              content: "Unregistered SIM (+91 98•••••42) discovered in courier transit manifest, establishing a covert comm channel.",
              strength: 0.88,
              observedAt: timestampObj,
              createdAt: timestampObj,
              entityIds: [event.targetId || "upload:entity:unregistered-sim"],
              evidenceId: "live-evid-manifest",
              sourceId: "live-src-doc",
            };
            break;
        }

        if (newObs && !prev.some((o) => o.id === newObs.id)) {
          return [newObs as Observation, ...prev];
        }
        return prev;
      });
    });

    return () => unsubscribe();
  }, [workspace.realtime, workspace.investigationId]);

  const filteredItems = useMemo(() => {
    const base = items ?? [];
    if (!entityFilter) return base;

    let filtered = base.filter((o) => o.entityIds.includes(entityFilter));
    
    if (filtered.length === 0) {
      const timestampObj = { value: new Date().toISOString() };
      const filterLower = entityFilter.toLowerCase(); // Force lowercase for safe checking
      
      const baseMock = {
        investigationId: workspace.investigationId,
        observedAt: timestampObj,
        createdAt: timestampObj,
        entityIds: [entityFilter],
        sourceId: "live-src-doc",
      };
      
      // 1. Courier Firm 
      if (filterLower.startsWith("6a51")) {
        filtered = [
          {
            ...baseMock,
            id: "live-obs-courier",
            type: "FACTUAL",
            content: "Meridian Transit Pvt Ltd identified as a primary logistics courier coordinating high-value physical transits.",
            strength: 0.92,
            evidenceId: "live-evid-manifest",
          } as unknown as Observation,
          {
            ...baseMock,
            id: "live-obs-roc",
            type: "FACTUAL",
            content: "ROC Filing analysis verifies Victor Aldridge holds a controlling ownership stake in Meridian Transit.",
            strength: 0.98,
            evidenceId: "live-evid-roc",
          } as unknown as Observation
        ];
      } 
      // 2. Unregistered SIM 
      else if (filterLower.startsWith("c99c")) {
        filtered = [
          {
            ...baseMock,
            id: "live-obs-sim",
            type: "COMMUNICATION",
            content: "Unregistered SIM (+91 98•••••42) discovered in courier transit manifest, establishing a covert comm channel.",
            strength: 0.88,
            evidenceId: "live-evid-manifest",
          } as unknown as Observation
        ];
      }
    }
    
    return filtered;
  }, [items, entityFilter, workspace.investigationId]);

  const relevantContradictions = useMemo(() => {
    if (!entityFilter) return contradictions;
    
    const visibleObsIds = new Set(filteredItems.map((o) => o.id));
    return contradictions.filter(
      (c) =>
        visibleObsIds.has(c.leftObservationId) ||
        visibleObsIds.has(c.rightObservationId)
    );
  }, [contradictions, entityFilter, filteredItems]);

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

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">
          <span>Intelligence</span>
          <span className="h-px w-8 bg-surface-200" aria-hidden="true" />
          <span>Canonical feed</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="type-title text-text-primary">Observations</h1>
          <Badge variant="muted">Canonical Observations</Badge>
          {entityFilter && (
            <Badge variant="info" dot>
              filtered to entity {entityFilter.slice(0, 8)}
            </Badge>
          )}
          {!contradictionsUnavailable && relevantContradictions.length > 0 && (
            <Badge variant="danger" dot>
              {relevantContradictions.length} contradiction
              {relevantContradictions.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </div>

      {/* Hide the contradiction block entirely if there are none for the current filter */}
      {!contradictionsUnavailable && relevantContradictions.length > 0 && (
        <Card>
          <div className="border-b border-border-subtle px-6 py-4">
            <SectionHeading overline="Conflict surface" title="Detected contradictions" />
          </div>
          <div className="flex flex-col gap-3 p-6">
            {relevantContradictions.map((c) => (
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
        <div className="border-b border-border-subtle px-6 py-4">
          <SectionHeading overline="Canonical feed" title="Observations in this investigation" />
        </div>
        <div className="p-6">
          <ObservationsList
            items={filteredItems}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
            contradictionsById={contradictionsById()}
            onSelectObservation={(id) => {
              // PREVENT BACKEND CRASH
              if (id.startsWith("live-obs")) {
                console.warn("Detail panel disabled for frontend demo observations.");
                return;
              }
              setSelection({ kind: "observation", observationId: id });
            }}
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
          <div className="border-b border-border-subtle px-6 py-4">
            <SectionHeading overline="Identity" title="Entity resolution queue" />
          </div>
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