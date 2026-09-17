// ============================================================================
// PR-22 — Valid-At Temporal Projection (pure derivations)
//
// A DISTINCT temporal concept from CURRENT (the live projection) and VERSION
// (a persisted graph version). VALID-AT is a backend graph projection valid at
// a requested domain instant — a request the frontend issues to the platform
// (GET /cases/:caseId/graph/valid-at?at=<ISO>) and renders as returned. It is
// NEVER a client-side filter of the current graph, never a fake /as-of, and
// never local interpolation.
//
// The module is pure (zero component / provider imports) so the honesty rules
// are unit-testable in one place:
//  1. An active valid-at request NEVER falls back to the current/version graph
//     when its projection is unreachable — it reports an honest error state.
//  2. A valid-at projection is a BACKEND request, distinguished from a local
//     time-range filter and from a persisted version.
//  3. as-of (GET /cases/:caseId/graph/as-of) is a DEFERRED 501 capability and
//     is NEVER offered here.
// ============================================================================

export type ValidAtMode = "current" | "valid-at";

export interface ValidAtSelection {
  readonly mode: ValidAtMode;
  /** The requested domain instant (ISO 8601) when mode === "valid-at". */
  readonly at: string | null;
}

export const CURRENT_VALID_AT_SELECTION: ValidAtSelection = {
  mode: "current",
  at: null,
};

export function isValidAtRequest(selection: ValidAtSelection): boolean {
  return selection.mode === "valid-at" && selection.at !== null;
}

/** Honesty rule #1: an unreachable valid-at projection must never silently fall
 *  back to the current/version graph. */
export const VALID_AT_SURFACE_UNAVAILABLE =
  "The valid-at graph projection is not reachable on this provider seam — the current graph is never shown on its behalf.";

/** as-of is a deferred 501 capability and is never offered (valid-at only). */
export const AS_OF_UNSUPPORTED =
  "The as-of projection is not supported — the valid-at projection is the authoritative historical surface.";

export type ValidAtViewState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "valid-at" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface ValidAtViewInput {
  readonly selection: ValidAtSelection;
  /** Whether the seam exposes any valid-at surface at all. */
  readonly available: boolean;
  /** True while a projection request is in flight. */
  readonly pending: boolean;
  /** Whether a projection actually resolved (backend returned a graph). */
  readonly resolved: boolean;
  /** The typed provider/API error message, if any. */
  readonly error: string | null;
}

export function deriveValidAtViewState(input: ValidAtViewInput): ValidAtViewState {
  if (!input.available) {
    return { kind: "unsupported", reason: VALID_AT_SURFACE_UNAVAILABLE };
  }
  if (!isValidAtRequest(input.selection)) {
    return { kind: "idle" };
  }
  if (input.error) {
    return { kind: "error", message: input.error };
  }
  if (input.pending && !input.resolved) {
    return { kind: "loading" };
  }
  if (input.resolved) {
    return { kind: "valid-at" };
  }
  return { kind: "loading" };
}

/** A compact label marking a projection as a backend valid-at request (distinct
 *  from a local filter and from a persisted version). */
export function validAtLabel(at: string): string {
  return `Valid at ${at}`;
}