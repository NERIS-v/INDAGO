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
import type { GraphFilterState } from "@/lib/graph/graph-filter";
import { DEFAULT_GRAPH_FILTER } from "@/lib/graph/graph-filter";
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
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { ControlCenterLayout } from "./control-center-layout";
import { OperationalRail } from "./operational-rail";
import { ContextualPanel } from "./contextual-panel";
import { ContextualPanelFooter } from "./contextual-panel-footer";
import { TemporalContextPanel } from "./temporal-context-panel";
import {
  CURRENT_VERSION_SELECTION,
  isHistoricalView,
  type TemporalVersionSelection,
} from "@/lib/context/temporal-workspace";
import { InvestigativeIntelligence } from "./investigative-intelligence";
import { PulsePanel } from "./pulse/pulse-panel";
import { PulseRail } from "./pulse/pulse-rail";
import { PulseContextSummary } from "./pulse/pulse-context-summary";
import { PulseTemporalNote } from "./pulse/pulse-temporal-note";
import { PulseIntelligenceInsight } from "./pulse/pulse-intelligence-insight";
import { RepresentationSwitcher } from "./representation-switcher";
import { presentationFor } from "@/lib/network/representations";
import { useEntityPulseAnalysis } from "@/lib/network/pulse/use-entity-pulse";
import { GraphPanel } from "@/components/graph/graph-panel";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { useMatrixAnalysis } from "@/lib/network/matrix/use-matrix";
import type { MatrixAuthStep, MatrixMode } from "@/lib/network/matrix/matrix-model";
import { MatrixPanel } from "./matrix/matrix-panel";
import { MatrixRail } from "./matrix/matrix-rail";
import { MatrixContextSummary } from "./matrix/matrix-context-summary";
import { MatrixTemporalNote } from "./matrix/matrix-temporal-note";
import { MatrixIntelligenceInsight } from "./matrix/matrix-intelligence-insight";
import { useFlowAnalysis } from "@/lib/network/flow/use-flow-analysis";
import type { FlowDomain, FlowRoleFilter } from "@/lib/network/flow/flow-model";
import { FlowPanel } from "./flow/flow-panel";
import { FlowRail } from "./flow/flow-rail";
import { FlowContextSummary } from "./flow/flow-context-summary";
import { FlowTemporalNote } from "./flow/flow-temporal-note";
import { FlowIntelligenceInsight } from "./flow/flow-intelligence-insight";
import { StructuralSignalsPanel } from "./structural/structural-signals-panel";
import {
  investigationUrl,
  NETWORK_ENTITY_PARAM,
} from "@/lib/workspace/url";

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
  /** F-PR6 seam: reports Zone 2 representation changes so the workspace state
   *  seam can serialize ?view=. Absent → the representation switcher is hidden
   *  and behavior is unchanged (tests / standalone renders stay stable). */
  onNetworkViewChange?: (view: NetworkView) => void;
  /** F-PR5 seam: the shared workspace temporal scope to restore across remount
   *  so a returning route does not silently reset the timeline to full range. */
  restoredTimeRange?: [number, number] | null;
  /** F-PR14 seam: the workspace-scoped readability filter (?support=/?hidec=),
   *  owned by the Network workspace state seam so it survives sub-route nav and
   *  is shared by every representation. Absent → a local fallback keeps
   *  standalone/test renders valid. */
  graphFilter?: GraphFilterState;
  /** F-PR14 seam: reports filter changes so the workspace seam can serialize
   *  the URL. Absent → the local fallback applies (no URL churn). */
  onGraphFilterChange?: (filter: GraphFilterState) => void;
}

