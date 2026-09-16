"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type TaskStatus = "PENDING" | "PROCESSING_APPROVE" | "PROCESSING_REJECT" | "APPROVED" | "REJECTED";

export interface ReviewTaskMock {
  id: string;
  type: "EVIDENCE_REQUEST" | "ENTITY_RESOLUTION" | "LEAD_PROMOTION";
  description: string;
  context: string;
  priority: "HIGH" | "MODERATE" | "LOW";
  status?: TaskStatus;
}

interface ReviewCenterProps {
  initialTasks: ReviewTaskMock[];
  /** PR-20: when provided, an action resolves through this hook (the live
   *  REVIEW_REQUIRED gate) instead of the local cinematic. The task enters the
   *  processing state while the promise settles; a rejection returns it to
   *  PENDING and reports through onResolveError. Absent → the existing local
   *  demo completion behavior is unchanged. */
  onResolve?: (id: string, action: "APPROVE" | "REJECT") => Promise<void> | void;
  onResolveError?: (id: string, message: string) => void;
}

const PRIORITY_COLORS = {
  HIGH: "var(--color-accent-rose)",
  MODERATE: "var(--color-accent-amber)",
  LOW: "var(--color-info)",
};

const PRIORITY_CLASSES = {
  HIGH: "border-l-accent-rose text-accent-rose",
  MODERATE: "border-l-accent-amber text-accent-amber",
  LOW: "border-l-info text-info",
};

export function ReviewCenter({ initialTasks, onResolve, onResolveError }: ReviewCenterProps) {
  const [tasks, setTasks] = useState<ReviewTaskMock[]>(
    initialTasks.map((t) => ({ ...t, status: "PENDING" }))
  );

  const pendingCount = tasks.filter((t) => t.status === "PENDING").length;

  const handleAction = (id: string, action: "APPROVE" | "REJECT") => {
    // 1. Enter processing state
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: action === "APPROVE" ? "PROCESSING_APPROVE" : "PROCESSING_REJECT" }
          : t
      )
    );

    const finish = (approved: boolean) =>
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: approved ? "APPROVED" : "REJECTED" } : t
        )
      );
    const fail = (message: string) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "PENDING" } : t))
      );
      onResolveError?.(id, message);
    };

    if (onResolve) {
      Promise.resolve(onResolve(id, action))
        .then(() => finish(action === "APPROVE"))
        .catch((err) =>
          fail(err instanceof Error ? err.message : String(err))
        );
      return;
    }

    // Local (demo) path: cinematic delay for the cryptographic handshake.
    setTimeout(() => finish(action === "APPROVE"), 1800);
  };

  if (tasks.length === 0) {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center rounded-xl border border-surface-200/50 bg-surface-50/40 p-6 backdrop-blur-md">
        <span className="font-mono text-xs uppercase tracking-widest text-surface-600">
          No pending review tasks.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      
      {/* HUD Telemetry Bar */}
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-light text-surface-900 tabular-nums">
            {pendingCount}
          </span>
          <span className="text-sm font-mono text-surface-700 uppercase tracking-widest">
            {pendingCount === 1 ? "PENDING ACTION" : "PENDING ACTIONS"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {tasks.map((task, i) => {
          const isPending = task.status === "PENDING";
          const isProcessing = task.status?.startsWith("PROCESSING");
          const isApproved = task.status === "APPROVED";
          const isRejected = task.status === "REJECTED";
          const isResolved = isApproved || isRejected;

          return (
            <div
              key={task.id}
              className={`glass-panel transition-all duration-500 rounded-xl overflow-hidden relative ${
                isResolved ? "opacity-60 grayscale-[40%] bg-surface-50/20" : "hover:border-surface-400/50 shadow-lg glass-panel-hover"
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Priority Left Border */}
              <div 
                className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_CLASSES[task.priority].split(" ")[0]}`} 
                style={{ boxShadow: isPending ? `0 0 10px ${PRIORITY_COLORS[task.priority]}` : "none" }}
              />

              {/* Processing Overlay (The Scanning Laser) */}
              {isProcessing && (
                <div className="absolute inset-0 z-50 bg-surface-0/60 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
                  <div className="w-full max-w-md h-[1px] bg-surface-300 relative overflow-hidden">
                    <div 
                      className={`absolute top-0 bottom-0 w-1/3 blur-[1px] animate-filament ${task.status === "PROCESSING_APPROVE" ? "bg-success" : "bg-danger"}`} 
                      style={{ boxShadow: `0 0 15px ${task.status === "PROCESSING_APPROVE" ? "var(--color-success)" : "var(--color-danger)"}` }}
                    />
                  </div>
                  <span className="mt-3 text-[10px] font-mono uppercase tracking-widest font-bold text-surface-900 animate-pulse">
                    {task.status === "PROCESSING_APPROVE" ? "AUTHORIZING SEQUENCE..." : "ABORTING SEQUENCE..."}
                  </span>
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 p-6 pl-8">
                
                {/* Context (Left Side) */}
                <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-surface-700 font-bold">
                    <span className={`${PRIORITY_CLASSES[task.priority].split(" ")[1]}`}>{task.priority} Priority</span>
                    <span className="text-surface-400">|</span>
                    <span>{task.type.replace("_", " ")}</span>
                    <span className="text-surface-400">|</span>
                    <span className="text-surface-500">ID: {task.id.split("-")[1]}</span>
                  </div>
                  
                  <h3 className={`font-sans text-lg font-medium leading-snug ${isResolved ? "text-surface-600 line-through decoration-surface-500/50" : "text-surface-900"}`}>
                    {task.description}
                  </h3>
                  
                  <p className={`text-sm font-sans leading-relaxed ${isResolved ? "text-surface-500" : "text-surface-700"}`}>
                    {task.context}
                  </p>
                </div>

                {/* Actions / Status (Right Side) */}
                <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0">
                  {isPending && (
                    <>
                      <Button 
                        variant="ghost" 
                        onClick={() => handleAction(task.id, "REJECT")}
                        className="font-mono text-[10px] uppercase tracking-widest text-surface-600 hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/30 transition-all"
                      >
                        Reject
                      </Button>
                      <Button 
                        onClick={() => handleAction(task.id, "APPROVE")}
                        className="font-mono text-[10px] uppercase tracking-widest bg-surface-800 text-surface-0 border border-surface-600 hover:bg-success/20 hover:text-success hover:border-success hover:shadow-[0_0_15px_var(--color-success)] transition-all"
                      >
                        Authorize
                      </Button>
                    </>
                  )}

                  {isApproved && (
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-success font-bold bg-success/10 px-3 py-1.5 rounded border border-success/30">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Authorized
                    </div>
                  )}

                  {isRejected && (
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-danger font-bold bg-danger/10 px-3 py-1.5 rounded border border-danger/30">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Rejected
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}