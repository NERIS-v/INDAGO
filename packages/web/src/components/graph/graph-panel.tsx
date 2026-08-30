"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { GraphCanvas } from "./graph-canvas";
import { EntityDrawer } from "@/components/drawers/entity-drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GraphNode, GraphEdge, GraphVersion } from "@indago/contracts";

interface GraphData {
  version: GraphVersion;
  nodes: GraphNode[];
  edges: GraphEdge[];
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

export function GraphPanel({ activeTimeRange }: { activeTimeRange: [number, number] | null }) {
  const workspace = useWorkspace();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [noDetailNotice, setNoDetailNotice] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const controlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchGraph() {
      try {
        const version = await workspace.graph.getVersion(workspace.investigationId);
        const [nodes, edges] = await Promise.all([
          fetchAllPages<GraphNode>((q) => workspace.graph.getNodes(workspace.investigationId, q)),
          fetchAllPages<GraphEdge>((q) => workspace.graph.getEdges(workspace.investigationId, q)),
        ]);
        if (isMounted) setData({ version, nodes, edges });
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err : new Error("Failed to load graph"));
      }
    }
    fetchGraph();
    return () => {
      isMounted = false;
    };
  }, [workspace]);

  // TIER 1 POLISH: `min-h-[65vh] flex-1` guarantees this shell never collapses to 0 height
  // even if the parent route layout forgets to allocate a strict height budget.
  const shellClass = "relative w-full h-full min-h-[65vh] flex-1 flex items-center justify-center bg-surface-0 rounded-lg border border-surface-200 shadow-sm";

  if (error) return <div className={shellClass}><ErrorDisplay message={error.message} retry={() => window.location.reload()} /></div>;
  if (!data) return <div className={shellClass}><LoadingSpinner size="md" label="Projecting graph topology" /></div>;
  if (data.nodes.length === 0) return <div className={shellClass}><EmptyState title="No graph yet" description="The graph builds as evidence is ingested and entities are resolved." /></div>;

  const isIncomplete = data.version.projectionStatus !== "COMPLETE";

  const handleNodeClick = (nodeId: string) => {
    const node = data.nodes.find((n) => n.id === nodeId);
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
    // TIER 1 POLISH: Structural flex/height locks to prevent DOM collapse
    <div className="relative w-full h-full min-h-[65vh] flex-1 bg-surface-0 rounded-lg border border-surface-200 overflow-hidden shadow-sm">
      
      <div className="absolute inset-0 z-0">
        <GraphCanvas
          nodes={data.nodes}
          edges={data.edges}
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
        <Chip label="Nodes" value={data.nodes.length} />
        <Chip label="Edges" value={data.edges.length} />
      </div>

      <div className="absolute top-4 right-4 flex gap-1 animate-fade-in z-20">
        <Button variant="quiet" size="sm" aria-label="Zoom in" className="w-8 px-0 bg-surface-50/80 backdrop-blur-md border border-surface-200 hover:bg-surface-100 hover:border-surface-300 transition-colors" onClick={() => controlsRef.current?.zoomIn()}>+</Button>
        <Button variant="quiet" size="sm" aria-label="Zoom out" className="w-8 px-0 bg-surface-50/80 backdrop-blur-md border border-surface-200 hover:bg-surface-100 hover:border-surface-300 transition-colors" onClick={() => controlsRef.current?.zoomOut()}>−</Button>
        <Button variant="quiet" size="sm" aria-label="Fit graph" className="w-8 px-0 bg-surface-50/80 backdrop-blur-md border border-surface-200 hover:bg-surface-100 hover:border-surface-300 transition-colors" onClick={() => controlsRef.current?.fit()}>⤢</Button>
      </div>

      <div className="absolute bottom-4 left-4 z-20 animate-fade-in">
        <button
          type="button"
          aria-expanded={legendOpen}
          aria-label="Toggle graph legend"
          onClick={() => setLegendOpen((v) => !v)}
          className="px-3 py-1.5 bg-surface-50/90 backdrop-blur-md border border-surface-200 rounded-md text-[10px] font-mono uppercase tracking-widest text-surface-500 shadow-sm hover:text-surface-900 hover:border-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose transition-colors"
        >
          {legendOpen ? "Hide legend" : "Legend"}
        </button>
        {legendOpen && (
          <div className="mt-2 flex flex-col gap-2.5 px-4 py-4 bg-surface-50/95 backdrop-blur-md border border-surface-200 rounded-lg shadow-2xl animate-fade-in transform origin-bottom-left">
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-100 ring-2 ring-surface-400" />} label="Entity" />
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-0 ring-2 ring-accent-amber" />} label="Other node" />
            <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-100 ring-2 ring-accent-rose animate-slow-pulse" />} label="Bridge candidate" />
            <LegendRow swatch={<span className="w-4 border-t-2 border-dashed border-surface-500" />} label="Low-confidence link" />
            <LegendRow swatch={<span className="w-4 border-t-2 border-dashed border-danger" />} label="Contradicted link" />
            <LegendRow swatch={<span className="w-3 h-3 rounded-full bg-surface-400 scale-125" />} label="Size = centrality" />
          </div>
        )}
      </div>

      {selectedEntityId && (
        <EntityDrawer
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
          graphNodes={data.nodes}
          graphEdges={data.edges}
        />
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