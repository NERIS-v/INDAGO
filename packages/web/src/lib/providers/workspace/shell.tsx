// ============================================================================
// PR-1 Workspace Shell / Navigation
//
// Rendered within the investigation workspace layout. Mounts the detached
// horizontal navigation dock (WorkspaceNavDock) above the workspace content.
// Consumes only the WorkspaceProviders bundle via useWorkspace — never imports
// Demo/Live and never branches on user-visible logic.
//
// PR-2 height model: one contract. The shell is a full-viewport flex column;
// the dock is fixed and the content area owns the scroll region, so the graph
// control center can fill its zone with h-full without magic offsets.
// ============================================================================

"use client";

import { WorkspaceNavDock } from "@/components/layout/workspace-nav-dock";

export function WorkspaceShell({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <WorkspaceNavDock />
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}