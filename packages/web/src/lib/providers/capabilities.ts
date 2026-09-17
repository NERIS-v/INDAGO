// ============================================================================
// F-PR5 — Provider Capabilities
//
// A PURE, declarative registry of what each capability can be served with under
// a given data-mode configuration. It is deliberately a SEPARATE module with its
// own structural config types so it can be imported from BOTH types.ts and the
// factory without creating a module cycle — it imports nothing.
//
// The registry answers three questions that previously required reasoning deep
// into Demo/Live implementions:
//
//   1. Does DEMO implement this capability?
//   2. Does LIVE implement this capability?
//   3. In THIS workspace (config.mode x effective mode), what serves it, and is
//      an attempt guaranteed typed rather than a silent mock?
//
// INVARIANTS (propagated verbatim from F-PR2's no-silent-fallback rule):
//   - DEMO config serves every demo-capable capability with the demo provider.
//   - LIVE config forces live EVERYWHERE. A capability live cannot serve throws
//     a typed ProviderError (UNSUPPORTED) — never a fabricated demo row. UI that
//     sees "not-ready"/unsupported treats it as an honest absence, not a bug.
//   - AUTO is resolved PER CAPABILITY (capability-level, uniform): live when a
//     live implementation exists, demo when only a demo implementation exists,
//     "not-ready" when neither does. AUTO is the ONLY place demo and live
//     coexist in ONE bundle. A capability that HAS a live implementation is
//     never demo-served — its runtime failures surface as typed ProviderErrors
//     (no silent demo fallback). Demo serving is reachable only when the
//     deployment explicitly configures auto (prod auto must configure a demo
//     case, enforced by assertNoImplicitFallback).
// ============================================================================

/** A capability of the platform as published to the frontend. Domain keys the
 *  workspace provider bundle, network.* keys the Zone 2 representations. */
export type CapabilityKey =
  | "investigation"
  | "evidence"
  | "observations"
  | "cases"
  | "entities"
  | "graph"
  | "relations"
  | "intelligence"
  | "timeline"
  | "leads"
  | "gaps"
  | "review"
  | "robustness"
  | "hypotheses"
  | "crossCase"
  | "realtime"
  | "network.graph"
  | "network.pulse"
  | "network.matrix"
  | "network.flow";

/** Structural DataModeConfig (avoids an import cycle with types.ts). */
export type NetworkDataMode = "demo" | "live" | "auto";
export type NetworkDataModeConfig = {
  readonly mode: NetworkDataMode;
  readonly isDevelopment: boolean;
};
export type NetworkAppDataMode = "demo" | "live";

export interface CapabilityAvailability {
  readonly demo: boolean;
  readonly live: boolean;
}

export const CAPABILITY_AVAILABILITY: Record<
  CapabilityKey,
  CapabilityAvailability
> = {
  // ---- Queryable now from the platform API --------------------------------
  investigation: { demo: true, live: true },
  evidence: { demo: true, live: true },
  observations: { demo: true, live: true },
  cases: { demo: true, live: true },
  realtime: { demo: true, live: true },
  // ---- Phase 4 core investigation loop (live-wireable) ---------------------
  graph: { demo: true, live: true },
  leads: { demo: true, live: true },
  crossCase: { demo: true, live: true },
  // ---- PR-21 — entities, relations + concrete entity/relation hypothesis
  // reads are genuinely live-wired (real HTTP routes). The generic
  // IntelligenceProvider (intelligence) stays demo-only — there is NO generic
  // Intelligence API, so only the concrete capabilities backed by routes are
  // marked live. timeline/gaps/review/robustness/hypotheses (the canonical
  // Hypothesis store) have no live route and stay typed-unsupported. -------
  entities: { demo: true, live: true },
  relations: { demo: true, live: true },
  intelligence: { demo: true, live: false },
  timeline: { demo: true, live: false },
  gaps: { demo: true, live: false },
  review: { demo: true, live: false },
  robustness: { demo: true, live: false },
  hypotheses: { demo: true, live: false },
  // ---- Network representations --------------------------------------------
  // "graph", "entity pulse", "cross-case matrix" AND "adaptive flow" are
  // implemented (demo); LIVE serving stays typed-unsupported (never
  // fabricated).
  "network.graph": { demo: true, live: false },
  "network.pulse": { demo: true, live: false },
  "network.matrix": { demo: true, live: false },
  "network.flow": { demo: true, live: false },
};

/**
 * How a capability is served in this workspace.
 *  - "demo"      served by the demo implementation (always available here)
 *  - "live"      served by the live implementation (never a mock)
 *  - "not-ready" no implementation in the effective mode — a call FAILS FAST
 *                with a typed ProviderError. Never a silent demo fallback.
 */
export type CapabilityStatus = "demo" | "live" | "not-ready";

/**
 * Resolve the serving status for one capability.
 *
 * workspaceMode is the workspace's effective mode (AppDataMode) — "live" for a
 * live-resolved bundle, "demo" for a pure-demo bundle. config carries the
 * global data-mode configuration (mode + isDevelopment).
 *
 * Resolution matrix:
 *   workspaceMode "demo"  -> availability.demo ? "demo"  : "not-ready"
 *   workspaceMode "live":
 *     config.mode "live"  -> availability.live ? "live"  : "not-ready"
 *     config.mode "auto"  -> availability.live ? "live"
 *                             : availability.demo ? "demo"
 *                             : "not-ready"
 *     config.mode "demo"  -> availability.live ? "live"
 *                             : "not-ready"
 *
 * config.mode "auto" is capability-level and uniform: a capability with a live
 * implementation is ALWAYS served live (its runtime failures surface a typed
 * ProviderError — never a demo fallback); a capability with only a demo
 * implementation is served by the demo provider; a capability with neither is
 * "not-ready" and fails typed. The factory composes the AUTO bundle from
 * exactly this matrix, so the status is never mere declaration.
 */
export function resolveCapabilityStatus(
  capability: CapabilityKey,
  config: NetworkDataModeConfig,
  workspaceMode: NetworkAppDataMode,
): CapabilityStatus {
  const availability = CAPABILITY_AVAILABILITY[capability];

  if (workspaceMode === "demo") {
    return availability.demo ? "demo" : "not-ready";
  }

  if (availability.live) return "live";
  if (config.mode === "auto" && availability.demo) return "demo";
  return "not-ready";
}

export type CapabilityStatusTable = Record<CapabilityKey, CapabilityStatus>;

/** Build the full capability table for a workspace (bundle construction time).
 *  Used deterministically by BOTH demo and live bundle creators. */
export function createCapabilityStatusTable(
  config: NetworkDataModeConfig,
  workspaceMode: NetworkAppDataMode,
): CapabilityStatusTable {
  const table = {} as CapabilityStatusTable;
  for (const capability of Object.keys(CAPABILITY_AVAILABILITY)) {
    table[capability as CapabilityKey] = resolveCapabilityStatus(
      capability as CapabilityKey,
      config,
      workspaceMode,
    );
  }
  return table;
}