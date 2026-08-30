// ============================================================================
// Investigation Status Response
//
// Shape returned by GET /api/v1/investigations/:investigationId
// This is a local type — no contracts match exists for this API response.
// ============================================================================

import type {
  Case,
  EventTime,
  EvidenceStatus,
  EvidenceType,
  Observation,
} from "@indago/contracts";

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

// ============================================================================
// Observations (M-A06)
//
// Shape returned by GET /api/v1/investigations/:investigationId/observations
// (source of truth: platform src/api/routes.ts). This is a local type — no
// contracts match exists for this API envelope.
// ============================================================================

export interface ObservationsResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly count: number;
  readonly observations: Observation[];
}

// ============================================================================
// Evidence List (M-A06)
//
// Shape returned by GET /api/v1/investigations/:investigationId/evidence
// (source of truth: platform src/api/routes.ts). This is a local type — no
// contracts match exists for the platform's evidence read projection. The
// platform persists a deliberately narrower Evidence row than the canonical
// EvidenceSchema (no strength / posture / provenance.extractor / entity /
// hypothesis links) and refuses to fabricate those fields, so the API item is
// the honest projection of what is durably stored. `status` is derived
// server-side (INGESTED → row persisted; PROCESSED → observations extracted).
// ============================================================================

export interface EvidenceListItem {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string;
  readonly type: EvidenceType;
  readonly title: string;
  readonly description: string | null;
  readonly status: EvidenceStatus;
  readonly sourceRef: string;
  readonly observedAt: EventTime | null;
  readonly observationCount: number;
  readonly artifactIds: string[];
  readonly strength?: number;
  readonly createdAt: string;
}

export interface EvidenceListResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly count: number;
  readonly evidence: EvidenceListItem[];
}

// ============================================================================
// Cases (case catalogue / dashboard)
//
// Shape returned by GET /api/v1/cases. The platform reassembles durable Case
// rows into canonical CaseSchema objects (id = caseId; investigationIds /
// evidenceIds / entityIds derived at read time, never fabricated).
// ============================================================================

export interface CasesResponse {
  readonly count: number;
  readonly cases: Case[];
}

// ============================================================================
// Delete Case
//
// Shape returned by DELETE /api/v1/cases/:caseId. 409-if-active and 404-from
// the platform map to `ApiError` status before this is ever resolved.
// ============================================================================

export interface DeleteCaseResponse {
  readonly deleted: true;
  readonly caseId: string;
}
