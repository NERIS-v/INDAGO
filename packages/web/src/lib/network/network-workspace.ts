// ============================================================================
// F-PR5 — Network Workspace State (pure model)
//
// The Network workspace is a SINGLE five-zone Control Center (the Graph route).
// Future representation PRs (Entity Pulse, Matrix, Adaptive Flow) will render
// inside Zone 2 and change the contextual meaning of the supporting zones while
// the five-zone shell stays stable. This module is the PURE shared-state model
// those representations consume:
//
//   - activeNetworkView  which representation is active (only "graph" exists)
//   - timeRange          the workspace-wide temporal scope (promoted from the
//                        previously page-local Graph time range)
//   - focusEntityId      the durable deep-link graph focus target
//
// Invariants:
//   - "graph" is the ONLY implemented representation; the rest are typed atoms
//     with declared not-ready status. No fake visualization is rendered.
//   - timeRange preserves the existing contract ([start, end] epoch ms | null).
//   - This module is PURE: no React, no providers, no URL, no D3. URL parsing/
//     serialization lives in lib/workspace/url.ts; the runtime owner lives in
//     lib/network/use-network-workspace.tsx.
// ============================================================================

/** The representation rendered in Zone 2 of the Network workspace. */
export type NetworkView = "graph" | "pulse" | "matrix" | "flow";

/** Declared representation space. "graph" is the only implemented value. */
export const NETWORK_VIEWS: readonly NetworkView[] = [
  "graph",
  "pulse",
  "matrix",
  "flow",
] as const;

/** The default (and currently only implemented) representation. */
export const DEFAULT_NETWORK_VIEW: NetworkView = "graph";

export function isNetworkView(value: unknown): value is NetworkView {
  return (
    typeof value === "string" &&
    (NETWORK_VIEWS as readonly string[]).includes(value)
  );
}

/** Parse a `?view=` wire value; null when absent/invalid. */
export function parseNetworkView(
  raw: string | null | undefined,
): NetworkView | null {
  return isNetworkView(raw) ? raw : null;
}

export const NETWORK_VIEW_LABELS: Record<NetworkView, string> = {
  graph: "Network",
  pulse: "Entity Pulse",
  matrix: "Matrix",
  flow: "Adaptive Flow",
};

export function networkViewLabel(view: NetworkView): string {
  return NETWORK_VIEW_LABELS[view];
}

/**
 * The shared temporal scope. Preserved contract from the Graph page:
 * `[start, end]` in epoch milliseconds, or null = no temporal bound (the
 * timeline derives the full domain). No new time semantics are introduced.
 */
export type NetworkTimeRange = [number, number] | null;

export function isNetworkTimeRange(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] <= value[1]
  );
}

/** The divergable serializable analytical identity of the Network workspace. */
export interface NetworkWorkspaceState {
  /** Active Zone 2 representation. Defaults to "graph". */
  readonly activeNetworkView: NetworkView;
  /** Workspace-wide temporal scope (the timeline's analytical window). */
  readonly timeRange: NetworkTimeRange;
  /** Deep-link graph focus target (null = none). SELECT ≠ FOCUS: focus is the
   *  camera/URL target; selection is the investigative context bridge. */
  readonly focusEntityId: string | null;
}

export function createDefaultNetworkWorkspaceState(): NetworkWorkspaceState {
  return {
    activeNetworkView: DEFAULT_NETWORK_VIEW,
    timeRange: null,
    focusEntityId: null,
  };
}