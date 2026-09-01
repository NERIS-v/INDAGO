"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GraphPanel } from "@/components/graph/graph-panel";
import { TimelinePanel } from "@/components/timeline/timeline-panel";

function GraphTabContent() {
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const searchParams = useSearchParams();
  const focusNodeId = searchParams?.get("focus") ?? null;

  return (
    <div className="flex flex-col h-full w-full gap-4 overflow-hidden">

      <div className="flex-1 min-h-0 relative">
        <GraphPanel activeTimeRange={timeRange} initialFocusNodeId={focusNodeId} />
      </div>

      <div className="shrink-0">
        <TimelinePanel onTimeRangeChange={setTimeRange} />
      </div>

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
