// ============================================================================
// PR-4 — Graph readability filter (pure, provider-agnostic)
//
// Filter is a PRESENTATION-level graph readability control. It operates on the
// already-loaded graph edge data (GraphEdge.status / GraphEdge.support) — it
// never invents taxonomies, never fetches, never restarts the physics. The
// simulation keeps running over the FULL topology; the filter changes only
// which relations are RENDERED (the contract's "readability" semantics).
//
// Dimensions are limited to fields actually backed by the graph data:
//   - minSupport       — hide relations whose support is below a threshold
//   - hideContradicted — hide CONTRADICTED-status relations
//
// Temporal visibility is an EXISTING, separate concern (activeTimeRange) and
// is intentionally not duplicated here.
// ============================================================================

import type { GraphEdge } from "@indago/contracts";

export interface GraphFilterState {
  /** [0,1] — relations with support strictly below this value are hidden. */
  minSupport: number;
  /** Hide relations whose graph status is CONTRADICTED. */
  hideContradicted: boolean;
}

export const DEFAULT_GRAPH_FILTER: GraphFilterState = {
  minSupport: 0,
  hideContradicted: false,
};

export const MIN_SUPPORT_STEP = 0.05;
export const MIN_SUPPORT_MAX = 0.6;

/** Whether the filter currently hides anything (drives the active indicator). */
export function graphFilterIsActive(filter: GraphFilterState | null | undefined): boolean {
  if (!filter) return false;
  return filter.minSupport > 0 || filter.hideContradicted;
}

/** Render-time edge pruning. Returns the same array when the filter is empty. */
export function applyGraphFilter(
  edges: GraphEdge[],
  filter: GraphFilterState | null | undefined,
): GraphEdge[] {
  if (!filter) return edges;
  if (!graphFilterIsActive(filter)) return edges;
  return edges.filter((e) => {
    if (filter.minSupport > 0 && e.support < filter.minSupport) return false;
    if (filter.hideContradicted && e.status === "CONTRADICTED") return false;
    return true;
  });
}