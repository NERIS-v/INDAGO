// ============================================================================
// F-PR3 Evidence File Validation
//
// Reuses the EXISTING upload configuration in lib/upload/types.ts (accepted
// MIME rules + per-kind size limits + per-kind counts). It does NOT invent a
// second upload configuration.
//
// Distinguishes: supported / unsupported-type / too-large / too-many, and
// returns typed, per-file results so the UI can surface specific errors.
// ============================================================================

import { ACCEPTED_FILE_TYPES, MAX_FILE_COUNTS } from "@/lib/upload/types";

export type EvidenceFileRejectReason = "unsupported" | "too-large" | "too-many";

export interface EvidenceFileVerdict {
  readonly file: File;
  readonly ok: boolean;
  readonly reason?: EvidenceFileRejectReason;
  readonly message?: string;
}

export interface EvidenceFileKind {
  readonly kind: "pdf" | "image" | "csv" | "text";
  readonly label: string;
  readonly maxBytes: number;
  readonly matches: (type: string) => boolean;
}

/** Canonical acceptance rules derived from ACCEPTED_FILE_TYPES. */
const KIND_RULES: EvidenceFileKind[] = [
  {
    kind: "pdf",
    label: ACCEPTED_FILE_TYPES["application/pdf"].label,
    maxBytes: ACCEPTED_FILE_TYPES["application/pdf"].maxSize,
    matches: (t) => t === "application/pdf",
  },
  {
    kind: "image",
    label: ACCEPTED_FILE_TYPES["image/*"].label,
    maxBytes: ACCEPTED_FILE_TYPES["image/*"].maxSize,
    matches: (t) => t.startsWith("image/"),
  },
  {
    kind: "csv",
    label: ACCEPTED_FILE_TYPES["text/csv"].label,
    maxBytes: ACCEPTED_FILE_TYPES["text/csv"].maxSize,
    matches: (t) => t === "text/csv",
  },
  {
    kind: "text",
    label: ACCEPTED_FILE_TYPES["text/*"].label,
    maxBytes: ACCEPTED_FILE_TYPES["text/*"].maxSize,
    matches: (t) => t.startsWith("text/") && t !== "text/csv",
  },
];

/** Resolve the acceptance rule for a file's MIME type, or undefined. */
export function ruleForType(type: string): EvidenceFileKind | undefined {
  return KIND_RULES.find((r) => r.matches(type));
}

/** Max files allowed in a single submission (canonical request cap). */
export const MAX_FILES_PER_SUBMISSION = 50;

/** Max files allowed per kind (from MAX_FILE_COUNTS). */
export function maxFilesForKind(kind: EvidenceFileKind["kind"]): number {
  switch (kind) {
    case "pdf":
      return MAX_FILE_COUNTS.pdf;
    case "image":
      return MAX_FILE_COUNTS.image;
    case "text":
    case "csv":
      return MAX_FILE_COUNTS.text;
  }
}

/**
 * Evaluate a batch of files for type/size acceptance. Count-limit checks are
 * handled separately (they depend on how many are already present).
 */
export function evaluateEvidenceFiles(files: File[]): EvidenceFileVerdict[] {
  return files.map((file) => {
    const type = file.type || "";
    const rule = ruleForType(type);
    if (!rule) {
      return {
        file,
        ok: false,
        reason: "unsupported",
        message: `Unsupported file type${type ? ` "${type}"` : ""}. Accepted: PDF, images, CSV, and text.`,
      };
    }
    if (file.size > rule.maxBytes) {
      return {
        file,
        ok: false,
        reason: "too-large",
        message: `${file.name} is larger than the ${rule.label} limit (${Math.round(rule.maxBytes / (1024 * 1024))} MB).`,
      };
    }
    return { file, ok: true };
  });
}

/** Per-kind count verdict for a file given how many of that kind already exist. */
export function evaluateFileCount(
  kind: EvidenceFileKind | undefined,
  currentCount: number,
): { ok: boolean; reason?: EvidenceFileRejectReason; message?: string } {
  if (!kind) return { ok: false, reason: "unsupported", message: "Unsupported file type." };
  const max = maxFilesForKind(kind.kind);
  if (currentCount >= max) {
    return {
      ok: false,
      reason: "too-many",
      message: `Too many ${kind.label.toLowerCase()} files (limit ${max}).`,
    };
  }
  return { ok: true };
}