// ============================================================================
// PR-7 — Temporal + Activity + Version Context (pure derivations)
//
// One coherent temporal workspace state: the analyst's temporal scope
// (timeRange), the graph version currently in view (versionId) and whether that
// view is the live CURRENT projection or a locked HISTORICAL version.
//
// The module is pure (zero component / provider imports) so every rule below is
// unit-testable and the honesty guarantees are enforced in one place:
//
//  1. A historical selection NEVER falls back to the current graph when its own
//     materialized surface is unreachable ("historical-unavailable").
//  2. REALTIME NEVER MUTATES A HISTORICAL VIEW: while a historical version is
//     selected, live events are recorded but must not be applied to the graph.
//  3. Version history is read through the provider seam only — there is no
//     fake /as-of, and demo fixtures are the only demo-source of version data.
// ============================================================================

import type { GraphVersion } from "@indago/contracts";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";

// ----------------------------------------------------------------------------
// Workspace context
// ----------------------------------------------------------------------------

export type TemporalVersionMode = "current" | "historical";

export interface TemporalVersionSelection {
  readonly mode: TemporalVersionMode;
  /** null when mode === "current". */
  readonly versionId: string | null;
}

export interface TemporalWorkspaceContext extends TemporalVersionSelection {
  /** Workspace-wide temporal scope (shared with the graph zones). */
  readonly timeRange: NetworkTimeRange;
}

export const CURRENT_VERSION_SELECTION: TemporalVersionSelection = {
  mode: "current",
  versionId: null,
};

export function isHistoricalView(selection: TemporalVersionSelection): boolean {
  return selection.mode === "historical";
}

/** Honesty rule #2: realtime feeding is never allowed to mutate the graph the
 *  analyst is looking at while it is locked onto a historical version. */
export function realtimeMayMutateVisibleGraph(
  selection: TemporalVersionSelection,
): boolean {
  return selection.mode === "current";
}

// ----------------------------------------------------------------------------
// Version view state
// ----------------------------------------------------------------------------

export const HISTORICAL_SURFACE_UNAVAILABLE =
  "Historical graph projection is not reachable on this provider seam — the current graph is never shown on its behalf.";

export const HISTORICAL_NO_SILENT_MUTATION =
  "New realtime events are recorded but never mutate this historical graph view.";

export type VersionViewState =
  | { readonly kind: "loading" }
  | { readonly kind: "current"; readonly version: GraphVersion }
  | { readonly kind: "historical"; readonly version: GraphVersion }
  | { readonly kind: "historical-unavailable"; readonly reason: string }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface VersionViewInput {
  readonly selection: TemporalVersionSelection;
  readonly currentVersion: GraphVersion | null;
  /** Metadata for the selected historical version (null = unreachable). */
  readonly selectedVersion: GraphVersion | null;
  /** Whether the seam exposes any historical surface at all. */
  readonly listingAvailable: boolean;
  /** True while any of the above is still loading. */
  readonly pending: boolean;
}

export function deriveVersionViewState(input: VersionViewInput): VersionViewState {
  if (!input.listingAvailable) {
    return {
      kind: "unsupported",
      reason:
        "Graph versions are not available on this provider seam — no historical surface and no fabrication.",
    };
  }
  if (input.pending) {
    return input.selection.mode === "historical" && input.selectedVersion
      ? { kind: "historical", version: input.selectedVersion }
      : { kind: "loading" };
  }
  if (input.selection.mode === "historical") {
    // Honesty rule #1: never fall back to the current graph for a historical
    // selection — if the selected version has no reachable surface, say so.
    if (!input.selectedVersion) {
      return { kind: "historical-unavailable", reason: HISTORICAL_SURFACE_UNAVAILABLE };
    }
    return { kind: "historical", version: input.selectedVersion };
  }
  if (!input.currentVersion) return { kind: "loading" };
  return { kind: "current", version: input.currentVersion };
}

// ----------------------------------------------------------------------------
// Version list helpers
// ----------------------------------------------------------------------------

export function sortVersionsByNumber(
  versions: readonly GraphVersion[],
): GraphVersion[] {
  return [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
}

/** The ACTIVE projection is the live graph; falls back to the newest numbered
 *  version when nothing is ACTIVE (still honest — never synthesizes one). */
export function activeVersion(
  versions: readonly GraphVersion[],
): GraphVersion | null {
  const active = versions.find((v) => v.status === "ACTIVE");
  if (active) return active;
  const sorted = sortVersionsByNumber(versions);
  return sorted[sorted.length - 1] ?? null;
}

export function versionLabel(version: GraphVersion): string {
  return `v${version.versionNumber}`;
}