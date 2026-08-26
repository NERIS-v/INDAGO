// ============================================================================
// Upload Router Contract
//
// Shared type boundary for the UploadThing file router.
// Platform implements the router. Web references these types to call
// uploadFiles type-safely without importing platform internals.
// ============================================================================

/**
 * Endpoint names exposed by the platform's UploadThing router.
 * Platform's uploadRouter must satisfy these keys.
 */
export const UPLOAD_ENDPOINTS = ["casePackUploader"] as const;
export type UploadEndpoint = (typeof UPLOAD_ENDPOINTS)[number];

/**
 * File type constraints for the casePackUploader endpoint.
 * Mirrors the platform's createUploadthing() config.
 */
export interface CasePackFileTypes {
  readonly pdf: { maxFileSize: "16MB"; maxFileCount: 10 };
  readonly image: { maxFileSize: "8MB"; maxFileCount: 20 };
  readonly text: { maxFileSize: "16MB"; maxFileCount: 10 };
  readonly blob: { maxFileSize: "32MB"; maxFileCount: 5 };
}

/**
 * Result returned by UploadThing after a successful upload.
 */
export interface UploadResult {
  readonly key: string;
  readonly url: string;
  readonly name: string;
  readonly size: number;
}

/**
 * Progress callback options emitted by UploadThing during upload.
 */
export interface UploadProgressData {
  readonly file: File;
  readonly progress: number;
  readonly loaded: number;
  readonly delta: number;
  readonly totalLoaded: number;
  readonly totalProgress: number;
}
