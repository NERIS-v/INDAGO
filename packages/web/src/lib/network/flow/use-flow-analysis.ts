// ============================================================================
// F-PR8 — Adaptive Flow: workspace data + analysis hook.
//
// The shell owns ONE flow analysis. When the Flow representation is active
// (and the capability table says the effective mode can serve it), this hook
// fetches the canonical provider surfaces (nodes, observations, relations and
// the deterministic cross-case match records) once and derives the pure
// FlowMeta through flow-model. Every supporting zone (rail, panel, context,
// temporal note, intelligence adapter) consumes the SAME meta, so the whole
// workspace morphs together on the shared timeRange, mode and role filter.
//
// Provider fetches are strictly gated: enabled=false (graph/pulse/matrix
// representations, live/unavailable flow, declared-only views) makes no
// provider calls and idle is returned. Explicit absence → typed not-ready at
// the shell, never a silent demo fallback here.
// ============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { buildFlowModel } from "./flow-model";
import type { FlowDomain, FlowMeta, FlowRoleFilter } from "./flow-model";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";
import type { GraphNode, Observation, RelationHypothesis, CrossCaseMatch } from "@indago/contracts";

const PAGE_SIZE = 100;

export type FlowLoadState =
  | { readonly status: "idle"; readonly meta: null; readonly error: null }
  | { readonly status: "loading"; readonly meta: null; readonly error: null }
  | { readonly status: "ready"; readonly meta: FlowMeta; readonly error: null }
  | { readonly status: "error"; readonly meta: null; readonly error: Error };

export interface FlowAnalysisOptions {
  /** Fetch/derive only while the effective representation is the flow. */
  readonly enabled: boolean;
  /** The shared workspace timeRange is the ONLY temporal controller. */
  readonly timeRange: NetworkTimeRange;
  /** Selected flow domain (honored only when it holds data). */
  readonly mode: FlowDomain | null;
  readonly roleFilter: FlowRoleFilter;
}

interface FlowData {
  readonly nodes: GraphNode[];
  readonly observations: Observation[];
  readonly relations: RelationHypothesis[];
  readonly matches: CrossCaseMatch[];
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

export function useFlowAnalysis({
  enabled,
  timeRange,
  mode,
  roleFilter,
}: FlowAnalysisOptions): FlowLoadState {
  const workspace = useWorkspace();
  const [data, setData] = useState<FlowData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    setData(null);
    setError(null);
    Promise.all([
      fetchAllPages<GraphNode>((query) =>
        workspace.graph.getNodes(workspace.investigationId, query),
      ),
      fetchAllPages<Observation>((query) =>
        workspace.observations.listByInvestigation(workspace.investigationId, query),
      ),
      fetchAllPages<RelationHypothesis>((query) =>
        workspace.relations.listByInvestigation(workspace.investigationId, query),
      ),
      workspace.crossCase
        .listMatches(workspace.caseId, { pageSize: PAGE_SIZE })
        .catch(() => ({ items: [] as CrossCaseMatch[] })),
    ])
      .then(([nodes, observations, relations, matches]) => {
        if (!active) return;
        setData({ nodes, observations, relations, matches: matches.items });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error("Failed to load the flow data"));
      });
    return () => {
      active = false;
    };
  }, [enabled, workspace]);

  const meta = useMemo(() => {
    if (!data) return null;
    // Cross-case matchers reference case-A entities by sourceEntityId — the
    // honest count of flow entities that also appear in a match record.
    const crossCaseEntityIds = new Set(data.matches.map((match) => match.sourceEntityId));
    return buildFlowModel({
      nodes: data.nodes,
      observations: data.observations,
      relations: data.relations,
      timeRange,
      selectedMode: mode,
      roleFilter,
      crossCaseEntityIds,
    });
  }, [data, timeRange, mode, roleFilter]);

  if (!enabled) return { status: "idle", meta: null, error: null };
  if (error) return { status: "error", meta: null, error };
  if (!data || !meta) return { status: "loading", meta: null, error: null };
  return { status: "ready", meta, error: null };
}