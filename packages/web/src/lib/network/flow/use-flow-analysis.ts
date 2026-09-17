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

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { buildFlowModel, relationTypeToFlowDomain } from "./flow-model";
import type { FlowDomain, FlowMeta, FlowRoleFilter } from "./flow-model";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";
import type { GraphProvider } from "@/lib/providers/types";
import type {
  ConnectingPathCandidateDTO,
  GraphNode,
  Observation,
  RelationHypothesis,
  CrossCaseMatch,
} from "@indago/contracts";

const PAGE_SIZE = 100;
// PR-23 bounded backend path corroboration (single load cycle, deterministic).
const BACKEND_PATH_PAIR_CAP = 8;
const BACKEND_PATH_HOPS = 3;
const BACKEND_PATH_TOTAL_CAP = 64;

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
  /** PR-23: live backend path corroboration. null = seam absent or a pair
   *  query failed (unavailable, NOT a verdict); array = backend answered. */
  readonly backendPaths: ConnectingPathCandidateDTO[] | null;
}

/**
 * Deterministic bounded set of connecting-path queries: the directed segment
 * endpoint pairs from flow-domain relations (PROPOSED/ACCEPTED only, matching
 * the model's segment rules), in stable relation-id order, capped. The result
 * order is a pure function of the input, keeping the load cycle reproducible.
 */
function backendPathPairs(
  relations: readonly RelationHypothesis[],
): { from: string; to: string }[] {
  const seen = new Set<string>();
  const pairs: { from: string; to: string }[] = [];
  for (const relation of [...relations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!relation.directed) continue;
    if (relation.status !== "PROPOSED" && relation.status !== "ACCEPTED") continue;
    if (relationTypeToFlowDomain(relation.relationType) === null) continue;
    const key = `${relation.sourceEntityId}\u0000${relation.targetEntityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      from: relation.sourceEntityId,
      to: relation.targetEntityId,
    });
    if (pairs.length >= BACKEND_PATH_PAIR_CAP) break;
  }
  return pairs;
}

/**
 * Queries the live connecting-paths seam for each bounded pair. Returns null
 * when the seam is absent or ANY pair query fails (the backend did not give an
 * authoritative answer → nothing is claimed); a real (possibly empty) array is
 * only returned when every query enumerated by the backend. Paths are
 * de-duplicated by their node sequence and capped.
 */
async function loadBackendPaths(
  seam: NonNullable<GraphProvider["connectingPaths"]>,
  investigationId: string,
  pairs: readonly { from: string; to: string }[],
): Promise<ConnectingPathCandidateDTO[] | null> {
  const perPair = await Promise.all(
    pairs.map((pair) =>
      seam(investigationId, pair.from, pair.to, BACKEND_PATH_HOPS)
        .then((page) => page.items)
        .catch(() => null),
    ),
  );
  if (perPair.some((result) => result === null)) return null;
  const byKey = new Map<string, ConnectingPathCandidateDTO>();
  for (const result of perPair as ConnectingPathCandidateDTO[][]) {
    for (const path of result) {
      byKey.set(
        `${path.startNodeId}\u0000${path.targetNodeId}\u0000${path.nodes.map((n) => n.nodeId).join(",")}`,
        path,
      );
    }
  }
  return [...byKey.values()].slice(0, BACKEND_PATH_TOTAL_CAP);
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
  const requestRef = useRef(0);

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
    setData(null);
    setError(null);
    (async () => {
      try {
        const [nodes, observations, relations, matches] = await Promise.all([
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
        ]);
        if (!active || requestId !== requestRef.current) return;

        // PR-23 bounded path corroboration: only when the live seam exists on
        // the graph provider (demo providers expose no seam → skipped, so the
        // demo stays provider-faithful and continues to work unchanged).
        const pathSeam = workspace.graph.connectingPaths;
        let backendPaths: ConnectingPathCandidateDTO[] | null = null;
        if (typeof pathSeam === "function") {
          const pairs = backendPathPairs(relations);
          if (pairs.length > 0) {
            backendPaths = await loadBackendPaths(pathSeam, workspace.investigationId, pairs);
          }
        }
        if (!active || requestId !== requestRef.current) return;

        setData({ nodes, observations, relations, matches: matches.items, backendPaths });
      } catch (err: unknown) {
        if (!active || requestId !== requestRef.current) return;
        setError(err instanceof Error ? err : new Error("Failed to load the flow data"));
      }
    })();
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
      backendPaths: data.backendPaths,
    });
  }, [data, timeRange, mode, roleFilter]);

  if (!enabled) return { status: "idle", meta: null, error: null };
  if (error) return { status: "error", meta: null, error };
  if (!data || !meta) return { status: "loading", meta: null, error: null };
  return { status: "ready", meta, error: null };
}