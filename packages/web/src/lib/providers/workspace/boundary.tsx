// ============================================================================
// F-PR2 Workspace Boundary (client)
//
// Resolves the explicit workspace identity from the route and builds the
// provider bundle CLIENT-SIDE, then provides it through the Workspace context
// wrapped in the workspace shell.
//
// Why client-side: the provider bundle holds runtime state (Sets, timeouts,
// in-memory demo state) that cannot cross the Server Component -> Client
// Component serialization boundary. Creating it here also lets us read the
// search params (caseId) and route param (investigationId) directly.
//
// Identity model (these are NOT the same thing):
//   - investigationId = route /investigations/[id]  (:id)
//   - caseId          = ?caseId= query param (DataMode resolution input)
//   - workspaceId     = stable frontend bundle-instance key
//
// UI never branches on DataMode and never imports Demo/Live implementations.
//
// F-PR5: <NetworkWorkspaceProvider> is mounted between <WorkspaceProvider> and
// <WorkspaceShell> so the Network workspace's shared analytical state (view,
// timeRange, focus) survives sub-route remounts while remaining scoped to this
// workspace instance. It uses useSearchParams() and is therefore inside the
// Suspense boundary, exactly like WorkspaceBoundaryContent itself.
// ============================================================================

"use client";

import { Suspense, useMemo, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createWorkspaceProviders } from "@/lib/providers/factory";
import { NetworkWorkspaceProvider } from "@/lib/network/use-network-workspace";
import { WorkspaceProvider } from "./context";
import { WorkspaceShell } from "./shell";

/**
 * Derive a deterministic, distinct bundle-instance key from the investigation
 * id so it is never confused with the case id or investigation id.
 */
function workspaceKey(investigationId: string): string {
  return `workspace:${investigationId}`;
}

function WorkspaceBoundaryContent({ children }: { readonly children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const investigationId = params.id;
  const caseId = searchParams.get("caseId") ?? "";

  const identity = useMemo(
    () => ({
      workspaceId: workspaceKey(investigationId),
      caseId,
      investigationId,
    }),
    [investigationId, caseId],
  );

  const providers = useMemo(
    () => createWorkspaceProviders(identity),
    [identity],
  );

  return (
    <WorkspaceProvider providers={providers}>
      <NetworkWorkspaceProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </NetworkWorkspaceProvider>
    </WorkspaceProvider>
  );
}

export function WorkspaceBoundary({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <WorkspaceBoundaryContent>{children}</WorkspaceBoundaryContent>
    </Suspense>
  );
}
