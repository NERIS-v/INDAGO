"use client";

// ============================================================================
// PR-2 Zone 0 — Graph Control Center (five-zone shell orchestrator)
// PR-3 — SINGLE OWNER of the investigative context bridge.
//
// The shell owns THREE independent state models:
//   - layout      : ControlCenterLayoutState  (rails open, active tabs)
//   - actions     : GraphControlCenterActions (graph surfaces visible, active overlay)
//   - context     : InvestigativeContext       (the discriminated selection)
//
// LAYOUT state NEVER mixes with investigative selection state. The PR-3
// bridge is the canonical selection owner: graph clicks, timeline activations,
// rail picks, deep links and drawer closes are all rematerialized here through
// one controller (useInvestigativeContext) and pushed to every surface.
//
// This is a LAYOUT + COMPOSITION component: the graph engine (GraphPanel/
// GraphCanvas) and timeline (TimelinePanel) are composed in place, not
// rewritten. It may use useWorkspace() but never imports Demo/Live providers,
// fixtures, or fixture databases.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { DEFAULT_ACTIONS, DEFAULT_LAYOUT_STATE } from "@/lib/layout/control-center";
import type {
  ControlCenterLayoutState,
  GraphControlCenterActions,
} from "@/lib/layout/control-center";
import type { ControlCenterSurfaceKey } from "@/lib/layout/control-center";
import type { ForeignCaseOverlay, TimelineItem } from "@/lib/providers/types";
import { useInvestigativeContext } from "@/lib/context/use-investigative-context";
import { getContextualCapabilities, sameContextIdentity } from "@/lib/context/investigative-context";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import {
  DEFAULT_NETWORK_VIEW,
  networkViewLabel,
} from "@/lib/network/network-workspace";
import type { NetworkView } from "@/lib/network/network-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { ControlCenterLayout } from "./control-center-layout";
import { OperationalRail } from "./operational-rail";
import { ContextualPanel } from "./contextual-panel";
import { TemporalContextPanel } from "./temporal-context-panel";
import { InvestigativeIntelligence } from "./investigative-intelligence";
import { GraphPanel } from "@/components/graph/graph-panel";
import { TimelinePanel } from "@/components/timeline/timeline-panel";

type ActionKey = ControlCenterSurfaceKey;

interface GraphControlCenterProps {
  activeTimeRange: [number, number] | null;
  onTimeRangeChange: (range: [number, number] | null) => void;
  initialFocusNodeId?: string | null;
  /** F-PR5 seam: which Network representation renders Zone 2. Only "graph" is
   *  implemented; other values render an honest typed not-ready pane. Absent →
   *  "graph", so existing callers and PR-2 tests are unchanged. */
  activeNetworkView?: NetworkView;
  /** F-PR5 seam: reports changes of the durable graph FOCUS target so the
   *  workspace state seam can serialize ?focus= (null = clear). SELECT is NOT
   *  FOCUS: this is only wired to the deliberate rail Focus and to clearing. */
  onFocusEntityChange?: (entityId: string | null) => void;
  /** F-PR5 seam: the shared workspace temporal scope to restore across remount
   *  so a returning route does not silently reset the timeline to full range. */
  restoredTimeRange?: [number, number] | null;
}

