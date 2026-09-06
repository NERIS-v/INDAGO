"use client";

// ============================================================================
// PR-8 — Contextual Panel Footer (footerSlot for the graph-context panel)
//
// Composes the PR-8 surfaces inside the contextual panel's RESERVED footer slot
// (reserved in PR-3, rendered nothing until now):
//   - Relation contexts   → Relation Authority (mutation panel) + Deep-Dive
//     Bridges.
//   - Entity contexts     → Deep-Dive Bridges.
//   - Relation + unsupported details (live seam) → honest typed-unsupported
//     note (never a fake authority surface).
//   - Anything else       → nothing (identical rendering to the pre-PR-8
//     reservation).
//
// After a successful mutation the footer re-selects the SAME relation through
// the shell bridge (fresh object identity → the details effect re-resolves so
// every consumer shows the authoritative status) and requests a graph reload
// (the canonical projection reconciles). False assumptions are avoided: stale
// concurrent changes surface through the panel's stale-conflict note, never as
// a silent false success.
// ============================================================================

import { useCallback } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { useContextDetails } from "@/lib/context/use-context-details";
import { isContextDetailsResolved } from "@/lib/context/context-details";
import {
  relationAuthorityAvailable,
  type RelationAuthorityAction,
} from "@/lib/context/relation-authority";
import {
  entityDeepDiveLinks,
  relationDeepDiveLinks,
} from "@/lib/context/deep-dive-links";
import { RelationAuthorityPanel } from "./relation-authority-panel";
import { DeepDiveBridges } from "./deep-dive-bridges";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import type { InvestigativeContext } from "@/lib/context/investigative-context";

interface ContextualPanelFooterProps {
  /** The shell-owned canonical selection (null renders nothing). */
  readonly context: InvestigativeContext | null;
  /** Shell reveal seam — re-select the same object to refresh its details. */
  readonly onReselect: (next: InvestigativeContext) => void;
  /** Shell graph refetch seam — bump the reload nonce after a mutation. */
  readonly onReloadRequest: () => void;
  /** PR-10: true when the shell has selected a HISTORICAL graph version. The
   *  authority panel is a MUTATION surface for the LIVE graph — it must never
   *  be present (not even disabled) while the analyst believes they are reading
   *  history. Renders an honest gated note instead; deep-dive navigation links
   *  are safe to keep. Absent → false (pre-PR-10 behavior unchanged). */
  readonly historical?: boolean;
}

export function ContextualPanelFooter({
  context,
  onReselect,
  onReloadRequest,
  historical = false,
}: ContextualPanelFooterProps) {
  const workspace = useWorkspace();
  const { details, loading } = useContextDetails(context);
  const gate = relationAuthorityAvailable(workspace.mode);

  const resolved = isContextDetailsResolved(details) ? details : null;
  const relation = resolved?.kind === "relation" ? resolved.relation : null;

  const mutate = useCallback(
    async (action: RelationAuthorityAction, reason?: string) => {
      if (historical) {
        throw new Error(
          "Relation authority is unavailable in a historical version view — live graph data is never mutated from a historical selection.",
        );
      }
      if (!relation) {
        throw new Error("Relation context is not resolved; cannot run an authority decision.");
      }
      const provider = workspace.relations;
      const fn =
        action === "accept"
          ? provider.accept
          : action === "reject"
            ? provider.reject
            : provider.reverse;
      if (!fn) {
        throw new Error("Relation authority is not available on this provider seam.");
      }
      const result = await fn.call(
        provider,
        workspace.investigationId,
        relation.id,
        reason ?? undefined,
      );
      onReselect({ kind: "relation", id: relation.id, source: "authority" });
      onReloadRequest();
      return result;
    },
    [workspace, relation, onReselect, onReloadRequest, historical],
  );

  if (!context) return null;

  if (resolved?.kind === "relation") {
    if (historical) {
      return (
        <div className="flex flex-col gap-3" data-testid="contextual-panel-footer">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
            Relation authority
          </p>
          <p
            className="type-caption"
            data-testid="relation-authority-historical-unavailable"
          >
            Relation decisions are unavailable while viewing a historical
            version — the live graph is never mutated from a historical view.
            Return to the current version to make an authority decision.
          </p>
          <PanelErrorBoundary label="Deep-dive bridges">
          <DeepDiveBridges
            links={relationDeepDiveLinks(
              {
                investigationId: workspace.investigationId,
                caseId: workspace.caseId,
              },
              resolved,
            )}
          />
        </PanelErrorBoundary>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" data-testid="contextual-panel-footer">
        <PanelErrorBoundary label="Relation authority">
          <RelationAuthorityPanel relation={resolved.relation} gate={gate} onMutate={mutate} />
        </PanelErrorBoundary>
        <PanelErrorBoundary label="Deep-dive bridges">
          <DeepDiveBridges
            links={relationDeepDiveLinks(
              {
                investigationId: workspace.investigationId,
                caseId: workspace.caseId,
              },
              resolved,
            )}
          />
        </PanelErrorBoundary>
      </div>
    );
  }

  if (resolved?.kind === "entity") {
    return (
      <div className="flex flex-col gap-3" data-testid="contextual-panel-footer">
        <PanelErrorBoundary label="Deep-dive bridges">
          <DeepDiveBridges
            links={entityDeepDiveLinks(
              {
                investigationId: workspace.investigationId,
                caseId: workspace.caseId,
              },
              resolved,
            )}
          />
        </PanelErrorBoundary>
      </div>
    );
  }

  if (
    !loading &&
    details &&
    details.status === "unsupported" &&
    context.kind === "relation"
  ) {
    return (
      <div className="flex flex-col gap-1" data-testid="contextual-panel-footer">
        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
          Relation authority
        </p>
        <p
          className="type-caption"
          data-testid="relation-authority-unavailable"
        >
          {gate.unavailableReason ??
            "Relation authority is unavailable on this provider seam."}
        </p>
      </div>
    );
  }

  return null;
}