// ============================================================================
// Workspace URL helper
//
// Central construction of investigation workspace URLs so that caseId is NEVER
// dropped during navigation (the F-PR2 hotfix regression guard). Every
// investigation workspace route preserves ?caseId=<CASE_ID>. Consumers must
// use these helpers instead of hand-building URLs.
//
// F-PR5 additions: two-way network workspace query-state helpers. These are the
// ONLY place network view/focus query params are parsed/serialized — the
// Network workspace state seam (lib/network) reads/writes through these so
// ?caseId= can never be dropped while syncing view/focus state.
// ============================================================================

import { parseNetworkView, type NetworkView } from "@/lib/network/network-workspace";

/** Build an investigation workspace URL, preserving the case boundary. */
export function investigationUrl(
  investigationId: string,
  caseId: string,
  subroute?: string,
): string {
  const base = `/investigations/${investigationId}${
    subroute ? `/${subroute}` : ""
  }`;
  return appendCaseId(base, caseId);
}

/** Append ?caseId= to an existing path (safe for overview or a subroute). */
export function appendCaseId(path: string, caseId: string): string {
  if (!caseId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}caseId=${encodeURIComponent(caseId)}`;
}

// ============================================================================
// F-PR5 network workspace query-state params
// ============================================================================

/** `?view=` — the active Network representation ("graph" is the default). */
export const NETWORK_VIEW_PARAM = "view";
/** `?focus=` — the durable deep-link graph focus target (an entity id). */
export const NETWORK_FOCUS_PARAM = "focus";
/** `?entity=` — the observations route filter (read-only deep link today). */
export const NETWORK_ENTITY_PARAM = "entity";

export type SearchParamsLike = {
  get(name: string): string | null;
  toString(): string;
} | null;

/** Read the active representation; null when absent. */
export function readNetworkView(
  searchParams: SearchParamsLike,
): NetworkView | null {
  if (!searchParams) return null;
  return parseNetworkView(searchParams.get(NETWORK_VIEW_PARAM));
}

/** Read the durable focus target; null when absent. */
export function readNetworkFocus(searchParams: SearchParamsLike): string | null {
  if (!searchParams) return null;
  return searchParams.get(NETWORK_FOCUS_PARAM) ?? null;
}

/**
 * Copy the current search params with `key` set to `value`.
 * Preserves every existing param (including ?caseId=).
 */
export function withSearchParam(
  searchParams: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  next.set(key, value);
  return next;
}

/**
 * Copy the current search params with `key` removed.
 * Preserves every existing param (including ?caseId=).
 */
export function withoutSearchParam(
  searchParams: URLSearchParams,
  key: string,
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  next.delete(key);
  return next;
}

/** Build a href from a pathname + query params (no trailing `?` when empty). */
export function pathWithParams(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}