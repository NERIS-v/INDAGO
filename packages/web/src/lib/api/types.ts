// ============================================================================
// Investigation Status Response
//
// Shape returned by GET /api/v1/investigations/:investigationId
// This is a local type — no contracts match exists for this API response.
// ============================================================================

export interface InvestigationStatusResponse {
  readonly id: string;
  readonly investigationId: string;
  readonly status: string;
  readonly state: string;
  readonly currentStage?: string;
  readonly error?: string;
  readonly retryCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================================
// Start Investigation
// ============================================================================

export interface StartInvestigationRequest {
  readonly caseId: string;
  readonly investigationId: string;
}

export interface StartInvestigationResponse {
  readonly message: string;
  readonly runId: string;
}

// ============================================================================
// Health
// ============================================================================

export interface HealthResponse {
  readonly status: string;
  readonly service: string;
}

// ============================================================================
// API Error
// ============================================================================

export interface ApiErrorResponse {
  readonly error: string;
  readonly details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse,
  ) {
    super(body.error);
    this.name = "ApiError";
  }
}

// ============================================================================
// Evidence Submission (I-PR2)
//
// UploadedFileRef and EvidenceSubmissionRequest are derived from the canonical
// contracts Zod schemas. EvidenceSubmissionResponse is a platform API response
// shape (no contracts equivalent exists).
// ============================================================================

export type {
  UploadedFileReference as UploadedFileRef,
  EvidenceSubmissionRequest,
} from "@indago/contracts";

export interface EvidenceSubmissionResponse {
  readonly message: string;
  readonly operationId: string;
  readonly correlationId: string;
  readonly jobsEnqueued: number;
  readonly fileCount: number;
}
