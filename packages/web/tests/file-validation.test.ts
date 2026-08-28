import { describe, it, expect } from "vitest";
import {
  evaluateEvidenceFiles,
  evaluateFileCount,
  ruleForType,
  MAX_FILES_PER_SUBMISSION,
} from "@/lib/evidence/file-validation";
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_COUNTS,
} from "@/lib/upload/types";

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("file-validation — supported", () => {
  it("accepts PDF, image, CSV, and text files", () => {
    const verdicts = evaluateEvidenceFiles([
      file("rpt.pdf", "application/pdf"),
      file("photo.png", "image/png"),
      file("data.csv", "text/csv"),
      file("notes.txt", "text/plain"),
    ]);
    expect(verdicts.every((v) => v.ok)).toBe(true);
  });

  it("requires at least one accepted kind rule to reuse the existing upload config", () => {
    expect(ruleForType("application/pdf")).toBeDefined();
    expect(ruleForType("image/jpeg")).toBeDefined();
    expect(ruleForType("text/csv")).toBeDefined();
    expect(ruleForType("text/plain")).toBeDefined();
  });
});

describe("file-validation — unsupported", () => {
  it("rejects a file with an unknown MIME type", () => {
    const verdicts = evaluateEvidenceFiles([file("app.exe", "application/x-msdownload")]);
    expect(verdicts[0].ok).toBe(false);
    expect(verdicts[0].reason).toBe("unsupported");
  });

  it("rejects a file with no MIME type", () => {
    const verdicts = evaluateEvidenceFiles([file("data.bin", "")]);
    expect(verdicts[0].ok).toBe(false);
    expect(verdicts[0].reason).toBe("unsupported");
  });
});

describe("file-validation — too large", () => {
  it("rejects a file larger than its kind limit", () => {
    const pdfMax = ACCEPTED_FILE_TYPES["application/pdf"].maxSize;
    const verdicts = evaluateEvidenceFiles([
      file("big.pdf", "application/pdf", pdfMax + 1),
    ]);
    expect(verdicts[0].ok).toBe(false);
    expect(verdicts[0].reason).toBe("too-large");
  });

  it("accepts a file at exactly the limit", () => {
    const pdfMax = ACCEPTED_FILE_TYPES["application/pdf"].maxSize;
    const verdicts = evaluateEvidenceFiles([
      file("exact.pdf", "application/pdf", pdfMax),
    ]);
    expect(verdicts[0].ok).toBe(true);
  });
});

describe("file-validation — too many", () => {
  it("rejects a file when the per-kind count is exceeded", () => {
    const max = MAX_FILE_COUNTS.pdf;
    const verdict = evaluateFileCount(ruleForType("application/pdf"), max);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("too-many");
  });

  it("accepts a file within the per-kind count", () => {
    const verdict = evaluateFileCount(ruleForType("application/pdf"), 0);
    expect(verdict.ok).toBe(true);
  });

  it("exposes the submission cap for the canonical request", () => {
    expect(MAX_FILES_PER_SUBMISSION).toBeGreaterThan(0);
  });
});
