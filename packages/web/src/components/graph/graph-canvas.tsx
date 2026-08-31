"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useGraphLayout, nodeVisualRadius } from "./use-graph-layout";
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
  } | null>;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;
const FIT_PADDING = 0.85;

export function GraphCanvas({
  nodes,
  edges,
  holes,
  onNodeClick,
  activeTimeRange,
  controlsRef,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hasAutoFit, setHasAutoFit] = useState(false);
  const panOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  const [bloom, setBloom] = useState(false);
  const hasBloomedRef = useRef(false);

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

  const { layoutNodes, layoutEdges, communities, settled } = useGraphLayout(
    nodes,
    edges,
    dimensions.width,
    dimensions.height
  );

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

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const panX = -(bboxCx - cx) * scale;
    const panY = -(bboxCy - cy) * scale;

    return { zoom: scale, pan: { x: panX, y: panY } };
  }, [layoutNodes, dimensions]);

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

  useEffect(() => {
    if (controlsRef) controlsRef.current = { zoomIn, zoomOut, fit };
  }, [controlsRef, zoomIn, zoomOut, fit]);

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

  const handlePointerDown = (e: React.PointerEvent) => {
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

  if (!dimensions.width) return <div ref={containerRef} className="w-full h-full" />;

  const DUR_SLOW = "var(--transition-duration-slow, 1200ms)";
  const DUR_NORMAL = "var(--transition-duration-normal, 400ms)";
  const DUR_FAST = "var(--transition-duration-fast, 200ms)";
  const EASE = "var(--ease-restrained, cubic-bezier(0.22, 1, 0.36, 1))";
  
  const SPRING_EASE = "cubic-bezier(0.175, 0.885, 0.32, 1.15)";

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

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
                const isConnected =
                  hoveredNode === source.id ||
                  hoveredNode === target.id ||
                  focusedNode === source.id ||
                  focusedNode === target.id;
                const isOutOfBounds = !isNodeInTimeRange(source.id) || !isNodeInTimeRange(target.id);
                const length = edgeGeometry.get(edge.id) ?? 0;

                let x2 = target.x;
                let y2 = target.y;
                if (edge.directed) {
                  const targetRadius = nodeVisualRadius(target.structuralImportance);
                  const dx = target.x - source.x;
                  const dy = target.y - source.y;
                  const dist = Math.hypot(dx, dy) || 1;
                  x2 = target.x - (dx / dist) * (targetRadius + 4);
                  y2 = target.y - (dy / dist) * (targetRadius + 4);
                }

                const midX = (source.x + target.x) / 2;
                const midY = (source.y + target.y) / 2;
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
                
                const baseOpacity = isOutOfBounds
                  ? 0.03
                  : isContradicted
                  ? 0.6
                  : isConnected
                  ? 1
                  : isLowConfidence
                  ? 0.3
                  : support * 0.4 + 0.2;

                const showTrace = isConnected && !isContradicted && !isLowConfidence && !reducedMotion;

                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={x2}
                    y2={y2}
                    strokeLinecap="round"
                    strokeDasharray={showTrace ? "6 4" : dashArray}
                    strokeDashoffset={dashOffset}
                    markerEnd={edge.directed && !isOutOfBounds ? "url(#edge-arrow)" : undefined}
                    className={colorClass}
                    strokeWidth={isConnected ? 2.25 : Math.max(1, (edge.structuralImportance ?? support ?? 0.5) * 2)}
                    strokeOpacity={baseOpacity}
                    style={{
                      transition: reducedMotion
                        ? "none"
                        : `stroke-dashoffset 800ms ${EASE} ${edgeDelay}ms, stroke-opacity ${DUR_NORMAL} ${EASE} ${edgeDelay}ms, stroke ${DUR_FAST} ${EASE}`,
                    }}
                  >
                    {showTrace && (
                      <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.6s" repeatCount="indefinite" />
                    )}
                  </line>
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
              .filter((n) => n.isBridge)
              .map((node) => {
                const distFromCenter = Math.hypot(node.x - cx, node.y - cy);
                const nodeDelay = Math.max(0, distFromCenter * 1.5);

                return (
                  <circle
                    key={`bridge-${node.id}`}
                    cx={node.x}
                    cy={node.y}
                    r={nodeVisualRadius(node.structuralImportance) + 14}
                    fill="url(#bridge-halo-gradient)"
                    className={reducedMotion ? "" : "animate-slow-pulse"}
                    style={{
                      opacity: bloom ? 1 : 0,
                      transform: bloom ? "scale(1)" : "scale(0.01)",
                      transformOrigin: `${node.x}px ${node.y}px`,
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
              const isDimmed =
                !inTimeRange ||
                (hoveredNode !== null &&
                  !isActive &&
                  !edges.some(
                    (e) =>
                      (e.sourceNodeId === node.id && e.targetNodeId === hoveredNode) ||
                      (e.targetNodeId === node.id && e.sourceNodeId === hoveredNode)
                  ));

              const radius = nodeVisualRadius(node.structuralImportance);
              const isEntity = node.type === "ENTITY";
              
              const distFromCenter = Math.hypot(node.x - cx, node.y - cy);
              const nodeDelay = Math.max(0, distFromCenter * 1.5);

              return (
                <circle
                  key={node.id}
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  filter={isActive ? "url(#node-glow)" : "url(#ambient-shadow)"}
                  className={`outline-none ${isActive && !reducedMotion ? "animate-breathe" : ""} ${
                    node.isNewArrival && !reducedMotion ? "animate-fade-in" : ""
                  } ${
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
                    opacity: isDimmed ? 0.1 : bloom ? 1 : 0,
                    transform: bloom ? "scale(1)" : "scale(0.01)",
                    transformOrigin: `${node.x}px ${node.y}px`,
                    transition: reducedMotion
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

          <g id="interaction-layer">
            {layoutNodes.map((node) => {
              const inTimeRange = isNodeInTimeRange(node.id);
              return (
                <circle
                  key={`interact-${node.id}`}
                  cx={node.x}
                  cy={node.y}
                  r={32}
                  tabIndex={inTimeRange ? 0 : -1}
                  role="button"
                  aria-label={`${node.label ?? "Entity"}${node.isBridge ? ", bridge candidate" : ""}`}
                  className={`fill-transparent outline-none ${inTimeRange ? "cursor-pointer" : "pointer-events-none"}`}
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
              const isDimmed = !inTimeRange || (hoveredNode !== null && !isActive);
              const radius = nodeVisualRadius(node.structuralImportance);

              const distFromCenter = Math.hypot(node.x - cx, node.y - cy);
              const labelDelay = Math.max(0, distFromCenter * 1.5) + 150;

              const dx = node.x - cx;
              const dy = node.y - cy;
              const angle = Math.atan2(dy, dx);
              const cosA = Math.cos(angle);
              const sinA = Math.sin(angle);
              const labelOffset = radius + 16;
              const lx = node.x + cosA * labelOffset;
              const ly = node.y + sinA * labelOffset + 3;
              const textAnchor = cosA > 0.35 ? "start" : cosA < -0.35 ? "end" : "middle";

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
                      opacity: isDimmed ? 0.05 : bloom ? (isActive ? 1 : 0.9) : 0, 
                      stroke: "var(--color-surface-0)", 
                      strokeWidth: 2,
                      transition: reducedMotion ? "none" : `opacity ${DUR_NORMAL} ${EASE} ${labelDelay}ms`,
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