"use client";

// ============================================================================
// PR-20 — Structural Signals panel (read-only candidate surfacing)
//
// Minimal additive seam on the Network graph region that surfaces Phase-4
// graph-analytics candidates (TEMPORAL_BURSTS / COMMUNITIES / BRIDGES) directly
// from the Live GraphProvider — never from fixtures. Candidate labels are
// resolved from the SAME provider graph the panel loads, so the panel shows
// what the platform actually computed.
//
// Capability-gated: every section renders only when its optional provider
// method exists (LiveGraphProvider). In demo bundles the methods are absent →
// the panel renders nothing. Each section is independently honest:
//   - sequence loaded  → rows
//   - sequence empty   → "none found"
//   - provider threw   → per-section unavailable (typed), never fabricated data
//
// The panel is READ-ONLY. Surfacing a candidate here never mutates anything.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import type {
  TemporalBurstCandidateDTO,
  CommunityCandidateDTO,
  BridgeCandidateDTO,
  GraphNode,
} from "@indago/contracts";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 100;

async function fetchAllNodes(
  getNodes: (investigationId: string, query: { page: number; pageSize: number }) => Promise<{ items: GraphNode[]; hasMore: boolean }>,
  investigationId: string,
): Promise<GraphNode[]> {
  let page = 1;
  let items: GraphNode[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const result = await getNodes(investigationId, { page, pageSize: PAGE_SIZE });
    items = items.concat(result.items);
    if (!result.hasMore) break;
    page += 1;
  }
  return items;
}

type SectionState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "error"; message: string };

interface SignalsState {
  bursts: SectionState<TemporalBurstCandidateDTO>;
  communities: SectionState<CommunityCandidateDTO>;
  bridges: SectionState<BridgeCandidateDTO>;
}

const EMPTY_STATE: SignalsState = {
  bursts: { status: "loading" },
  communities: { status: "loading" },
  bridges: { status: "loading" },
};

