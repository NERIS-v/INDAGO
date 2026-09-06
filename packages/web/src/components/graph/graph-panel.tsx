"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { GraphCanvas } from "./graph-canvas";
import { EntityDrawer } from "@/components/drawers/entity-drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatChip } from "@/components/ui/stat-chip";
import { useGraphLiveOverlay, triggerOrQueueUploadSequence } from "./graph-live";
import { DiscoveryPanel } from "@/components/intelligence/discovery-panel";
import { EvidenceIntake } from "@/components/evidence/evidence-intake";
import type { GraphNode, GraphEdge, GraphHole, GraphVersion } from "@indago/contracts";
import type { InvestigativeGap } from "@indago/contracts";
import type { GraphRealtimeCatalog, ForeignCaseOverlay } from "@/lib/providers/types";
import { mapInvestigativeGapToGapMock } from "@/lib/intel/gap-adapter";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { applyGraphFilter, DEFAULT_GRAPH_FILTER } from "@/lib/graph/graph-filter";
import type { GraphFilterState } from "@/lib/graph/graph-filter";
import { deriveGraphVisualContext } from "@/lib/graph/graph-visual-state";
import type { GraphFocusSeed, GraphVisualContext } from "@/lib/graph/graph-visual-state";
import { DEFAULT_ACTIONS } from "@/lib/layout/control-center";
import type { GraphControlCenterActions } from "@/lib/layout/control-center";

import { GapsList } from "@/components/intel/gaps-list";
import { GapDrawer } from "@/components/drawers/gap-drawer";

interface GraphData {
  version: GraphVersion;
  nodes: GraphNode[];
  edges: GraphEdge[];
  holes: GraphHole[];
}

const PAGE_SIZE = 100;

async function fetchAllPages<T>(
  fetchPage: (query: { page: number; pageSize: number }) => Promise<{ items: T[]; hasMore: boolean }>
): Promise<T[]> {
  let page = 1;
  let items: T[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const result = await fetchPage({ page, pageSize: PAGE_SIZE });
    items = items.concat(result.items);
    if (!result.hasMore) break;
    page += 1;
  }
  return items;
}

