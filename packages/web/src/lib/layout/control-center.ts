// ============================================================================
// PR-2 Graph Control Center — layout state model + geometry contract.
//
// SINGLE OWNER: the control center shell (GraphControlCenter) owns one
// instance of ControlCenterLayoutState and one of GraphControlCenterActions.
// Every panel derives its open/closed/tab allocation from these objects —
// there are no scattered margin/padding hacks across components.
//
// SEPARATION: this module is PURE layout/presentation state. Investigative
// selection state (selected entity/edge/gap, cross-case active overlay data)
// is deliberately NOT modeled here; PR-3 introduces the discriminated context
// bridge that feeds the contextual panel.
//
// Provider-agnostic: never imports providers, demo/live fixtures or UI.
// ============================================================================

export type TemporalTab = "time" | "activity" | "versions";

export type IntelligenceTab = "overview" | "hypotheses" | "signals" | "evidence" | "activity";

export interface ControlCenterLayoutState {
  /** Left operational rail visible (content) or collapsed to a reopen strip. */
  leftRailOpen: boolean;
  /** Right contextual / intelligence panel visible (content) or collapsed. */
  rightPanelOpen: boolean;
  /** Active bottom-left tab. */
  temporalTab: TemporalTab;
  /** Active bottom-right tab. */
  intelligenceTab: IntelligenceTab;
}

export const DEFAULT_LAYOUT_STATE: ControlCenterLayoutState = {
  leftRailOpen: true,
  rightPanelOpen: true,
  temporalTab: "time",
  intelligenceTab: "overview",
};

/** Workspace-presentation actions owned by the shell that the graph panel and
 *  the operational rail BOTH consume. A false value does not delete content —
 *  it hides the corresponding graph-surface surface. */
export interface GraphControlCenterActions {
  legendOpen: boolean;
  discoveryOpen: boolean;
  gapsOpen: boolean;
  crossCaseOpen: boolean;
  uploadOpen: boolean;
  /** PR-4: graph readability filter surface (inline in the rail). The filter
   *  VALUE is F-PR14 workspace-scoped state (?support=/?hidec=), so only the
   *  surface open/closed flag remains owned by the actions object. */
  filterOpen: boolean;
  /** Overlay ref ("cobalt"/"crimson") currently active on the canvas. */
  activeForeignCaseId: string | null;
}

/** Surface-toggles owned by the shell/rail (the `onActionToggle` key set).
 *  Filter and Legend are independent; Discover / Gaps / Cross-Case / Upload are
 *  exclusive (opening one closes the others). */
export type ControlCenterSurfaceKey =
  | "legendOpen"
  | "discoveryOpen"
  | "gapsOpen"
  | "crossCaseOpen"
  | "uploadOpen"
  | "filterOpen";

export const DEFAULT_ACTIONS: GraphControlCenterActions = {
  legendOpen: false,
  discoveryOpen: false,
  gapsOpen: false,
  crossCaseOpen: false,
  uploadOpen: false,
  filterOpen: false,
  activeForeignCaseId: null,
};

// ----------------------------------------------------------------------------
// Geometry contract — DERIVED allocation (no phantom columns).
//
// The middle graph column is always `minmax(0, 1fr)`: it absorbs exactly the
// space the side columns do NOT consume. A collapsed side column shrinks to a
// compact reopen strip (2.5rem) instead of keeping its full width, so the grid
// reflows and GraphCanvas's container genuinely grows. The returned string is
// used verbatim as the `gridTemplateColumns` of the main row.
// ----------------------------------------------------------------------------

const RAIL_WIDTH = "minmax(12rem, 15rem)";
const RIGHT_WIDTH = "minmax(16rem, 20rem)";
const COLLAPSED_STRIP = "2.5rem";

export function controlCenterColumns(layout: Pick<ControlCenterLayoutState, "leftRailOpen" | "rightPanelOpen">): string {
  const left = layout.leftRailOpen ? RAIL_WIDTH : COLLAPSED_STRIP;
  const right = layout.rightPanelOpen ? RIGHT_WIDTH : COLLAPSED_STRIP;
  return `${left} minmax(0, 1fr) ${right}`;
}

/** Bottom band allocation as a viewport-derived height (clamped), so the two
 *  bottom halves stay legible without hardcoded pixel offsets. F-PR18: compacted
 *  to match the reduced internal Timeline height after the fit redesign. */
export function bottomBandHeightClass(): string {
  return "h-[clamp(12rem,26vh,16rem)]";
}