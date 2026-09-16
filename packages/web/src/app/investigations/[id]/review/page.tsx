"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import {
  mapReviewTaskToReviewTaskMock,
  mapLeadToReviewTaskMock,
  isActionableReviewTask,
} from "@/lib/intel/review-adapter";
import { ReviewCenter, type ReviewTaskMock } from "@/components/intel/review-center";

export default function ReviewPage() {
  const workspace = useWorkspace();
  const [tasks, setTasks] = useState<ReviewTaskMock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  /** Which queue is served: a live REVIEW_REQUIRED gate (checkpoint) or the
   *  provider review-task queue (demo). */
  const [gate, setGate] = useState<"checkpoint" | "tasks" | null>(null);

  const checkpointMethodPresent =
    typeof workspace.investigations.getReviewCheckpoint === "function";
  const canResolve = typeof workspace.investigations.resolveReview === "function";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const checkpoint = workspace.investigations.getReviewCheckpoint
        ? await workspace.investigations
            .getReviewCheckpoint(workspace.investigationId)
            .catch(() => null)
        : null;

      if (checkpoint) {
        // Run at a REVIEW_REQUIRED gate: the reviewable queue is the leads
        // still under authority review. Resolution drives the run forward.
        const page = await workspace.leads.listByInvestigation(
          workspace.investigationId,
          { pageSize: 100 },
        );
        const reviewable = page.items.filter(
          (l) => l.status === "UNDER_REVIEW" || l.status === "NEW",
        );
        if (!canResolve) {
          setUnavailable(true);
          setTasks([]);
          setGate(null);
          return;
        }
        setGate("checkpoint");
        setTasks(reviewable.map(mapLeadToReviewTaskMock));
        return;
      }

      if (!checkpointMethodPresent) {
        const page = await workspace.review.listTasks(
          workspace.investigationId,
          { pageSize: 100 },
        );
        setGate("tasks");
        setTasks(
          page.items.filter(isActionableReviewTask).map(mapReviewTaskToReviewTaskMock),
        );
        return;
      }

      // Live, but the run is NOT at a review gate right now — honest empty.
      setGate("checkpoint");
      setTasks([]);
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setTasks([]);
        setGate(null);
      } else {
        setError(pe.message);
      }
    } finally {
      setLoading(false);
    }
  }, [workspace, checkpointMethodPresent, canResolve]);

  useEffect(() => {
    void load();
  }, [load]);

  const onResolve = canResolve
    ? (_id: string, action: "APPROVE" | "REJECT"): Promise<void> =>
        workspace.investigations.resolveReview!(
          workspace.investigationId,
          action === "APPROVE" ? "APPROVED" : "NEEDS_EVIDENCE",
        ).then(() => load())
    : undefined;

  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Oversight</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Human in the loop</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
              Review center
            </h1>
            {gate === "checkpoint" && (
              <span className="rounded-full border border-semantic-info/30 bg-semantic-info/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-info">
                Run gate
              </span>
            )}
            {gate === "tasks" && (
              <span className="rounded-full border border-semantic-border-subtle bg-semantic-surface px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
                Task queue
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Juncture points where autonomous inference requires explicit human
            authorization before mutating the canonical case graph or requesting
            external data.
          </p>
        </header>

        <div className="flex w-full flex-col pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint">
              Loading review surfaces...
            </div>
          ) : unavailable ? (
            <div className="rounded-lg border border-dashed border-semantic-border px-6 py-10 text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                Review not available in this mode
              </p>
              <p className="mt-2 text-sm text-semantic-foreground-faint">
                The review queue could not be served for this investigation.
              </p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-semantic-contradiction/30 bg-semantic-contradiction/5 px-6 py-10 text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-contradiction">
                Could not load review surfaces
              </p>
              <p className="mt-2 text-sm text-semantic-foreground-faint">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 rounded-md border border-semantic-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-muted transition-colors hover:bg-semantic-surface-elevated"
              >
                Retry
              </button>
            </div>
          ) : (
            <ReviewCenter
              initialTasks={tasks}
              onResolve={onResolve}
              onResolveError={(_id, message) => setError(message)}
            />
          )}
        </div>
      </div>
    </div>
  );
}