// ============================================================================
// Upload Types
//
// Client-side upload contract. Uses @indago/contracts for shared types.
// No imports from packages/platform/src/...
// ============================================================================

/**
 * Upload progress state for the file upload component.
 */
export interface UploadProgressState {
  readonly status: "idle" | "uploading" | "completed" | "error";
  readonly progress: number;
  readonly fileKey?: string;
  readonly fileUrl?: string;
  readonly error?: string;
}

/**
 * Accepted file types matching platform's casePackUploader.
 */
export const ACCEPTED_FILE_TYPES = {
  "application/pdf": { maxSize: 16 * 1024 * 1024, label: "PDF" },
  "image/*": { maxSize: 8 * 1024 * 1024, label: "Image" },
  "text/*": { maxSize: 16 * 1024 * 1024, label: "Text" },
  "text/csv": { maxSize: 32 * 1024 * 1024, label: "CSV" },
} as const;

/**
 * Max file counts matching platform's casePackUploader.
 */
export const MAX_FILE_COUNTS: Record<"pdf" | "image" | "text" | "blob", number> = {
  pdf: 10,
  image: 20,
  text: 10,
  blob: 5,
} as const;
