// ============================================================================
// PR-1 Navigation Dock — shared nav data + route helpers
//
// Single source of truth for the investigation workspace destination list and
// the pathname parsing used by both the workspace dock (WorkspaceNavDock) and
// the app-level dock (AppNavDock). Kept dependency-free so it can be unit
// tested without a DOM or a provider bundle.
//
// Route contract (preserved from the previous WorkspaceShell NAV; see shell.tsx
// history): every investigation workspace sub-route is rendered under
// /investigations/:id and keeps the case boundary via ?caseId=. The Overview
// sub-route has an empty href (the :id index route). Dashboard is the app-level
// route; the root "/" is the cinematic Home surface.
// ============================================================================

export interface NavEntry {
  readonly label: string;
  readonly href: string;
  /** Set true for scaffolded views rendered on the same route. */
  readonly scaffolded?: boolean;
  /** Visual grouping label in the workspace dock. */
  readonly group?: string;
}

/** Investigation workspace destinations (real routes only — do not invent). */
export const WORKSPACE_NAV: readonly NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", group: "Core" },
  { label: "Overview", href: "", group: "Core" },
  // F-PR6: the parent network destination is labelled NETWORK; its five-zone
  // shell serves the selected representation (Graph / Pulse / Matrix / Flow).
  { label: "Network", href: "graph", group: "Core" },
  { label: "Evidence", href: "evidence", group: "Core" },
  { label: "Observations", href: "observations", group: "Intelligence" },
  { label: "Leads", href: "leads", group: "Intelligence" },
  { label: "Gaps", href: "gaps", group: "Intelligence" },
  { label: "Hypothesis", href: "hypothesis", group: "Intelligence" },
  // Cross-Case is a REAL, fully rendered module (CrossCaseSignals + case-boundary
  // graph overlays) — its PR-1 "scaffolded" flag was stale metadata and is gone.
  { label: "Cross-Case", href: "cross-case", group: "Analysis" },
  { label: "Ledger", href: "ledger", scaffolded: true, group: "Analysis" },
  { label: "Robustness", href: "robustness", scaffolded: true, group: "Analysis" },
  { label: "Review", href: "review", scaffolded: true, group: "Analysis" },
];

/**
 * The workspace sub-route currently active, given a pathname. Mirrors the
 * previous WorkspaceShell resolution: /investigations/:id[/:subroute].
 * Overview is the empty sub-route (":id" with no third segment).
 */
export function workspaceSubroute(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "investigations") return "";
  if (segments[1] === "new") return "";
  return segments[2] ?? "";
}

/** True when the pathname is inside an investigation workspace route. */
export function isInvestigationWorkspacePathname(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments[0] === "investigations" &&
    segments.length >= 2 &&
    segments[1] !== "new"
  );
}

/** The cinematic Home owns the root path — no application chrome on "/". */
export function isHomePathname(pathname: string): boolean {
  return pathname === "/";
}

/** Dashboard (app workspace) is active only on the /dashboard route. */
export function isDashboardPathname(pathname: string): boolean {
  return pathname === "/dashboard";
}

/**
 * Resolve active state for a dock entry on a given pathname.
 * Absolute hrefs (e.g. "/") are app-level routes matched exactly; workspace
 * entries resolve against the workspace sub-route (Overview = empty href).
 */
export function isNavEntryActive(
  entry: NavEntry,
  pathname: string,
): boolean {
  if (entry.href.startsWith("/")) return pathname === entry.href;
  if (entry.href === "") return workspaceSubroute(pathname) === "";
  return workspaceSubroute(pathname) === entry.href;
}