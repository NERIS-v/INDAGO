// ============================================================================
// F-PR7 — Cross-Case / Relationship Matrix: workspace data + analysis hook.
//
// The shell owns ONE matrix analysis. When the Matrix representation is active
// (and the capability table says the effective mode can serve it), this hook
// fetches the canonical provider surfaces (nodes, observations, relations,
// intelligence seams, foreign overlays AND the deterministic cross-case match
// records) once and derives the pure MatrixMeta through matrix-model. Every
// supporting zone (rail, panel, context, temporal note, intelligence adapter)
// consumes the SAME meta, so the whole workspace morphs together on the shared
// timeRange, mode toggle and authorized-boundary set.
//
// Provider fetches are strictly gated: enabled=false (graph/pulse
// representations, live/unavailable matrix, declared-only views) makes real
// provider calls and idle is returned. Explicit absence → typed not-ready at
// the shell, never a silent demo fallback here.
// ============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { buildMatrix, matrixBoundaryOptions } from "./matrix-model";
import type { MatrixBoundaryOption, MatrixMeta, MatrixMode } from "./matrix-model";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";
import type {
  ForeignCaseOverlay,
  IntelligenceCandidateView,
  ObservationContradiction,
} from "@/lib/providers/types";
import type {
  CrossCaseMatch,
  GraphNode,
  Observation,
  RelationHypothesis,
} from "@indago/contracts";

const PAGE_SIZE = 100;

export type MatrixLoadState =
  | { readonly status: "idle"; readonly meta: null; readonly boundaryOptions: readonly MatrixBoundaryOption[]; readonly error: null }
  | { readonly status: "loading"; readonly meta: null; readonly boundaryOptions: readonly MatrixBoundaryOption[]; readonly error: null }
  | { readonly status: "ready"; readonly meta: MatrixMeta; readonly boundaryOptions: readonly MatrixBoundaryOption[]; readonly error: null }
  | { readonly status: "error"; readonly meta: null; readonly boundaryOptions: readonly MatrixBoundaryOption[]; readonly error: Error };

interface MatrixAnalysisOptions {
  /** Fetch/derive only while the effective representation is the matrix. */
  readonly enabled: boolean;
  /** The shared workspace timeRange is the ONLY temporal controller. */
  readonly timeRange: NetworkTimeRange;
  readonly overlays?: readonly ForeignCaseOverlay[];
  readonly mode: MatrixMode;
  readonly boundaryCaseId: string | null;
  /** Comparison boundaries the analyst has authorized (idle→authorized). */
  readonly authorizedBoundaries: readonly string[];
}

interface MatrixData {
  readonly nodes: GraphNode[];
  readonly observations: Observation[];
  readonly relations: RelationHypothesis[];
  readonly contradictions: ObservationContradiction[];
  readonly candidates: IntelligenceCandidateView[];
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

export function useMatrixAnalysis({
  enabled,
  timeRange,
  overlays = [],
  mode,
  boundaryCaseId,
  authorizedBoundaries,
}: MatrixAnalysisOptions): MatrixLoadState {
  const workspace = useWorkspace();
  const [data, setData] = useState<MatrixData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const overlaysKey = useMemo(
    () => overlays.map((overlay) => overlay.ref).sort().join(","),
    [overlays],
  );
  const authKey = useMemo(
    () => [...authorizedBoundaries].sort().join(","),
    [authorizedBoundaries],
  );

  // The comparison boundary is an identity key for the cross-case fetch — the
  // row/column geometry must rematerialize when it changes.
  const boundaryKey = boundaryCaseId ?? "";

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
      workspace.intelligence
        .listContradictions(workspace.investigationId, { pageSize: PAGE_SIZE })
        .catch(() => ({ items: [] as ObservationContradiction[] })),
      workspace.intelligence
        .listCandidates(workspace.investigationId, { pageSize: PAGE_SIZE })
        .catch(() => ({ items: [] as IntelligenceCandidateView[] })),
      workspace.crossCase
        .listMatches(workspace.caseId, { pageSize: PAGE_SIZE })
        .catch(() => ({ items: [] as CrossCaseMatch[] })),
    ])
      .then(([nodes, observations, relations, contradictions, candidates, matches]) => {
        if (!active) return;
        setData({
          nodes,
          observations,
          relations,
          contradictions: contradictions.items,
          candidates: candidates.items,
          matches: matches.items,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error("Failed to load the matrix data"));
      });
    return () => {
      active = false;
    };
  }, [enabled, workspace, overlaysKey, boundaryKey]);

  const meta = useMemo(() => {
    if (!data) return null;
    return buildMatrix({
      nodes: data.nodes,
      observations: data.observations,
      relations: data.relations,
      contradictions: data.contradictions,
      candidates: data.candidates,
      matches: data.matches,
      overlays,
      caseId: workspace.caseId,
      investigationId: workspace.investigationId,
      timeRange,
      mode,
      boundaryCaseId,
      authorizedBoundaries,
    });
  }, [data, overlays, workspace.caseId, workspace.investigationId, timeRange, mode, boundaryCaseId, authKey]);

  const boundaryOptions = useMemo(
    () => (data ? matrixBoundaryOptions(overlays, data.matches) : []),
    [data, overlays],
  );

  if (!enabled) return { status: "idle", meta: null, boundaryOptions: [], error: null };
  if (error) return { status: "error", meta: null, boundaryOptions: [], error };
  if (!data || !meta) return { status: "loading", meta: null, boundaryOptions: [], error: null };
  return { status: "ready", meta, boundaryOptions, error: null };
}