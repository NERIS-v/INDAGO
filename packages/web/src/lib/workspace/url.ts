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
import type { GraphFilterState } from "@/lib/graph/graph-filter";
import { DEFAULT_GRAPH_FILTER, MIN_SUPPORT_MAX } from "@/lib/graph/graph-filter";

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
/** F-PR14: `?support=` — the workspace readability filter min-support (0 default). */
export const NETWORK_SUPPORT_PARAM = "support";
/** F-PR14: `?hidec=` — the workspace readability filter "hide contradicted" flag. */
export const NETWORK_HIDEC_PARAM = "hidec";

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
 * F-PR14 — Read the workspace readability filter from the URL deterministically.
 * Absent/invalid params resolve to the DEFAULT (unfiltered) state so a fresh
 * workspace URL has no ?support=/?hidec= noise and corrupted values never crash
 * the workspace. Explicit values only ever appear when the filter is active —
 * default values are dropped on serialization (same REST-ful rule as ?view=).
 */
export function readNetworkFilter(
  searchParams: SearchParamsLike,
): GraphFilterState {
  if (!searchParams) return DEFAULT_GRAPH_FILTER;
  const supportRaw = searchParams.get(NETWORK_SUPPORT_PARAM);
  const hidecRaw = searchParams.get(NETWORK_HIDEC_PARAM);
  const parsedSupport = supportRaw ? Number(supportRaw) : NaN;
  const minSupport =
    Number.isFinite(parsedSupport) && parsedSupport > 0
      ? Math.min(MIN_SUPPORT_MAX, parsedSupport)
      : 0;
  return {
    minSupport,
    hideContradicted: hidecRaw === "1" || hidecRaw === "true",
  };
}

/** F-PR14 — The non-default filter dimension entries to serialize (?support=/?hidec=). */
export function networkFilterToParams(
  filter: GraphFilterState,
): { readonly key: string; readonly value: string }[] {
  const params: { key: string; value: string }[] = [];
  if (filter.minSupport > 0) {
    params.push({ key: NETWORK_SUPPORT_PARAM, value: String(filter.minSupport) });
  }
  if (filter.hideContradicted) {
    params.push({ key: NETWORK_HIDEC_PARAM, value: "1" });
  }
  return params;
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