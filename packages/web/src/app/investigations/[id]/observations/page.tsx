"use client";

import { Suspense, useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type { Observation } from "@indago/contracts";
import { ObservationsList } from "@/components/observations/observations-list";
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

  const obsLookup = useMemo(() => {
    const map = new Map<string, Observation>();
    for (const o of filteredItems) map.set(o.id, o);
    return map;
  }, [filteredItems]);

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Intelligence</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Canonical feed</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Observations
            </h1>
            {entityFilter && (
              <span className="rounded-full border border-semantic-accent/30 bg-semantic-accent/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-accent">
                Filtered to entity {entityFilter.slice(0, 8)}
              </span>
            )}
            {!contradictionsUnavailable && relevantContradictions.length > 0 && (
              <span className="rounded-full border border-semantic-contradiction/30 bg-semantic-contradiction/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-contradiction">
                {relevantContradictions.length} contradiction{relevantContradictions.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Observations extracted from evidence in this investigation. Each entry
            is a canonical statement derived from source material.
          </p>
        </header>

        {/* ── CONTRADICTION COMPARISON ─────────────────────────────────── */}
        {!contradictionsUnavailable && relevantContradictions.length > 0 && (
          <section className="pt-10">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                Conflict surface
              </span>
              <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[0.9375rem] text-semantic-foreground-muted">
              Contradictions represent explicit conflicts between observations that
              cannot both be true. Each pair below surfaces a direct factual
              inconsistency.
            </p>
            <div className="mt-6 space-y-8">
              {relevantContradictions.map((c) => {
                const leftObs = obsLookup.get(c.leftObservationId);
                const rightObs = obsLookup.get(c.rightObservationId);
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-semantic-contradiction/20 bg-semantic-contradiction/[0.03] p-6"
                  >
                    <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-semantic-contradiction">
                      <span>{c.contradictionType.replace(/_/g, " ")}</span>
                      {c.strength !== undefined && (
                        <>
                          <span className="h-px w-4 bg-semantic-contradiction/20" aria-hidden="true" />
                          <span>strength {c.strength.toFixed(2)}</span>
                        </>
                      )}
                    </div>

                    <div className="mt-5 grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
                      {/* Left observation */}
                      <button
                        type="button"
                        onClick={() =>
                          setSelection({ kind: "observation", observationId: c.leftObservationId })
                        }
                        className="text-left rounded-md border border-semantic-border-subtle bg-semantic-surface p-4 transition-colors duration-fast hover:bg-semantic-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-rose"
                      >
                        <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                          {c.leftObservationId.slice(0, 8)}
                        </span>
                        {leftObs ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-semantic-foreground">
                            {leftObs.content}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm italic text-semantic-foreground-faint">
                            Observation unavailable
                          </p>
                        )}
                      </button>

                      {/* ≠ marker */}
                      <span className="flex items-center justify-center font-mono text-xl font-extralight text-semantic-contradiction select-none" aria-label="contradicts">
                        ≠
                      </span>

                      {/* Right observation */}
                      <button
                        type="button"
                        onClick={() =>
                          setSelection({ kind: "observation", observationId: c.rightObservationId })
                        }
                        className="text-left rounded-md border border-semantic-border-subtle bg-semantic-surface p-4 transition-colors duration-fast hover:bg-semantic-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-rose"
                      >
                        <span className="font-mono text-[9px] uppercase tracking-widest text-semantic-foreground-faint">
                          {c.rightObservationId.slice(0, 8)}
                        </span>
                        {rightObs ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-semantic-foreground">
                            {rightObs.content}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm italic text-semantic-foreground-faint">
                            Observation unavailable
                          </p>
                        )}
                      </button>
                    </div>

                    {c.description && (
                      <p className="mt-4 text-sm leading-relaxed text-semantic-foreground-muted">
                        {c.description}
                      </p>
                    )}

                    {c.evidenceIds.length > 0 && (
                      <p className="mt-3 font-mono text-[10px] text-semantic-foreground-faint">
                        {c.evidenceIds.length} evidence sources referenced
                      </p>
                    )}                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── OBSERVATIONS JOURNAL ────────────────────────────────────── */}
        <section className="pt-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Canonical feed
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
            {!loading && items !== null && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                {String(filteredItems.length).padStart(2, "0")}
              </span>
            )}
          </div>
          <ObservationsList
            items={filteredItems}
            loading={loading}
            error={error}
            unavailable={unavailable}
            onRetry={() => void load()}
            contradictionsById={contradictionsById()}
            onSelectObservation={(id) => {
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
        </section>

        {/* ── ENTITY RESOLUTION QUEUE ─────────────────────────────────── */}
        {resolutions.length > 0 && (
          <section className="pt-10 pb-6">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                Identity
              </span>
              <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                {String(resolutions.length).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-5">
              <ul className="divide-y divide-semantic-border-subtle">
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
                      className="w-full py-4 text-left transition-colors duration-fast hover:bg-semantic-surface-elevated rounded-lg px-3 -mx-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-rose"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-semantic-foreground">
                          {candidate.left.text}
                          <span className="mx-2 font-mono text-[10px] text-semantic-foreground-faint">vs</span>
                          {candidate.right.text}
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                          candidate.hypothesis.status === "ACCEPTED"
                            ? "text-semantic-accent border border-semantic-accent/30 bg-semantic-accent/5"
                            : "text-semantic-warning border border-semantic-warning/30 bg-semantic-warning/5"
                        }`}>
                          {candidate.hypothesis.status}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-semantic-foreground-faint">
                        score {candidate.comparison.score} · {candidate.left.provenance.sourceId.slice(0, 8)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>

      {/* ── DETAIL / RESOLUTION PANELS ──────────────────────────────── */}
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