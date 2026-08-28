"use client";

import { useWorkspace } from "@/lib/providers/workspace/context";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

interface InvestigationScaffoldProps {
  readonly title: string;
  readonly description: string;
  /** Canonical terminology shown as a muted label. */
  readonly domain: string;
}

/**
 * Placeholder surface for a workspace view that is scaffolded but not yet
 * implemented (F-PR3+). Consumes the Workspace context so the shell wiring is
 * verified; it intentionally shows NO intelligence behavior — just a clear
 * "future" empty state using canonical domain terminology.
 */
export function InvestigationScaffold({
  title,
  description,
  domain,
}: InvestigationScaffoldProps) {
  // Reading the workspace confirms the provider/context wiring is live and
  // keeps every scaffold participating in the active workspace.
  const workspace = useWorkspace();

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-text-primary">{title}</h1>
        <Badge variant="muted">{domain}</Badge>
      </div>
      <EmptyState
        title={`${title} is scaffolded`}
        description={`${description} This view is part of the workspace architecture but is implemented in a later phase (F-PR3+). No intelligence is computed here yet.`}
      />
      <p className="type-caption text-text-muted">
        Workspace id: {workspace.workspaceId}
      </p>
    </div>
  );
}