export function GraphControlCenter({
  activeTimeRange,
  onTimeRangeChange,
  initialFocusNodeId,
  activeNetworkView,
  onFocusEntityChange,
  restoredTimeRange,
}: GraphControlCenterProps) {
  const workspace = useWorkspace();

  const view = activeNetworkView ?? DEFAULT_NETWORK_VIEW;

  const [layout, setLayout] = useState<ControlCenterLayoutState>(DEFAULT_LAYOUT_STATE);
  const [actions, setActions] = useState<GraphControlCenterActions>(DEFAULT_ACTIONS);
  const [foreignOverlays, setForeignOverlays] = useState<ForeignCaseOverlay[]>([]);

  // PR-3: the canonical selection owner lives HERE, never inside a panel.
  const { context, select, focus, reveal } = useInvestigativeContext();
  const [focusRequest, setFocusRequest] = useState<{ nonce: number; entityId: string } | null>(null);

  // PR-3 UX: deselecting simply clears the highlight — the camera NEVER moves
  // on deselect. The only deliberate camera zooms are the rail "Focus"
  // (focusRequest → focusNode, zoom IN) and merge reveals; a background click
  // or re-click that clears a focus must not abruptly zoom the graph back out.
  const clearSelection = useCallback(() => {
    select(null);
    // F-PR5: a deliberate clear also releases the durable focus target. The
    // workspace store no-ops when focus is already null, so this never churns
    // the URL in the common "deselect without ever focusing" case.
    onFocusEntityChange?.(null);
  }, [select, onFocusEntityChange]);

  const capabilities = useMemo(
    () => getContextualCapabilities(context, { mode: workspace.mode }),
    [context, workspace.mode],
  );

  // Single source of foreign-case overlays, consumed by BOTH the operational
  // rail (cross-case picker) and the graph panel (overlay geometry). Fetched
  // once here so no consumer refetches when the shell re-lays-out.
  useEffect(() => {
    let active = true;
    workspace.crossCase
      .listForeignOverlays(workspace.caseId, { pageSize: 100 })
      .then((page) => page.items)
      .catch(() => [] as ForeignCaseOverlay[])
      .then((items) => {
        if (active) setForeignOverlays(items);
      });
    return () => {
      active = false;
    };
  }, [workspace]);

  const updateLayout = useCallback((patch: Partial<ControlCenterLayoutState>) => {
    setLayout((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateActions = useCallback((patch: Partial<GraphControlCenterActions>) => {
    setActions((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleAction = useCallback(
    (key: ActionKey) => {
      // PR-3 UX: re-clicking Detect Gaps while a gap is pitched = browse the
      // gaps LIST again (deselect + open the surface + collapse the panel so
      // only the list covers the graph).
      if (key === "gapsOpen" && context?.kind === "gap") {
        clearSelection();
        updateActions({ gapsOpen: true });
        updateLayout({ rightPanelOpen: false });
        return;
      }
      // PR-3 UX: opening a right-side analysis surface (Discover / Detect
      // Gaps) collapses the right contextual panel so the two never double-up
      // and cover the graph. The legend and the left-side cross-case scan are
      // exempt (and toggling a surface CLOSED never collapses the panel).
      // PR-4: the Filter inline controls are also exempt — they live inside the
      // rail and never steal graph real-estate or context.
      const opening = key === "legendOpen" ? !actions.legendOpen : !actions[key];
      if (opening && (key === "discoveryOpen" || key === "gapsOpen")) {
        updateLayout({ rightPanelOpen: false });
      }
      setActions((prev) => {
        // Independent (non-exclusive) surfaces: legend + the inline filter.
        if (key === "legendOpen" || key === "filterOpen") {
          return { ...prev, [key]: !prev[key] };
        }
        const nowOpen = !prev[key];
        const next: GraphControlCenterActions = {
          ...DEFAULT_ACTIONS,
          activeForeignCaseId: prev.activeForeignCaseId,
          legendOpen: prev.legendOpen,
          filterOpen: prev.filterOpen,
          filter: prev.filter,
        };
        next[key] = nowOpen;
        return next;
      });
    },
    [actions, context, clearSelection, updateActions, updateLayout],
  );

  // PR-3: rail/graph action patches feed selection too. Activating a foreign
  // overlay selects { cross-case, overlay.ref, rail }; deactivating clears the
  // cross-case context ONLY (a real entity selection survives overlay toggling)
  // and requests a camera refit (the overlay no longer warrants a focus).
  const handleActionsChange = useCallback(
    (patch: Partial<GraphControlCenterActions>) => {
      updateActions(patch);
      if (!("activeForeignCaseId" in patch)) return;
      const nextForeignId = patch.activeForeignCaseId;
      if (nextForeignId) {
        select({ kind: "cross-case", id: nextForeignId, source: "rail" });
      } else if (context?.kind === "cross-case") {
        clearSelection();
      }
    },
    [updateActions, select, context, clearSelection],
  );

  const focusContext = useCallback(
    (next: InvestigativeContext) => {
      focus(next);
      // Only entity selections have a deterministic graph target in PR-3.
      if (next.kind === "entity") {
        setFocusRequest((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, entityId: next.id }));
        // F-PR5: the deliberate rail Focus updates the durable focus target
        // (serialized as ?focus=). Node clicks never reach here — SELECT ≠ FOCUS.
        onFocusEntityChange?.(next.id);
      }
    },
    [focus, onFocusEntityChange],
  );

  const revealContext = useCallback(
    (next: InvestigativeContext) => {
      reveal(next);
      updateLayout({ rightPanelOpen: true });
    },
    [reveal, updateLayout],
  );

  // PR-3 UX: graph clicks REMATERIALIZE the selection with reveal semantics —
  // clicking a node/gap while the right panel is collapsed reopens it. The
  // one exception: re-clicking the SAME object while the panel is still open
  // toggles the selection OFF (the "focus goes away" affordance).
  const handleGraphContextSelect = useCallback(
    (next: InvestigativeContext | null) => {
      if (!next) {
        clearSelection();
        return;
      }
      if (sameContextIdentity(context, next) && layout.rightPanelOpen) {
        clearSelection();
        return;
      }
      revealContext(next);
    },
    [context, layout.rightPanelOpen, clearSelection, revealContext],
  );

  const handleTimelineActivate = useCallback(
    (item: TimelineItem) => {
      if (item.evidenceId) {
        revealContext({ kind: "evidence", id: item.evidenceId, source: "timeline" });
      } else if (item.observationId) {
        revealContext({ kind: "observation", id: item.observationId, source: "timeline" });
      }
    },
    [revealContext],
  );

  const toggleLeft = useCallback(() => {
    setLayout((prev) => ({ ...prev, leftRailOpen: !prev.leftRailOpen }));
  }, []);
  const toggleRight = useCallback(() => {
    setLayout((prev) => ({ ...prev, rightPanelOpen: !prev.rightPanelOpen }));
  }, []);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden p-3">
      <ControlCenterLayout
        leftRailOpen={layout.leftRailOpen}
        rightPanelOpen={layout.rightPanelOpen}
        onToggleLeft={toggleLeft}
        onToggleRight={toggleRight}
        rail={
          <OperationalRail
            open={layout.leftRailOpen}
            onToggle={toggleLeft}
            actions={actions}
            onActionToggle={toggleAction}
            onActionsChange={handleActionsChange}
            foreignOverlays={foreignOverlays}
            capabilities={capabilities}
            context={context}
            mode={workspace.mode}
            filter={actions.filter}
            onFilterChange={(next) => updateActions({ filter: next })}
            onFocus={() => {
              if (context) focusContext(context);
            }}
          />
        }
        graph={
          view === "graph" ? (
            <div className="relative h-full w-full min-h-0 min-w-0">
              <GraphPanel
                activeTimeRange={activeTimeRange}
                initialFocusNodeId={initialFocusNodeId}
                actions={actions}
                onActionsChange={handleActionsChange}
                foreignOverlays={foreignOverlays}
                onContextSelect={handleGraphContextSelect}
                selectedContext={context}
                focusRequest={focusRequest}
                filter={actions.filter}
              />
            </div>
          ) : (
            <div className="flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center p-6">
              <EmptyState
                title={`${networkViewLabel(view)} is not yet available`}
                description="This representation is declared in the workspace state seam but has no implementation yet. Its zone will render here once the representation ships. Switch back to the Network view to continue."
              />
            </div>
          )
        }
        context={
          <ContextualPanel
            open={layout.rightPanelOpen}
            onToggle={toggleRight}
            context={context}
            onSelectContext={revealContext}
          />
        }
        temporal={
          <TemporalContextPanel
            tab={layout.temporalTab}
            onTabChange={(tab) => updateLayout({ temporalTab: tab })}
          >
            <TimelinePanel
              onTimeRangeChange={onTimeRangeChange}
              onEventActivate={handleTimelineActivate}
              restoredTimeRange={restoredTimeRange}
            />
          </TemporalContextPanel>
        }
        intelligence={
          <InvestigativeIntelligence
            tab={layout.intelligenceTab}
            onTabChange={(tab) => updateLayout({ intelligenceTab: tab })}
            context={context}
            onSelectContext={revealContext}
          />
        }
      />
    </div>
  );
}