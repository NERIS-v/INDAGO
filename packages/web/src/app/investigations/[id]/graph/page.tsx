"use client";

import { Suspense } from "react";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { useNetworkWorkspace } from "@/lib/network/use-network-workspace";

function GraphTabContent() {
  // F-PR5: the workspace-wide temporal scope + durable focus target are OWNED
  // by the shared Network workspace state (mounted at the workspace boundary),
  // so they survive sub-route navigation and are two-way URL-synced. The page
  // no longer keeps page-local copies that would reset on every visit.
  // F-PR6: the active Zone 2 representation is the same shared state — the
  // page reports ?view= mutations through it so representations survive
  // refresh and back/forward.
  const {
    activeNetworkView,
    setActiveNetworkView,
    timeRange,
    setTimeRange,
    focusEntityId,
    setFocusEntityId,
  } = useNetworkWorkspace();

  return (
    <div className="h-full w-full min-h-0 overflow-hidden">
      <GraphControlCenter
        activeTimeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        initialFocusNodeId={focusEntityId}
        onFocusEntityChange={setFocusEntityId}
        activeNetworkView={activeNetworkView}
        onNetworkViewChange={setActiveNetworkView}
        restoredTimeRange={timeRange}
      />
    </div>
  );
}

export default function GraphTabPage() {
  return (
    <Suspense fallback={null}>
      <GraphTabContent />
    </Suspense>
  );
}