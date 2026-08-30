"use client";

import { useRef, useState, useEffect, type ChangeEvent, type DragEvent } from "react";
import type { EvidenceProvider } from "@/lib/providers";
import type { UploadedFileReference } from "@indago/contracts";
import { toProviderError } from "@/lib/providers";
import {
  evaluateEvidenceFiles,
  ruleForType,
} from "@/lib/evidence/file-validation";
import { Button } from "@/components/ui/button";

// Deterministic document-pile rotation offsets (no randomness).
const ROTATIONS = [0, -2, 1.5, -1, 2.5, -1.5];

interface Entry {
  readonly id: string;
  readonly file: File;
  readonly status: "pending" | "uploading" | "uploaded" | "failed";
  readonly progress: number;
  readonly error?: string;
  readonly ref?: UploadedFileReference;
}

interface EvidenceFileDropProps {
  readonly evidence: EvidenceProvider;
  readonly investigationId: string;
  /** Uploaded file references (controlled by the parent). */
  readonly refs: UploadedFileReference[];
  readonly onRefsChange: (refs: UploadedFileReference[]) => void;
  readonly disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function EvidenceFileDrop({
  evidence,
  investigationId,
  refs,
  onRefsChange,
  disabled = false,
}: EvidenceFileDropProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSyncedRef = useRef("");

  // Sync the uploaded references up to the parent. Notifying inside a state
  // updater would call setState during the parent's render phase (React error),
  // so this runs in a post-commit effect and only fires when the set of
  // uploaded artifact IDs actually changes.
  useEffect(() => {
    const uploaded = entries
      .filter((e) => e.status === "uploaded" && e.ref)
      .map((e) => e.ref!);
    const key = uploaded.map((r) => r.fileKey).join("|");
    if (key !== lastSyncedRef.current) {
      lastSyncedRef.current = key;
      onRefsChange(uploaded);
    }
  }, [entries, onRefsChange]);

  const uploaded = entries.filter((e) => e.status === "uploaded" && e.ref);
  const readyCount = refs.length;
  const anyUploading = entries.some((e) => e.status === "uploading");

  function updateEntry(id: string, patch: Partial<Entry>): void {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function uploadEntry(entry: Entry): Promise<void> {
    updateEntry(entry.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const result = await evidence.prepareUpload(
        investigationId,
        [entry.file],
        (p) => updateEntry(entry.id, { status: "uploading", progress: p }),
      );
      const ref = result[0];
      if (!ref) {
        updateEntry(entry.id, {
          status: "failed",
          progress: 0,
          error: "Upload returned no file reference.",
        });
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: "uploaded" as const, progress: 100, ref }
            : e,
        ),
      );
    } catch (err) {
      updateEntry(entry.id, {
        status: "failed",
        progress: 0,
        error: toProviderError(err).message,
      });
    }
  }

  function addFiles(incoming: File[]): void {
    if (disabled) return;
    const verdicts = evaluateEvidenceFiles(incoming);
    const rejects = verdicts.filter((v) => !v.ok);
    setRejected((prev) => [
      ...prev,
      ...rejects.map((v) => v.message ?? `${v.file.name} was rejected.`),
    ]);

    const fresh = verdicts
      .filter((v) => v.ok)
      .map((v) => ({
        id: crypto.randomUUID(),
        file: v.file,
        status: "pending" as const,
        progress: 0,
      }));

    setEntries((prev) => {
      const next = [...prev, ...fresh];
      return next;
    });
    // Upload each new entry individually so a single failure never blocks the
    // rest (per-file retry requirement).
    for (const e of fresh) {
      void uploadEntry(e);
    }
  }

  function handlePicker(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  }

  function removeEntry(id: string): void {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function retryEntry(entry: Entry): void {
    void uploadEntry({ ...entry, status: "pending", error: undefined });
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add evidence files"
        aria-disabled={disabled || anyUploading}
        onClick={() => {
          if (!disabled && !anyUploading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !anyUploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors duration-fast ease-restrained focus-visible:outline-none ${
          dragging
            ? "border-accent-rose/50 bg-accent-rose/5"
            : "border-border-emphasis bg-surface-100/30 hover:border-border-standard"
        }`}
      >
        <svg
          className="h-8 w-8 text-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="mt-3 text-sm text-text-secondary">
          Drag &amp; drop evidence files, or{" "}
          <span className="text-accent-rose underline-offset-2">browse</span>
        </p>
        <p className="type-caption mt-1">
          PDF, images, CSV, and text. Multiple files supported.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.txt,.csv,.json,.xml"
          onChange={handlePicker}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {rejected.length > 0 && (
        <ul className="space-y-1">
          {rejected.map((m, i) => (
            <li key={i} className="text-xs text-danger/80">
              {m}
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry, index) => {
            const rule = ruleForType(entry.file.type);
            const rotate = ROTATIONS[index % ROTATIONS.length];
            const showProgress =
              entry.status === "uploading" || entry.status === "pending";
            return (
              <li
                key={entry.id}
                className="animate-document-tile flex items-center gap-3 rounded-lg border border-border-standard bg-surface-50 px-3 py-2"
                style={{ transform: `rotate(${rotate}deg)` }}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    entry.status === "uploaded"
                      ? "bg-success"
                      : entry.status === "failed"
                        ? "bg-danger"
                        : entry.status === "uploading"
                          ? "bg-accent-amber animate-breathe"
                          : "bg-text-muted"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-secondary">
                    {entry.file.name}
                  </p>
                  <p className="type-mono-small truncate">
                    {rule ? rule.label : "File"} · {formatBytes(entry.file.size)}
                  </p>
                </div>

                {showProgress && (
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-200">
                      <div
                        className="h-full rounded-full bg-accent-amber transition-all duration-fast"
                        style={{ width: `${Math.max(entry.progress, 8)}%` }}
                      />
                    </div>
                    <span className="type-mono-small w-8 text-right">
                      {entry.status === "pending" ? "…" : `${Math.round(entry.progress)}%`}
                    </span>
                  </div>
                )}

                <span className="type-caption w-16 shrink-0 text-right text-text-muted">
                  {entry.status === "uploaded"
                    ? "Uploaded"
                    : entry.status === "failed"
                      ? "Failed"
                      : entry.status === "uploading"
                        ? "Uploading"
                        : "Pending"}
                </span>

                {entry.status === "failed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => retryEntry(entry)}
                  >
                    Retry
                  </Button>
                ) : (
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-label={`Remove ${entry.file.name}`}
                    onClick={() => removeEntry(entry.id)}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {readyCount > 0 && (
        <p className="type-caption text-text-muted">
          {readyCount} file{readyCount === 1 ? "" : "s"} ready for submission.
        </p>
      )}
      {uploaded.length > 0 && uploaded.length < entries.length && (
        <p className="type-caption text-text-muted">
          {entries.length - uploaded.length} still uploading or waiting.
        </p>
      )}
    </div>
  );
}