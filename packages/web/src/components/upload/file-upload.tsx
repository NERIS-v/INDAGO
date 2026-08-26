"use client";

import { useState, useCallback } from "react";
import { uploadEvidence, type UploadEvidenceResult } from "@/lib/upload/uploadthing";
import type { UploadProgressState } from "@/lib/upload/types";
import type { UploadProgressData } from "@indago/contracts";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  readonly investigationId: string;
  readonly onUploadComplete?: (fileKey: string, fileUrl: string) => void;
  readonly onFilesUploaded?: (files: UploadEvidenceResult[]) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.txt,.csv,.json,.xml";

export function FileUpload({
  investigationId,
  onUploadComplete,
  onFilesUploaded,
  disabled = false,
  className = "",
}: FileUploadProps) {
  const [uploadState, setUploadState] = useState<UploadProgressState>({
    status: "idle",
    progress: 0,
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        setSelectedFiles(Array.from(files));
      }
    },
    [],
  );

  const handleUploadProgress = useCallback((data: UploadProgressData) => {
    setUploadState((prev) => ({
      ...prev,
      progress: data.totalProgress,
    }));
  }, []);

  const handleUploadBegin = useCallback((fileName: string) => {
    setUploadingFile(fileName);
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setUploadState({ status: "uploading", progress: 0 });

    try {
      const results = await uploadEvidence({
        investigationId,
        files: selectedFiles,
        onUploadBegin: handleUploadBegin,
        onUploadProgress: handleUploadProgress,
      });

      setUploadState({ status: "completed", progress: 100 });
      setSelectedFiles([]);
      setUploadingFile(null);

      for (const result of results) {
        onUploadComplete?.(result.fileKey, result.fileUrl);
      }
      onFilesUploaded?.(results);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed";
      setUploadState({ status: "error", progress: 0, error: message });
      setUploadingFile(null);
    }
  }, [
    selectedFiles,
    investigationId,
    onUploadComplete,
    onFilesUploaded,
    handleUploadBegin,
    handleUploadProgress,
  ]);

  const handleReset = useCallback(() => {
    setUploadState({ status: "idle", progress: 0 });
    setSelectedFiles([]);
    setUploadingFile(null);
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-sm font-medium text-surface-800">Upload Evidence</h3>
        <p className="mt-1 text-xs text-surface-500">
          Select files to upload. Accepted: PDF, images, text, CSV, JSON, XML.
        </p>
      </div>

      {uploadState.status === "error" && uploadState.error && (
        <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger/80 border border-danger/20">
          <div className="flex items-center justify-between">
            <span>{uploadState.error}</span>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {uploadState.status === "completed" && (
        <div className="rounded-lg bg-success/10 p-3 text-sm text-success/80 border border-success/20 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Upload complete.
        </div>
      )}

      <div>
        <input
          type="file"
          accept={ACCEPT}
          multiple
          onChange={handleFileChange}
          disabled={disabled || uploadState.status === "uploading"}
          className="block w-full text-xs text-surface-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-500 file:border file:border-brand-500/20 hover:file:bg-brand-500/20 disabled:opacity-30 file:cursor-pointer cursor-pointer"
        />
      </div>

      {selectedFiles.length > 0 && uploadState.status !== "uploading" && (
        <div className="rounded-lg border border-surface-200/40 bg-surface-100/50 p-3">
          <p className="text-xs font-medium text-surface-600">
            {selectedFiles.length} file(s) selected
          </p>
          <ul className="mt-2 space-y-1">
            {selectedFiles.map((f) => (
              <li key={f.name} className="text-[11px] text-surface-500 truncate">
                {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploadState.status === "uploading" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-60" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-surface-700 truncate">
                {uploadingFile ?? "Uploading..."}
              </p>
            </div>
            <span className="text-[11px] text-surface-500">
              {Math.round(uploadState.progress)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-200/50">
            <div
              className="h-full rounded-full bg-brand-500/40 transition-all duration-500"
              style={{ width: `${Math.round(uploadState.progress)}%` }}
            />
          </div>
        </div>
      )}

      {selectedFiles.length > 0 &&
        uploadState.status !== "uploading" &&
        uploadState.status !== "completed" && (
          <Button onClick={handleUpload} disabled={disabled}>
            Upload {selectedFiles.length} file(s)
          </Button>
        )}
    </div>
  );
}
