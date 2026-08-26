// ============================================================================
// UploadThing Client Helper
//
// Creates the UploadThing client pointed at the platform's UploadThing route.
// No auth token — UploadThing handles its own secret-based auth via
// UPLOADTHING_SECRET on the server side.
//
// The x-investigation-id header is sent with each upload request and
// extracted by the platform's UploadThing middleware.
//
// Uses @indago/contracts UploadEndpoint type for type-safe endpoint names.
// ============================================================================

import { genUploader } from "uploadthing/client";
import type { UploadEndpoint, UploadProgressData } from "@indago/contracts";

const uploadUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const uploader = genUploader({
  url: `${uploadUrl}/api/uploadthing`,
  package: "@indago/web",
});

export interface UploadEvidenceOptions {
  readonly investigationId: string;
  readonly files: File[];
  readonly onUploadBegin?: (fileName: string) => void;
  readonly onUploadProgress?: (data: UploadProgressData) => void;
}

export interface UploadEvidenceResult {
  readonly fileKey: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly fileSize: number;
}

/**
 * Upload files to the platform's casePackUploader endpoint.
 *
 * The investigationId is sent as the x-investigation-id header,
 * which the platform's UploadThing middleware extracts to associate
 * the upload with an investigation.
 */
export async function uploadEvidence(
  options: UploadEvidenceOptions,
): Promise<UploadEvidenceResult[]> {
  const { investigationId, files, onUploadBegin, onUploadProgress } = options;

  const results = await uploader.uploadFiles(
    "casePackUploader" satisfies UploadEndpoint,
    {
      files,
      headers: {
        "x-investigation-id": investigationId,
      },
      onUploadBegin: onUploadBegin
        ? ({ file }: { file: string }) => onUploadBegin(file)
        : undefined,
      onUploadProgress: onUploadProgress
        ? (data: UploadProgressData) => onUploadProgress(data)
        : undefined,
    },
  );

  return results.map((r) => ({
    fileKey: r.key,
    fileUrl: r.url,
    fileName: r.name,
    fileSize: r.size,
  }));
}
