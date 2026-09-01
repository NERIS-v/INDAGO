"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { drag as d3Drag } from "d3-drag";
import { select as d3Select, pointer as d3Pointer } from "d3-selection";
import {
  useGraphLayout,
  nodeVisualRadius,
  screenToWorld,
  type LayoutNode,
} from "./use-graph-layout";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";
import { GraphHoleBurstLayer } from "./graph-hole-burst-layer";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  holes: GraphHole[];
  onNodeClick: (nodeId: string) => void;
  activeTimeRange: [number, number] | null;
  controlsRef?: React.MutableRefObject<{
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    focusNode: (id: string) => void;
  } | null>;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;
const FIT_PADDING = 0.85;

// Time-window entrance: how long a node takes to fly in from outside the canvas
// (ease-in → ease-out), and how far past the edge it starts.
const ENTER_MS = 700;
const OFF_CANVAS_GAP = 60;

/** Symmetric ease-in-out cubic: 0 → 0.5 → 1 with no speed jumps at the ends. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Spawn point just outside the canvas, along the ray from the viewport center
 *  through the node's landing (home) position — so it appears to fly in from
 *  off-screen and sweep to where it connects. */
function offCanvasSpawn(nodeX: number, nodeY: number, w: number, h: number): { x: number; y: number } {
  let dirX = nodeX - w / 2;
  let dirY = nodeY - h / 2;
  const rayLen = Math.hypot(dirX, dirY);
  if (rayLen < 1) {
    dirX = 0;
    dirY = -1;
  } else {
    dirX /= rayLen;
    dirY /= rayLen;
  }
  const exitX = Math.abs(dirX) > 1e-6 ? w / 2 / Math.abs(dirX) : Infinity;
  const exitY = Math.abs(dirY) > 1e-6 ? h / 2 / Math.abs(dirY) : Infinity;
  const exitDist = Math.min(exitX, exitY);
  return { x: w / 2 + dirX * (exitDist + OFF_CANVAS_GAP), y: h / 2 + dirY * (exitDist + OFF_CANVAS_GAP) };
}

