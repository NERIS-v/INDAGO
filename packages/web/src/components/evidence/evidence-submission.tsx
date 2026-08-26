"use client";

import { useState, useCallback } from "react";
import type { EvidenceMetadata } from "./evidence-metadata-form";
import type { UploadedFileRef } from "@/lib/api/types";
import { EvidenceMetadataForm } from "./evidence-metadata-form";
import { EvidenceReview } from "./evidence-review";
import { FileUpload } from "@/components/upload/file-upload";
import { Button } from "@/components/ui/button";
import { submitEvidence } from "@/lib/api/server-action";

interface EvidenceSubmissionProps {
  readonly investigationId: string;
  readonly onComplete: () => void;
}

type Step = "metadata" | "files" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "metadata", label: "Context" },
  { key: "files", label: "Files" },
  { key: "review", label: "Review" },
];

const STEP_INDEX: Record<Step, number> = {
  metadata: 0,
  files: 1,
  review: 2,
};

export function EvidenceSubmission({
  investigationId,
  onComplete,
}: EvidenceSubmissionProps) {
  const [step, setStep] = useState<Step>("metadata");
  const [metadata, setMetadata] = useState<EvidenceMetadata | null>(null);
  const [files, setFiles] = useState<UploadedFileRef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleMetadataSubmit = useCallback((m: EvidenceMetadata) => {
    setMetadata(m);
    setStep("files");
  }, []);

  const handleFilesUploaded = useCallback((uploaded: UploadedFileRef[]) => {
    setFiles((prev) => [...prev, ...uploaded]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!metadata || files.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const observedAt = metadata.observedAt
        ? { value: metadata.observedAt, precision: "day" as const }
        : undefined;

      await submitEvidence(investigationId, {
        sourceName: metadata.sourceName,
        sourceDescription: metadata.sourceDescription || undefined,
        evidenceType: metadata.evidenceType,
        evidenceTitle: metadata.evidenceTitle,
        evidenceDescription: metadata.evidenceDescription || undefined,
        observedAt,
        files,
        notes: metadata.notes || undefined,
      });

      onComplete();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Submission failed";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }, [metadata, files, investigationId, onComplete]);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = STEP_INDEX[step] === i;
          const isComplete = STEP_INDEX[step] > i;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium border transition-all duration-500 ${
                    isActive
                      ? "bg-brand-500/20 text-brand-500 border-brand-500/30"
                      : isComplete
                        ? "bg-brand-500/10 text-brand-500/70 border-brand-500/20"
                        : "bg-surface-100 text-surface-500 border-surface-200/40"
                  }`}
                >
                  {isComplete ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`text-xs font-medium tracking-wide ${
                    isActive
                      ? "text-surface-800"
                      : isComplete
                        ? "text-brand-500/60"
                        : "text-surface-500"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 h-px w-6 transition-all duration-500 ${isComplete ? "bg-brand-500/30" : "bg-surface-300/30"}`} />
              )}
            </div>
          );
        })}
      </nav>

      {step === "metadata" && (
        <EvidenceMetadataForm
          initial={metadata ?? undefined}
          onSubmit={handleMetadataSubmit}
          onCancel={onComplete}
        />
      )}

      {step === "files" && (
        <div className="space-y-4">
          <FileUpload
            investigationId={investigationId}
            onFilesUploaded={handleFilesUploaded}
          />

          {files.length > 0 && (
            <p className="text-xs text-surface-500">
              {files.length} file(s) ready for submission.
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setStep("metadata")}>
              Back
            </Button>
            <Button onClick={() => setStep("review")} disabled={files.length === 0}>
              Next: Review
            </Button>
          </div>
        </div>
      )}

      {step === "review" && metadata && (
        <EvidenceReview
          metadata={metadata}
          files={files}
          onSubmit={handleSubmit}
          onBack={() => setStep("files")}
          submitting={submitting}
          submitError={submitError}
        />
      )}
    </div>
  );
}
