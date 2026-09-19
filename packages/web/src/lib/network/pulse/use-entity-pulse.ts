// ============================================================================
// F-PR6 — Entity Pulse (corrective pass): workspace data + analysis hook.
//
// The shell owns ONE pulse analysis. When the Entity Pulse representation is
// active (and the capability table says the effective mode can serve it), this
// hook fetches the canonical provider surfaces (nodes, observations,
// intelligence seams, foreign overlays) once and derives the pure
// EntityPulseOverview through pulse-model. Every supporting zone (rail,
// context, temporal note, intelligence adapter) consumes the SAME overview, so
// the whole workspace morphs together on the shared timeRange.
//
// Provider fetches are strictly gated: enabled=false (graph representation,
// live/unavailable pulse, declared-only views) makes real provider calls and
// idle is returned. Explicit absence → typed not-ready at the shell, never a
// silent demo fallback here.
// ============================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { buildEntityPulseOverview } from "./pulse-model";
import type { EntityPulseOverview } from "./pulse-model";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";
import type {
  ForeignCaseOverlay,
  IntelligenceCandidateView,
  ObservationContradiction,
} from "@/lib/providers/types";
import type { GraphNode, Observation, TemporalBurstCandidateDTO } from "@indago/contracts";

const PAGE_SIZE = 100;

export type EntityPulseLoadState =
  | { readonly status: "idle"; readonly overview: null; readonly error: null }
  | { readonly status: "loading"; readonly overview: null; readonly error: null }
  | { readonly status: "ready"; readonly overview: EntityPulseOverview; readonly error: null }
  | { readonly status: "error"; readonly overview: null; readonly error: Error };

interface EntityPulseAnalysisOptions {
  /** Fetch/derive only while the effective representation is the pulse. */
  readonly enabled: boolean;
  readonly timeRange: NetworkTimeRange;
  readonly overlays?: readonly ForeignCaseOverlay[];
}

interface EntityPulseData {
  readonly nodes: GraphNode[];
  readonly observations: Observation[];
  readonly contradictions: ObservationContradiction[];
  readonly candidates: IntelligenceCandidateView[];
  /** PR-23: authoritative backend bursts (LIVE). null = no live burst answer
   *  (no seam in demo, or the seam call failed — never confused with a backend
   *  "no bursts" reply, which is an empty array). */
  readonly bursts: TemporalBurstCandidateDTO[] | null;
}

async function fetchAllPages<T>(
  fetchPage: (query: {
    page: number;
    pageSize: number;
  }) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<T[]> {
  let page = 1;
  let items: T[] = [];
  for (let guard = 0; guard < 200; guard += 1) {
    const result = await fetchPage({ page, pageSize: PAGE_SIZE });
    items = items.concat(result.items);
    if (!result.hasMore) break;
    page += 1;
  }
  return items;
}

export function useEntityPulseAnalysis({
  enabled,
  timeRange,
  overlays = [],
}: EntityPulseAnalysisOptions): EntityPulseLoadState {
  const workspace = useWorkspace();
  const [data, setData] = useState<EntityPulseData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const requestRef = useRef(0);

  const overlaysKey = useMemo(
    () => overlays.map((overlay) => overlay.ref).sort().join(","),
    [overlays],
  );

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    // PR-23 race hardening: latest-requested-context wins. A newer effect run
    // supersedes an older one even if the older resolves later; only the newest
    // request id may commit state.
    const requestId = ++requestRef.current;
    // Stale-while-revalidate: keep the previous ready overview mounted while a
    // refetch (enabled/overlays/workspace change) is in flight so the rail and
    // zones never unmount into the loading frame between fresh data. The first
    // load still shows loading (data starts null); failures still surface.
    setError(null);
    const hasBurstSeam = typeof workspace.graph.getTemporalBursts === "function";
    Promise.all([
      fetchAllPages<GraphNode>((query) =>
        workspace.graph.getNodes(workspace.investigationId, query),
      ),
      fetchAllPages<Observation>((query) =>
        workspace.observations.listByInvestigation(workspace.investigationId, query),
      ),
      workspace.intelligence
        .listContradictions(workspace.investigationId, { pageSize: PAGE_SIZE })
        .catch(() => ({ items: [] as ObservationContradiction[] })),
      workspace.intelligence
        .listCandidates(workspace.investigationId, { pageSize: PAGE_SIZE })
        .catch(() => ({ items: [] as IntelligenceCandidateView[] })),
      // PR-23 honesty: a failed burst query is "bursts unavailable" (null),
      // never an authoritative "no bursts" (empty array).
      hasBurstSeam && workspace.graph.getTemporalBursts
        ? workspace.graph
            .getTemporalBursts(workspace.investigationId, { pageSize: PAGE_SIZE })
            .then((page) => page.items)
            .catch(() => null)
        : Promise.resolve(null as TemporalBurstCandidateDTO[] | null),
    ])
      .then(([nodes, observations, contradictions, candidates, bursts]) => {
        if (!active || requestId !== requestRef.current) return;
        setData({
          nodes,
          observations,
          contradictions: contradictions.items,
          candidates: candidates.items,
          bursts: bursts,
        });
      })
      .catch((err: unknown) => {
        if (!active || requestId !== requestRef.current) return;
        setError(err instanceof Error ? err : new Error("Failed to load the entity pulse data"));
      });
    return () => {
      active = false;
    };
  }, [enabled, workspace, overlaysKey]);

  const overview = useMemo(() => {
    if (!data) return null;
    return buildEntityPulseOverview({
      nodes: data.nodes,
      observations: data.observations,
      contradictions: data.contradictions,
      candidates: data.candidates,
      overlays,
      bursts: data.bursts ?? undefined,
      timeRange,
    });
  }, [data, overlays, timeRange]);

  if (!enabled) return { status: "idle", overview: null, error: null };
  if (error) return { status: "error", overview: null, error };
  if (!data || !overview) return { status: "loading", overview: null, error: null };
  return { status: "ready", overview, error: null };
}