export function GraphControlCenter({
  activeTimeRange,
  onTimeRangeChange,
  initialFocusNodeId,
  activeNetworkView,
  onFocusEntityChange,
  onNetworkViewChange,
  restoredTimeRange,
  graphFilter: graphFilterProp,
  onGraphFilterChange,
}: GraphControlCenterProps) {
  const workspace = useWorkspace();

  const view = activeNetworkView ?? DEFAULT_NETWORK_VIEW;

  // F-PR6: the pulse renders only when the effective workspace mode can serve
  // it (DEMO / AUTO-demo). In a LIVE workspace (or any mode where the typed
  // resolution is "not-ready") the shell renders the honest typed pane instead
  // of the representation. Read from the capability table — never branch on
  // Demo/Live implementations here.
  const pulseServed =
    workspace.capabilities["network.pulse"] !== "not-ready";
  // F-PR7: same gate for the Cross-Case / Relationship matrix.
  const matrixServed =
    workspace.capabilities["network.matrix"] !== "not-ready";
  // F-PR8: same gate for the Adaptive Flow representation.
  const flowServed =
    workspace.capabilities["network.flow"] !== "not-ready";
  const availability = {
    graph: workspace.capabilities["network.graph"],
    pulse: workspace.capabilities["network.pulse"],
    matrix: workspace.capabilities["network.matrix"],
    flow: workspace.capabilities["network.flow"],
  } as const;

  const [layout, setLayout] = useState<ControlCenterLayoutState>(DEFAULT_LAYOUT_STATE);
  const [actions, setActions] = useState<GraphControlCenterActions>(DEFAULT_ACTIONS);
  const [foreignOverlays, setForeignOverlays] = useState<ForeignCaseOverlay[]>([]);

  // F-PR14: the readability filter VALUE is workspace-scoped (deterministic,
  // URL-serialized, survives remounts). When the caller supplies the seam use
  // it; otherwise fall back to a local copy so standalone/test renders stay
  // valid (the rail surface state stays in `actions.filterOpen` regardless).
  const [localFilter, setLocalFilter] = useState<GraphFilterState>(DEFAULT_GRAPH_FILTER);
  const effectiveFilter = graphFilterProp ?? localFilter;
  const handleFilterChange = useCallback(
    (next: GraphFilterState) => {
      setLocalFilter(next);
      onGraphFilterChange?.(next);
    },
    [onGraphFilterChange],
  );

  // PR-10: the temporal version selection is SHELL-owned (lifted out of
  // TemporalContextPanel) so the contextual-panel authority footer can be gated
  // honestly — a historical selection must never permit a mutation that would
  // apply to the live graph while the analyst believes they are editing history.
  const [temporalSelection, setTemporalSelection] = useState<TemporalVersionSelection>(
    CURRENT_VERSION_SELECTION,
  );
  const historicalView = isHistoricalView(temporalSelection);

  // PR-8: post-mutation canonical-graph refetch nonce. A relation-authority
  // decision reconciles the projection in the provider store; bumping this
  // nonce makes GraphPanel refetch version/nodes/edges so the change renders.
  const [graphReloadRequest, setGraphReloadRequest] = useState<{ nonce: number } | null>(null);
  const requestGraphReload = useCallback(
    () => setGraphReloadRequest((prev) => ({ nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  );

  // F-PR6 corrective pass: the five-zone shell GEOMETRY is fixed; what adapts
  // per representation is zone CONTENT, resolved by a typed presentation model
  // — never scattered `view === "pulse"` checks in this shell.
  const presentation = useMemo(
    () => presentationFor(view, pulseServed, matrixServed, flowServed),
    [view, pulseServed, matrixServed, flowServed],
  );

  // ONE shell-owned Entity Pulse analysis shared by every supporting zone
  // (rail, panel, context, temporal note, intelligence adapter). Provider
  // fetches are strictly gated to the pulse representation — graph mode never
  // triggers pulse fetches.
  const pulse = useEntityPulseAnalysis({
    enabled: presentation.zoneTwo === "pulse",
    timeRange: activeTimeRange,
    overlays: foreignOverlays,
  });

  // F-PR7: ONE shell-owned Matrix analysis shared by every supporting zone
  // (rail, panel, context, temporal note, intelligence adapter). Provider
  // fetches are strictly gated to the matrix representation — graph/pulse
  // modes never trigger matrix fetches.
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("cross-case");
  const [matrixBoundary, setMatrixBoundary] = useState<string | null>(null);
  const [matrixAuth, setMatrixAuth] = useState<
    Readonly<Record<string, MatrixAuthStep>>
  >({});
  const authorizedBoundaries = useMemo(
    () =>
      Object.entries(matrixAuth)
        .filter(
          (entry): entry is [string, "authorized"] =>
            entry[1] === "authorized",
        )
        .map(([caseId]) => caseId),
    [matrixAuth],
  );

  const matrix = useMatrixAnalysis({
    enabled: presentation.zoneTwo === "matrix",
    timeRange: activeTimeRange,
    overlays: foreignOverlays,
    mode: matrixMode,
    boundaryCaseId: matrixBoundary,
    authorizedBoundaries,
  });

  // F-PR8: ONE shell-owned Flow analysis shared by every supporting zone
  // (rail, panel, context, temporal note, intelligence adapter). Provider
  // fetches are strictly gated to the flow representation — graph/pulse/
  // matrix modes never trigger flow fetches.
  const [flowMode, setFlowMode] = useState<FlowDomain | null>(null);
  const [flowRoleFilter, setFlowRoleFilter] = useState<FlowRoleFilter>("all");

  const flow = useFlowAnalysis({
    enabled: presentation.zoneTwo === "flow",
    timeRange: activeTimeRange,
    mode: flowMode,
    roleFilter: flowRoleFilter,
  });

  // F-PR7: when no boundary has been chosen yet, the picker
  // deterministically follows the boundary the model resolved (the first
  // comparison candidate in provider order). A ready meta can transiently
  // report a null boundary until the provider surfaces (foreign overlays /
  // match records) land, so the follow ALSO latches the first option the
  // model can resolve. If the model still resolves nothing on the current
  // frame, re-poll briefly — the surfaces can settle a beat later, and the
  // picker must never sit empty while comparison candidates exist (the
  // refetch cascade can otherwise wedge it). Switching to within-case keeps
  // the analyst's choice for when they toggle back.
  const matrixMeta = matrix.meta;
  const [boundaryRetry, setBoundaryRetry] = useState(0);
  useEffect(() => {
    if (matrixBoundary !== null) return;
    const resolvedBoundary =
      matrixMeta?.boundaryCaseId ?? matrix.boundaryOptions[0]?.caseId ?? null;
    if (resolvedBoundary !== null) {
      setMatrixBoundary(resolvedBoundary);
      return;
    }
    if (!matrixMeta || boundaryRetry >= 20) return;
    const t = setTimeout(() => setBoundaryRetry((n) => n + 1), 50);
    return () => clearTimeout(t);
  }, [matrixMeta, matrix.boundaryOptions, matrixBoundary, boundaryRetry]);

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

  // F-PR6: "Open in Graph" hands a pulse entity to the EXISTING graph focus
  // seam — switch the representation to graph, rematerialize the selection and
  // request the deterministic camera focus (same path as the rail Focus).
  const openEntityInGraph = useCallback(
    (entityId: string) => {
      onNetworkViewChange?.("graph");
      const next: InvestigativeContext = {
        kind: "entity",
        id: entityId,
        source: "graph",
      };
      select(next);
      setFocusRequest((prev) => ({
        nonce: (prev?.nonce ?? 0) + 1,
        entityId,
      }));
      onFocusEntityChange?.(entityId);
    },
    [onNetworkViewChange, select, onFocusEntityChange],
  );

  // F-PR7: "Open in Pulse" hands a matrix row entity to the Entity Pulse seam
  // — switch the representation to pulse and rematerialize the selection so
  // the pulse panel highlights the entity (no camera seam — pulse/zoom are
  // graph-only).
  const openEntityInPulse = useCallback(
    (entityId: string) => {
      onNetworkViewChange?.("pulse");
      select({ kind: "entity", id: entityId, source: "matrix" });
    },
    [onNetworkViewChange, select],
  );

  // F-PR7: "View Evidence" deep-links to the evidence surface preserving
  // ?caseId= and appending ?entity=<row> so the surface opens pre-filtered.
  // A plain anchor — the matrix cone never intercepts navigation.
  const viewEvidenceHref = useCallback(
    (entityId: string) => {
      const base = investigationUrl(
        workspace.investigationId,
        workspace.caseId,
        "observations",
      );
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}${NETWORK_ENTITY_PARAM}=${encodeURIComponent(entityId)}`;
    },
    [workspace.investigationId, workspace.caseId],
  );

  // F-PR7: pure frontend cross-case authorization (idle → confirming →
  // authorized), mirrored from the cross-case signals seam. Beginning the
  // flow only ever flips the review step; the actual candidate reveal happens
  // when the analyst confirms.
  const beginAuthorize = useCallback((caseId: string) => {
    setMatrixAuth((prev) => ({ ...prev, [caseId]: "confirming" }));
  }, []);
  const confirmAuthorize = useCallback((caseId: string) => {
    setMatrixAuth((prev) => ({ ...prev, [caseId]: "authorized" }));
  }, []);
  const cancelAuthorize = useCallback((caseId: string) => {
    setMatrixAuth((prev) => ({ ...prev, [caseId]: "idle" }));
  }, []);

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
          presentation.zoneOne === "matrix-rail" ? (
            <MatrixRail
              open={layout.leftRailOpen}
              onToggle={toggleLeft}
              meta={matrix}
              mode={matrixMode}
              onModeChange={setMatrixMode}
              boundaryCaseId={matrixBoundary}
              onBoundaryChange={setMatrixBoundary}
              authByBoundary={matrixAuth}
              onBeginAuthorize={beginAuthorize}
              onConfirmAuthorize={confirmAuthorize}
              onCancelAuthorize={cancelAuthorize}
              context={context}
              onOpenInGraph={onNetworkViewChange ? openEntityInGraph : undefined}
              onClearSelection={clearSelection}
              filter={effectiveFilter}
            />
          ) : presentation.zoneOne === "flow-rail" ? (
            <FlowRail
              open={layout.leftRailOpen}
              onToggle={toggleLeft}
              meta={flow}
              mode={flowMode}
              onModeChange={setFlowMode}
              roleFilter={flowRoleFilter}
              onRoleFilterChange={setFlowRoleFilter}
              context={context}
              onOpenInGraph={onNetworkViewChange ? openEntityInGraph : undefined}
              onClearSelection={clearSelection}
            />
          ) : presentation.zoneOne === "pulse-rail" ? (
            <PulseRail
              open={layout.leftRailOpen}
              onToggle={toggleLeft}
              overview={pulse}
              context={context}
              onOpenInGraph={onNetworkViewChange ? openEntityInGraph : undefined}
              onClearSelection={clearSelection}
            />
          ) : (
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
              filter={effectiveFilter}
              onFilterChange={handleFilterChange}
              onFocus={() => {
                if (context) focusContext(context);
              }}
              onChallenge={() => {
                // PR-8: the rail Challenge command is the ENTRY to the
                // relation-authority workflow — reveal the relation context so
                // the authority panel (footer slot) is visible. Fresh object
                // identity re-resolves the context details.
                if (context?.kind === "relation") {
                  revealContext({ kind: "relation", id: context.id, source: "rail" });
                }
              }}
            />
          )
        }
        graph={
          <div
            className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
            data-network-visualization-region
          >
            {/* F-PR16: the representation bar is a dedicated IN-FLOW strip of
                the network visualization region. It never leaves this column
                and cannot cover the adjacent context region nor the graph's
                own top-right chrome. The zone-two panel renders in its own
                region below the bar — independent layout ownership. */}
            {onNetworkViewChange && (
              <div
                data-representation-bar
                className="flex shrink-0 items-center justify-end gap-3 px-3 pt-2 pb-0"
              >
                <span
                  aria-hidden
                  className="mr-auto font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-surface-400"
                >
                  Network
                </span>
                <RepresentationSwitcher
                  current={view}
                  onChange={onNetworkViewChange}
                  availability={availability}
                />
              </div>
            )}
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            {presentation.zoneTwo === "graph" ? (
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
                  filter={effectiveFilter}
                  onFilterChange={handleFilterChange}
                  graphReloadRequest={graphReloadRequest}
                />
                {/* PR-20: read-only Phase-4 candidate surfacing. Capability-gated
                    inside the panel (demo bundles render nothing). */}
                <StructuralSignalsPanel className="absolute bottom-4 right-4 z-20 w-80" />
              </div>
            ) : presentation.zoneTwo === "matrix" ? (
              <MatrixPanel
                meta={matrix}
                mode={matrixMode}
                context={context}
                onSelectContext={handleGraphContextSelect}
                onOpenInGraph={openEntityInGraph}
                onOpenPulse={openEntityInPulse}
                onRequestAuthorization={beginAuthorize}
                filter={effectiveFilter}
              />
            ) : presentation.zoneTwo === "flow" ? (
              <FlowPanel
                meta={flow}
                context={context}
                onSelectContext={handleGraphContextSelect}
                onOpenInGraph={openEntityInGraph}
              />
            ) : presentation.zoneTwo === "pulse" ? (
              <PulsePanel
                overview={pulse}
                context={context}
                onSelectContext={handleGraphContextSelect}
                focusEntityId={initialFocusNodeId}
                onOpenInGraph={openEntityInGraph}
              />
            ) : (
              <div className="flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center p-6">
                <EmptyState
                  title={`${networkViewLabel(view)} is not yet available`}
                  description="This representation is declared in the workspace state seam but has no implementation yet in this mode. Its zone will render here once the representation ships. Switch back to the Network view to continue."
                />
              </div>
            )}
            </div>
          </div>
        }
        context={
          presentation.zoneThree === "graph-context" ? (
            <PanelErrorBoundary label="Contextual panel">
              <ContextualPanel
                open={layout.rightPanelOpen}
                onToggle={toggleRight}
                context={context}
                onSelectContext={revealContext}
                footerSlot={
                  <ContextualPanelFooter
                    context={context}
                    onReselect={revealContext}
                    onReloadRequest={requestGraphReload}
                    historical={historicalView}
                  />
                }
              />
            </PanelErrorBoundary>
          ) : presentation.zoneThree === "matrix-context" ? (
            <MatrixContextSummary
              open={layout.rightPanelOpen}
              onToggle={toggleRight}
              meta={matrix}
              context={context}
              mode={matrixMode}
              onOpenInGraph={openEntityInGraph}
              onOpenPulse={openEntityInPulse}
              viewEvidenceHref={viewEvidenceHref}
            />
          ) : presentation.zoneThree === "flow-context" ? (
            <FlowContextSummary
              open={layout.rightPanelOpen}
              onToggle={toggleRight}
              meta={flow}
              context={context}
              onOpenInGraph={openEntityInGraph}
            />
          ) : (
            <PulseContextSummary
              open={layout.rightPanelOpen}
              onToggle={toggleRight}
              overview={pulse}
              context={context}
              onOpenInGraph={openEntityInGraph}
            />
          )
        }
        temporal={
          <TemporalContextPanel
            tab={layout.temporalTab}
            onTabChange={(tab) => updateLayout({ temporalTab: tab })}
            selection={temporalSelection}
            onSelectionChange={setTemporalSelection}
          >
            {presentation.zoneFourNote === "matrix" && (
              <MatrixTemporalNote meta={matrix} context={context} />
            )}
            {presentation.zoneFourNote === "flow" && (
              <FlowTemporalNote meta={flow} />
            )}
            {presentation.zoneFourNote === "pulse" && (
              <PulseTemporalNote overview={pulse} />
            )}
            <TimelinePanel
              onTimeRangeChange={onTimeRangeChange}
              onEventActivate={handleTimelineActivate}
              restoredTimeRange={restoredTimeRange}
            />
          </TemporalContextPanel>
        }
        intelligence={
          <PanelErrorBoundary label="Intelligence">
            <InvestigativeIntelligence
              tab={layout.intelligenceTab}
              onTabChange={(tab) => updateLayout({ intelligenceTab: tab })}
              context={context}
              onSelectContext={revealContext}
              adapterSlot={
                presentation.zoneFive === "matrix"
                  ? <MatrixIntelligenceInsight meta={matrix} />
                  : presentation.zoneFive === "flow"
                    ? <FlowIntelligenceInsight meta={flow} />
                    : presentation.zoneFive === "pulse"
                      ? <PulseIntelligenceInsight overview={pulse} />
                      : undefined
              }
            />
          </PanelErrorBoundary>
        }
      />
    </div>
  );
}