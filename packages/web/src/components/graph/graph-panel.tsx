"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { GraphCanvas } from "./graph-canvas";
import { EntityDrawer } from "@/components/drawers/entity-drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGraphLiveOverlay } from "./graph-live";
import { DiscoveryPanel } from "@/components/intelligence/discovery-panel";
import type { GraphNode, GraphEdge, GraphHole, GraphVersion } from "@indago/contracts";
import type { GraphRealtimeCatalog } from "@/lib/providers/types";

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
}: {
  activeTimeRange: [number, number] | null;
  initialFocusNodeId?: string | null;
}) {
  const workspace = useWorkspace();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [noDetailNotice, setNoDetailNotice] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [overlayCatalog, setOverlayCatalog] = useState<GraphRealtimeCatalog | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [appliedDeepLink, setAppliedDeepLink] = useState(false);

  const controlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void; focusNode: (id: string) => void } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchGraph() {
      try {
        const version = await workspace.graph.getVersion(workspace.investigationId);
        const [nodes, edges, holes, catalog] = await Promise.all([
          fetchAllPages<GraphNode>((q) => workspace.graph.getNodes(workspace.investigationId, q)),
          fetchAllPages<GraphEdge>((q) => workspace.graph.getEdges(workspace.investigationId, q)),
          fetchAllPages<GraphHole>((q) => workspace.graph.getGraphHoles(workspace.investigationId, q)),
          workspace.graph.getOverlayCatalog().catch(() => ({} as GraphRealtimeCatalog)),
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
    return () => {
      isMounted = false;
    };
  }, [workspace]);

  // LIVE: subscribes once per mount; every matching realtime event (base
  // investigation replay + any triggerUploadGraphSequence() call from the
  // evidence intake flow) lands here as an overlay delta. The catalog is the
  // provider-owned mapping (demo resolves it; live resolves to {}).
  const { overlayNodes, overlayEdges, overlayHoles } = useGraphLiveOverlay(
    workspace.realtime,
    workspace.investigationId,
    overlayCatalog ?? {}
  );

  const mergedNodes = useMemo(
    () => (data ? mergeById(data.nodes, overlayNodes) : []),
    [data, overlayNodes]
  );
  const mergedEdges = useMemo(
    () => (data ? mergeById(data.edges, overlayEdges) : []),
    [data, overlayEdges]
  );
  const mergedHoles = useMemo(() => {
    if (!data) return [];
    const holeKey = (h: GraphHole) => h.investigationGapId ?? h.nodeIds.join("-");
    const seen = new Set(data.holes.map(holeKey));
    const additions = overlayHoles.filter((h) => !seen.has(holeKey(h)));
    return [...data.holes, ...additions];
  }, [data, overlayHoles]);

  // All nodes/edges are ALWAYS passed to the simulation. Time-range visibility
  // (fade out-of-range, fly-in on entry) is handled at the render layer in
  // GraphCanvas via smooth transitions — the physics never rebuilds from slider
  // movement, so there is no abrupt re-layout churn.
  const graphNodes = mergedNodes;
  const graphEdges = mergedEdges;

  const shellClass = "relative w-full h-full min-h-[65vh] flex-1 flex items-center justify-center bg-surface-0 rounded-lg border border-surface-200 shadow-sm";

  // ?focus=<nodeId> deep link (preserved with ?caseId by the workspace URL
  // helpers). Applied once the graph topology is present. Kept above the
  // early returns so the hook count never changes between renders.
  useEffect(() => {
    if (!initialFocusNodeId || appliedDeepLink || !data) return;
    const target = mergedNodes.find((n) => n.id === initialFocusNodeId);
    if (!target) return;
    controlsRef.current?.focusNode(initialFocusNodeId);
    if (target.entityId) {
      setSelectedEntityId(target.entityId);
      setNoDetailNotice(false);
    } else {
      setSelectedEntityId(null);
      setNoDetailNotice(true);
      setTimeout(() => setNoDetailNotice(false), 2400);
    }
    setAppliedDeepLink(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusNodeId, appliedDeepLink, data, mergedNodes]);

  if (error) return <div className={shellClass}><ErrorDisplay message={error.message} retry={() => window.location.reload()} /></div>;
  if (!data) return <div className={shellClass}><LoadingSpinner size="md" label="Projecting graph topology" /></div>;
  if (mergedNodes.length === 0) return <div className={shellClass}><EmptyState title="No graph yet" description="The graph builds as evidence is ingested and entities are resolved." /></div>;

  const isIncomplete = data.version.projectionStatus !== "COMPLETE";

  const handleNodeClick = (nodeId: string) => {
    const node = mergedNodes.find((n) => n.id === nodeId);
    if (node?.entityId) {
      setSelectedEntityId(node.entityId);
      setNoDetailNotice(false);
    } else {
      setSelectedEntityId(null);
      setNoDetailNotice(true);
      setTimeout(() => setNoDetailNotice(false), 2400);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[65vh] flex-1 bg-surface-0 rounded-lg border border-surface-200 overflow-hidden shadow-sm">

      <div className="absolute inset-0 z-0">
        <GraphCanvas
          nodes={graphNodes}
          edges={graphEdges}
          holes={mergedHoles}
          onNodeClick={handleNodeClick}
          activeTimeRange={activeTimeRange}
          controlsRef={controlsRef}
        />
      </div>

      {isIncomplete && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 animate-fade-in z-20 pointer-events-none">
          <Badge variant={data.version.projectionStatus === "ERROR" ? "danger" : "warning"} dot>
            Graph {data.version.projectionStatus.toLowerCase()} — some relationships may be missing
          </Badge>
        </div>
      )}

      {noDetailNotice && (
        <div className="absolute bottom-4 right-4 animate-fade-in z-20 pointer-events-none">
          <Badge variant="muted">No entity detail available for this node</Badge>
        </div>
      )}

      <div className="absolute top-4 left-4 flex gap-2 pointer-events-none animate-fade-in z-20">
        <Chip label="Nodes" value={mergedNodes.length} />
        <Chip label="Edges" value={mergedEdges.length} />
        {mergedHoles.length > 0 && (
          <span className="px-3 py-1.5 bg-surface-50/90 backdrop-blur-md border border-accent-amber/40 rounded-md text-[10px] font-mono uppercase tracking-widest text-accent-amber shadow-sm">
            Holes: <span className="font-bold ml-1.5">{mergedHoles.length}</span>
          </span>
        )}
      </div>

      <div className="absolute top-4 right-4 flex gap-1 animate-fade-in z-20">
        <Button variant="quiet" size="sm" aria-label="Zoom in" className="w-8 px-0 bg-surface-50/80 backdrop-blur-md border border-surface-200 hover:bg-surface-100 hover:border-surface-300 transition-colors" onClick={() => controlsRef.current?.zoomIn()}>+</Button>
        <Button variant="quiet" size="sm" aria-label="Zoom out" className="w-8 px-0 bg-surface-50/80 backdrop-blur-md border border-surface-200 hover:bg-surface-100 hover:border-surface-300 transition-colors" onClick={() => controlsRef.current?.zoomOut()}>−</Button>
        <Button variant="quiet" size="sm" aria-label="Fit graph" className="w-8 px-0 bg-surface-50/80 backdrop-blur-md border border-surface-200 hover:bg-surface-100 hover:border-surface-300 transition-colors" onClick={() => controlsRef.current?.fit()}>⤢</Button>
      </div>

      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-20 animate-fade-in">
        <button
          type="button"
          aria-expanded={legendOpen}
          aria-label="Toggle graph legend"
          onClick={() => setLegendOpen((v) => !v)}
          className="px-3 py-1.5 bg-surface-50/90 backdrop-blur-md border border-surface-200 rounded-md text-[10px] font-mono uppercase tracking-widest text-surface-500 shadow-sm hover:text-surface-900 hover:border-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose transition-colors"
        >
          {legendOpen ? "Hide legend" : "Legend"}
        </button>
        <button
          type="button"
          aria-expanded={discoveryOpen}
          aria-label="Toggle Discovery Mode"
          onClick={() => setDiscoveryOpen((v) => !v)}
          className={`px-3 py-1.5 backdrop-blur-md border rounded-md text-[10px] font-mono uppercase tracking-widest shadow-sm hover:border-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose transition-colors ${
            discoveryOpen
              ? "bg-accent-rose/15 border-accent-rose/50 text-accent-rose"
              : "bg-surface-50/90 border-surface-200 text-surface-500 hover:text-surface-900"
          }`}
        >
          {discoveryOpen ? "Exit discovery" : "Discovery"}
        </button>
        {legendOpen && (
          <div className="mt-2 flex flex-col gap-2.5 px-4 py-4 bg-surface-50/95 backdrop-blur-md border border-surface-200 rounded-lg shadow-2xl animate-fade-in transform origin-bottom-left">
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-100 ring-2 ring-surface-400" />} label="Entity" />
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-0 ring-2 ring-accent-amber" />} label="Other node" />
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-100 ring-2 ring-accent-rose animate-slow-pulse" />} label="Bridge candidate" />
            <LegendRow swatch={<span className="w-4 border-t-2 border-dashed border-surface-500" />} label="Low-confidence link" />
            <LegendRow swatch={<span className="w-4 border-t-2 border-dashed border-danger" />} label="Contradicted link" />
            <LegendRow swatch={<span className="w-4 border-t-2 border-dashed border-accent-amber" />} label="Graph hole (candidate missing link)" />
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full ring-2 ring-accent-rose" />} label="Just arrived (live)" />
            <LegendRow swatch={<span className="w-3 h-3 rounded-full bg-surface-400 scale-125" />} label="Size = centrality" />
          </div>
        )}
      </div>

      {selectedEntityId && (
        <EntityDrawer
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
          graphNodes={mergedNodes}
          graphEdges={mergedEdges}
        />
      )}

      {discoveryOpen && (
        <div className="absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l border-surface-200 bg-surface-0/95 backdrop-blur-md shadow-2xl overflow-y-auto animate-slide-in-right">
          <DiscoveryPanel
            investigationId={workspace.investigationId}
            onFocusNode={(nodeId) => controlsRef.current?.focusNode(nodeId)}
          />
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="px-3 py-1.5 bg-surface-50/90 backdrop-blur-md border border-surface-200 rounded-md text-[10px] font-mono uppercase tracking-widest text-surface-500 shadow-sm">
      {label}: <span className="text-surface-900 font-bold ml-1.5">{value}</span>
    </span>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-surface-600">
      <div className="flex items-center justify-center w-4 h-4 shrink-0">
        {swatch}
      </div>
      <span>{label}</span>
    </div>
  );
}