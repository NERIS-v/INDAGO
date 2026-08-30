"use client";

import { useState } from "react";
import { GraphPanel } from "@/components/graph/graph-panel";
import { TimelinePanel } from "@/components/timeline/timeline-panel";

export default function GraphTabPage() {
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);

  return (
    <div className="flex flex-col h-full w-full gap-4 overflow-hidden">

      <div className="flex-1 min-h-0 relative">
        <GraphPanel activeTimeRange={timeRange} />
      </div>

      <div className="shrink-0">
        <TimelinePanel onTimeRangeChange={setTimeRange} />
      </div>
      
    </div>
  );
}