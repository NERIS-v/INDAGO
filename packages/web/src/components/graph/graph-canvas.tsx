"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { drag as d3Drag } from "d3-drag";
import { select as d3Select, pointer as d3Pointer } from "d3-selection";
import { useGraphLayout, nodeVisualRadius, screenToWorld, type LayoutNode, type LayoutEdge, type GraphMotionState } from "./use-graph-layout";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";
import { GraphHoleBurstLayer } from "./graph-hole-burst-layer";
import type { GraphVisualContext, GraphNodeVisualState, GraphEdgeVisualState, GraphAttentionRegion } from "@/lib/graph/graph-visual-state";
import { DEFAULT_NODE_VISUAL_STATE, DEFAULT_EDGE_VISUAL_STATE } from "@/lib/graph/graph-visual-state";
import { getNodeIconPath } from "@/lib/graph/node-icon-path";

// The icon vocabulary is shared with the cinematic home opening — its
// "network resolve" phase renders the SAME entity icons.
export { getNodeIconPath } from "@/lib/graph/node-icon-path";

interface GraphCanvasProps {
  nodes: GraphNode[];
  /** RENDERED edge projection (PR-4 filter applied). Always a subset (or the
   *  same set) of `physicsEdges`; only these are drawn. */
  edges: GraphEdge[];
  /** PR-10: the FULL topology that feeds the physics simulation
   *  (useGraphLayout). Kept separate from `edges` so a readability-filter
   *  change never changes the simulation content key / restarts the physics.
   *  Absent → defaults to `edges` (standalone/back-compat callers). */
  physicsEdges?: GraphEdge[];
  holes: GraphHole[];
  /** Hole ids belonging to the currently selected gap — highlighted in the
   *  "?" layer (selection color + dashed rings on the hole's endpoint nodes). */
  selectedHoleIds?: ReadonlySet<string> | null;
  onNodeClick: (nodeId: string) => void;
  /** Fired when the user clicks a RENDERED edge (relationship link). The edge
   *  id is a graph edge id (not a relation id) — the panel maps it to the
   *  provider-backed relation context. */
  onEdgeClick?: (edgeId: string) => void;
  /** Directly selected edge id (a picked relationship). Drives the selection
   *  highlight on the edge itself; cleared when the panel selection moves. */
  selectedEdgeId?: string | null;
  activeTimeRange: [number, number] | null;
  /** P4: per-node observation activity corridor (nodeId → [min,max] epoch or
   *  null when the node has no dated observations). When present it is the
   *  TEMPORAL source for the window filter — a node is in-range iff >=1 dated
   *  observation falls inside the window; nodes without dated observations stay
   *  visible (conservative). Absent → createdAt-based (leaf behavior). */
  nodeTemporalBounds?: ReadonlyMap<string, { min: number; max: number } | null>;
  selectedNodeId?: string | null;
  controlsRef?: React.MutableRefObject<{ zoomIn: () => void; zoomOut: () => void; fit: () => void; focusNode: (id: string) => void; focusPair: (aId: string, bId: string, durationMs?: number) => void; } | null>;
  /** PR-3: fired when the user presses on empty canvas (not a node). Lets the
   *  shell clear the selection — the "click away to unfocus" affordance. */
  onCanvasBackgroundPointerDown?: () => void;
  /** PR-6: presentation-model context derived in the panel (memoized, pure).
   *  Interaction dimensions (selected/focused/hovered) are hydrated by the
   *  canvas from its own interaction state — never from this base map. */
  visualContext?: GraphVisualContext | null;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;
const FIT_PADDING = 0.95;
const MAX_FIT_ZOOM = 1.15;
const ENTER_MS = 700;
const OFF_CANVAS_GAP = 60;
// F-PR17: focus-aura lifecycle timing — fade out fast when the graph wakes,
// commit short after real settle, fade in gently at the CURRENT settled position.
const AURA_FADE_OUT_MS = 150;
const AURA_FADE_IN_MS = 250;
const AURA_SETTLE_DELAY_MS = 160;

// P4: out-of-window objects are HIDDEN, never dimmed — a node before or after
// the timeline window stays invisible and eases in (via the entrance animation /
// CSS opacity transition) exactly when the playhead actually reaches it.
const OUT_OF_RANGE_NODE_OPACITY = 0;
const OUT_OF_RANGE_EDGE_OPACITY = 0;
const OUT_OF_RANGE_LABEL_OPACITY = 0;

function easeInOutCubic(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function offCanvasSpawn(nodeX: number, nodeY: number, w: number, h: number): { x: number; y: number } {
  let dirX = nodeX - w / 2; let dirY = nodeY - h / 2;
  const rayLen = Math.hypot(dirX, dirY) || 1;
  if (rayLen < 1) { dirX = 0; dirY = -1; } else { dirX /= rayLen; dirY /= rayLen; }
  const exitX = Math.abs(dirX) > 1e-6 ? w / 2 / Math.abs(dirX) : Infinity;
  const exitY = Math.abs(dirY) > 1e-6 ? h / 2 / Math.abs(dirY) : Infinity;
  const exitDist = Math.min(exitX, exitY);
  return { x: w / 2 + dirX * (exitDist + OFF_CANVAS_GAP), y: h / 2 + dirY * (exitDist + OFF_CANVAS_GAP) };
}

export function GraphCanvas({ nodes, edges, physicsEdges: physicsEdgesProp, holes, selectedHoleIds, onNodeClick, onEdgeClick, activeTimeRange, controlsRef, selectedNodeId, selectedEdgeId, onCanvasBackgroundPointerDown, visualContext, nodeTemporalBounds }: GraphCanvasProps) {
  // PR-10: the physics topology defaults to the rendered edges for standalone
  // callers and is the FULL merged topology when the panel supplies it — so
  // readability-filter interactions never restart the simulation.
  const physicsEdges = physicsEdgesProp ?? edges;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionLayerRef = useRef<SVGGElement>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [internalSelectedNode, setInternalSelectedNode] = useState<string | null>(null);
  const [internalSelectedEdge, setInternalSelectedEdge] = useState<string | null>(null);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hasAutoFit, setHasAutoFit] = useState(false);
  // PR-3 UX: programmatic camera moves (focusPair) may request a slower ease
  // so staged reveals (e.g. cross-case) don't snap. Reset after the move.
  const [cameraEase, setCameraEase] = useState("400ms cubic-bezier(0.22, 1, 0.36, 1)");
  const panOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const panRef = useRef(pan); panRef.current = pan;
  const dimensionsRef = useRef(dimensions); dimensionsRef.current = dimensions;
  const draggingNodeId = useRef<string | null>(null);

  const [bloom, setBloom] = useState(false);
  const hasBloomedRef = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (selectedNodeId !== undefined) {
      setInternalSelectedNode(selectedNodeId);
      // PR-3 UX: the focus highlight must follow the selection. When the
      // selection is cleared or moves to another node, drop the focusedNode
      // ring too — otherwise a previously Focused node stays lit forever.
      setFocusedNode((prev) => (prev !== null && prev !== selectedNodeId ? null : prev));
    }
  }, [selectedNodeId]);

  // A directly selected edge follows the panel selection (derived from the
  // canonical context). A node selection deliberately clears the edge — a
  // graph can highlight exactly one selection subject at a time.
  useEffect(() => {
    if (selectedEdgeId !== undefined) {
      setInternalSelectedEdge(selectedEdgeId);
      if (selectedEdgeId) setHoveredNode(null);
    }
  }, [selectedEdgeId]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let resizeTimer: NodeJS.Timeout;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          setDimensions({ width, height });
        }, 50);
      }
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, []);

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  const { layoutRef, apiRef, settled, motionState } = useGraphLayout(nodes, physicsEdges, dimensions.width, dimensions.height, { hoveredNodeId: hoveredNode, focusedNodeId: focusedNode, reducedMotion });

  useEffect(() => { apiRef.current.onTick(() => setTick((t) => t + 1)); return () => { apiRef.current.onTick(() => undefined); }; }, [apiRef]);

  // F-PR17 focus-aura lifecycle. The SIMULATION is the motion clock: any live
  // re-tick fades the analytical aura out (~150ms); a genuine settle arms a
  // short delay then fades the aura back in at the node's CURRENT position.
  // Reduced motion rides the same machine — every transition is `none`.
  const [focusAuraOn, setFocusAuraOn] = useState(false);
  const prevMotionRef = useRef<GraphMotionState>("settled");
  const auraReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevMotionRef.current;
    prevMotionRef.current = motionState;
    if (prev === motionState) return;
    if (motionState === "moving") {
      if (auraReturnTimerRef.current) { clearTimeout(auraReturnTimerRef.current); auraReturnTimerRef.current = null; }
      setFocusAuraOn(false);
    } else {
      if (auraReturnTimerRef.current) clearTimeout(auraReturnTimerRef.current);
      auraReturnTimerRef.current = setTimeout(() => {
        auraReturnTimerRef.current = null;
        setFocusAuraOn(true);
      }, AURA_SETTLE_DELAY_MS);
    }
  }, [motionState]);

  useEffect(() => () => {
    if (auraReturnTimerRef.current) { clearTimeout(auraReturnTimerRef.current); auraReturnTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!settled) return;
    if (hasBloomedRef.current) { setBloom(true); return; }
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => { setBloom(true); hasBloomedRef.current = true; });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [settled]);

  // PR-10: precompute nodeId → timestamp once per node snapshot. The old
  // `nodes.find` per call turned every render into O(V²)+ (node layer, edge
  // layer twice per edge, annotation layer, entrance pass).
  const nodeTimeById = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nodes) {
      const t = n.createdAt?.value ? new Date(n.createdAt.value).getTime() : NaN;
      if (!Number.isNaN(t)) map.set(n.id, t);
    }
    return map;
  }, [nodes]);

  const isNodeInTimeRange = useCallback((nodeId: string) => {
    if (!activeTimeRange) return true;
    const bounds = nodeTemporalBounds?.get(nodeId);
    if (bounds) {
      return bounds.min <= activeTimeRange[1] && bounds.max >= activeTimeRange[0];
    }
    const nodeTime = nodeTimeById.get(nodeId);
    if (nodeTime === undefined) return true;
    return nodeTime >= activeTimeRange[0] && nodeTime <= activeTimeRange[1];
  }, [activeTimeRange, nodeTimeById, nodeTemporalBounds]);

  const enterRef = useRef<Map<string, { t0: number; fromX: number; fromY: number }>>(new Map());
  const enterAnimRef = useRef<number | null>(null);
  const prevInRangeRef = useRef<Set<string> | null>(null);

  const stepEntrances = useCallback(() => {
    const now = performance.now(); let done = true;
    for (const [id, e] of enterRef.current) {
      const t = (now - e.t0) / ENTER_MS;
      if (t >= 1) enterRef.current.delete(id); else done = false;
    }
    setTick((t) => t + 1);
    if (done) { enterAnimRef.current = null; return; }
    enterAnimRef.current = requestAnimationFrame(stepEntrances);
  }, []);

  useEffect(() => {
    if (!activeTimeRange || !settled) { prevInRangeRef.current = null; return; }
    const inSet = new Set<string>(); const prev = prevInRangeRef.current;
    layoutRef.current.layoutNodes.forEach((n) => {
      if (isNodeInTimeRange(n.id)) {
        inSet.add(n.id);
        // P4: re-ease on EVERY playhead passage — a node leaving the range and
        // returning (later play, rewind-then-forward, replay) gets the same
        // off-canvas entrance as its very first appearance. Without this the
        // ease-in only fires once and later passes just pop the node in flat.
        if (prev && !prev.has(n.id)) {
          const spawn = offCanvasSpawn(n.x, n.y, dimensions.width, dimensions.height);
          enterRef.current.set(n.id, { t0: performance.now(), fromX: spawn.x, fromY: spawn.y });
        }
      }
    });
    if (enterRef.current.size > 0 && enterAnimRef.current === null) enterAnimRef.current = requestAnimationFrame(stepEntrances);
    prevInRangeRef.current = inSet;
  }, [layoutRef, activeTimeRange, isNodeInTimeRange, reducedMotion, dimensions, settled, stepEntrances]);

  useEffect(() => () => { if (enterAnimRef.current !== null) cancelAnimationFrame(enterAnimRef.current); }, []);

  const computeFit = useCallback((): { zoom: number; pan: { x: number; y: number } } | null => {
    const layoutNodes = layoutRef.current.layoutNodes;
    if (!layoutNodes.length || !dimensions.width || !dimensions.height) return null;
    const LABEL_PAD_X = 150; const LABEL_PAD_Y = 90;
    const xs = layoutNodes.map((n) => n.x || 0); const ys = layoutNodes.map((n) => n.y || 0);
    const minX = Math.min(...xs) - LABEL_PAD_X; const maxX = Math.max(...xs) + LABEL_PAD_X;
    const minY = Math.min(...ys) - LABEL_PAD_Y; const maxY = Math.max(...ys) + LABEL_PAD_Y;
    const boxWidth = Math.max(maxX - minX, 1); const boxHeight = Math.max(maxY - minY, 1);
    const bboxCx = (minX + maxX) / 2; const bboxCy = (minY + maxY) / 2;
    const scale = Math.min(MAX_FIT_ZOOM, MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((dimensions.width / boxWidth) * FIT_PADDING, (dimensions.height / boxHeight) * FIT_PADDING)));
    return { zoom: scale, pan: { x: -(bboxCx - cx) * scale, y: -(bboxCy - cy) * scale } };
  }, [layoutRef, dimensions, cx, cy]);

  const fit = useCallback(() => {
    const result = computeFit();
    if (result) { setZoom(result.zoom); setPan(result.pan); } else { setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [computeFit]);

  useEffect(() => { if (settled && !hasAutoFit) { fit(); setHasAutoFit(true); } }, [settled, hasAutoFit, fit]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.15).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.15).toFixed(2))), []);

  // F-PR17: focus is an analytical action — waking a gentle local response is
  // the intended "focus-triggered movement" (the graph flexes toward the target
  // through the existing focusBias force, then settles). The aura machine hides
  // the overlay during that wake and commits at the settled position.
  const applyFocus = useCallback((id: string | null) => {
    setFocusedNode(id);
    apiRef.current.setFocus(id);
  }, [apiRef]);

  const focusNode = useCallback((id: string) => {
    const node = layoutRef.current.layoutNodes.find((n) => n.id === id);
    if (!node || !dimensions.width || !dimensions.height) return;
    const d = Math.max(0, node.structuralImportance);
    // PR-3 UX: focus = center the object with a comfortable close-up. A
    // bounded 1.4x-3x zoom (importance-tuned) brings the subject forward
    // while keeping neighboring entities in view — no abrupt empty-screen dive.
    const targetZoom = Math.max(1.4, Math.min(MAX_ZOOM, 1.2 + d * 1.3));
    setPan({ x: -((node.x || cx) - cx) * targetZoom, y: -((node.y || cy) - cy) * targetZoom });
    setZoom(targetZoom);
    applyFocus(id);
    setInternalSelectedNode(id);
  }, [layoutRef, dimensions, cx, cy, applyFocus]);

  // PR-3 UX: frame a PAIR of nodes (e.g. the local bridge anchor + the foreign
  // island head) in ONE smooth, slightly slower camera move instead of the
  // old fit-then-dive two-step. The camera settles centered on the connection.
  const focusPair = useCallback(
    (aId: string, bId: string, durationMs = 800) => {
      const layoutNodes = layoutRef.current.layoutNodes;
      if (!layoutNodes.length || !dimensions.width || !dimensions.height) return;
      const a = layoutNodes.find((n) => n.id === aId);
      const b = layoutNodes.find((n) => n.id === bId);
      const xs = [a?.x, b?.x].filter((v): v is number => v != null && Number.isFinite(v));
      const ys = [a?.y, b?.y].filter((v): v is number => v != null && Number.isFinite(v));
      if (!xs.length || !ys.length) return;
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const targetCx = (minX + maxX) / 2;
      const targetCy = (minY + maxY) / 2;
      const boxW = Math.max(maxX - minX, 220);
      const boxH = Math.max(maxY - minY, 220);
      const scale = Math.min(
        2.2,
        Math.max(1, Math.min((dimensions.width / boxW) * 0.65, (dimensions.height / boxH) * 0.65)),
      );
      setCameraEase(`${Math.max(400, Math.round(durationMs))}ms cubic-bezier(0.22, 1, 0.36, 1)`);
      setPan({ x: -(targetCx - cx) * scale, y: -(targetCy - cy) * scale });
      setZoom(scale);
      setFocusedNode(aId);
      setInternalSelectedNode(aId);
    },
    [layoutRef, dimensions, cx, cy],
  );

  useEffect(() => {
    if (cameraEase === "400ms cubic-bezier(0.22, 1, 0.36, 1)") return;
    // Reset the programmatic ease AFTER the requested camera move completes,
    // with a small buffer so the next user interaction is snappy again.
    const durationMatch = /\b(\d+)ms\b/.exec(cameraEase);
    const moveMs = durationMatch ? Number(durationMatch[1]) : 1600;
    const t = setTimeout(
      () => setCameraEase("400ms cubic-bezier(0.22, 1, 0.36, 1)"),
      Math.max(moveMs + 400, 1600),
    );
    return () => clearTimeout(t);
  }, [cameraEase]);

  useEffect(() => { if (controlsRef) controlsRef.current = { zoomIn, zoomOut, fit, focusNode, focusPair }; }, [controlsRef, zoomIn, zoomOut, fit, focusNode, focusPair]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z - e.deltaY * 0.001).toFixed(2))));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const dragBehavior = useMemo(() => {
    const drag = d3Drag<SVGCircleElement, LayoutNode>()
      .clickDistance(3)
      .on("start", (_event, d) => { draggingNodeId.current = d.id; apiRef.current.beginDrag(d.id); })
      .on("drag", (event) => {
        const id = draggingNodeId.current; if (!id) return;
        const svg = svgRef.current; if (!svg) return;
        const dims = dimensionsRef.current;
        const [sx, sy] = d3Pointer(event.sourceEvent ?? event, svg);
        const w = screenToWorld(sx, sy, panRef.current, zoomRef.current, dims.width / 2, dims.height / 2);
        apiRef.current.moveNode(id, w.x, w.y);
      })
      .on("end", (_event, d) => { draggingNodeId.current = null; apiRef.current.endDrag(d.id); });
    drag.container(() => (svgRef.current ?? document.body) as SVGSVGElement);
    return drag;
  }, [apiRef]);

  const bindNodeDrag = useCallback((el: SVGCircleElement | null) => {
    if (!el) return;
    const id = el.dataset.nodeid; if (!id) return;
    d3Select(el).datum({ id } as LayoutNode).on(".drag", null).call(dragBehavior);
  }, [dragBehavior]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-nodeid]")) return;
    setIsPanning(true);
    setInternalSelectedNode(null);
    setFocusedNode(null);
    onCanvasBackgroundPointerDown?.();
    panOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panOrigin.current.x;
    const dy = e.clientY - panOrigin.current.y;
    setPan({ x: panOrigin.current.panX + dx, y: panOrigin.current.panY + dy });
  };
  const stopPanning = () => setIsPanning(false);

  const layoutNodes = layoutRef.current.layoutNodes;
  const layoutEdges = layoutRef.current.layoutEdges;
  const communities = layoutRef.current.communities;
  const focusActive = visualContext?.focus != null;

  // PR-10: index layout nodes once per physics snapshot so the render path
  // (edge geometry, attention regions, entrance easing, edge endpoints) is
  // O(E) + O(V) instead of O(E·V) / O(V²) `.find` scans every frame.
  const layoutNodesById = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of layoutNodes) map.set(n.id, n);
    return map;
  }, [layoutNodes]);

  // PR-10: the PR-4 filter prunes RENDERED edges only. Physics still runs on
  // the full topology; only these ids are drawn from the layout's edge set.
  const visibleEdgeIds = useMemo(() => {
    return new Set(edges.map((e) => e.id));
  }, [edges]);

  // PR-10: undirected adjacency over the RENDERED edges only (matches the
  // pre-existing hover-dim semantics: a node dims unless it shares a visible
  // relation with the hovered node). Replaces the per-node `edges.some(...)`
  // O(E) scan inside the node render loop.
  const adjacencyFor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      const a = map.get(e.sourceNodeId) ?? new Set<string>();
      a.add(e.targetNodeId);
      map.set(e.sourceNodeId, a);
      const b = map.get(e.targetNodeId) ?? new Set<string>();
      b.add(e.sourceNodeId);
      map.set(e.targetNodeId, b);
    }
    return map;
  }, [edges]);

  const edgeGeometry = useMemo(() => {
    const map = new Map<string, number>();
    layoutEdges.forEach((edge) => {
      const source = layoutNodesById.get(edge.sourceNodeId);
      const target = layoutNodesById.get(edge.targetNodeId);
      if (source && target) map.set(edge.id, Math.max(1, Math.hypot((target.x||0) - (source.x||0), (target.y||0) - (source.y||0))));
    });
    return map;
  }, [layoutEdges, layoutNodesById]);

  const enterPos = useCallback((id: string): { x: number; y: number; alpha: number; active: boolean } | null => {
    const e = enterRef.current.get(id); if (!e) return null;
    const node = layoutNodesById.get(id); if (!node) return null;
    const t = Math.min(1, (performance.now() - e.t0) / ENTER_MS);
    const k = easeInOutCubic(t);
    return { x: e.fromX + ((node.x||cx) - e.fromX) * k, y: e.fromY + ((node.y||cy) - e.fromY) * k, alpha: k, active: t < 1 };
  }, [layoutNodesById, cx, cy]);

  // PR-6: hydrate the presentation model with THIS canvas's interaction state.
  // The base map is derived once in the panel; interaction is canvas-local and
  // never mutates the base context. Attention snaps to 3 whenever the node is
  // selected or focused (the hierarchy apex).
  const nodeStateFor = useCallback(
    (node: LayoutNode): GraphNodeVisualState => {
      const raw = visualContext?.nodes.get(node.id) ?? DEFAULT_NODE_VISUAL_STATE;
      const selected = internalSelectedNode === node.id;
      const focused = focusedNode === node.id;
      const hovered = hoveredNode === node.id;
      return {
        ...raw,
        selected,
        focused,
        hovered,
        attentionLevel: selected || focused ? 3 : raw.attentionLevel,
      };
    },
    [visualContext, internalSelectedNode, focusedNode, hoveredNode],
  );

  const edgeStateFor = useCallback(
    (edge: LayoutEdge, interaction: { selected: boolean; focused: boolean; hovered: boolean; selectedEdge: boolean }): GraphEdgeVisualState => {
      const raw = visualContext?.edges.get(edge.id) ?? DEFAULT_EDGE_VISUAL_STATE;
      const selected = raw.selected || interaction.selectedEdge;
      return {
        ...raw,
        selected,
        incidentToSelection: raw.incidentToSelection || interaction.selected || interaction.focused || interaction.hovered || selected,
        attentionLevel: selected || interaction.selected || interaction.focused ? 3 : raw.attentionLevel,
      };
    },
    [visualContext],
  );

  const attentionRegions = useMemo(() => {
    if (!visualContext?.regions.length) return [];
    return visualContext.regions.map((region) => {
      const members = region.memberNodeIds
        .map((id) => layoutNodesById.get(id))
        .filter((n): n is LayoutNode => Boolean(n))
        .map((n) => ({ x: n.x ?? cx, y: n.y ?? cy }));
      if (members.length === 0) return null;
      const centerX = members.reduce((s, m) => s + m.x, 0) / members.length;
      const centerY = members.reduce((s, m) => s + m.y, 0) / members.length;
      const radius = Math.max(56, Math.max(0, ...members.map((m) => Math.hypot(m.x - centerX, m.y - centerY))) + 30);
      return { id: region.id, signals: region.signalTypes, cx: centerX, cy: centerY, radius };
    }).filter((r): r is { id: string; signals: GraphAttentionRegion["signalTypes"]; cx: number; cy: number; radius: number } => Boolean(r));
  }, [visualContext, layoutNodesById, cx, cy]);

  if (!dimensions.width) return <div ref={containerRef} className="w-full h-full" />;

  const EASE_NORMAL = "400ms cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_SLOW = "1200ms cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_SPRING = "500ms cubic-bezier(0.175, 0.885, 0.32, 1.15)";

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-semantic-background animate-fade-in"
      data-graph-physics-edges={physicsEdges.length}
      data-graph-render-edges={visibleEdgeIds.size}
      data-graph-motion={motionState}
      data-focus-aura={focusAuraOn ? "visible" : "hidden"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerLeave={stopPanning}
      onDoubleClick={fit}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      <svg ref={svgRef} className="w-full h-full relative z-10 overflow-hidden" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
        <defs>
          <filter id="ambient-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodOpacity="0.8" floodColor="#000" />
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.4" floodColor="#000" />
          </filter>
          <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.9" floodColor="#000" />
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="fog-gradient">
            <stop offset="0%" stopColor="var(--color-surface-300)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--color-surface-400)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bridge-halo-gradient">
            <stop offset="0%" stopColor="var(--color-accent-rose)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent-rose)" stopOpacity="0" />
          </radialGradient>
          
          <radialGradient id="foreign-halo-gradient">
            <stop offset="0%" stopColor="var(--color-semantic-foreign)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-semantic-foreign)" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="attention-gradient">
            <stop offset="0%" stopColor="var(--color-semantic-attention)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--color-semantic-attention)" stopOpacity="0" />
          </radialGradient>

          <pattern id="canvas-grid" width="64" height="64" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="var(--color-surface-400)" opacity="0.16" />
            <path d="M 32 30 L 32 34 M 30 32 L 34 32" stroke="var(--color-surface-400)" strokeWidth="0.5" opacity="0.08" />
          </pattern>
          <marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0.5 L10 5 L0 9.5 z" fill="context-stroke" />
          </marker>
          <marker id="edge-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0.5 L10 5 L0 9.5 z" fill="var(--color-semantic-foreign)" />
          </marker>
        </defs>

        <rect x={0} y={0} width={dimensions.width} height={dimensions.height} fill="url(#canvas-grid)" />

        <g opacity={0.05} transform={`translate(${cx}, ${cy})`}>
          <line x1="-40" y1="0" x2="40" y2="0" stroke="var(--color-surface-600)" strokeWidth="1" />
          <line x1="0" y1="-40" x2="0" y2="40" stroke="var(--color-surface-600)" strokeWidth="1" />
          <circle cx="0" cy="0" r="16" fill="none" stroke="var(--color-surface-600)" strokeWidth="1" />
        </g>

        <g transform={`translate(${pan.x}, ${pan.y}) translate(${cx}, ${cy}) scale(${zoom}) translate(${-cx}, ${-cy})`} style={{ transition: isPanning ? "none" : `transform ${cameraEase}`, willChange: "transform" }}>
          
          <g id="community-layer">
            {communities.map((c) => {
              const distFromCenter = Math.hypot(c.cx - cx, c.cy - cy) || 0;
              const rippleDelay = Math.max(0, distFromCenter * 1.5);
              return (
                <circle
                  key={`fog-${c.id}`} cx={c.cx} cy={c.cy} r={c.r} fill="url(#fog-gradient)"
                  style={{ opacity: bloom ? 1 : 0, transition: reducedMotion ? "none" : `opacity ${EASE_SLOW} ${rippleDelay + 200}ms` }}
                />
              );
            })}
          </g>

          <g id="attention-layer">
            {attentionRegions.map((region) => (
              <g
                key={`attention-region-${region.id}`}
                data-graph-attention-region={region.id}
                data-graph-attention-signals={region.signals.join(",")}
                data-graph-attention-members={region.id}
              >
                <circle cx={region.cx} cy={region.cy} r={region.radius} fill="url(#attention-gradient)" style={{ opacity: bloom ? 1 : 0, transition: reducedMotion ? "none" : `opacity ${EASE_SLOW} 500ms` }} />
                <circle cx={region.cx} cy={region.cy} r={region.radius + 6} fill="none" stroke="var(--color-semantic-attention)" strokeWidth={1.5} strokeDasharray="3 6" style={{ opacity: bloom ? 0.65 : 0, transition: reducedMotion ? "none" : `opacity ${EASE_SLOW} 800ms` }} />
              </g>
            ))}
          </g>

          <g id="foreign-halo-layer">
            {layoutNodes.filter((n) => (n as any).isForeign).map((node) => {
              const pos = enterPos(node.id);
              const bx = pos ? pos.x : (node.x || cx); 
              const by = pos ? pos.y : (node.y || cy);
              return (
                <circle
                  key={`foreign-halo-${node.id}`} cx={bx} cy={by} r={120}
                  fill="url(#foreign-halo-gradient)" className={reducedMotion ? "" : "animate-slow-pulse"}
                  style={{ opacity: bloom ? (pos ? pos.alpha : 1) : 0, transform: bloom ? "scale(1)" : "scale(0.01)", transformOrigin: `${bx}px ${by}px`, transition: reducedMotion ? "none" : `opacity ${EASE_SLOW} 400ms, transform ${EASE_SPRING} 400ms` }}
                />
              );
            })}
          </g>

          <g id="edge-layer">
            {layoutNodes.length > 0 &&
              layoutEdges.map((edge) => {
                // PR-10: the physics layout holds the FULL topology; only the
                // PR-4 filtered projection is rendered.
                if (!visibleEdgeIds.has(edge.id)) return null;
                const source = layoutNodesById.get(edge.sourceNodeId);
                const target = layoutNodesById.get(edge.targetNodeId);
                if (!source || !target) return null;

                const support = edge.support ?? 1;
                const isLowConfidence = support < 0.5;
                const isContradicted = edge.status === "CONTRADICTED";
                const isDragged = draggingNodeId.current === source.id || draggingNodeId.current === target.id;
                
                const isForeignBridge = (edge as any).isForeignBridge;
                const isForeignEdge = (edge as any).isForeignEdge;
                  
                const isSelectedEdge = internalSelectedEdge === edge.id;
                const isConnected = isSelectedEdge || hoveredNode === source.id || hoveredNode === target.id || focusedNode === source.id || focusedNode === target.id || internalSelectedNode === source.id || internalSelectedNode === target.id || isDragged;
                const isOutOfBounds = !isNodeInTimeRange(source.id) || !isNodeInTimeRange(target.id);
                const length = Math.max(1, edgeGeometry.get(edge.id) ?? 1);

                const sPos = enterPos(source.id);
                const tPos = enterPos(target.id);
                const sEntering = sPos ? sPos.active : false;
                const tEntering = tPos ? tPos.active : false;
                const entranceAlpha = Math.min(sPos ? sPos.alpha : 1, tPos ? tPos.alpha : 1);
                const x1 = sPos ? sPos.x : (source.x || cx); const y1 = sPos ? sPos.y : (source.y || cy);
                let ex = tPos ? tPos.x : (target.x || cx); let ey = tPos ? tPos.y : (target.y || cy);

                if (edge.directed) {
                  const targetRadius = nodeVisualRadius(target.structuralImportance);
                  const tdx = ex - x1; const tdy = ey - y1; const tdist = Math.hypot(tdx, tdy) || 1;
                  ex = ex - (tdx / tdist) * (targetRadius + 4); ey = ey - (tdy / tdist) * (targetRadius + 4);
                }

                const edgeDelay = Math.max(0, Math.hypot((x1+ex)/2 - cx, (y1+ey)/2 - cy) * 1.5) + 100;
                const initialOffset = Math.hypot((source.x||cx) - cx, (source.y||cy) - cy) > Math.hypot((target.x||cx) - cx, (target.y||cy) - cy) ? -length : length;

                const interaction = {
                  selected: internalSelectedNode === source.id || internalSelectedNode === target.id,
                  focused: focusedNode === source.id || focusedNode === target.id,
                  hovered: hoveredNode === source.id || hoveredNode === target.id,
                  selectedEdge: isSelectedEdge,
                };
                const vs = edgeStateFor(edge, interaction);
                const focusRecede =
                  focusActive &&
                  !vs.hypothesisRelevance &&
                  !vs.evidenceInScope &&
                  !vs.gapAffected &&
                  !isConnected &&
                  !isForeignBridge &&
                  !isContradicted;

                let colorClass = "stroke-semantic-foreground-faint/70";
                if (isForeignBridge) colorClass = "stroke-semantic-foreign drop-shadow-[0_0_8px_var(--color-semantic-foreign)]";
                else if (isForeignEdge) colorClass = "stroke-semantic-foreign/35";
                else if (isContradicted) colorClass = "stroke-semantic-contradiction";
                else if (focusActive && (vs.hypothesisRelevance === "supporting" || vs.evidenceInScope)) colorClass = "stroke-semantic-supported";
                else if (isConnected && !isOutOfBounds) colorClass = "stroke-semantic-selection";
                
                const dashArray = isForeignBridge ? "8 6" : isContradicted ? "4 4" : isLowConfidence ? "6 6" : reducedMotion ? undefined : `${length} ${length}`;
                const dashOffset = isForeignBridge || isLowConfidence || isContradicted || reducedMotion ? 0 : bloom ? 0 : initialOffset;

                const drawOn = (sEntering || tEntering) && sEntering !== tEntering && !isLowConfidence && !isContradicted && !reducedMotion;
                let edgePath = `M ${x1} ${y1} L ${ex} ${ey}`;
                let edgeDashArray: string | undefined = dashArray;
                let edgeDashOffset = dashOffset;
                let edgeMarkerEnd = edge.directed && !isOutOfBounds ? (isForeignEdge || isForeignBridge ? "url(#edge-arrow-blue)" : "url(#edge-arrow)") : undefined;
                
                if (drawOn) {
                  const anchor = sEntering ? { x: target.x||cx, y: target.y||cy } : { x: source.x||cx, y: source.y||cy };
                  const moving = sEntering ? sPos ? { x: sPos.x, y: sPos.y } : { x: source.x||cx, y: source.y||cy } : tPos ? { x: tPos.x, y: tPos.y } : { x: target.x||cx, y: target.y||cy };
                  const progress = sEntering ? (sPos ? sPos.alpha : 1) : tPos ? tPos.alpha : 1;
                  const drawLen = Math.max(1, Math.hypot(moving.x - anchor.x, moving.y - anchor.y));
                  edgePath = `M ${anchor.x} ${anchor.y} L ${moving.x} ${moving.y}`;
                  edgeDashArray = `${drawLen} ${drawLen}`; edgeDashOffset = drawLen * (1 - progress); edgeMarkerEnd = undefined;
                }

                const baseOpacity = isOutOfBounds ? OUT_OF_RANGE_EDGE_OPACITY : isForeignBridge ? 1 : isContradicted ? 0.6 : isConnected ? 1 : isLowConfidence ? 0.28 : support * 0.34 + 0.14;
                const showTrace = (isConnected || isForeignBridge) && !isContradicted && !isLowConfidence && !reducedMotion;

                const edgeOpacity = baseOpacity * entranceAlpha * (focusRecede ? 0.4 : 1);

                return (
                  <g
                    key={edge.id}
                    data-graph-edge-state={JSON.stringify({
                      band: vs.supportBand,
                      posture: vs.posture,
                      grounded: vs.grounded,
                      scope: vs.caseScope,
                      temporal: vs.temporal,
                      hypRel: vs.hypothesisRelevance,
                      evidenceInScope: vs.evidenceInScope,
                      gapAffected: vs.gapAffected,
                      selected: interaction.selected || interaction.selectedEdge,
                      attentionLevel: vs.attentionLevel,
                    })}
                    data-graph-case-scope={vs.caseScope}
                    data-graph-attention-level={String(vs.attentionLevel)}
                    data-graph-edge-grounded={vs.grounded && !isForeignBridge && !isContradicted ? "true" : undefined}
                  >
                    {vs.grounded && !isForeignBridge && !isContradicted && !isOutOfBounds && (
                      <circle
                        cx={(x1 + ex) / 2} cy={(y1 + ey) / 2} r={2.5}
                        fill="var(--color-accent-amber)" stroke="var(--color-surface-0)" strokeWidth={1}
                        data-graph-edge-grounded="true"
                        style={{ opacity: bloom ? (isConnected ? 1 : 0.7) : 0, transition: reducedMotion ? "none" : `opacity ${EASE_NORMAL} ${edgeDelay}ms` }}
                      />
                    )}
                    <path
                      d={edgePath} fill="none" strokeLinecap="round"
                      strokeDasharray={sEntering || tEntering ? edgeDashArray : showTrace ? "6 4" : dashArray}
                      strokeDashoffset={sEntering || tEntering ? edgeDashOffset : dashOffset}
                      markerEnd={edgeMarkerEnd} className={`${colorClass} ${isConnected ? "focus-target" : ""}`}
                      strokeWidth={isConnected || isForeignBridge ? 2.25 : Math.max(1, (edge.structuralImportance ?? support ?? 0.5) * 2)}
                      strokeOpacity={edgeOpacity}
                      style={{ transition: reducedMotion || (sEntering || tEntering) ? "none" : `stroke-dashoffset 800ms cubic-bezier(0.22, 1, 0.36, 1) ${edgeDelay}ms, stroke-opacity ${EASE_NORMAL} ${edgeDelay}ms, stroke 200ms cubic-bezier(0.22, 1, 0.36, 1)` }}
                    >
                      {showTrace && <animate attributeName="stroke-dashoffset" from="20" to="0" dur={isForeignBridge ? "0.4s" : "0.6s"} repeatCount="indefinite" />}
                    </path>
                    <path
                      d={edgePath} fill="none" stroke="transparent" strokeOpacity={0}
                      strokeLinecap="round" strokeWidth={14} style={{ pointerEvents: isOutOfBounds ? "none" : "stroke" }}
                      aria-hidden="true"
                      className="cursor-pointer"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInternalSelectedEdge(edge.id);
                        onEdgeClick?.(edge.id);
                      }}
                    />
                  </g>
                );
              })}
          </g>

          <g className="focus-target"><GraphHoleBurstLayer layoutNodes={layoutNodes} holes={holes} reducedMotion={reducedMotion} zoom={zoom} bloom={bloom} selectedHoleIds={selectedHoleIds} /></g>

          <g id="node-layer">
            {layoutNodes.map((node) => {
              const isForeign = (node as any).isForeign;
              const inTimeRange = isNodeInTimeRange(node.id);
              // F-PR18: SELECTION is a committed node state — its body emphasis
              // (fill, stroke, glow, label) persists through motion. The
              // analytical FOCUS RING (dashed circle) is a transient overlay
              // that hides while the graph moves and returns only after settle.
              const isSelectedNode = internalSelectedNode === node.id;
              const isFocusTarget = focusedNode === node.id;
              const isHovered = hoveredNode === node.id;
              const isActive = isSelectedNode || isFocusTarget || isHovered;
              const bodyEmphasis = isSelectedNode || (focusAuraOn && (isFocusTarget || isHovered));
              const ringVisible = motionState === "settled" && bodyEmphasis && inTimeRange;
              const hoverDimmed = hoveredNode !== null && !isActive && !(adjacencyFor.get(hoveredNode)?.has(node.id) ?? false);

              const pos = enterPos(node.id);
              const nx = pos ? pos.x : (node.x || cx); 
              const ny = pos ? pos.y : (node.y || cy);
              const radius = nodeVisualRadius(node.structuralImportance);

              // PR-6: hydrate the base presentation state with this canvas's
              // interaction state, then apply the focus-scope recede rule.
              const vs = nodeStateFor(node);
              const focusRecede =
                focusActive &&
                !vs.hypothesisRelevance &&
                !vs.evidenceInScope &&
                !vs.gapAffected &&
                vs.evidencePosture !== "contradicted" &&
                !isActive;

              let fillColor = "fill-semantic-surface-soft";
              let strokeColor = "stroke-semantic-foreground-muted";

              if (bodyEmphasis && inTimeRange) { fillColor = "fill-semantic-selection-subtle"; strokeColor = "stroke-semantic-selection shadow-[0_0_18px_var(--color-semantic-selection)]"; }
              else if (isForeign) { fillColor = "fill-semantic-foreign/15"; strokeColor = "stroke-semantic-foreign/80"; }
              else if (focusActive && (vs.hypothesisRelevance === "supporting" || vs.evidenceInScope)) { fillColor = "fill-semantic-supported/15"; strokeColor = "stroke-semantic-supported/90"; }
              else if (node.isBridge) { fillColor = "fill-semantic-surface-elevated"; strokeColor = "stroke-accent-rose/70"; }
              else if (node.type === "ENTITY") { fillColor = "fill-semantic-surface-soft"; strokeColor = "stroke-semantic-foreground-faint"; }

              const nodeDelay = Math.max(0, Math.hypot(nx - cx, ny - cy) * 1.5) || 0;

              // F-PR14: the node group DIM is floor-clamped. Previously the
              // multiplicative chain dropped a simultaneously hover-dimmed +
              // focus-receded body to 0.05 opacity — effectively invisible, so
              // edge strokes rendered straight through the node. The body must
              // stay composited above the edge layer: attention signals ride
              // the rings/labels instead of collapsing the body into a hole.
              const stateDim = hoverDimmed
                ? focusRecede
                  ? 0.35
                  : 0.4
                : focusRecede
                  ? 0.65
                  : 1;

              return (
                <g
                  key={node.id}
                  className={isActive ? "focus-target" : ""}
                  data-graph-node-state={JSON.stringify({
                    posture: vs.evidencePosture,
                    role: vs.structuralRole,
                    temporal: vs.temporal,
                    scope: vs.caseScope,
                    hypRel: vs.hypothesisRelevance,
                    evidenceInScope: vs.evidenceInScope,
                    gapAffected: vs.gapAffected,
                    attentionLevel: vs.attentionLevel,
                  })}
                  data-graph-selected={vs.selected ? "true" : undefined}
                  data-graph-focused={vs.focused ? "true" : undefined}
                  data-graph-hovered={vs.hovered ? "true" : undefined}
                  data-graph-case-scope={vs.caseScope}
                  data-graph-attention-level={String(vs.attentionLevel)}
                  data-graph-node-posture={vs.evidencePosture}
                  style={{ opacity: (!inTimeRange ? OUT_OF_RANGE_NODE_OPACITY : bloom ? stateDim : 0) * (pos ? pos.alpha : 1), transform: bloom ? "scale(1)" : "scale(0.01)", transformOrigin: `${nx}px ${ny}px`, transition: reducedMotion || (pos ? pos.active : false) ? "none" : `opacity ${EASE_NORMAL} ${nodeDelay}ms, transform ${EASE_SPRING} ${nodeDelay}ms` }}
                >
                  {/* F-PR17 analytical focus aura: a thin dashed ring rendered at
                      the node's CURRENT live position. SELECTION (a committed
                      node state) stays lit through motion; the FOCUS/hover aura
                      hides while the graph moves and fades back in on settle. */}
                  {isFocusTarget || isHovered ? (
                    <circle
                      cx={nx} cy={ny} r={radius + 8} fill="none" stroke="var(--color-semantic-selection)" strokeWidth={1.5} strokeDasharray="1.5 4" strokeLinecap="round"
                      data-graph-aura={ringVisible ? "focus" : "hidden"}
                      data-graph-aura-x={nx}
                      data-graph-aura-y={ny}
                      style={{ opacity: ringVisible ? 1 : 0, transition: reducedMotion ? "none" : motionState === "moving" ? "opacity 0ms" : `opacity ${ringVisible ? AURA_FADE_IN_MS : AURA_FADE_OUT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
                    />
                  ) : null}
                  {vs.evidencePosture === "contradicted" && (
                    <circle
                      cx={nx} cy={ny} r={radius + 3} fill="none" stroke="var(--color-semantic-contradiction)" strokeWidth={1.5} strokeDasharray="3 4"
                      data-graph-node-posture="contradicted"
                      style={{ opacity: bloom ? (focusRecede ? 0.5 : 0.85) : 0, transition: reducedMotion ? "none" : `opacity ${EASE_NORMAL} ${nodeDelay}ms` }}
                    />
                  )}
                  {vs.gapAffected && (
                    <circle
                      cx={nx} cy={ny} r={radius + 7} fill="none" stroke="var(--color-warning)" strokeWidth={1.5} strokeDasharray="3 4"
                      data-graph-gap-affected="true"
                      style={{ opacity: bloom ? (focusRecede ? 0.5 : 0.85) : 0, transition: reducedMotion ? "none" : `opacity ${EASE_NORMAL} ${nodeDelay}ms` }}
                    />
                  )}
                  <circle
                    cx={nx} cy={ny} r={radius} filter={bodyEmphasis || isForeign ? "url(#node-glow)" : "url(#ambient-shadow)"}
                    className={`outline-none transition-colors duration-fast ${fillColor} ${strokeColor}`}
                    strokeWidth={bodyEmphasis || isForeign ? 2.5 : 1.5}
                  />
                  <svg
                    x={nx - (radius * 1.15) / 2} y={ny - (radius * 1.15) / 2} width={radius * 1.15} height={radius * 1.15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                    className={`pointer-events-none transition-colors duration-fast ${bodyEmphasis && inTimeRange ? "text-semantic-selection" : isForeign ? "text-semantic-foreign" : "text-semantic-foreground-faint"}`}
                  >
                    <path d={getNodeIconPath(node)} />
                  </svg>
                </g>
              );
            })}
          </g>

          <g id="interaction-layer" ref={interactionLayerRef}>
            {layoutNodes.map((node) => {
              const inTimeRange = isNodeInTimeRange(node.id);
              const selected = internalSelectedNode === node.id || focusedNode === node.id;
              return (
                <circle
                  key={`interact-${node.id}`} ref={bindNodeDrag} data-nodeid={node.id} cx={node.x || cx} cy={node.y || cy} r={32} tabIndex={inTimeRange ? 0 : -1} role="button" aria-label={`${node.label ?? "Entity"}${node.isBridge ? ", bridge candidate" : ""}`} aria-pressed={selected ? "true" : undefined}
                  className={`fill-transparent outline-none ${inTimeRange ? "cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-semantic-focus" : "pointer-events-none"}`}
                  onMouseEnter={() => setHoveredNode(node.id)} onMouseLeave={() => setHoveredNode(null)}
                  onFocus={() => applyFocus(node.id)} onBlur={() => applyFocus(null)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setInternalSelectedEdge(null); setInternalSelectedNode(node.id); onNodeClick(node.id); } }}
                  onClick={() => { setInternalSelectedEdge(null); setInternalSelectedNode(node.id); onNodeClick(node.id); }}
                />
              );
            })}
          </g>

          <g id="annotation-layer">
            {layoutNodes.map((node) => {
              const inTimeRange = isNodeInTimeRange(node.id);
              const isSelectedNode = internalSelectedNode === node.id;
              const isFocusTarget = focusedNode === node.id;
              const isHovered = hoveredNode === node.id;
              const isActive = isSelectedNode || isFocusTarget || isHovered;
              // F-PR17: label emphasis (selection always, focus/hover only when
              // the analytical aura is committed) mirrors the node layer.
              const bodyEmphasis = isSelectedNode || (focusAuraOn && (isFocusTarget || isHovered));
              const isForeign = (node as any).isForeign;
              const pos = enterPos(node.id);
              
              const dx = (pos ? pos.x : (node.x || cx)) - cx; 
              const dy = (pos ? pos.y : (node.y || cy)) - cy;
              const angle = Math.atan2(dy, dx); const cosA = Math.cos(angle); const sinA = Math.sin(angle);
              const labelOffset = nodeVisualRadius(node.structuralImportance) + 16;
              const lx = (pos ? pos.x : (node.x || cx)) + cosA * labelOffset; 
              const ly = (pos ? pos.y : (node.y || cy)) + sinA * labelOffset + 3;
              const textAnchor = cosA > 0.35 ? "start" : cosA < -0.35 ? "end" : "middle";

              const labelDelay = Math.max(0, Math.hypot((node.x || cx) - cx, (node.y || cy) - cy) * 1.5) + 150;

              return (
                <g key={`label-${node.id}`} transform={`translate(${lx}, ${ly}) scale(${1 / zoom}) translate(${-lx}, ${-ly})`}>
                  <text
                    x={lx} y={ly} textAnchor={textAnchor} paintOrder="stroke fill"
                    className={`font-mono text-[9px] uppercase tracking-widest pointer-events-none transition-colors duration-fast ${bodyEmphasis && inTimeRange ? "fill-semantic-selection font-bold" : isForeign ? "fill-semantic-foreign font-bold drop-shadow-[0_0_4px_var(--color-semantic-foreign)]" : "fill-semantic-foreground-muted font-medium"}`}
                    style={{ opacity: (!inTimeRange ? OUT_OF_RANGE_LABEL_OPACITY : hoveredNode !== null && !isActive ? 0.3 : bloom ? (isActive ? 1 : 0.9) : 0) * (pos ? pos.alpha : 1), stroke: "var(--color-surface-0)", strokeWidth: 2, transition: reducedMotion || (pos ? pos.active : false) ? "none" : `opacity ${EASE_NORMAL} ${labelDelay}ms` }}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_50%,transparent_50%,rgba(0,0,0,0.6)_100%)] mix-blend-multiply" />
    </div>
  );
}