// ============================================================================
// F-PR8 — Adaptive Flow panel (Zone 2 representation)
//
// Rendered ONLY when the workspace capability resolution says the flow is
// ready in the effective mode (DEMO / AUTO-demo). LIVE renders a typed
// not-ready pane at the shell instead. The flow meta arrives from the
// SHELL-owned analysis (one source across all five zones) — this panel never
// fetches.
//
// Honesty contract (locked):
//   - Segments exist ONLY for provider-backed directed relation hypotheses
//     whose lifecycle is still actionable (PROPOSED / ACCEPTED). Amounts come
//     ONLY from observation metadata (flowAmount + flowCurrency); mixed
//     currencies are NEVER summed — each is drawn and labelled separately.
//   - A unilateral outflow with an unobserved destination renders a dashed
//     edge to an unresolved "?" endpoint — never a suspicious label, and only
//     when an observation explicitly marks flowGap: "destination".
//   - NO FLOW DATA, NO FLOW IN SELECTED WINDOW, and FLOW DATA UNAVAILABLE are
//     three distinct honest states — never an invented empty-looking flow.
//   - Geometry is a deterministic pure function of the case data (layered
//     longest-path + barycenter). No Math.random / Date.now.
//   - No continuous animation: the diagram is static; the only transitions are
//     short selection highlights and they are disabled under reduced motion.
//   - Color is never the sole channel: every node carries a label, role and
//     keyboard-accessible aria semantics.
//
// SELECT (click a node/edge) ≠ FOCUS (durable deep-link target). Clicking
// SELECTs through the shell context bridge. Keyboard: roving tabIndex over
// nodes and edges, Enter/Space activates.
// ============================================================================

"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import type { FlowLoadState } from "@/lib/network/flow/use-flow-analysis";
import type { FlowLayoutEdge, FlowLayoutNode, FlowSegment } from "@/lib/network/flow/flow-model";
import {
  FLOW_DOMAIN_LABELS,
  FLOW_ROLE_LABELS,
  flowContextForEntity,
  flowContextForGap,
  flowContextForRelation,
  formatFlowAmount,
} from "@/lib/network/flow/flow-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";

interface FlowPanelProps {
  /** Shell-owned flow analysis shared with every supporting zone. */
  readonly meta: FlowLoadState;
  /** The canonical shell-owned selection (derived highlight only). */
  readonly context?: InvestigativeContext | null;
  /** Shell handler that rematerializes flow intents as context (SELECT). */
  readonly onSelectContext?: (context: InvestigativeContext | null) => void;
  /** "Open in Graph" — hands the row entity to the graph focus seam. */
  readonly onOpenInGraph?: (entityId: string) => void;
}

interface SelectedFlow {
  readonly nodeId: string | null;
  readonly edgeIds: ReadonlySet<string>;
}

function resolveSelection(
  meta: NonNullable<FlowLoadState & { readonly status: "ready" }>["meta"],
  context: InvestigativeContext | null,
): SelectedFlow {
  const edgeIds = new Set<string>();
  let nodeId: string | null = null;
  if (context?.source !== "flow") return { nodeId: null, edgeIds };
  if (context.kind === "entity") {
    const node = meta.layout?.nodes.find((n) => n.id === `ent:${context.id}`);
    nodeId = node?.id ?? null;
  } else if (context.kind === "relation") {
    const segment = meta.segments.find((s) => s.relationId === context.id);
    if (segment) {
      for (const edge of meta.layout?.edges ?? []) {
        if (edge.segmentId === segment.id) edgeIds.add(edge.id);
      }
    }
  } else if (context.kind === "observation") {
    const gap = meta.gaps.find((g) => g.observationId === context.id);
    if (gap) {
      for (const edge of meta.layout?.edges ?? []) {
        if (edge.gapId === gap.id) edgeIds.add(edge.id);
      }
      nodeId = meta.layout?.nodes.find((n) => n.id === gap.id)?.id ?? null;
    }
  }
  return { nodeId, edgeIds };
}

function nodeContext(meta: NonNullable<FlowLoadState & { readonly status: "ready" }>["meta"], node: FlowLayoutNode): InvestigativeContext | null {
  if (node.kind === "entity") {
    return flowContextForEntity(node.id.slice("ent:".length));
  }
  const gap = meta.gaps.find((g) => g.id === node.id);
  return gap ? flowContextForGap(gap) : null;
}

