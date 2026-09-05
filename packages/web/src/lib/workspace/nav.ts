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
// landing route.
// ============================================================================

export interface NavEntry {
  readonly label: string;
  readonly href: string;
  /** Set true for scaffolded views rendered on the same route. */
  readonly scaffolded?: boolean;
}

/** Investigation workspace destinations (real routes only — do not invent). */
export const WORKSPACE_NAV: readonly NavEntry[] = [
  { label: "Dashboard", href: "/" },
  { label: "Overview", href: "" },
  { label: "Graph", href: "graph" },
  { label: "Timeline", href: "timeline" },
  { label: "Observations", href: "observations" },
  { label: "Leads", href: "leads" },
  { label: "Gaps", href: "gaps" },
  { label: "Evidence", href: "evidence" },
  // Cross-Case is a REAL, fully rendered module (CrossCaseSignals + case-boundary
  // graph overlays) — its PR-1 "scaffolded" flag was stale metadata and is gone.
  { label: "Cross-Case", href: "cross-case" },
  { label: "Ledger", href: "ledger", scaffolded: true },
  { label: "Robustness", href: "robustness", scaffolded: true },
  { label: "Review", href: "review", scaffolded: true },
  { label: "Hypothesis", href: "hypothesis" },
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

/** Dashboard (app landing) is active only on the root path. */
export function isDashboardPathname(pathname: string): boolean {
  return pathname === "/";
}

/** Resolve active state for a dock entry on a given pathname. */
export function isNavEntryActive(
  entry: NavEntry,
  pathname: string,
): boolean {
  if (entry.href === "/") return isDashboardPathname(pathname);
  if (entry.href === "") return workspaceSubroute(pathname) === "";
  return workspaceSubroute(pathname) === entry.href;
}