function mergeById<T extends { id: string }>(base: T[], overlay: T[]): T[] {
  if (overlay.length === 0) return base;
  const seen = new Set(base.map((item) => item.id));
  const merged = base.slice();
  for (const item of overlay) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function GraphPanel({
  activeTimeRange,
  initialFocusNodeId,
  actions,
  onActionsChange,
  foreignOverlays: foreignOverlaysProp,
  onContextSelect,
  selectedContext,
  focusRequest,
  filter,
  onFilterChange,
  graphReloadRequest,
}: {
  activeTimeRange: [number, number] | null;
  initialFocusNodeId?: string | null;
  /** PR-2: shell-owned action state. When provided, the panel is controlled
   *  by the control center and never fetches duplicate provider data. */
  actions?: GraphControlCenterActions;
  onActionsChange?: (patch: Partial<GraphControlCenterActions>) => void;
  /** Shell-provided foreign-case overlays (lifted to avoid duplicate fetch). */
  foreignOverlays?: ForeignCaseOverlay[];
  /** PR-3: canonically tagged emission whenever graph selection changes.
   *  Absent in standalone rendering (judge stage) — the graph panel then
   *  keeps its own selection and does not drive a context bridge. */
  onContextSelect?: (context: InvestigativeContext | null) => void;
  /** PR-3: the shell-owned canonical selection. When provided, the canvas
   *  highlight is DERIVED from the shell context (graph node id resolution
   *  happens here); when absent (standalone judge rendering) the panel keeps
   *  its own local highlight. */
  selectedContext?: InvestigativeContext | null;
  /** PR-3: shell request to center the selected object on the graph. The
   *  entityId resolves to a graph node through finalNodes (deterministic). */
  focusRequest?: { nonce: number; entityId: string } | null;
  /** PR-4: readability filter applied to the RENDERED edges only. The graph
   *  physics and the entity drawer keep the full topology. */
  filter?: GraphFilterState | null | undefined;
  /** F-PR14: optional filter-reset callback so the honest "filter hides
   *  relations of the selection" annotation can offer a reveal shortcut.
   *  Absent → the annotation renders without the button. */
  onFilterChange?: (filter: GraphFilterState) => void;
  /** PR-8: post-mutation canonical-graph refetch request. Bumping the nonce
   *  refetches version/nodes/edges so a relation-authority decision's projection
   *  change (edge archived, retained, contradicted) becomes visible. Absent or
   *  unchanged nonce → behavior is identical to today. */
  graphReloadRequest?: { nonce: number } | null;
}) {
  const workspace = useWorkspace();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [overlayCatalog, setOverlayCatalog] = useState<GraphRealtimeCatalog | null>(null);
  const [investigativeGaps, setInvestigativeGaps] = useState<InvestigativeGap[]>([]);
  const [fetchedOverlays, setFetchedOverlays] = useState<ForeignCaseOverlay[]>([]);

  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);

  // PR-2: when no shell provides actions, fall back to an internal instance so
  // GraphPanel remains renderable standalone (e.g. the Judge demo stage).
  const [localActions, setLocalActions] = useState<GraphControlCenterActions>(DEFAULT_ACTIONS);
  const effectiveActions = actions ?? localActions;
  const foreignOverlays = foreignOverlaysProp ?? fetchedOverlays;
  const activeForeignCaseId = effectiveActions.activeForeignCaseId;

  // PR-3: when the control-center shell provides the context bridge, node and
  // gap selection surfaces through the RIGHT contextual panel only. The legacy
  // in-graph EntityDrawer/GapDrawer remain ONLY for standalone rendering
  // (judge stage, where no contextual panel exists) — never both at once.
  const isStandalone = onContextSelect === undefined;

  const publish = useCallback(
    (patch: Partial<GraphControlCenterActions>) => {
      if (onActionsChange) onActionsChange(patch);
      else setLocalActions((prev) => ({ ...prev, ...patch }));
    },
    [onActionsChange],
  );

  const [mergedCases, setMergedCases] = useState<string[]>([]); 
  const [mergeStatus, setMergeStatus] = useState<Record<string, "IDLE" | "PROCESSING" | "MERGED">>({});
  
  const [appliedDeepLink, setAppliedDeepLink] = useState(false);
  const [mounted, setMounted] = useState(false);

  const controlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void; focusNode: (id: string) => void; focusPair: (aId: string, bId: string, durationMs?: number) => void } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let isMounted = true;
    workspace.gaps
      .listByInvestigation(workspace.investigationId, { pageSize: 100 })
      .then((page) => page.items)
      .catch(() => [] as InvestigativeGap[])
      .then((gaps) => {
        if (isMounted) setInvestigativeGaps(gaps);
      });
    return () => { isMounted = false; };
  }, [workspace]);

  // Only fetch foreign overlays when the control center shell is NOT already
  // providing them (judge/standalone rendering).
  useEffect(() => {
    if (foreignOverlaysProp !== undefined) return;
    let isMounted = true;
    workspace.crossCase
      .listForeignOverlays(workspace.caseId, { pageSize: 100 })
      .then((page) => page.items)
      .catch(() => [] as ForeignCaseOverlay[])
      .then((items) => {
        if (isMounted) setFetchedOverlays(items);
      });
    return () => { isMounted = false; };
  }, [workspace, foreignOverlaysProp !== undefined]);

  useEffect(() => {
    let isMounted = true;
    async function fetchGraph() {
      try {
        const version = await workspace.graph.getVersion(workspace.investigationId);
        const [nodes, edges, holes, catalog] = await Promise.all([
          fetchAllPages<GraphNode>((q) => workspace.graph.getNodes(workspace.investigationId, q)),
          fetchAllPages<GraphEdge>((q) => workspace.graph.getEdges(workspace.investigationId, q)),
          fetchAllPages<GraphHole>((q) => workspace.graph.getGraphHoles(workspace.investigationId, q)),
          workspace.graph.getOverlayCatalog().catch(() => ({}) as GraphRealtimeCatalog),
        ]);
        if (isMounted) {
          setData({ version, nodes, edges, holes });
          setOverlayCatalog(catalog);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err : new Error("Failed to load graph"));
      }
    }
    fetchGraph();
    return () => { isMounted = false; };
  }, [workspace, graphReloadRequest?.nonce]);

  const activeCatalog = useMemo(() => overlayCatalog ?? {}, [overlayCatalog]);

  const { overlayNodes, overlayEdges, overlayHoles } = useGraphLiveOverlay(
    workspace.realtime,
    workspace.investigationId,
    activeCatalog
  );

  // activeForeignCaseId holds the overlay ref ("cobalt"/"crimson"); the overlay
  // data itself comes from the cross-case provider seam (never demo fixtures).
  const activeForeignCase = activeForeignCaseId
    ? foreignOverlays.find((o) => o.ref === activeForeignCaseId) ?? null
    : null;
  const currentMergeState = activeForeignCaseId ? (mergeStatus[activeForeignCaseId] || "IDLE") : "IDLE";

  // PR-3 UX fix: the island set injected for an ACTIVE overlay is frozen on the
  // overlay TRANSITION. A merge finishing mid-session must NOT produce a new
  // finalNodes identity (that would re-run the physics layout + restart the
  // staged reveal = the foreign island visibly "appears twice"). Previously
  // merged islands are still honored while an overlay is open; on close the full
  // merged list takes over so absorbed islands persist.
  const casesToRender = useMemo(() => {
    if (!activeForeignCaseId) return mergedCases;
    const previouslyMerged = mergedCases.filter((id) => id !== activeForeignCaseId);
    return [...previouslyMerged, activeForeignCaseId];
    // mergedCases intentionally omitted from deps: a merge finishing while an
    // overlay is OPEN must not change the injected set (finalNodes stays stable
    // for the duration of the session, and the staged camera reveal never
    // restarts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeForeignCaseId]);

  const { finalNodes, finalEdges } = useMemo(() => {
    const baseNodes = data ? mergeById(data.nodes, overlayNodes) : [];
    const baseEdges = data ? mergeById(data.edges, overlayEdges) : [];

    if (casesToRender.length === 0 || baseNodes.length === 0) {
      return { finalNodes: baseNodes, finalEdges: baseEdges };
    }

    const injectedNodes = [...baseNodes];
    const injectedEdges = [...baseEdges];

    casesToRender.forEach((caseRef) => {
      const foreignCase = foreignOverlays.find((o) => o.ref === caseRef);
      if (!foreignCase) return;

      const localTarget = baseNodes.find(n => (n.label ?? "").toUpperCase().includes(foreignCase.localTargetMatch)) || baseNodes[0];
      if (!localTarget) return;

      const bridgeEdge = { 
        id: `cross-case-bridge-${caseRef}`, 
        sourceNodeId: localTarget.id, 
        targetNodeId: foreignCase.nodes[0]!.id, 
        support: foreignCase.bridgeSupport, 
        relationType: "SHARED_INFRASTRUCTURE", 
        status: "ACTIVE",                      
        isForeignBridge: true 
      } as unknown as GraphEdge;

      injectedNodes.push(...(foreignCase.nodes as unknown as GraphNode[]));
      injectedEdges.push(bridgeEdge, ...(foreignCase.edges as unknown as GraphEdge[]));
    });

    return { finalNodes: injectedNodes, finalEdges: injectedEdges };
  }, [data, overlayNodes, overlayEdges, casesToRender, foreignOverlays]);

  const mergedHoles = useMemo(() => {
    if (!data) return [];
    const holeKey = (h: GraphHole) => h.investigationGapId ?? h.nodeIds.join("-");
    const seen = new Set(data.holes.map(holeKey));
    const additions = overlayHoles.filter((h) => !seen.has(holeKey(h)));
    return [...data.holes, ...additions];
  }, [data, overlayHoles]);

  // PR-4: readability filter changes ONLY the rendered edges — the force
  // simulation still runs on the FULL topology (no physics restart on filter
  // interaction) and the entity drawer still sees every relation.
  //
  // PR-10 hardening: this contract is now enforced structurally. The canvas
  // receives TWO edge sets:
  //   - edges        → the FILTERED projection that is RENDERED (applyGraphFilter)
  //   - physicsEdges → the FULL merged topology that feeds useGraphLayout, so
  //     the simulation's content key (nodes + edges) never changes on a filter
  //     interaction and the physics does not restart.
  const canvasEdges = useMemo(
    () => applyGraphFilter(finalEdges, filter),
    [finalEdges, filter],
  );

  // PR-6: cross-case overlay membership surfaces as a CASE-SCOPE dimension —
  // foreign entities (incl. the cross-case bridge) must never look local. The
  // flags are carried on the injected overlay objects; these sets are derived
  // from the merged projection so they always match what the canvas renders.
  const foreignNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of finalNodes) if ((n as { isForeign?: boolean }).isForeign) set.add(n.id);
    return set;
  }, [finalNodes]);

  const foreignEdgeIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of finalEdges) {
      const foreign = e as { isForeign?: boolean; isForeignEdge?: boolean; isForeignBridge?: boolean };
      if (foreign.isForeignEdge || foreign.isForeignBridge) set.add(e.id);
    }
    return set;
  }, [finalEdges]);

  // PR-6: the FOCUS SCOPE is resolved from provider data here (above the
  // canvas). A hypothesis contributes its related entities; a gap contributes
  // its related entities PLUS the graph holes resolved for that gap; an
  // evidence selection contributes its graph-grounded scope (the provider
  // projection does not carry evidence→entity links, so the scope is honestly
  // derived from the grounded edges that exist — never fabricated).
  const [focusSeed, setFocusSeed] = useState<GraphFocusSeed | null>(null);

  useEffect(() => {
    const ctx = selectedContext;
    if (!ctx) { setFocusSeed(null); return; }
    let cancelled = false;

    if (ctx.kind === "hypothesis") {
      workspace.hypotheses
        .get(ctx.id)
        .then((hypothesis) => {
          if (cancelled) return;
          setFocusSeed({
            kind: "hypothesis",
            entityIds: hypothesis.relatedEntityIds ?? [],
            nodeIds: [],
          });
        })
        .catch(() => {
          if (!cancelled) setFocusSeed({ kind: "hypothesis", entityIds: [], nodeIds: [] });
        });
    } else if (ctx.kind === "gap") {
      const gap = investigativeGaps.find((g) => g.id === ctx.id);
      setFocusSeed({
        kind: "gap",
        entityIds: gap?.relatedEntityIds ?? [],
        nodeIds: mergedHoles
          .filter((h) => h.investigationGapId === ctx.id)
          .flatMap((h) => h.nodeIds),
      });
    } else if (ctx.kind === "evidence") {
      workspace.evidence
        .get(ctx.id)
        .then(() => {
          if (!cancelled) setFocusSeed({ kind: "evidence", entityIds: [], nodeIds: [] });
        })
        .catch(() => {
          if (!cancelled) setFocusSeed({ kind: "evidence", entityIds: [], nodeIds: [] });
        });
    } else {
      setFocusSeed(null);
    }

    return () => { cancelled = true; };
  }, [selectedContext, workspace, investigativeGaps, mergedHoles]);

  // PR-3: the canvas highlight must target a GRAPH node id (n.id), never an
  // entity id. In shell mode it tracks the shell-owned context (so a shell
  // deselect clears the harness highlight); standalone it follows the panel's
  // own local selection.
  const selectedGraphNodeId = useMemo(() => {
    const source =
      selectedContext !== undefined
        ? selectedContext?.kind === "entity"
          ? selectedContext.id
          : null
        : selectedEntityId;
    if (!source) return null;
    return finalNodes.find((n) => n.entityId === source)?.id ?? null;
  }, [selectedContext, selectedEntityId, finalNodes]);

  // F-PR14: deterministic hidden-selection rule. The filter only ever removes
  // RENDERED edges (provider topology is untouched), so a selected node's
  // incident edges may be hidden even though the node stays. This derived
  // count drives the honest annotation beside the selection ("N relations
  // hidden by filter") — the selection is never silently cleared or re-scoped.
  const filterStats = useMemo(() => {
    const active = Boolean(
      filter && (filter.minSupport > 0 || filter.hideContradicted),
    );
    if (!active || !selectedGraphNodeId) {
      return { active, hiddenIncidentCount: 0, totalIncidentCount: 0 };
    }
    const isIncident = (edge: GraphEdge, nodeId: string | null) =>
      nodeId !== null &&
      (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId);
    let totalIncidentCount = 0;
    let visibleIncidentCount = 0;
    for (const edge of finalEdges) {
      if (!isIncident(edge, selectedGraphNodeId)) continue;
      totalIncidentCount += 1;
      if (canvasEdges.some((rendered) => rendered.id === edge.id)) {
        visibleIncidentCount += 1;
      }
    }
    return {
      active,
      hiddenIncidentCount: totalIncidentCount - visibleIncidentCount,
      totalIncidentCount,
    };
  }, [filter, selectedGraphNodeId, finalEdges, canvasEdges]);

  // PR-6: the presentation model is derived ONCE per meaningful snapshot change
  // (memoized), then hydrated with interaction state inside the canvas per
  // render. It never runs on the physics tick.
  const visualContext: GraphVisualContext = useMemo(
    () =>
      deriveGraphVisualContext({
        nodes: finalNodes,
        edges: canvasEdges,
        holes: mergedHoles,
        activeTimeRange,
        filter,
        selectedNodeId: selectedGraphNodeId,
        foreignNodeIds,
        foreignEdgeIds,
        focusSeed,
      }),
    [finalNodes, canvasEdges, mergedHoles, activeTimeRange, filter, selectedGraphNodeId, foreignNodeIds, foreignEdgeIds, focusSeed],
  );

  // PR-3: graph selection is an INTENT. The shell owns canonical selection
  // state; the panel only reports which graph object the user picked, tagged
  // with the source. Foreign-island nodes map to their owning cross-case
  // overlay ref (deterministic search, never a guess).
  const emitContext = useCallback(
    (next: InvestigativeContext | null) => onContextSelect?.(next),
    [onContextSelect],
  );

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      const node = finalNodes.find((n) => n.id === nodeId);
      if (node?.entityId) {
        setSelectedEntityId(node.entityId);
        emitContext({ kind: "entity", id: node.entityId, source: "graph" });
      } else if ((node as { isForeign?: boolean } | undefined)?.isForeign) {
        setSelectedEntityId(nodeId);
        const ownerOverlay = foreignOverlays.find((o) =>
          o.nodes.some((foreignNode) => foreignNode.id === nodeId),
        );
        emitContext({ kind: "cross-case", id: ownerOverlay?.ref ?? nodeId, source: "graph" });
      } else {
        setSelectedEntityId(null);
        emitContext(null);
      }
    },
    [finalNodes, foreignOverlays, emitContext],
  );

  const handleGapSelect = useCallback(
    (gapId: string) => {
      setSelectedGapId(gapId);
      emitContext({ kind: "gap", id: gapId, source: "graph" });
    },
    [emitContext],
  );

  const closeEntityDrawer = useCallback(() => {
    setSelectedEntityId(null);
    emitContext(null);
  }, [emitContext]);

  const closeGapDrawer = useCallback(() => {
    setSelectedGapId(null);
    emitContext(null);
  }, [emitContext]);

  // PR-3: clicking empty canvas clears the highlight AND the bridge — the
  // "click away to unfocus" affordance (the shell has no in-graph drawer).
  const handleBackgroundDeselect = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedGapId(null);
    emitContext(null);
  }, [emitContext]);

  // PR-1 T3: the Gaps menu is provider-driven. Canonical InvestigativeGaps are
  // adapted into the display shape; related-entity ids are resolved to the
  // node labels already projected for the canvas.
  const gapsView = useMemo(() => {
    const labelById = new Map<string, string>();
    for (const n of finalNodes) {
      if (n.entityId) labelById.set(n.entityId, n.label ?? n.entityId);
    }
    return investigativeGaps.map((gap) =>
      mapInvestigativeGapToGapMock(gap, (entityId) => labelById.get(entityId) ?? entityId),
    );
  }, [investigativeGaps, finalNodes]);

  // PR-3 UX fix: the staged reveal must react ONLY to the overlay transition.
  // finalNodes/mergedCases churn (e.g. a merge finishing while the overlay is
  // open) must NOT restart the sequence, otherwise the foreign island "appears
  // twice" (fit → bridge focus → cleanup → fit again at a different zoom). The
  // CURRENT case + anchor are read from a ref; the effect only re-schedules
  // when the active id, mount flag, or the (stable, once-fetched) overlay list
  // changes.
  const stagedRevealRef = useRef<{
    activeForeignCase: ForeignCaseOverlay | null;
    localBridgeAnchor: GraphNode | null;
  }>({ activeForeignCase: null, localBridgeAnchor: null });
  stagedRevealRef.current = {
    activeForeignCase,
    localBridgeAnchor: activeForeignCase
      ? (finalNodes.find((n) =>
          (n.label ?? "").toUpperCase().includes(activeForeignCase.localTargetMatch),
        ) ?? null)
      : null,
  };

  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;

    const { activeForeignCase: currentCase, localBridgeAnchor } = stagedRevealRef.current;

    if (currentCase && currentCase.nodes.length > 0) {
      // PR-3 UX: STAGED bridge reveal — the user wants to SEE both steps:
      // 1) the foreign nodes appear while the camera zooms OUT to frame the
      //    whole grown graph (fit),
      // 2) after the nodes settle and the full graph has a beat, a LONG slow
      //    camera move frames the shared-infrastructure BRIDGE itself (local
      //    target anchor + foreign island head) — never a sudden jump.
      const foreignHead = currentCase.nodes[0]!;
      t1 = setTimeout(() => {
        controlsRef.current?.fit();
      }, 150);
      t2 = setTimeout(() => {
        if (localBridgeAnchor) {
          controlsRef.current?.focusPair(localBridgeAnchor.id, foreignHead.id, 1100);
        } else {
          controlsRef.current?.focusPair(foreignHead.id, foreignHead.id, 1100);
        }
      }, 1700);
    } else if (mounted && activeForeignCaseId === null && mergedCases.length === 0) {
      t3 = setTimeout(() => {
        controlsRef.current?.fit();
      }, 100);
    }

    // Always return a single cleanup function to satisfy TypeScript consistent-return rules
    return () => { 
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [activeForeignCaseId, mounted, foreignOverlays]);

  useEffect(() => {
    if (!initialFocusNodeId || appliedDeepLink || !data) return;
    const target = finalNodes.find((n) => n.id === initialFocusNodeId);
    if (!target) return;
    controlsRef.current?.focusNode(initialFocusNodeId);
    if (target.entityId) {
      setSelectedEntityId(target.entityId);
      // PR-3: a ?focus= deep link is an INITIAL INTENT — surface it through
      // the bridge once, tagged so consumers know it came from the URL.
      emitContext({ kind: "entity", id: target.entityId, source: "deep-link" });
    } else {
      setSelectedEntityId(null);
      emitContext(null);
    }
    setAppliedDeepLink(true);
  }, [initialFocusNodeId, appliedDeepLink, data, finalNodes, emitContext]);

  // PR-3: apply a shell-invoked focus request (operational rail "Focus") by
  // locating the owning graph node. No match = focus-unavailable; the context
  // selection is untouched so the right panel keeps its state.
  useEffect(() => {
    if (!focusRequest || !data) return;
    const target =
      finalNodes.find((n) => n.entityId === focusRequest.entityId) ??
      finalNodes.find((n) => n.id === focusRequest.entityId);
    if (!target) return;
    controlsRef.current?.focusNode(target.id);
  }, [focusRequest, data, finalNodes]);

  const handleMergeAction = () => {
    const targetId = activeForeignCaseId;
    if (!targetId) return;
    
    setMergeStatus(prev => ({ ...prev, [targetId]: "PROCESSING" }));
    
    setTimeout(() => {
      setMergeStatus(prev => ({ ...prev, [targetId]: "MERGED" }));
      setMergedCases(prev => {
        const next = prev.includes(targetId) ? prev : [...prev, targetId];
        return next;
      });

      setTimeout(() => {
        publish({ activeForeignCaseId: null, crossCaseOpen: false });
      }, 1500);

    }, 1800);
  };

  if (error) {
    return (
      <div className="glass-panel relative w-full h-full min-h-0 flex items-center justify-center rounded-xl overflow-hidden animate-slide-up">
        <ErrorDisplay message={error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-panel relative w-full h-full min-h-0 flex items-center justify-center rounded-xl overflow-hidden animate-slide-up">
        <LoadingSpinner size="md" label="Projecting graph topology..." />
      </div>
    );
  }

  if (finalNodes.length === 0) {
    return (
      <div className="glass-panel relative w-full h-full min-h-0 flex items-center justify-center rounded-xl overflow-hidden animate-slide-up">
        <EmptyState title="No graph yet" description="The graph builds as evidence is ingested and entities are resolved." />
      </div>
    );
  }

  const isIncomplete = data.version.projectionStatus !== "COMPLETE";

  // PR-3: the gaps LIST panel visibility follows the SHELL context in shell
  // mode (pitching a gap hides the list so the right panel takes over; the
  // shell re-browsing gaps → clearSelection re-shows it). Standalone judges by
  // the local row state.
  const gapListVisible =
    effectiveActions.gapsOpen &&
    (selectedContext !== undefined ? selectedContext?.kind !== "gap" : !selectedGapId);

  const rightOffset = effectiveActions.discoveryOpen 
    ? "right-96" 
    : gapListVisible 
    ? "right-[500px]" 
    : isStandalone && (selectedEntityId || selectedGapId) 
    ? "right-[400px]" 
    : "right-0";

  return (
    <div className="relative h-full w-full min-h-0 animate-slide-up overflow-hidden rounded-xl">

      <div 
        className={`absolute inset-y-0 left-0 glass-panel rounded-xl overflow-hidden shadow-lg transition-all duration-500 flex items-center justify-center ${rightOffset}`}
      >
        <div className="absolute inset-0 z-0">
          <GraphCanvas
            nodes={finalNodes as GraphNode[]}
            edges={canvasEdges as GraphEdge[]}
            physicsEdges={finalEdges as GraphEdge[]}
            holes={mergedHoles}
            selectedNodeId={selectedGraphNodeId}
            onNodeClick={handleNodeSelect}
            onCanvasBackgroundPointerDown={handleBackgroundDeselect}
            activeTimeRange={activeTimeRange}
            controlsRef={controlsRef}
            visualContext={visualContext}
          />
        </div>

        {isIncomplete && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 animate-slide-up z-20 pointer-events-none">
            <Badge variant={data.version.projectionStatus === "ERROR" ? "danger" : "warning"} dot className="bg-surface-50/90 px-3 py-1.5 backdrop-blur-md">
              Graph {data.version.projectionStatus.toLowerCase()} — some relationships may be missing
            </Badge>
          </div>
        )}

        <div className={`absolute top-6 flex gap-4 pointer-events-none animate-fade-in z-20 bg-semantic-surface/95 border border-semantic-border backdrop-blur-md px-5 py-2.5 rounded-lg shadow-md transition-opacity ${activeForeignCase ? "left-[336px]" : "left-6"}`}>
          <StatChip label="NODES" value={finalNodes.length} />
          <div className="w-px h-5 bg-semantic-border my-auto" />
          <StatChip label="EDGES" value={finalEdges.length} />
          {filterStats.active && (
            <>
              <div className="w-px h-5 bg-semantic-border my-auto" />
              <StatChip label="RENDERED" value={canvasEdges.length} />
            </>
          )}
        </div>

        {filterStats.active && filterStats.hiddenIncidentCount > 0 && (
          <div className="absolute left-6 top-24 lg:top-28 z-20 max-w-md animate-slide-up">
            <div className="flex items-start gap-3 bg-semantic-surface/95 border border-semantic-attention/40 backdrop-blur-md px-4 py-3 rounded-lg shadow-md">
              <div className="flex flex-col gap-0.5">
                <p className="type-mono-small text-semantic-foreground-muted">
                  {filterStats.hiddenIncidentCount} of {filterStats.totalIncidentCount} relation{filterStats.totalIncidentCount === 1 ? "" : "s"} of the selection hidden by the current filter
                </p>
                <p className="text-xs text-semantic-foreground-muted">
                  NODES DISPLAYED ≠ DOES NOT EXIST — reduce the filter ({filter && filter.minSupport > 0 ? `support ≥ ${filter.minSupport}` : ""}{filter && filter.minSupport > 0 && filter.hideContradicted ? " · " : ""}{filter && filter.hideContradicted ? "contradicted hidden" : ""}) to reveal them.
                </p>
              </div>
              {onFilterChange && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 mt-0.5"
                  onClick={() => onFilterChange(DEFAULT_GRAPH_FILTER)}
                >
                  Reveal all
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="absolute top-6 right-6 flex flex-col gap-px animate-fade-in z-20 bg-semantic-surface/95 border border-semantic-border backdrop-blur-md rounded-lg overflow-hidden p-1 shadow-md">
          <button aria-label="Zoom in" className="w-8 h-8 flex items-center justify-center text-semantic-foreground-muted hover:text-semantic-foreground hover:bg-semantic-surface-elevated rounded transition-colors focus-visible:outline-none" onClick={() => controlsRef.current?.zoomIn()}>+</button>
          <button aria-label="Zoom out" className="w-8 h-8 flex items-center justify-center text-semantic-foreground-muted hover:text-semantic-foreground hover:bg-semantic-surface-elevated rounded transition-colors focus-visible:outline-none" onClick={() => controlsRef.current?.zoomOut()}>−</button>
          <div className="w-5 mx-auto h-px bg-semantic-border my-0.5" />
          <button aria-label="Fit graph to view" className="w-8 h-8 flex items-center justify-center text-semantic-foreground-muted hover:text-semantic-foreground hover:bg-semantic-surface-elevated rounded transition-colors focus-visible:outline-none text-xs" onClick={() => controlsRef.current?.fit()}>⤢</button>
        </div>

        <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-20 animate-slide-up">
          
          {effectiveActions.legendOpen && (
            <div className="cc-panel-floating p-5 flex flex-col gap-3 min-w-48 transform origin-bottom-left">
              <h3 className="type-mono-small mb-1 border-b border-semantic-border-subtle pb-2">GRAPH LEGEND</h3>
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-semantic-surface-soft ring-2 ring-semantic-foreground-muted" />} label="Entity" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-semantic-surface ring-2 ring-semantic-foreground-faint" />} label="Other node" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-semantic-surface-elevated ring-2 ring-accent-rose animate-slow-pulse" />} label="Bridge candidate" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-dashed border-semantic-foreground-faint" />} label="Low-confidence link" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-dashed border-semantic-contradiction" />} label="Contradicted link" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-dashed border-warning" />} label="Graph hole" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full ring-2 ring-semantic-selection shadow-[0_0_8px_var(--color-semantic-selection)]" />} label="Live arrival" />
              <LegendRow swatch={<span className="relative w-4 h-4 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-accent-amber ring-1 ring-semantic-background" /></span>} label="Evidence-grounded link" />
              <LegendRow swatch={<span className="w-4 h-4 rounded-full border-[1.5px] border-dashed border-semantic-attention/70 bg-semantic-attention/10" />} label="Attention region" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-semantic-surface-soft ring-2 ring-semantic-foreign" />} label="Foreign case node" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-semantic-selection" />} label="Current focus area" />
            </div>
          )}
        </div>

        {activeForeignCase && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 animate-slide-up z-20 pointer-events-none">
            <Badge variant="info" dot className="bg-semantic-foreign/10 text-semantic-foreign border-semantic-foreign/30 backdrop-blur-md px-4 py-2 uppercase tracking-widest font-mono shadow-[0_0_15px_rgba(127,146,163,0.25)]">
              Foreign Boundary Scan Active
            </Badge>
          </div>
        )}
      </div>

      <div 
        className={`absolute inset-y-0 left-0 w-80 bg-surface-0 rounded-none! rounded-l-xl! border-r border-accent-blue/30 shadow-2xl overflow-y-auto transition-transform duration-500 ease-out z-30 ${activeForeignCase ? "translate-x-0" : "-translate-x-full"}`}
      >
        {activeForeignCase && (
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-surface-200/50 bg-surface-50">
              <span className="text-[10px] font-mono text-semantic-foreign font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                Boundary Alert
              </span>
              <h2 className="text-xl font-medium text-surface-900 leading-tight">Shared Infrastructure Detected</h2>
            </div>
            
            <div className="p-6 flex flex-col gap-6 h-full">
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-surface-500 uppercase tracking-widest font-bold">Match Telemetry</span>
                <div className="flex flex-col gap-3 bg-surface-100/50 p-4 rounded-lg border border-surface-200">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-sans text-surface-700">Identity Match</span>
                    <span className="text-lg font-mono text-accent-rose tabular-nums font-bold">{Math.round(activeForeignCase.bridgeSupport * 100)}%</span>
                  </div>
                  <div className="h-[2px] w-full bg-surface-300 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-rose" style={{ width: `${Math.round(activeForeignCase.bridgeSupport * 100)}%` }} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono text-surface-500 uppercase tracking-widest font-bold">Target Jurisdiction</span>
                <div className="bg-surface-50 p-4 rounded-lg border border-surface-200">
                  <p className="text-sm font-mono text-surface-900">{activeForeignCase.title} ({activeForeignCase.caseId.split('-')[1]})</p>
                  <p className="text-xs text-surface-500 mt-1 italic">{activeForeignCase.summary}</p>
                </div>
              </div>

              <div className="mt-auto pt-4">
                {currentMergeState === "IDLE" && (!activeForeignCaseId || !mergedCases.includes(activeForeignCaseId)) && (
                  <Button 
                    onClick={handleMergeAction} 
                    className="w-full bg-accent-blue text-surface-0 hover:bg-accent-blue/80 font-mono text-[10px] uppercase tracking-widest shadow-[0_0_15px_var(--color-accent-blue-subtle)] transition-all"
                  >
                    Authorize Graph Merge
                  </Button>
                )}
                
                {currentMergeState === "PROCESSING" && (
                  <div className="w-full bg-surface-800 text-semantic-foreign border border-semantic-foreign/30 font-mono text-[10px] uppercase tracking-widest p-2 rounded flex flex-col items-center justify-center relative overflow-hidden h-10 shadow-inner">
                    <div className="absolute inset-0 w-full h-[2px] bg-accent-blue/50 blur-[2px] animate-filament" />
                    <span className="animate-pulse font-bold">Authorizing Sync...</span>
                  </div>
                )}

                {(currentMergeState === "MERGED" || (activeForeignCaseId && mergedCases.includes(activeForeignCaseId))) && (
                  <div className="w-full bg-success/10 text-success border border-success/30 font-mono text-[10px] uppercase tracking-widest p-2 rounded flex items-center justify-center gap-2 h-10 font-bold shadow-[0_0_15px_var(--color-success-subtle)]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Nodes Merged
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {effectiveActions.discoveryOpen && (
        <div className="absolute inset-y-0 right-0 z-30 w-96 border-l border-surface-200 glass-panel rounded-none! rounded-r-xl! shadow-2xl overflow-y-auto transition-transform duration-500 ease-out translate-x-0">
          <DiscoveryPanel investigationId={workspace.investigationId} onFocusNode={(nodeId) => controlsRef.current?.focusNode(nodeId)} />
        </div>
      )}

      {gapListVisible && (
        <div className="absolute inset-y-0 right-0 z-30 w-[500px] border-l border-surface-200 glass-panel rounded-none! rounded-r-xl! shadow-2xl overflow-y-auto transition-transform duration-500 ease-out translate-x-0 bg-surface-0/95 backdrop-blur-xl">
           <div className="sticky top-0 z-10 p-6 border-b border-surface-200/50 bg-surface-50/80 backdrop-blur-md flex items-center justify-between">
             <div>
               <span className="text-[10px] font-mono text-warning font-bold uppercase tracking-widest flex items-center gap-2 mb-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                 Structural Analysis
               </span>
               <h2 className="text-xl font-medium text-surface-900 leading-tight">Investigative Gaps</h2>
             </div>
             <button onClick={() => publish({ gapsOpen: false })} className="w-8 h-8 flex items-center justify-center text-surface-500 hover:text-surface-900 hover:bg-surface-200/50 rounded-md transition-colors focus-visible:outline-none">✕</button>
           </div>
           <div className="p-6">
             <GapsList gaps={gapsView} onSelectGap={handleGapSelect} />
           </div>
        </div>
      )}

      {isStandalone && selectedEntityId && (
        <EntityDrawer 
          entityId={selectedEntityId} 
          onClose={closeEntityDrawer} 
          graphNodes={finalNodes as GraphNode[]} 
          graphEdges={finalEdges as GraphEdge[]} 
        />
      )}

      {isStandalone && selectedGapId && (
        <GapDrawer 
          gapId={selectedGapId} 
          onClose={closeGapDrawer} 
        />
      )}
      
      {effectiveActions.uploadOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-surface-50 border border-surface-200 rounded-xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.8)] animate-slide-up">
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-surface-200/50 bg-surface-50/80 backdrop-blur-xl">
              <h2 className="text-lg font-medium text-surface-900">Upload Evidence</h2>
              <button onClick={() => publish({ uploadOpen: false })} className="w-8 h-8 flex items-center justify-center text-surface-500 hover:text-surface-900 hover:bg-surface-200/50 rounded-md transition-colors">✕</button>
            </div>
            <div className="p-6">
              <EvidenceIntake 
                investigationId={workspace.investigationId} 
                evidence={workspace.evidence} 
                onSubmitEvidence={async (request) => {
                  // F-PR14 (Phase 5): the DEMO ingestion choreography only
                  // starts AFTER the provider accepts the submission. Firing
                  // it fire-and-forget ahead of the await would keep playing
                  // simulated events even when submit() rejects — a fabricated
                  // success. A rejected submit surfaces the provider error to
                  // the intake (retry) and never plays the sequence.
                  await workspace.evidence.submit(
                    workspace.investigationId,
                    request,
                  );
                  triggerOrQueueUploadSequence(workspace.realtime);
                }}
                onComplete={() => publish({ uploadOpen: false })} 
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-surface-600">
      <div className="flex items-center justify-center w-4 h-4 shrink-0">{swatch}</div>
      <span>{label}</span>
    </div>
  );
}