export function GraphCanvas({
  nodes,
  edges,
  holes,
  onNodeClick,
  activeTimeRange,
  controlsRef,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionLayerRef = useRef<SVGGElement>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hasAutoFit, setHasAutoFit] = useState(false);
  const panOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  // Live mutable copies used by the d3-drag handler (a stable closure).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;
  const draggingNodeId = useRef<string | null>(null);

  const [bloom, setBloom] = useState(false);
  const hasBloomedRef = useRef(false);

  // Imperative per-tick re-render driver — see note below.
  const [, setTick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  const { layoutRef, apiRef, settled } = useGraphLayout(
    nodes,
    edges,
    dimensions.width,
    dimensions.height,
    { hoveredNodeId: hoveredNode, focusedNodeId: focusedNode, reducedMotion }
  );

  // Physics sends a *fresh* set of positions per tick; we re-render only while
  // the simulation is actively moving (settling or dragging). d3-force stops
  // its timer when alpha decays below the threshold, so there is no continuous
  // background re-render loop — when idle the graph holds still.
  useEffect(() => {
    apiRef.current.onTick(() => setTick((t) => t + 1));
    return () => {
      apiRef.current.onTick(() => undefined);
    };
  }, [apiRef]);

  const layoutNodes = layoutRef.current.layoutNodes;
  const layoutEdges = layoutRef.current.layoutEdges;
  const communities = layoutRef.current.communities;

  useEffect(() => {
    if (!settled) return;
    if (hasBloomedRef.current) {
      setBloom(true);
      return;
    }
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setBloom(true);
        hasBloomedRef.current = true;
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [settled]);

  const isNodeInTimeRange = useCallback(
    (nodeId: string) => {
      if (!activeTimeRange) return true;
      const originalNode = nodes.find((n) => n.id === nodeId);
      if (!originalNode || !originalNode.createdAt?.value) return true;
      const nodeTime = new Date(originalNode.createdAt.value).getTime();
      return nodeTime >= activeTimeRange[0] && nodeTime <= activeTimeRange[1];
    },
    [nodes, activeTimeRange]
  );

  // ─── Time-window entrances ─────────────────────────────────────────────
  // Nodes are never removed from the simulation when they leave the time
  // range (they just fade out at their resting position). When a node ENTERS
  // the range we animate it flying in from just outside the canvas to its
  // home with an ease-in / ease-out curve, driven per-frame in render (the
  // physics is untouched, so nothing else churns).
  const enterRef = useRef<Map<string, { t0: number; fromX: number; fromY: number }>>(new Map());
  const enterAnimRef = useRef<number | null>(null);
  const prevInRangeRef = useRef<Set<string> | null>(null);
  // Nodes that have already entered the time window at least once. A node only
  // flies in on its FIRST entry (e.g. while Play is building the graph). Moving
  // the scrubber back and forth must NOT re-trigger the fly-in — that reads as
  // "the graph rendering again unnecessarily" while dragging.
  const enteredOnceRef = useRef<Set<string>>(new Set());

  const stepEntrances = useCallback(() => {
    const now = performance.now();
    let done = true;
    for (const [id, e] of enterRef.current) {
      const t = (now - e.t0) / ENTER_MS;
      if (t >= 1) {
        enterRef.current.delete(id);
      } else {
        done = false;
      }
    }
    setTick((t) => t + 1);
    if (done) {
      enterAnimRef.current = null;
      return;
    }
    enterAnimRef.current = requestAnimationFrame(stepEntrances);
  }, []);

  useEffect(() => {
    if (!activeTimeRange) {
      prevInRangeRef.current = null;
      return;
    }
    // Only establish the baseline / diff fly-ins once the physics layout is
    // fully settled. Before that, layoutNodes may be populated asynchronously
    // (a node at a time), so a "first" diff against a partial prev set would
    // spuriously fly in the remaining nodes and read as a re-render — exactly
    // the bug observed on the first slider move.
    if (!settled) {
      prevInRangeRef.current = null;
      return;
    }
    const inSet = new Set<string>();
    const prev = prevInRangeRef.current;
    layoutNodes.forEach((n) => {
      if (isNodeInTimeRange(n.id)) {
        inSet.add(n.id);
        if (prev && !prev.has(n.id) && !enteredOnceRef.current.has(n.id)) {
          const spawn = offCanvasSpawn(n.x, n.y, dimensions.width, dimensions.height);
          enterRef.current.set(n.id, { t0: performance.now(), fromX: spawn.x, fromY: spawn.y });
        }
        enteredOnceRef.current.add(n.id);
      }
    });
    if (enterRef.current.size > 0 && enterAnimRef.current === null) {
      enterAnimRef.current = requestAnimationFrame(stepEntrances);
    }
    prevInRangeRef.current = inSet;
  }, [layoutNodes, activeTimeRange, isNodeInTimeRange, reducedMotion, dimensions, settled, stepEntrances]);

  useEffect(() => () => {
    if (enterAnimRef.current !== null) cancelAnimationFrame(enterAnimRef.current);
  }, []);

  const computeFit = useCallback((): { zoom: number; pan: { x: number; y: number } } | null => {
    if (!layoutNodes.length || !dimensions.width || !dimensions.height) return null;

    const LABEL_PAD_X = 150;
    const LABEL_PAD_Y = 90;

    const xs = layoutNodes.map((n) => n.x);
    const ys = layoutNodes.map((n) => n.y);
    const minX = Math.min(...xs) - LABEL_PAD_X;
    const maxX = Math.max(...xs) + LABEL_PAD_X;
    const minY = Math.min(...ys) - LABEL_PAD_Y;
    const maxY = Math.max(...ys) + LABEL_PAD_Y;
    const boxWidth = Math.max(maxX - minX, 1);
    const boxHeight = Math.max(maxY - minY, 1);
    const bboxCx = (minX + maxX) / 2;
    const bboxCy = (minY + maxY) / 2;

    const scale = Math.min(
      1,
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min((dimensions.width / boxWidth) * FIT_PADDING, (dimensions.height / boxHeight) * FIT_PADDING)
      )
    );

    const panX = -(bboxCx - cx) * scale;
    const panY = -(bboxCy - cy) * scale;

    return { zoom: scale, pan: { x: panX, y: panY } };
  }, [layoutNodes, dimensions, cx, cy]);

  const fit = useCallback(() => {
    const result = computeFit();
    if (result) {
      setZoom(result.zoom);
      setPan(result.pan);
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [computeFit]);

  useEffect(() => {
    if (settled && !hasAutoFit) {
      fit();
      setHasAutoFit(true);
    }
  }, [settled, hasAutoFit, fit]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.15).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.15).toFixed(2))), []);

  // Focus a specific node by id: center it and zoom in. Used by Discovery Mode
  // deep links (?focus=) and intelligence navigation.
  const focusNode = useCallback(
    (id: string) => {
      const node = layoutNodes.find((n) => n.id === id);
      if (!node || !dimensions.width || !dimensions.height) return;
      const d = Math.max(0, node.structuralImportance);
      const targetZoom = Math.min(MAX_ZOOM, Math.max(1.2, 0.9 + d * 2.5));
      setPan({ x: -(node.x - cx) * targetZoom, y: -(node.y - cy) * targetZoom });
      setZoom(targetZoom);
      setFocusedNode(id);
    },
    [layoutNodes, dimensions, cx, cy]
  );

  useEffect(() => {
    if (controlsRef) controlsRef.current = { zoomIn, zoomOut, fit, focusNode };
  }, [controlsRef, zoomIn, zoomOut, fit, focusNode]);

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

  // ------------------------------------------------------------------
  // Node dragging via d3-drag, attached to each interaction circle.
  //
  // IMPORTANT (lifecycle fix): the drag behavior is built ONCE and is never
  // torn down/recreated on re-render. It is attached per-circle through a React
  // callback ref, so drag is always bound to whatever circle element currently
  // exists — the binding survives physics re-renders, hover, bloom, data
  // updates, and viewport resizes. It does NOT depend on this effect re-running
  // (which previously caused attach→detach cycling that left nodes rigid).
  //
  // event coordinates are resolved against the SVG root (container) and
  // converted to world space with the pure pan/zoom inverse transform, so
  // dragging stays glued to the cursor at any zoom level.
  // ------------------------------------------------------------------
  const dragBehavior = useMemo(() => {
    const drag = d3Drag<SVGCircleElement, LayoutNode>()
      // Small click-distance threshold separates a click (which opens the
      // drawer) from a drag (which pins and moves the node). Below this many
      // screen pixels of movement d3-drag does not start -> no pin, and the
      // click event still fires on the interaction circle.
      .clickDistance(3)
      .on("start", (_event, d) => {
        draggingNodeId.current = d.id;
        apiRef.current.beginDrag(d.id);
      })
      .on("drag", (event) => {
        const id = draggingNodeId.current;
        if (!id) return;
        const svg = svgRef.current;
        if (!svg) return;
        const dims = dimensionsRef.current;
        const [sx, sy] = d3Pointer(event.sourceEvent ?? event, svg);
        const w = screenToWorld(sx, sy, panRef.current, zoomRef.current, dims.width / 2, dims.height / 2);
        apiRef.current.moveNode(id, w.x, w.y);
      })
      .on("end", (_event, d) => {
        draggingNodeId.current = null;
        apiRef.current.endDrag(d.id);
      });
    // The drag container is resolved lazily at gesture time so it always points
    // at the current svg element. Dragging only ever begins on a circle that
    // lives inside the svg, so the ref is guaranteed present here.
    drag.container(() => (svgRef.current ?? document.body) as SVGSVGElement);
    return drag;
  }, []);

  // Attach d3-drag to a single interaction circle. This single callback is
  // assigned to every circle, so React calls it once per element on mount (and
  // with null on unmount) — a stable identity means no per-render rebinding.
  // Rebinding is idempotent (detach then attach), so it is always safe. It is
  // intentionally decoupled from layout timing: it binds purely from the
  // circle's own data-nodeid attribute, and the drag handlers only read `d.id`.
  const bindNodeDrag = useCallback((el: SVGCircleElement | null) => {
    if (!el) return;
    const id = el.dataset.nodeid;
    if (!id) return;
    d3Select(el).datum({ id } as LayoutNode).on(".drag", null).call(dragBehavior);
  }, [dragBehavior]);

  // Canvas pan via pointer-drag on the background. Guarded so a node drag
  // (handled by d3-drag on the circles) does not also pan the canvas.
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-nodeid]")) return;
    setIsPanning(true);
    panOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panOrigin.current.x;
    const dy = e.clientY - panOrigin.current.y;
    setPan({ x: panOrigin.current.panX + dx, y: panOrigin.current.panY + dy });
  };
  const stopPanning = () => setIsPanning(false);

  const edgeGeometry = useMemo(() => {
    const map = new Map<string, number>();
    layoutEdges.forEach((edge) => {
      const source = layoutNodes.find((n) => n.id === edge.sourceNodeId);
      const target = layoutNodes.find((n) => n.id === edge.targetNodeId);
      if (source && target) {
        map.set(edge.id, Math.hypot(target.x - source.x, target.y - source.y));
      }
    });
    return map;
  }, [layoutEdges, layoutNodes]);

  // While a node is entering the time window, its rendered position is
  // interpolated from just outside the canvas to its resting home with an
  // ease-in / ease-out curve. Returns null once the animation is finished
  // (the entry is deleted from enterRef), so rendering falls back to the node's
  // live physics position.
  const enterPos = useCallback(
    (id: string): { x: number; y: number; alpha: number; active: boolean } | null => {
      const e = enterRef.current.get(id);
      if (!e) return null;
      const node = layoutNodes.find((n) => n.id === id);
      if (!node) return null;
      const t = Math.min(1, (performance.now() - e.t0) / ENTER_MS);
      const k = easeInOutCubic(t);
      return {
        x: e.fromX + (node.x - e.fromX) * k,
        y: e.fromY + (node.y - e.fromY) * k,
        alpha: k,
        active: t < 1,
      };
    },
    [layoutNodes]
  );

  if (!dimensions.width) return <div ref={containerRef} className="w-full h-full" />;

  const DUR_SLOW = "var(--transition-duration-slow, 1200ms)";
  const DUR_NORMAL = "var(--transition-duration-normal, 400ms)";
  const DUR_FAST = "var(--transition-duration-fast, 200ms)";
  const EASE = "var(--ease-restrained, cubic-bezier(0.22, 1, 0.36, 1))";

  const SPRING_EASE = "cubic-bezier(0.175, 0.885, 0.32, 1.15)";

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden rounded-lg bg-surface-0 animate-fade-in"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerLeave={stopPanning}
      onDoubleClick={fit}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      <svg
        ref={svgRef}
        className="w-full h-full relative z-10 overflow-hidden"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        <defs>
          <filter id="ambient-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.45" floodColor="#000" />
          </filter>
          <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.5" floodColor="#000" />
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="fog-gradient">
            <stop offset="0%" stopColor="var(--color-surface-400)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--color-surface-400)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bridge-halo-gradient">
            <stop offset="0%" stopColor="var(--color-accent-rose)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-accent-rose)" stopOpacity="0" />
          </radialGradient>
          <pattern id="canvas-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="var(--color-surface-500)" opacity="0.15" />
          </pattern>
          <marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0.5 L10 5 L0 9.5 z" fill="context-stroke" />
          </marker>
        </defs>

        <rect x={0} y={0} width={dimensions.width} height={dimensions.height} fill="url(#canvas-grid)" />

        <g
          transform={`translate(${pan.x}, ${pan.y}) translate(${cx}, ${cy}) scale(${zoom}) translate(${-cx}, ${-cy})`}
          style={{ transition: isPanning ? "none" : `transform ${DUR_NORMAL} ${EASE}` }}
        >
          <g id="community-layer">
            {communities.map((c) => {
              const distFromCenter = Math.hypot(c.cx - cx, c.cy - cy);
              const rippleDelay = Math.max(0, distFromCenter * 1.5);

              return (
                <circle
                  key={`fog-${c.id}`}
                  cx={c.cx}
                  cy={c.cy}
                  r={c.r}
                  fill="url(#fog-gradient)"
                  style={{
                    opacity: bloom ? 1 : 0,
                    transition: reducedMotion ? "none" : `opacity ${DUR_SLOW} ${EASE} ${rippleDelay + 200}ms`,
                  }}
                />
              );
            })}
          </g>

          <g id="edge-layer">
            {layoutNodes.length > 0 &&
              layoutEdges.map((edge) => {
                const source = layoutNodes.find((n) => n.id === edge.sourceNodeId);
                const target = layoutNodes.find((n) => n.id === edge.targetNodeId);
                if (!source || !target) return null;

                const support = edge.support ?? 1;
                const isLowConfidence = support < 0.5;
                const isContradicted = edge.status === "CONTRADICTED";
                const isDragged =
                  draggingNodeId.current === source.id || draggingNodeId.current === target.id;
                const isConnected =
                  hoveredNode === source.id ||
                  hoveredNode === target.id ||
                  focusedNode === source.id ||
                  focusedNode === target.id ||
                  isDragged;
                const isOutOfBounds = !isNodeInTimeRange(source.id) || !isNodeInTimeRange(target.id);
                const length = edgeGeometry.get(edge.id) ?? 0;

                // Entering nodes stretch their edges: draw endpoints at the
                // eased fly-in position until the entrance completes.
                const sPos = enterPos(source.id);
                const tPos = enterPos(target.id);
                const sEntering = sPos ? sPos.active : false;
                const tEntering = tPos ? tPos.active : false;
                const entranceAlpha = Math.min(sPos ? sPos.alpha : 1, tPos ? tPos.alpha : 1);
                const x1 = sPos ? sPos.x : source.x;
                const y1 = sPos ? sPos.y : source.y;

                // Straight edge: a simple line segment between the two nodes.
                // No bow, no curvature — the edge stays straight at any zoom
                // and separation.
                const midX = (x1 + (tPos ? tPos.x : target.x)) / 2;
                const midY = (y1 + (tPos ? tPos.y : target.y)) / 2;

                let ex = tPos ? tPos.x : target.x;
                let ey = tPos ? tPos.y : target.y;
                if (edge.directed) {
                  const targetRadius = nodeVisualRadius(target.structuralImportance);
                  const tdx = ex - x1;
                  const tdy = ey - y1;
                  const tdist = Math.hypot(tdx, tdy) || 1;
                  ex = ex - (tdx / tdist) * (targetRadius + 4);
                  ey = ey - (tdy / tdist) * (targetRadius + 4);
                }

                const distFromCenter = Math.hypot(midX - cx, midY - cy);
                const edgeDelay = Math.max(0, distFromCenter * 1.5) + 100;

                const sourceDist = Math.hypot(source.x - cx, source.y - cy);
                const targetDist = Math.hypot(target.x - cx, target.y - cy);
                const drawsBackward = sourceDist > targetDist;
                const initialOffset = drawsBackward ? -length : length;

                const colorClass = isContradicted
                  ? "stroke-danger"
                  : isConnected && !isOutOfBounds
                  ? "stroke-accent-rose"
                  : "stroke-surface-600";

                const dashArray = isContradicted ? "4 4" : isLowConfidence ? "6 6" : reducedMotion ? undefined : `${length} ${length}`;
                const dashOffset = isLowConfidence || isContradicted || reducedMotion ? 0 : bloom ? 0 : initialOffset;

                // ── Edge draw-on while a node enters ─────────────────────────
                // When exactly one endpoint is flying in, the edge is drawn-on
                // from the settled (existing) node toward the arriving node: the
                // line starts collapsed at the existing node and visibly extends
                // to the moving node as it lands — a "connection being made"
                // rather than the finished edge suddenly appearing.
                const entering = sEntering || tEntering;
                const drawOn =
                  entering &&
                  sEntering !== tEntering &&
                  !isLowConfidence &&
                  !isContradicted &&
                  !reducedMotion;
                let edgePath = `M ${x1} ${y1} L ${ex} ${ey}`;
                let edgeDashArray: string | undefined = dashArray;
                let edgeDashOffset = dashOffset;
                let edgeMarkerEnd = edge.directed && !isOutOfBounds ? "url(#edge-arrow)" : undefined;
                if (drawOn) {
                  // drawOn guarantees exactly one endpoint is entering, so the
                  // other is anchored at its settled home. Narrow explicitly:
                  const anchor = sEntering ? { x: target.x, y: target.y } : { x: source.x, y: source.y };
                  const moving = sEntering
                    ? sPos
                      ? { x: sPos.x, y: sPos.y }
                      : { x: source.x, y: source.y }
                    : tPos
                    ? { x: tPos.x, y: tPos.y }
                    : { x: target.x, y: target.y };
                  const progress = sEntering ? (sPos ? sPos.alpha : 1) : tPos ? tPos.alpha : 1;
                  const drawLen = Math.hypot(moving.x - anchor.x, moving.y - anchor.y) || 1;
                  edgePath = `M ${anchor.x} ${anchor.y} L ${moving.x} ${moving.y}`;
                  edgeDashArray = `${drawLen} ${drawLen}`;
                  edgeDashOffset = drawLen * (1 - progress);
                  edgeMarkerEnd = undefined;
                }

                const baseOpacity = isOutOfBounds
                  ? 0
                  : isContradicted
                  ? 0.6
                  : isConnected
                  ? 1
                  : isLowConfidence
                  ? 0.3
                  : support * 0.4 + 0.2;

                const showTrace = isConnected && !isContradicted && !isLowConfidence && !reducedMotion;

                return (
                  <path
                    key={edge.id}
                    d={edgePath}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={entering ? edgeDashArray : showTrace ? "6 4" : dashArray}
                    strokeDashoffset={entering ? edgeDashOffset : dashOffset}
                    markerEnd={edgeMarkerEnd}
                    className={colorClass}
                    strokeWidth={isConnected ? 2.25 : Math.max(1, (edge.structuralImportance ?? support ?? 0.5) * 2)}
                    strokeOpacity={baseOpacity * entranceAlpha}
                    style={{
                      transition: reducedMotion || entering
                        ? "none"
                        : `stroke-dashoffset 800ms ${EASE} ${edgeDelay}ms, stroke-opacity ${DUR_NORMAL} ${EASE} ${edgeDelay}ms, stroke ${DUR_FAST} ${EASE}`,
                    }}
                  >
                    {showTrace && (
                      <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.6s" repeatCount="indefinite" />
                    )}
                  </path>
                );
              })}
          </g>

          <GraphHoleBurstLayer
            layoutNodes={layoutNodes}
            holes={holes}
            reducedMotion={reducedMotion}
            zoom={zoom}
            bloom={bloom}
          />

          <g id="bridge-layer">
            {layoutNodes
              .filter((n) => n.isBridge && isNodeInTimeRange(n.id))
              .map((node) => {
                const pos = enterPos(node.id);
                const bx = pos ? pos.x : node.x;
                const by = pos ? pos.y : node.y;
                const distFromCenter = Math.hypot(node.x - cx, node.y - cy);
                const nodeDelay = Math.max(0, distFromCenter * 1.5);

                return (
                  <circle
                    key={`bridge-${node.id}`}
                    cx={bx}
                    cy={by}
                    r={nodeVisualRadius(node.structuralImportance) + 14}
                    fill="url(#bridge-halo-gradient)"
                    className={reducedMotion ? "" : "animate-slow-pulse"}
                    style={{
                      opacity: bloom ? (pos ? pos.alpha : 1) : 0,
                      transform: bloom ? "scale(1)" : "scale(0.01)",
                      transformOrigin: `${bx}px ${by}px`,
                      transition: reducedMotion ? "none" : `opacity ${DUR_SLOW} ${EASE} ${nodeDelay + 200}ms, transform 500ms ${SPRING_EASE} ${nodeDelay + 200}ms`,
                    }}
                  />
                );
              })}
          </g>

          <g id="node-layer">
            {layoutNodes.map((node) => {
              const inTimeRange = isNodeInTimeRange(node.id);
              const isActive = hoveredNode === node.id || focusedNode === node.id;
              const outOfRange = !inTimeRange;
              const hoverDimmed =
                hoveredNode !== null &&
                !isActive &&
                !edges.some(
                  (e) =>
                    (e.sourceNodeId === node.id && e.targetNodeId === hoveredNode) ||
                    (e.targetNodeId === node.id && e.sourceNodeId === hoveredNode)
                );

              const pos = enterPos(node.id);
              const entering = pos ? pos.active : false;
              const nx = pos ? pos.x : node.x;
              const ny = pos ? pos.y : node.y;
              const entranceAlpha = pos ? pos.alpha : 1;

              const radius = nodeVisualRadius(node.structuralImportance);
              const isEntity = node.type === "ENTITY";

              const distFromCenter = Math.hypot(node.x - cx, node.y - cy);
              const nodeDelay = Math.max(0, distFromCenter * 1.5);

              const nodeOpacity = outOfRange ? 0 : hoverDimmed ? 0.1 : bloom ? 1 : 0;

              return (
                <circle
                  key={node.id}
                  cx={nx}
                  cy={ny}
                  r={radius}
                  filter={isActive ? "url(#node-glow)" : "url(#ambient-shadow)"}
                  className={`outline-none ${node.isNewArrival && !reducedMotion ? "animate-fade-in" : ""} ${
                    isActive && inTimeRange
                      ? "fill-surface-200 stroke-accent-rose"
                      : node.isBridge
                      ? "fill-surface-100 stroke-accent-rose"
                      : isEntity
                      ? "fill-surface-100 stroke-surface-400"
                      : "fill-surface-0 stroke-accent-amber"
                  }`}
                  strokeWidth={isActive && inTimeRange ? 2 : 1.5}
                  style={{
                    opacity: nodeOpacity * entranceAlpha,
                    transform: bloom ? "scale(1)" : "scale(0.01)",
                    transformOrigin: `${nx}px ${ny}px`,
                    transition: reducedMotion || entering
                      ? "none"
                      : `opacity ${DUR_NORMAL} ${EASE} ${nodeDelay}ms, transform 500ms ${SPRING_EASE} ${nodeDelay}ms, fill ${DUR_FAST} ${EASE}, stroke ${DUR_FAST} ${EASE}`,
                  }}
                >
                  <title>
                    {node.label} · {node.type.toLowerCase()}
                    {node.isBridge ? " · bridge candidate" : ""}
                  </title>
                </circle>
              );
            })}
          </g>

          <g id="interaction-layer" ref={interactionLayerRef}>
            {layoutNodes.map((node) => {
              const inTimeRange = isNodeInTimeRange(node.id);
              return (
                <circle
                  key={`interact-${node.id}`}
                  ref={bindNodeDrag}
                  data-nodeid={node.id}
                  cx={node.x}
                  cy={node.y}
                  r={32}
                  tabIndex={inTimeRange ? 0 : -1}
                  role="button"
                  aria-label={`${node.label ?? "Entity"}${node.isBridge ? ", bridge candidate" : ""}`}
                  className={`fill-transparent outline-none ${inTimeRange ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"}`}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onFocus={() => setFocusedNode(node.id)}
                  onBlur={() => setFocusedNode(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onNodeClick(node.id);
                  }}
                  onClick={() => onNodeClick(node.id)}
                />
              );
            })}
          </g>

          <g id="annotation-layer">
            {layoutNodes.map((node) => {
              const inTimeRange = isNodeInTimeRange(node.id);
              const isActive = hoveredNode === node.id || focusedNode === node.id;
              const outOfRange = !inTimeRange;
              const hoverDimmed = hoveredNode !== null && !isActive;
              const radius = nodeVisualRadius(node.structuralImportance);

              const pos = enterPos(node.id);
              const entering = pos ? pos.active : false;
              const entranceAlpha = pos ? pos.alpha : 1;
              const baseX = pos ? pos.x : node.x;
              const baseY = pos ? pos.y : node.y;

              const distFromCenter = Math.hypot(node.x - cx, node.y - cy);
              const labelDelay = Math.max(0, distFromCenter * 1.5) + 150;

              const dx = baseX - cx;
              const dy = baseY - cy;
              const angle = Math.atan2(dy, dx);
              const cosA = Math.cos(angle);
              const sinA = Math.sin(angle);
              const labelOffset = radius + 16;
              const lx = baseX + cosA * labelOffset;
              const ly = baseY + sinA * labelOffset + 3;
              const textAnchor = cosA > 0.35 ? "start" : cosA < -0.35 ? "end" : "middle";
              const labelOpacity = (outOfRange ? 0 : hoverDimmed ? 0.05 : bloom ? (isActive ? 1 : 0.9) : 0) * entranceAlpha;

              return (
                <g
                  key={`label-${node.id}`}
                  transform={`translate(${lx}, ${ly}) scale(${1 / zoom}) translate(${-lx}, ${-ly})`}
                >
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={textAnchor}
                    paintOrder="stroke fill"
                    className={`font-mono text-[9px] uppercase tracking-widest pointer-events-none transition-colors duration-fast ${
                      isActive && inTimeRange ? "fill-surface-900 font-bold" : "fill-surface-600 font-medium"
                    }`}
                    style={{
                      opacity: labelOpacity,
                      stroke: "var(--color-surface-0)",
                      strokeWidth: 2,
                      transition: reducedMotion || entering ? "none" : `opacity ${DUR_NORMAL} ${EASE} ${labelDelay}ms`,
                    }}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.32) 100%)" }}
      />

      <ul className="sr-only" aria-label="Graph entities">
        {layoutNodes.map((node) => (
          <li key={`a11y-${node.id}`}>
            <button type="button" onClick={() => onNodeClick(node.id)}>
              {node.label} {node.isBridge ? "(bridge candidate)" : ""}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