function edgeContext(meta: NonNullable<FlowLoadState & { readonly status: "ready" }>["meta"], edge: FlowLayoutEdge): InvestigativeContext | null {
  if (edge.segmentId !== null) {
    const segment = meta.segments.find((s) => s.id === edge.segmentId);
    return segment ? flowContextForRelation(segment.relationId) : null;
  }
  if (edge.gapId !== null) {
    const gap = meta.gaps.find((g) => g.id === edge.gapId);
    return gap ? flowContextForGap(gap) : null;
  }
  return null;
}

function nodeSemantics(node: FlowLayoutNode): string {
  const role =
    node.kind === "gap" ? "unobserved destination" : FLOW_ROLE_LABELS[node.role].toLowerCase();
  return `${node.label}, ${role}`;
}

function edgeSemantics(edge: FlowLayoutEdge): string {
  const domainLabel = FLOW_DOMAIN_LABELS[edge.domain].toLowerCase();
  const kind = edge.dashed ? "proposed" : "confirmed";
  return `${domainLabel} flow, ${kind}`;
}

export function FlowPanel({
  meta,
  context = null,
  onSelectContext,
  onOpenInGraph,
}: FlowPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<number | null>(null);

const analysis = meta.status === "ready" ? meta.meta : null;
  const effectiveStatus = analysis?.status ?? "loading";
  const flowReady = effectiveStatus === "ready";
  const layout = flowReady ? analysis!.layout : null;
  const selectables = useMemo(() => {
    if (!layout) return [];
    return [...layout.nodes, ...layout.edges];
  }, [layout]);

  const selected = useMemo(
    () =>
      analysis && layout
        ? resolveSelection(analysis, context)
        : { nodeId: null, edgeIds: new Set<string>() },
    [analysis, layout, context],
  );

  if (meta.status === "error") {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="flow-panel">
        <ErrorDisplay message={meta.error.message} retry={() => window.location.reload()} />
      </div>
    );
  }

  if (effectiveStatus === "no-flow-data" || effectiveStatus === "no-flow-in-window") {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="flow-panel">
        <EmptyState
          title={effectiveStatus === "no-flow-data" ? "No flow data" : "No flow in selected window"}
          description={
            effectiveStatus === "no-flow-in-window"
              ? "Move or clear the timeline window to show the flow segments that sit inside it."
              : "No directional flow evidence (financial, movement or communication) was found for this case."
          }
        />
      </div>
    );
  }

  if (!flowReady || !layout) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-testid="flow-panel">
        <LoadingSpinner size="sm" label="Building the adaptive flow..." />
      </div>
    );
  }

  const metaReady = analysis!;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (selectables.length === 0) return;
    const next = (focused ?? 0) + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1);
    const clamped = Math.min(Math.max(next, 0), selectables.length - 1);
    setFocused(clamped);
    const target = containerRef.current?.querySelector(
      `[data-flow-focus-index="${clamped}"]`,
    );
    (target as HTMLElement | null)?.focus();
  }

  function activate(index: number) {
    const selectable = selectables[index];
    if (!selectable) return;
    if ("segmentId" in selectable) {
      onSelectContext?.(edgeContext(metaReady, selectable));
    } else {
      onSelectContext?.(nodeContext(metaReady, selectable));
    }
  }

  function amountTitle(segments: readonly FlowSegment[]): string {
    const titles = segments.flatMap((segment) =>
      segment.amounts.map((amount) => formatFlowAmount(amount.total, amount.currency)),
    );
    return titles.length > 0 ? titles.join(" + ") : "No observed amount";
  }

  return (
    <div
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col gap-3 p-4"
      data-testid="flow-panel"
    >
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-surface-400">
            Adaptive Flow
          </h2>
          <p className="truncate font-mono text-[11px] text-surface-500" data-testid="flow-summary">
            {metaReady.summary}
          </p>
        </div>
        <span
          className="shrink-0 rounded-md border border-surface-300 bg-surface-100/80 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-surface-500"
          data-testid="flow-mode-label"
        >
          {metaReady.mode ? FLOW_DOMAIN_LABELS[metaReady.mode] : "No flow"}
        </span>
      </div>

      <div
        ref={containerRef}
        role="region"
        aria-label={`Adaptive flow diagram: ${metaReady.summary}`}
        onKeyDown={handleKeyDown}
        className="min-h-0 flex-1 overflow-auto rounded-xl border border-surface-200/60 bg-surface-50/60 p-3"
        data-testid="flow-diagram"
      >
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto max-w-full"
          role="img"
          aria-label="Directed flow diagram of observed movement between entities"
        >
          {layout.edges.map((edge, index) => {
            const startIndex = selectables.indexOf(edge);
            const isFocused = focused === startIndex;
            const isSelected = selected.edgeIds.has(edge.id);
            const label = edgeSemantics(edge);
            return (
              <g
                key={edge.id}
                role="button"
                tabIndex={isFocused ? 0 : -1}
                aria-label={label}
                aria-pressed={isSelected}
                data-flow-edge
                data-flow-edge-id={edge.id}
                data-flow-focus-index={startIndex}
                data-testid={`flow-edge-${index}`}
                onClick={() => activate(startIndex)}
                onFocus={() => setFocused(startIndex)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate(startIndex);
                  }
                }}
                className="cursor-pointer"
              >
                <path
                  d={edge.d}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={edge.width}
                  strokeDasharray={edge.dashed ? "5 4" : undefined}
                  strokeLinecap="round"
                  className={`motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none ${
                    isSelected ? "opacity-100" : focused === null ? "opacity-85" : focused === startIndex ? "opacity-100" : "opacity-55"
                  }`}
                  pointerEvents="stroke"
                />
                <path d={edge.d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />
                <title>
                  {label} — {amountTitle(metaReady.segments.filter((s) => s.id === edge.segmentId))}
                </title>
              </g>
            );
          })}

          {layout.nodes.map((node, index) => {
            const startIndex = selectables.indexOf(node);
            const isFocused = focused === startIndex;
            const isSelected = selected.nodeId === node.id;
            const y = node.y;
            const x = node.x;
            const isGap = node.kind === "gap";
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={isFocused ? 0 : -1}
                aria-label={nodeSemantics(node)}
                aria-pressed={isSelected}
                data-flow-node
                data-flow-node-id={node.id}
                data-flow-node-kind={node.kind}
                data-flow-focus-index={startIndex}
                data-testid={`flow-node-${index}`}
                onClick={() => activate(startIndex)}
                onFocus={() => setFocused(startIndex)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate(startIndex);
                  }
                }}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={node.w}
                  height={node.h}
                  rx={8}
                  fill={isGap ? "var(--color-surface-100)" : "var(--color-surface-50)"}
                  stroke={isSelected ? "var(--color-brand-500)" : isGap ? "var(--color-surface-400)" : "var(--color-surface-300)"}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray={isGap ? "4 3" : undefined}
                  className={`motion-safe:transition-[stroke,stroke-width] motion-safe:duration-200 motion-reduce:transition-none`}
                />
                {isGap && (
                  <text
                    x={x + node.w - 10}
                    y={y + 10}
                    textAnchor="end"
                    fontSize={10}
                    fontWeight="bold"
                    fill="var(--color-surface-500)"
                    aria-hidden="true"
                  >
                    ?
                  </text>
                )}
                <text
                  x={x + node.w / 2}
                  y={y + node.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={isGap ? 400 : 600}
                  fill={isGap ? "var(--color-surface-500)" : "var(--color-surface-800)"}
                  className="select-none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected.nodeId !== null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-surface-500">
            Selected:
          </span>
          <span className="max-w-48 truncate font-mono text-[10px] text-surface-700" data-testid="flow-selected-node-label">
            {layout.nodes.find((n) => n.id === selected.nodeId)?.label ?? "Unknown destination"}
          </span>
          {onOpenInGraph && (() => {
            const node = layout.nodes.find((n) => n.id === selected.nodeId);
            if (!node || node.kind !== "entity") return null;
            return (
              <button
                type="button"
                data-testid="flow-open-in-graph"
                onClick={() => onOpenInGraph(node.id.slice("ent:".length))}
                className="rounded-md border border-surface-300 bg-surface-100/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-surface-700 transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Open in Graph
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
}