function formatWindow(isoStart: string, isoEnd: string): string {
  const start = new Date(isoStart);
  const end = new Date(isoEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${isoStart} → ${isoEnd}`;
  }
  return `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`;
}

interface StructuralSignalsPanelProps {
  className?: string;
}

export function StructuralSignalsPanel({ className = "" }: StructuralSignalsPanelProps) {
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [state, setState] = useState<SignalsState>(EMPTY_STATE);
  const [nodeLookup, setNodeLookup] = useState<Record<string, string>>({});
  const [loadNonce, setLoadNonce] = useState(0);

  const graph = workspace.graph;
  const hasBursts = typeof graph.getTemporalBursts === "function";
  const hasCommunities = typeof graph.getCommunities === "function";
  const hasBridges = typeof graph.getBridges === "function";
  const gated = hasBursts || hasCommunities || hasBridges;

  const load = useCallback(async () => {
    const next: SignalsState = { ...EMPTY_STATE };
    setState(next);

    let labels: Record<string, string> = {};
    if (typeof graph.getNodes === "function") {
      try {
        const nodes = await fetchAllNodes(graph.getNodes.bind(graph), workspace.investigationId);
        labels = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
      } catch {
        // Labels are a convenience — a label failure never masks candidate rows.
        labels = {};
      }
    }
    setNodeLookup(labels);

    await Promise.all([
      hasBursts && graph.getTemporalBursts
        ? graph
            .getTemporalBursts(workspace.investigationId, { pageSize: 50 })
            .then(
              (page) => {
                next.bursts = { status: "ready", items: page.items };
                setState({ ...next });
              },
              (err) => {
                next.bursts = { status: "error", message: toProviderError(err).message };
                setState({ ...next });
              },
            )
        : Promise.resolve(),
      hasCommunities && graph.getCommunities
        ? graph
            .getCommunities(workspace.investigationId, { pageSize: 50 })
            .then(
              (page) => {
                next.communities = { status: "ready", items: page.items };
                setState({ ...next });
              },
              (err) => {
                next.communities = { status: "error", message: toProviderError(err).message };
                setState({ ...next });
              },
            )
        : Promise.resolve(),
      hasBridges && graph.getBridges
        ? graph
            .getBridges(workspace.investigationId, { pageSize: 50 })
            .then(
              (page) => {
                next.bridges = { status: "ready", items: page.items };
                setState({ ...next });
              },
              (err) => {
                next.bridges = { status: "error", message: toProviderError(err).message };
                setState({ ...next });
              },
            )
        : Promise.resolve(),
    ]);
  }, [graph, workspace.investigationId, hasBursts, hasCommunities, hasBridges]);

  const refresh = useCallback(() => setLoadNonce((n) => n + 1), []);

  useEffect(() => {
    if (!gated) return;
    void load();
  }, [load, gated, loadNonce]);

  const label = useMemo(
    () => (id: string) => nodeLookup[id] ?? id,
    [nodeLookup],
  );

  if (!gated) return null;

  const hasAnyData =
    (state.bursts.status === "ready" && state.bursts.items.length > 0) ||
    (state.communities.status === "ready" && state.communities.items.length > 0) ||
    (state.bridges.status === "ready" && state.bridges.items.length > 0);

  const stillLoading =
    state.bursts.status === "loading" ||
    state.communities.status === "loading" ||
    state.bridges.status === "loading";

  return (
    <div
      data-structural-signals-panel
      className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-surface-200/60 bg-surface-100/95 shadow-lg backdrop-blur ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-surface-200/40 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-surface-500">
            Structural signals
          </span>
          {!collapsed && (
            <button
              type="button"
              onClick={refresh}
              className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-surface-400 transition-colors hover:bg-surface-200/60 hover:text-surface-600"
              disabled={stillLoading}
            >
              Refresh
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-surface-400 transition-colors hover:bg-surface-200/60 hover:text-surface-600"
          aria-expanded={!collapsed}
        >
          {collapsed ? "Open" : "Collapse"}
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[40vh] overflow-y-auto p-3">
          {stillLoading && (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner label="Reading structural signals" />
            </div>
          )}

          {!stillLoading && !hasAnyData && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-surface-400">
                No structural signals
              </p>
              <p className="mt-1 text-xs text-surface-400">
                The platform computed no bridge, burst, or community candidates.
              </p>
            </div>
          )}

          {!stillLoading && hasBursts && (
            <SignalSection
              title="Temporal bursts"
              count={countOf(state.bursts)}
              state={state.bursts}
            >
              {(items) => (
                <ul className="flex flex-col gap-2">
                  {items.map((b) => (
                    <li key={`${b.nodeId}-${b.windowStart}`} className="rounded-lg border border-surface-200/60 bg-surface-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-surface-800">{label(b.nodeId)}</span>
                        <Badge variant="accent">{b.burstScore.toFixed(1)}×</Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-surface-500">
                        <span>{formatWindow(b.windowStart, b.windowEnd)}</span>
                        <span>{b.eventCount} events</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SignalSection>
          )}

          {!stillLoading && hasCommunities && (
            <SignalSection
              title="Communities"
              count={countOf(state.communities)}
              state={state.communities}
            >
              {(items) => (
                <ul className="flex flex-col gap-2">
                  {items.map((c) => (
                    <li key={c.communityId} className="rounded-lg border border-surface-200/60 bg-surface-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-surface-800">
                          {c.truncated ? (
                            <span>
                              {c.size} members
                              <Badge variant="muted" className="ml-2">truncated</Badge>
                            </span>
                          ) : (
                            `${c.size} members`
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-surface-500">
                          {c.internalEdgeCount} edges
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-surface-500">
                        <span>Cohesion</span>
                        <span>{c.cohesion.toFixed(2)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SignalSection>
          )}

          {!stillLoading && hasBridges && (
            <SignalSection
              title="Bridges"
              count={countOf(state.bridges)}
              state={state.bridges}
            >
              {(items) => (
                <ul className="flex flex-col gap-2">
                  {items.map((b) => (
                    <li key={b.edgeId} className="rounded-lg border border-surface-200/60 bg-surface-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-surface-800">
                          {label(b.nodeIds[0])} ↔ {label(b.nodeIds[1])}
                        </span>
                        {b.relationType && (
                          <Badge variant="accent">{b.relationType}</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-surface-500">
                        <span>Removal splits a {b.componentSize}-node component</span>
                        <span>{b.bridgeImpact} on smaller side</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SignalSection>
          )}
        </div>
      )}
    </div>
  );
}

function countOf<T>(state: SectionState<T>): number | null {
  return state.status === "ready" ? state.items.length : null;
}

interface SignalSectionProps<T> {
  title: string;
  count: number | null;
  state: SectionState<T>;
  children: (items: T[]) => React.ReactNode;
}

function SignalSection<T>({ title, count, state, children }: SignalSectionProps<T>) {
  return (
    <section className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-surface-500">
          {title}
        </span>
        <span className="h-px flex-1 bg-surface-200/60" aria-hidden="true" />
        {count !== null && (
          <span className="font-mono text-[9px] text-surface-400">{count}</span>
        )}
      </div>
      {state.status === "error" && (
        <p className="rounded-md border border-contradiction/20 bg-contradiction/5 px-2 py-1.5 font-mono text-[10px] text-contradiction">
          {state.message}
        </p>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <p className="px-1 font-mono text-[10px] text-surface-400">None found.</p>
      )}
      {state.status === "ready" && state.items.length > 0 && children(state.items)}
    </section>
  );
}