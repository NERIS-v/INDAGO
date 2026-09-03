"use client";

import { ReviewCenter, type ReviewTaskMock } from "@/components/intel/review-center";
import { Badge } from "@/components/ui/badge";

const DEMO_TASKS: ReviewTaskMock[] = [
  {
    id: "task-001",
    type: "EVIDENCE_REQUEST",
    description: "Approve Evidence Request: ROC / MCA Corporate Filing",
    context: "Requested by autonomous agent to resolve Meridian Transit beneficial ownership gap. Expected Information Gain: 0.85",
    priority: "HIGH"
  },
  {
    id: "task-002",
    type: "ENTITY_RESOLUTION",
    description: "Confirm Merge: Unidentified Witness & Victor Aldridge",
    context: "Candidate match identified via shared communications infrastructure. Confidence threshold requires human override: 72%",
    priority: "MODERATE"
  }
];

export default function ReviewPage() {
  return (
    <div className="relative mx-auto max-w-6xl space-y-8 p-8 animate-fade-in">
      
      {/* TACTICAL PAGE HEADER */}
      <header className="space-y-4 border-b border-surface-200/50 pb-6">
        <div className="flex flex-col gap-1">
          <span className="type-mono-small text-warning font-bold uppercase tracking-widest">
            System Module // Human-In-The-Loop
          </span>
          
          <div className="flex flex-wrap items-center gap-4 mt-1">
            <h1 className="text-3xl font-light text-surface-900 tracking-tight">
              Review Center
            </h1>
            <Badge variant="warning" dot className="bg-warning/10 border-warning/30 backdrop-blur-md text-surface-900">
              Authorization Required
            </Badge>
          </div>
        </div>
        
        <p className="text-sm text-surface-700 max-w-3xl leading-relaxed font-sans">
          Critical juncture points where autonomous inference sequences require explicit human authorization before mutating the canonical case graph or requesting external data.
        </p>
      </header>

      {/* MAIN MODULE MOUNT */}
      <div className="w-full">
        <ReviewCenter initialTasks={DEMO_TASKS} />
      </div>
      
    </div>
  );
}