"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { GraphCanvas } from "./graph-canvas";
import { EntityDrawer } from "@/components/drawers/entity-drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGraphLiveOverlay, triggerOrQueueUploadSequence } from "./graph-live";
import { DiscoveryPanel } from "@/components/intelligence/discovery-panel";
import { EvidenceIntake } from "@/components/evidence/evidence-intake";
import { uploadDemoCatalog } from "@/lib/providers/demo/demo-fixtures/upload-demo-sequence";
import type { GraphNode, GraphEdge, GraphHole, GraphVersion } from "@indago/contracts";
import type { GraphRealtimeCatalog } from "@/lib/providers/types";

import { MOCK_FOREIGN_CASES, FOREIGN_ENTITIES_DB } from "@/lib/providers/demo/demo-fixtures/cross-case";

import { GapsList, type GapMock } from "@/components/intel/gaps-list";
import { GapDrawer } from "@/components/drawers/gap-drawer";

const DEMO_GAPS: GapMock[] = [
  {
    id: "gap-meridian-ownership",
    holeType: "ISOLATED_NODE",
    missingRelationship: "Meridian Transit Pvt Ltd has no resolved ownership record — beneficial owner unconfirmed.",
    affectedEntities: ["Meridian Transit Pvt Ltd"],
    impact: "HIGH",
    status: "OPEN",
  },
  {
    id: "gap-witness-comm",
    holeType: "MISSING_COMPARISON",
    missingRelationship: "Unidentified Witness communication channel to Victor Aldridge is inferred but lacks direct CDR evidence.",
    affectedEntities: ["Unidentified Witness", "Victor Aldridge"],
    impact: "MODERATE",
    status: "EVIDENCE_REQUESTED",
  },
  {
    id: "gap-financial-bridge",
    holeType: "INFRASTRUCTURE_GAP",
    missingRelationship: "Payment routing between Aldridge Holdings S.A. and Intermediary Account 0093 is obscured by missing ledger.",
    affectedEntities: ["Aldridge Holdings S.A.", "Intermediary Account 0093"],
    impact: "HIGH",
    status: "RESOLVED",
  }
];

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
  const [overlayCatalog, setOverlayCatalog] = useState<GraphRealtimeCatalog | null>(null);
  
  const [legendOpen, setLegendOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [crossCaseMenuOpen, setCrossCaseMenuOpen] = useState(false);
  
  const [gapsMenuOpen, setGapsMenuOpen] = useState(false);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);
  
  const [activeForeignCaseId, setActiveForeignCaseId] = useState<string | null>(null);
  const [mergedCases, setMergedCases] = useState<string[]>([]); 
  const [mergeStatus, setMergeStatus] = useState<Record<string, "IDLE" | "PROCESSING" | "MERGED">>({});
  
  const [appliedDeepLink, setAppliedDeepLink] = useState(false);
  const [mounted, setMounted] = useState(false);

  const controlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void; focusNode: (id: string) => void } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const originalGetEntity = workspace.entities.get;
    
    workspace.entities.get = async (id: string) => {
      if (FOREIGN_ENTITIES_DB[id]) {
        const mockData = FOREIGN_ENTITIES_DB[id] as any;
        return {
          ...mockData,
          observationIds: mockData.observationIds || [],
          evidenceIds: mockData.evidenceIds || [],
          hypothesisIds: mockData.hypothesisIds || [],
          roleHypothesisIds: mockData.roleHypothesisIds || [],
        };
      }
      return originalGetEntity.call(workspace.entities, id);
    };

    return () => {
      workspace.entities.get = originalGetEntity;
    };
  }, [workspace]);

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
  }, [workspace]);

  const activeCatalog = useMemo(() => {
    return { ...(overlayCatalog ?? {}), ...uploadDemoCatalog };
  }, [overlayCatalog]);

  const { overlayNodes, overlayEdges, overlayHoles } = useGraphLiveOverlay(
    workspace.realtime,
    workspace.investigationId,
    activeCatalog
  );

  const activeForeignCase = activeForeignCaseId ? MOCK_FOREIGN_CASES[activeForeignCaseId] : null;
  const currentMergeState = activeForeignCaseId ? (mergeStatus[activeForeignCaseId] || "IDLE") : "IDLE";

  const { finalNodes, finalEdges } = useMemo(() => {
    const baseNodes = data ? mergeById(data.nodes, overlayNodes) : [];
    const baseEdges = data ? mergeById(data.edges, overlayEdges) : [];

    const casesToRender = Array.from(new Set([...mergedCases, activeForeignCaseId].filter(Boolean) as string[]));

    if (casesToRender.length === 0 || baseNodes.length === 0) {
      return { finalNodes: baseNodes, finalEdges: baseEdges };
    }

    const injectedNodes = [...baseNodes];
    const injectedEdges = [...baseEdges];

    casesToRender.forEach((caseId) => {
      const foreignCase = MOCK_FOREIGN_CASES[caseId];
      if (!foreignCase) return;

      const localTarget = baseNodes.find(n => (n.label ?? "").toUpperCase().includes(foreignCase.localTargetMatch)) || baseNodes[0];
      if (!localTarget) return;

      const bridgeEdge = { 
        id: `cross-case-bridge-${caseId}`, 
        sourceNodeId: localTarget.id, 
        targetNodeId: foreignCase.nodes[0].id, 
        support: foreignCase.bridgeSupport, 
        relationType: "SHARED_INFRASTRUCTURE", 
        status: "ACTIVE",                      
        isForeignBridge: true 
      } as unknown as GraphEdge;

      injectedNodes.push(...(foreignCase.nodes as unknown as GraphNode[]));
      injectedEdges.push(bridgeEdge, ...(foreignCase.edges as unknown as GraphEdge[]));
    });

    return { finalNodes: injectedNodes, finalEdges: injectedEdges };
  }, [data, overlayNodes, overlayEdges, activeForeignCaseId, mergedCases]);

  const mergedHoles = useMemo(() => {
    if (!data) return [];
    const holeKey = (h: GraphHole) => h.investigationGapId ?? h.nodeIds.join("-");
    const seen = new Set(data.holes.map(holeKey));
    const additions = overlayHoles.filter((h) => !seen.has(holeKey(h)));
    return [...data.holes, ...additions];
  }, [data, overlayHoles]);

  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;

    if (activeForeignCase && activeForeignCase.nodes.length > 0) {
      t1 = setTimeout(() => controlsRef.current?.fit(), 550);
      t2 = setTimeout(() => controlsRef.current?.focusNode(activeForeignCase.nodes[0].id), 1200);
    } else if (mounted && activeForeignCaseId === null && mergedCases.length === 0) {
      t3 = setTimeout(() => controlsRef.current?.fit(), 100);
    }

    // Always return a single cleanup function to satisfy TypeScript consistent-return rules
    return () => { 
      if (t1) clearTimeout(t1); 
      if (t2) clearTimeout(t2); 
      if (t3) clearTimeout(t3); 
    };
  }, [activeForeignCase, mounted, activeForeignCaseId, mergedCases.length]);

  useEffect(() => {
    if (!initialFocusNodeId || appliedDeepLink || !data) return;
    const target = finalNodes.find((n) => n.id === initialFocusNodeId);
    if (!target) return;
    controlsRef.current?.focusNode(initialFocusNodeId);
    if (target.entityId) setSelectedEntityId(target.entityId);
    else setSelectedEntityId(null);
    setAppliedDeepLink(true);
  }, [initialFocusNodeId, appliedDeepLink, data, finalNodes]);

  const handleMergeAction = () => {
    const targetId = activeForeignCaseId;
    if (!targetId) return;
    
    setMergeStatus(prev => ({ ...prev, [targetId]: "PROCESSING" }));
    
    setTimeout(() => {
      setMergeStatus(prev => ({ ...prev, [targetId]: "MERGED" }));
      setMergedCases(prev => prev.includes(targetId) ? prev : [...prev, targetId]);

      setTimeout(() => {
        setActiveForeignCaseId(null);
        setCrossCaseMenuOpen(false);
      }, 1500);

    }, 1800);
  };

  if (error) {
    return (
      <div className="glass-panel relative w-full h-full min-h-[65vh] flex-1 flex items-center justify-center rounded-xl overflow-hidden animate-slide-up">
        <ErrorDisplay message={error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-panel relative w-full h-full min-h-[65vh] flex-1 flex items-center justify-center rounded-xl overflow-hidden animate-slide-up">
        <LoadingSpinner size="md" label="Projecting graph topology..." />
      </div>
    );
  }

  if (finalNodes.length === 0) {
    return (
      <div className="glass-panel relative w-full h-full min-h-[65vh] flex-1 flex items-center justify-center rounded-xl overflow-hidden animate-slide-up">
        <EmptyState title="No graph yet" description="The graph builds as evidence is ingested and entities are resolved." />
      </div>
    );
  }

  const isIncomplete = data.version.projectionStatus !== "COMPLETE";
  
  const rightOffset = discoveryOpen 
    ? "right-96" 
    : gapsMenuOpen && !selectedGapId 
    ? "right-[500px]" 
    : selectedEntityId || selectedGapId 
    ? "right-[400px]" 
    : "right-0";

  return (
    <div className="relative w-full h-full min-h-[65vh] flex flex-col flex-1 animate-slide-up overflow-hidden rounded-xl">

      <div 
        className={`absolute inset-y-0 glass-panel rounded-xl overflow-hidden shadow-lg transition-all duration-500 flex items-center justify-center ${activeForeignCase ? "left-80" : "left-0"} ${rightOffset}`}
      >
        <div className="absolute inset-0 z-0">
          <GraphCanvas
            nodes={finalNodes as GraphNode[]}
            edges={finalEdges as GraphEdge[]}
            holes={mergedHoles}
            selectedNodeId={selectedEntityId}
            onNodeClick={(nodeId) => {
              const node = finalNodes.find((n) => n.id === nodeId);
              if (node?.entityId) {
                setSelectedEntityId(node.entityId);
              } else if ((node as any)?.isForeign) {
                setSelectedEntityId(nodeId);
              } else {
                setSelectedEntityId(null);
              }
            }}
            activeTimeRange={activeTimeRange}
            controlsRef={controlsRef}
          />
        </div>

        {isIncomplete && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 animate-slide-up z-20 pointer-events-none">
            <Badge variant={data.version.projectionStatus === "ERROR" ? "danger" : "warning"} dot className="bg-surface-50/90 px-3 py-1.5 backdrop-blur-md">
              Graph {data.version.projectionStatus.toLowerCase()} — some relationships may be missing
            </Badge>
          </div>
        )}

        <div className="absolute top-6 left-6 flex gap-4 pointer-events-none animate-fade-in z-20 bg-surface-50/60 border border-surface-200 backdrop-blur-md px-5 py-2.5 rounded-lg shadow-md transition-opacity">
          <TelemetryStat label="NODES" value={finalNodes.length} />
          <div className="w-px h-5 bg-surface-400/30 my-auto" />
          <TelemetryStat label="EDGES" value={finalEdges.length} />
        </div>

        <div className="absolute top-6 right-6 flex flex-col gap-px animate-fade-in z-20 bg-surface-50/60 border border-surface-200 backdrop-blur-md rounded-lg overflow-hidden p-1 shadow-md">
          <button className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-surface-900 hover:bg-surface-200/50 rounded transition-colors focus-visible:outline-none" onClick={() => controlsRef.current?.zoomIn()}>+</button>
          <button className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-surface-900 hover:bg-surface-200/50 rounded transition-colors focus-visible:outline-none" onClick={() => controlsRef.current?.zoomOut()}>−</button>
          <div className="w-5 mx-auto h-px bg-surface-200 my-0.5" />
          <button className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-surface-900 hover:bg-surface-200/50 rounded transition-colors focus-visible:outline-none text-xs" onClick={() => controlsRef.current?.fit()}>⤢</button>
        </div>

        <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-20 animate-slide-up">
          
          {legendOpen && (
            <div className="bg-surface-50/95 border border-surface-200 backdrop-blur-md p-5 rounded-lg shadow-2xl animate-fade-in flex flex-col gap-3 min-w-48 transform origin-bottom-left">
              <h3 className="type-mono-small mb-1 border-b border-surface-200/50 pb-2">GRAPH LEGEND</h3>
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-100 ring-2 ring-surface-400" />} label="Entity" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-0 ring-2 ring-accent-amber" />} label="Other node" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full bg-surface-100 ring-2 ring-accent-rose animate-slow-pulse" />} label="Bridge candidate" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-dashed border-surface-500" />} label="Low-confidence link" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-dashed border-danger" />} label="Contradicted link" />
              <LegendRow swatch={<span className="w-4 border-t-[1.5px] border-dashed border-accent-amber" />} label="Graph hole" />
              <LegendRow swatch={<span className="w-2.5 h-2.5 rounded-full ring-2 ring-accent-rose shadow-[0_0_8px_var(--color-accent-rose)]" />} label="Live arrival" />
            </div>
          )}

          <div className="bg-surface-50/60 border border-surface-200 backdrop-blur-md p-1.5 rounded-lg flex items-center shadow-xl w-fit">
            <ConsoleButton active={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>Legend</ConsoleButton>
            <div className="w-px h-4 bg-surface-300 mx-2" />
            
            <ConsoleButton 
              active={discoveryOpen} 
              onClick={() => { 
                setDiscoveryOpen(!discoveryOpen); 
                setGapsMenuOpen(false);
                setSelectedGapId(null);
                setActiveForeignCaseId(null); 
                setCrossCaseMenuOpen(false); 
              }} 
              activeClass="bg-accent-rose/20 text-accent-rose border-accent-rose/30 shadow-[0_0_10px_var(--color-accent-rose-subtle)]"
            >
              Discovery
            </ConsoleButton>
            <div className="w-px h-4 bg-surface-300 mx-2" />

            <ConsoleButton 
              active={uploadOpen} 
              onClick={() => setUploadOpen(!uploadOpen)} 
              activeClass="bg-surface-900 text-surface-0 border-surface-600 shadow-[0_0_10px_var(--color-surface-400)]"
            >
              Upload Evidence
            </ConsoleButton>
            <div className="w-px h-4 bg-surface-300 mx-2" />
            
            <ConsoleButton 
              active={gapsMenuOpen || selectedGapId !== null} 
              onClick={() => { 
                const isOpening = !gapsMenuOpen;
                setGapsMenuOpen(isOpening); 
                if (!isOpening) setSelectedGapId(null);
                setDiscoveryOpen(false);
                setActiveForeignCaseId(null);
                setCrossCaseMenuOpen(false); 
              }} 
              activeClass="bg-warning/15 text-warning border-warning/30 shadow-[0_0_10px_var(--color-warning)]"
            >
              Gaps
            </ConsoleButton>
            <div className="w-px h-4 bg-surface-300 mx-2" />

            <ConsoleButton 
              active={crossCaseMenuOpen || activeForeignCaseId !== null} 
              onClick={() => { 
                const isOpening = !crossCaseMenuOpen;
                setCrossCaseMenuOpen(isOpening); 
                if (!isOpening) setActiveForeignCaseId(null);
                setDiscoveryOpen(false); 
                setGapsMenuOpen(false);
                setSelectedGapId(null);
              }} 
              activeClass="bg-accent-blue/10 text-accent-blue border-accent-blue/30"
            >
              Cross-Case
            </ConsoleButton>

            {crossCaseMenuOpen && (
              <div className="flex items-center gap-1 animate-slide-in-right overflow-hidden ml-2 pl-2 border-l border-surface-300">
                <ConsoleButton 
                  active={activeForeignCaseId === "cobalt" || mergedCases.includes("cobalt")} 
                  onClick={() => setActiveForeignCaseId(activeForeignCaseId === "cobalt" ? null : "cobalt")} 
                  activeClass="bg-accent-blue/20 text-accent-blue border-accent-blue/30 shadow-[0_0_10px_var(--color-accent-blue-subtle)]"
                >
                  {mergedCases.includes("cobalt") ? "Merged: Cobalt" : "Match: Cobalt"}
                </ConsoleButton>
                <ConsoleButton 
                  active={activeForeignCaseId === "crimson" || mergedCases.includes("crimson")} 
                  onClick={() => setActiveForeignCaseId(activeForeignCaseId === "crimson" ? null : "crimson")} 
                  activeClass="bg-accent-blue/20 text-accent-blue border-accent-blue/30 shadow-[0_0_10px_var(--color-accent-blue-subtle)]"
                >
                  {mergedCases.includes("crimson") ? "Merged: Crimson" : "Match: Crimson"}
                </ConsoleButton>
              </div>
            )}
          </div>
        </div>

        {activeForeignCase && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 animate-slide-up z-20 pointer-events-none">
            <Badge variant="info" dot className="bg-accent-blue/10 text-accent-blue border-accent-blue/30 backdrop-blur-md px-4 py-2 uppercase tracking-widest font-mono shadow-[0_0_15px_var(--color-accent-blue-subtle)]">
              Foreign Boundary Scan Active
            </Badge>
          </div>
        )}
      </div>

      <div 
        className={`absolute inset-y-0 left-0 w-80 glass-panel rounded-none! rounded-l-xl! border-r border-accent-blue/30 shadow-2xl overflow-y-auto transition-transform duration-500 ease-out z-30 ${activeForeignCase ? "translate-x-0" : "-translate-x-full"}`}
      >
        {activeForeignCase && (
          <div className="flex flex-col h-full bg-surface-0/40">
            <div className="p-6 border-b border-surface-200/50 bg-surface-50/80 backdrop-blur-md">
              <span className="text-[10px] font-mono text-accent-blue font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
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
                  <p className="text-sm font-mono text-surface-900">{activeForeignCase.title} ({activeForeignCase.id.split('-')[1]})</p>
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
                  <div className="w-full bg-surface-800 text-accent-blue border border-accent-blue/30 font-mono text-[10px] uppercase tracking-widest p-2 rounded flex flex-col items-center justify-center relative overflow-hidden h-10 shadow-inner">
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

      {discoveryOpen && (
        <div className="absolute inset-y-0 right-0 z-30 w-96 border-l border-surface-200 glass-panel rounded-none! rounded-r-xl! shadow-2xl overflow-y-auto transition-transform duration-500 ease-out translate-x-0">
          <DiscoveryPanel investigationId={workspace.investigationId} onFocusNode={(nodeId) => controlsRef.current?.focusNode(nodeId)} />
        </div>
      )}

      {gapsMenuOpen && !selectedGapId && (
        <div className="absolute inset-y-0 right-0 z-30 w-[500px] border-l border-surface-200 glass-panel rounded-none! rounded-r-xl! shadow-2xl overflow-y-auto transition-transform duration-500 ease-out translate-x-0 bg-surface-0/95 backdrop-blur-xl">
           <div className="sticky top-0 z-10 p-6 border-b border-surface-200/50 bg-surface-50/80 backdrop-blur-md flex items-center justify-between">
             <div>
               <span className="text-[10px] font-mono text-warning font-bold uppercase tracking-widest flex items-center gap-2 mb-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                 Structural Analysis
               </span>
               <h2 className="text-xl font-medium text-surface-900 leading-tight">Investigative Gaps</h2>
             </div>
             <button onClick={() => setGapsMenuOpen(false)} className="w-8 h-8 flex items-center justify-center text-surface-500 hover:text-surface-900 hover:bg-surface-200/50 rounded-md transition-colors focus-visible:outline-none">✕</button>
           </div>
           <div className="p-6">
             <GapsList gaps={DEMO_GAPS} onSelectGap={setSelectedGapId} />
           </div>
        </div>
      )}

      {selectedEntityId && (
        <EntityDrawer 
          entityId={selectedEntityId} 
          onClose={() => setSelectedEntityId(null)} 
          graphNodes={finalNodes as GraphNode[]} 
          graphEdges={finalEdges as GraphEdge[]} 
        />
      )}

      {selectedGapId && (
        <GapDrawer 
          gapId={selectedGapId} 
          onClose={() => setSelectedGapId(null)} 
        />
      )}
      
      {uploadOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-surface-50 border border-surface-200 rounded-xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.8)] animate-slide-up">
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-surface-200/50 bg-surface-50/80 backdrop-blur-xl">
              <h2 className="text-lg font-medium text-surface-900">Upload Evidence</h2>
              <button onClick={() => setUploadOpen(false)} className="w-8 h-8 flex items-center justify-center text-surface-500 hover:text-surface-900 hover:bg-surface-200/50 rounded-md transition-colors">✕</button>
            </div>
            <div className="p-6">
              <EvidenceIntake 
                investigationId={workspace.investigationId} 
                evidence={workspace.evidence} 
                onSubmitEvidence={async (request) => {
                  triggerOrQueueUploadSequence(workspace.realtime);
                  workspace.evidence.submit(workspace.investigationId, request).catch(console.error);
                  return Promise.resolve();
                }}
                onComplete={() => setUploadOpen(false)} 
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function TelemetryStat({ label, value, colorClass = "text-surface-900" }: { label: string; value: number, colorClass?: string }) {
  return (
    <div className="flex flex-col items-center justify-center leading-none">
      <span className="text-[8px] font-mono text-surface-500 uppercase tracking-widest mb-1">{label}</span>
      <span className={`text-sm font-mono font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function ConsoleButton({ active, onClick, children, activeClass = "bg-surface-200 text-surface-900" }: any) {
  return (
    <button onClick={onClick} className={`px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-colors focus-visible:outline-none border border-transparent ${active ? activeClass : "text-surface-500 hover:text-surface-900 hover:bg-surface-100/50 hover:border-surface-200/50"}`}>
      {children}
    </button>
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