"use client";

import { ReviewCenter, type ReviewTaskMock } from "@/components/intel/review-center";

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
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Oversight</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Human in the loop</span>
          </div>
          <h1 className="mt-4 font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            Review center
          </h1>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Juncture points where autonomous inference requires explicit human
            authorization before mutating the canonical case graph or requesting
            external data.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          <ReviewCenter initialTasks={DEMO_TASKS} />
        </div>
      </div>
    </div>
  );
}