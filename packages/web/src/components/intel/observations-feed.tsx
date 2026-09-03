"use client";

import { useState, useEffect, useMemo } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import type { Observation } from "@indago/contracts";  
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";

function formatObsDate(dateInput: any) {
  if (!dateInput) return "--";
  const val = typeof dateInput === "object" && dateInput !== null && 'value' in dateInput 
    ? dateInput.value 
    : dateInput;
    
  return new Date(val).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ObservationsFeed() {
  const workspace = useWorkspace();
  const [observations, setObservations] = useState<Observation[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  useEffect(() => {
    let isMounted = true;
    async function fetchObservations() {
      try {
        const data = await workspace.observations.listByInvestigation(workspace.investigationId);
        setTimeout(() => {
          if (isMounted) setObservations(data.items);
        }, 400); // Cinematic delay
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Failed to load observations"));
        }
      }
    }
    fetchObservations();
    return () => { isMounted = false; };
  }, [workspace]);

  // LIVE LISTENER: Catch cinematic events on the dashboard feed!
  useEffect(() => {
    const unsubscribe = workspace.realtime.subscribe((event) => {
      setObservations((prev) => {
        if (!prev) return prev;
        
        let newObs: any = null;
        const timestampObj = { value: event.timestamp || new Date().toISOString() };
        
        const baseMock = {
          investigationId: workspace.investigationId,
          observedAt: timestampObj,
          createdAt: timestampObj,
          sourceId: "live-src-doc",
        };

        switch (event.id) {
          case "upload-evt-courier-node":
            newObs = {
              ...baseMock,
              id: "live-obs-courier",
              type: "FACTUAL",
              content: "Meridian Transit Pvt Ltd identified as a primary logistics courier coordinating high-value physical transits.",
              strength: 0.92,
              entityIds: [event.targetId || "upload:entity:courier-firm"],
              evidenceId: "live-evid-manifest",
            } as unknown as Observation;
            break;
          case "upload-evt-resolve-hole":
            newObs = {
              ...baseMock,
              id: "live-obs-roc",
              type: "FACTUAL",
              content: "ROC Filing analysis verifies Victor Aldridge holds a controlling ownership stake in Meridian Transit.",
              strength: 0.98,
              entityIds: [event.targetId || "upload:entity:courier-firm"], 
              evidenceId: "live-evid-roc",
            } as unknown as Observation;
            break;
          case "upload-evt-sim-node":
            newObs = {
              ...baseMock,
              id: "live-obs-sim",
              type: "COMMUNICATION",
              content: "Unregistered SIM (+91 98•••••42) discovered in courier transit manifest, establishing a covert comm channel.",
              strength: 0.88,
              entityIds: [event.targetId || "upload:entity:unregistered-sim"],
              evidenceId: "live-evid-manifest",
            } as unknown as Observation;
            break;
        }

        if (newObs && !prev.some((o) => o.id === newObs.id)) {
          return [newObs, ...prev];
        }

        return prev;
      });
    });

    return () => unsubscribe();
  }, [workspace.realtime, workspace.investigationId]);

  const filtered = useMemo(() => {
    if (!observations) return [];
    if (filter === "ALL") return observations;
    return observations.filter((o) => o.type === filter);
  }, [observations, filter]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface-0 border border-surface-200/40 p-6">
        <ErrorDisplay message={error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (!observations) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface-0 border border-surface-200/40">
        <LoadingSpinner size="md" />
        <p className="mt-4 text-[10px] font-mono text-surface-500 uppercase tracking-widest animate-pulse">
          Extracting Assertions...
        </p>
      </div>
    );
  }

  if (observations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface-0 border border-surface-200/40 text-surface-500">
        <p className="text-sm font-medium">No observations extracted yet.</p>
        <p className="text-[11px] mt-1">They will appear here as evidence is processed.</p>
      </div>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden border-surface-200/40 bg-surface-0 rounded-none border-x-0 border-b-0 animate-fade-in">
      {/* Filter Bar */}
      <div className="flex flex-none items-center gap-4 border-b border-surface-200/40 bg-surface-50/50 px-6 py-3">
        <span className="text-[11px] font-mono text-surface-500 uppercase tracking-wider">Filter:</span>
        <div className="flex gap-2">
          {["ALL", "COMMUNICATION", "FACTUAL", "BEHAVIORAL"].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded transition-colors duration-fast focus-visible:outline focus-visible:outline-brand-500 ${
                filter === type
                  ? "bg-brand-500/10 text-brand-500 font-bold"
                  : "text-surface-500 hover:bg-surface-100 hover:text-surface-700"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[10px] font-mono text-surface-400">
          {filtered.length} {filtered.length === 1 ? "RECORD" : "RECORDS"}
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-surface-200/30">
          {filtered.length === 0 ? (
             <li className="px-6 py-8 text-center text-sm text-surface-500">
               No observations match this filter.
             </li>
          ) : (
            filtered.map((obs, i) => (
              <li
                key={obs.id}
                className="group px-6 py-4 hover:bg-surface-100/50 transition-colors duration-fast animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <div className="flex items-start justify-between gap-4 mb-1.5">
                  <p className="text-sm text-surface-800 leading-relaxed font-sans">
                    {obs.content}
                  </p>
                  {typeof obs.strength === "number" && (
                    <Badge variant="muted" className="shrink-0 text-[10px] font-mono bg-brand-500/5 text-brand-500/80 border-brand-500/20">
                      CONF {(obs.strength * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-[11px] font-mono text-surface-500">
                  <time className="text-surface-600">
                    {formatObsDate(obs.observedAt ?? obs.createdAt)}
                  </time>
                  <span className="text-surface-300">|</span>
                  <span className="uppercase tracking-widest text-[9px]">
                    {obs.type ?? "UNCLASSIFIED"}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </Card>
  );
}