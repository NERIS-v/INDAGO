"use client";

import type { EvidenceMetadata } from "./evidence-metadata-form";
import type { UploadedFileRef } from "@/lib/api/types";
import {
  EVIDENCE_TYPE_LABELS,
  SOURCE_CATALOG_LABELS,
} from "@/lib/contracts/types";
import { Button } from "@/components/ui/button";

interface EvidenceReviewProps {
  readonly metadata: EvidenceMetadata;
  readonly files: UploadedFileRef[];
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly submitting: boolean;
  readonly submitError: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function EvidenceReview({
  metadata,
  files,
  onSubmit,
  onBack,
  submitting,
  submitError,
}: EvidenceReviewProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-surface-800">Review Submission</h3>
        <p className="mt-1 text-xs text-surface-500">
          Confirm the evidence context and files before submitting.
        </p>
      </div>

      <div className="rounded-lg border border-surface-200/40 bg-surface-100/50 p-4">
        <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-surface-500">
          Evidence Context
        </h4>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-surface-500 text-[11px]">Source / Origin</dt>
            <dd className="text-surface-700">{metadata.sourceName}</dd>
          </div>
          <div>
            <dt className="text-surface-500 text-[11px]">Evidence Type</dt>
            <dd className="text-surface-700">
              {EVIDENCE_TYPE_LABELS[metadata.evidenceType] ?? metadata.evidenceType}
            </dd>
          </div>
          <div>
            <dt className="text-surface-500 text-[11px]">Source Catalog</dt>
            <dd className="text-surface-700">
              {SOURCE_CATALOG_LABELS[metadata.sourceCatalog] ?? metadata.sourceCatalog}
            </dd>
          </div>
          <div>
            <dt className="text-surface-500 text-[11px]">Title</dt>
            <dd className="text-surface-700">{metadata.evidenceTitle}</dd>
          </div>
          {metadata.sourceDescription && (
            <div className="sm:col-span-2">
              <dt className="text-surface-500 text-[11px]">Source Description</dt>
              <dd className="text-surface-600">{metadata.sourceDescription}</dd>
            </div>
          )}
          {metadata.evidenceDescription && (
            <div className="sm:col-span-2">
              <dt className="text-surface-500 text-[11px]">Evidence Description</dt>
              <dd className="text-surface-600">{metadata.evidenceDescription}</dd>
            </div>
          )}
          {metadata.observedAt && (
            <div>
              <dt className="text-surface-500 text-[11px]">Relevant Date</dt>
              <dd className="text-surface-600">{metadata.observedAt}</dd>
            </div>
          )}
          {metadata.notes && (
            <div>
              <dt className="text-surface-500 text-[11px]">Notes</dt>
              <dd className="text-surface-600">{metadata.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-surface-200/40 bg-surface-100/50 p-4">
        <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-surface-500">
          Files ({files.length})
        </h4>
        <ul className="divide-y divide-surface-200/30">
          {files.map((f) => (
            <li key={f.fileKey} className="flex items-center justify-between py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-surface-700">{f.fileName}</p>
                <p className="text-[11px] text-surface-500">{formatBytes(f.fileSize)}</p>
              </div>
              <span className="ml-4 shrink-0 inline-flex items-center gap-1 text-[11px] text-success/70">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Uploaded
              </span>
            </li>
          ))}
        </ul>
      </div>

      {submitError && (
        <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger/80 border border-danger/20">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button
          onClick={onSubmit}
          disabled={submitting || files.length === 0}
          loading={submitting}
        >
          Submit Evidence
        </Button>
      </div>
    </div>
  );
}
