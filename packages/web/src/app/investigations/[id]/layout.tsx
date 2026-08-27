import type { ReactNode } from "react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";

/**
 * Workspace layout for an investigation.
 *
 * Renders the client <WorkspaceBoundary>, which resolves the explicit
 * workspace identity (investigationId from the route, caseId from ?caseId=)
 * and builds the provider bundle client-side. The bundle is provided through
 * the Workspace context and wrapped in the workspace shell. UI never branches
 * on DataMode and never imports Demo/Live implementations.
 */
export default function InvestigationWorkspaceLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <WorkspaceBoundary>{children}</WorkspaceBoundary>;
}
