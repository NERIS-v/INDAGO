"use client";

import { Suspense } from "react";
import { GraphControlCenter } from "@/components/graph/control-center/graph-control-center";
import { useNetworkWorkspace } from "@/lib/network/use-network-workspace";

function GraphTabContent() {
  // F-PR5: the workspace-wide temporal scope + durable focus target are OWNED
  // by the shared Network workspace state (mounted at the workspace boundary),
  // so they survive sub-route navigation and are two-way URL-synced. The page
  // no longer keeps page-local copies that would reset on every visit.
  const { timeRange, setTimeRange, focusEntityId, setFocusEntityId } =
    useNetworkWorkspace();

  return (
    <div className="h-full w-full min-h-0 overflow-hidden">
      <GraphControlCenter
        activeTimeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        initialFocusNodeId={focusEntityId}
        onFocusEntityChange={setFocusEntityId}
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