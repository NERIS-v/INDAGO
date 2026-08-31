"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import type { GraphHole } from "@indago/contracts";
import { nodeVisualRadius, type LayoutNode } from "./use-graph-layout";

interface GraphHoleBurstLayerProps {
  readonly layoutNodes: LayoutNode[];
  readonly holes: GraphHole[];
  readonly reducedMotion: boolean;
  readonly zoom: number;
  readonly bloom: boolean;
}

export function GraphHoleBurstLayer({
  layoutNodes,
  holes,
  reducedMotion,
  zoom,
  bloom,
}: GraphHoleBurstLayerProps) {
  const [burstBuffer, setBurstBuffer] = useState<LayoutNode[]>([]);
  
  // Track independent removal timers so rapid successive arrivals don't overwrite each other
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const nodeById = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    layoutNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [layoutNodes]);

  useEffect(() => {
    const freshArrivals = layoutNodes.filter((n) => n.isNewArrival);
    
    if (freshArrivals.length > 0) {
      setBurstBuffer((prev) => {
        const next = [...prev];
        let hasChanges = false;

        freshArrivals.forEach((arr) => {
          // If we haven't tracked this node yet, add it to the visual buffer
          if (!next.some((n) => n.id === arr.id)) {
            next.push(arr);
            hasChanges = true;

            // Give this specific node an independent 1.1s countdown
            const timer = setTimeout(() => {
              setBurstBuffer((currentBuffer) => 
                currentBuffer.filter((p) => p.id !== arr.id)
              );
              timersRef.current.delete(arr.id);
            }, 1100);

            timersRef.current.set(arr.id, timer);
          }
        });
        
        return hasChanges ? next : prev;
      });
    }
  }, [layoutNodes]);

  // Clean up all pending timers if the layer unmounts entirely
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const burstCentroid = useMemo(() => {
    if (burstBuffer.length < 2) return null;
    const cx = burstBuffer.reduce((s, n) => s + n.x, 0) / burstBuffer.length;
    const cy = burstBuffer.reduce((s, n) => s + n.y, 0) / burstBuffer.length;
    const r =
      Math.max(...burstBuffer.map((n) => Math.hypot(n.x - cx, n.y - cy))) + 30;
    return { cx, cy, r };
  }, [burstBuffer]);

  if (!bloom) return null;

  return (
    <>
      <g id="hole-layer">
        {holes.map((hole) => {
          const nodes = hole.nodeIds
            .map((id) => nodeById.get(id))
            .filter((n): n is LayoutNode => Boolean(n));

          if (nodes.length >= 2) {
            const a = nodes[0];
            const b = nodes[1];
            if (!a || !b) return null;

            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={`hole-${hole.investigationGapId ?? `${a.id}-${b.id}`}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-accent-amber"
                  strokeWidth={1.75}
                  strokeDasharray="5 5"
                  strokeOpacity={0.7}
                  strokeLinecap="round"
                  style={{
                    animation: reducedMotion
                      ? undefined
                      : "hole-pulse 2.6s ease-in-out infinite",
                  }}
                />
                <circle
                  cx={mx}
                  cy={my}
                  r={13}
                  className="fill-surface-0 stroke-accent-amber"
                  strokeWidth={1.25}
                  style={{
                    animation: reducedMotion
                      ? undefined
                      : "hole-pulse 2.6s ease-in-out infinite",
                  }}
                />
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-accent-amber font-mono text-[11px] font-bold pointer-events-none"
                  transform={`translate(${mx}, ${my}) scale(${1 / zoom}) translate(${-mx}, ${-my})`}
                >
                  ?
                </text>
                <title>{hole.description}</title>
              </g>
            );
          }

          if (nodes.length === 1) {
            const n = nodes[0];
            if (!n) return null;

            const r = nodeVisualRadius(n.structuralImportance) + 10;
            return (
              <circle
                key={`hole-${hole.investigationGapId ?? n.id}`}
                cx={n.x}
                cy={n.y}
                r={r}
                fill="none"
                className="stroke-accent-amber"
                strokeWidth={1.5}
                strokeDasharray="3 4"
                strokeOpacity={0.75}
                style={{
                  animation: reducedMotion
                    ? undefined
                    : "hole-pulse 2.6s ease-in-out infinite",
                }}
              >
                <title>{hole.description}</title>
              </circle>
            );
          }

          return null;
        })}
      </g>

      {!reducedMotion && (
        <g id="burst-layer" pointerEvents="none">
          {burstCentroid ? (
            <circle
              key={`burst-group-${burstBuffer.map(n => n.id).join('-')}`}
              cx={burstCentroid.cx}
              cy={burstCentroid.cy}
              r={burstCentroid.r}
              fill="none"
              className="stroke-accent-rose"
              strokeWidth={2}
            >
              <animate
                attributeName="r"
                from={burstCentroid.r * 0.6}
                to={burstCentroid.r * 1.6}
                dur="1.1s"
                begin="0s"
                repeatCount="1"
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                from="0.8"
                to="0"
                dur="1.1s"
                begin="0s"
                repeatCount="1"
                fill="freeze"
              />
            </circle>
          ) : (
            burstBuffer.map((n) => {
              const r0 = nodeVisualRadius(n.structuralImportance);
              return (
                <circle
                  key={`arrival-${n.id}`}
                  cx={n.x}
                  cy={n.y}
                  r={r0}
                  fill="none"
                  className="stroke-accent-rose"
                  strokeWidth={1.5}
                >
                  <animate
                    attributeName="r"
                    from={r0}
                    to={r0 + 26}
                    dur="0.9s"
                    begin="0s"
                    repeatCount="1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.7"
                    to="0"
                    dur="0.9s"
                    begin="0s"
                    repeatCount="1"
                    fill="freeze"
                  />
                </circle>
              );
            })
          )}
        </g>
      )}

      <style>{`
        @keyframes hole-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </>
  );
}