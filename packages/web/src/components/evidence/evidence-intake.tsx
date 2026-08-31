"use client";

import { useCallback, useState } from "react";
import type { EvidenceProvider } from "@/lib/providers";
import type { EvidenceSubmissionRequest, UploadedFileReference } from "@indago/contracts";
import { EvidenceFileDrop } from "./evidence-file-drop";
import { EvidenceMetadataForm, type EvidenceMetadata } from "./evidence-metadata-form";
import { EvidenceReview } from "./evidence-review";
import { Button } from "@/components/ui/button";

type Step = "context" | "files" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "context", label: "Context" },
  { key: "files", label: "Files" },
  { key: "review", label: "Review" },
];

const STEP_INDEX: Record<Step, number> = { context: 0, files: 1, review: 2 };

export interface EvidenceIntakeSubmitRequest
  extends Omit<EvidenceSubmissionRequest, "investigationId"> {}

interface EvidenceIntakeProps {
  /** The provider boundary — UI never knows whether it is demo or live. */
  readonly evidence: EvidenceProvider;
  readonly investigationId: string;
  /** Case the evidence belongs to (shown in review for provenance context). */
  readonly caseId?: string;
  /** Parent/provider coordinator drives the actual submission. */
  readonly onSubmitEvidence: (
    request: EvidenceIntakeSubmitRequest,
  ) => Promise<void>;
  /** Called after a successful submission. */
  readonly onComplete: () => void;
}

export function EvidenceIntake({
  evidence,
  investigationId,
  caseId,
  onSubmitEvidence,
  onComplete,
}: EvidenceIntakeProps) {
  const [step, setStep] = useState<Step>("context");
  const [refs, setRefs] = useState<UploadedFileReference[]>([]);
  const [metadata, setMetadata] = useState<EvidenceMetadata | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleRefsChange = useCallback((next: UploadedFileReference[]) => {
    // Pushes the update to the next tick to prevent "setState during render" crashes
    setTimeout(() => setRefs(next), 0);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!metadata || refs.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const request: EvidenceIntakeSubmitRequest = {
        sourceName: metadata.sourceName,
        sourceDescription: metadata.sourceDescription || undefined,
        evidenceType: metadata.evidenceType,
        evidenceTitle: metadata.evidenceTitle,
        evidenceDescription: metadata.evidenceDescription || undefined,
        observedAt: metadata.observedAt
          ? { value: metadata.observedAt, precision: "day" }
          : undefined,
        files: refs,
        notes: metadata.notes || undefined,
      };
      await onSubmitEvidence(request);
      onComplete();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [metadata, refs, onSubmitEvidence, onComplete]);

  const currentIndex = STEP_INDEX[step];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2" aria-label="Evidence steps">
        {STEPS.map((s, i) => {
          const isActive = currentIndex === i;
          const isComplete = currentIndex > i;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium ${
                  isActive
                    ? "border-accent-rose/30 bg-accent-rose/10 text-accent-rose"
                    : isComplete
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border-standard bg-surface-100 text-text-muted"
                }`}
              >
                {isComplete ? (
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`text-xs font-medium tracking-wide ${
                  isActive
                    ? "text-text-primary"
                    : isComplete
                      ? "text-success/70"
                      : "text-text-muted"
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-px w-6 ${
                    isComplete ? "bg-success/30" : "bg-surface-300/40"
                  }`}
                />
              )}
            </div>
          );
        })}
      </nav>

      {step === "context" && (
        <EvidenceMetadataForm
          initial={metadata ?? undefined}
          onSubmit={(m) => {
            setMetadata(m);
            setStep("files");
          }}
          onCancel={onComplete}
        />
      )}

      {step === "files" && (
        <div className="space-y-4">
          <EvidenceFileDrop
            evidence={evidence}
            investigationId={investigationId}
            refs={refs}
            onRefsChange={handleRefsChange}
            disabled={submitting}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setStep("context")}>
              Back
            </Button>
            <Button onClick={() => setStep("review")} disabled={refs.length === 0}>
              Next: Review
            </Button>
          </div>
        </div>
      )}

      {step === "review" && metadata && (
        <div className="space-y-5">
          {caseId && (
            <div className="rounded-lg border border-border-standard bg-surface-50 px-4 py-3">
              <p className="type-label">Case</p>
              <p className="type-mono-small mt-1 text-text-secondary">{caseId}</p>
            </div>
          )}
          <EvidenceReview
            metadata={metadata}
            files={refs}
            onSubmit={handleSubmit}
            onBack={() => setStep("files")}
            submitting={submitting}
            submitError={submitError}
          />
        </div>
      )}
    </div>
  );
}