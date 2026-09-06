// ============================================================================
// F-PR6 — Representation presentations (typed five-zone adaptation model)
//
// The five-zone shell GEOMETRY is fixed: [1 Operations rail][2 Network view]
// [3 Context] / [4 Temporal/Case][5 Intelligence]. What adapts per selected
// representation is the CONTENT of those zones. This module is the single,
// typed answer to "what does the shell render for this representation?" so
// zone wiring never hardcodes scattered `if (view === "pulse")` checks.
//
//   GRAPH   → graph rail, graph canvas, contextual panel, hidden note,
//             intelligence tabs (pure PR-2/PR-3/PR-5 behavior).
//   PULSE   → pulse operations rail, entity pulse field, pulse context
//             summary, temporal pulse note, intelligence pulse insight
//             adapter (same five-zone geometry, representation content).
//   OTHERS  → a declared-but-not-ready representation keeps the graph
//             presentation and renders an honest typed not-ready pane in
//             Zone 2 — never a fabricated visualization.
//
// PURE model: no React, no providers. Tests can assert adaptation directly.
// ============================================================================

import type { NetworkView } from "./network-workspace";

export type RepresentationZoneOne = "graph-rail" | "pulse-rail" | "matrix-rail" | "flow-rail";
export type RepresentationZoneTwo = "graph" | "pulse" | "matrix" | "flow" | "not-ready";
export type RepresentationZoneThree =
  | "graph-context"
  | "pulse-context"
  | "matrix-context"
  | "flow-context";
export type RepresentationZoneFourNote = "none" | "pulse" | "matrix" | "flow";
export type RepresentationZoneFive = "intelligence" | "pulse" | "matrix" | "flow";

export interface RepresentationPresentation {
  readonly zoneOne: RepresentationZoneOne;
  readonly zoneTwo: RepresentationZoneTwo;
  readonly zoneThree: RepresentationZoneThree;
  /** Which representation adds its shared note strip to the Temporal/Case zone.
   *  F-PR7 removes the single boolean: content now adapts per representation. */
  readonly zoneFourNote: RepresentationZoneFourNote;
  readonly zoneFive: RepresentationZoneFive;
}

export const GRAPH_PRESENTATION: RepresentationPresentation = {
  zoneOne: "graph-rail",
  zoneTwo: "graph",
  zoneThree: "graph-context",
  zoneFourNote: "none",
  zoneFive: "intelligence",
};

export const PULSE_PRESENTATION: RepresentationPresentation = {
  zoneOne: "pulse-rail",
  zoneTwo: "pulse",
  zoneThree: "pulse-context",
  zoneFourNote: "pulse",
  zoneFive: "pulse",
};

export const MATRIX_PRESENTATION: RepresentationPresentation = {
  zoneOne: "matrix-rail",
  zoneTwo: "matrix",
  zoneThree: "matrix-context",
  zoneFourNote: "matrix",
  zoneFive: "matrix",
};

export const FLOW_PRESENTATION: RepresentationPresentation = {
  zoneOne: "flow-rail",
  zoneTwo: "flow",
  zoneThree: "flow-context",
  zoneFourNote: "flow",
  zoneFive: "flow",
};

export const NOT_READY_PRESENTATION: RepresentationPresentation = {
  zoneOne: "graph-rail",
  zoneTwo: "not-ready",
  zoneThree: "graph-context",
  zoneFourNote: "none",
  zoneFive: "intelligence",
};

/**
 * Resolve the zone presentation for an effective representation + mode.
 * `pulseAvailable` / `matrixAvailable` / `flowAvailable` are workspace
 * capability resolutions ("network.pulse" / "network.matrix" / "network.flow"
 * is not "not-ready" in the effective mode) — NEVER a Demo/Live branch here.
 */
export function presentationFor(
  view: NetworkView,
  pulseAvailable: boolean,
  matrixAvailable: boolean,
  flowAvailable: boolean,
): RepresentationPresentation {
  if (view === "pulse") {
    return pulseAvailable ? PULSE_PRESENTATION : NOT_READY_PRESENTATION;
  }
  if (view === "matrix") {
    return matrixAvailable ? MATRIX_PRESENTATION : NOT_READY_PRESENTATION;
  }
  if (view === "flow") {
    return flowAvailable ? FLOW_PRESENTATION : NOT_READY_PRESENTATION;
  }
  return view === "graph" ? GRAPH_PRESENTATION : NOT_READY_PRESENTATION;
}