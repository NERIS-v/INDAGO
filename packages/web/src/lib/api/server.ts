// ============================================================================
// Server-Side API Client
//
// All platform API calls go through this module, which injects the auth
// token server-side. Browser code NEVER sees AUTH_TOKEN.
//
// Usage: call these from Server Components, Server Actions, or API routes.
// ============================================================================

import type {
  InvestigationStatusResponse,
  StartInvestigationResponse,
  EvidenceSubmissionRequest,
  EvidenceSubmissionResponse,
  ObservationsResponse,
  EvidenceListResponse,
  CasesResponse,
  DeleteCaseResponse,
  HealthResponse,
  ApiError,
} from "./types.js";
import { EvidenceSubmissionRequestSchema } from "@indago/contracts";

function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_API_URL is not configured");
  return url;
}

function getAuthToken(): string {
  const token = process.env.AUTH_TOKEN;
  if (!token) throw new Error("AUTH_TOKEN is not configured");
  // Fail closed: the demo credential must never be presented in production.
  // The platform rejects "demo-token" when NODE_ENV=production; this guard
  // makes the web server fail fast at call time instead of surfacing obscure
  // 401s while the platform is locked down.
  if (process.env.NODE_ENV === "production" && token === "demo-token") {
    throw new Error(
      "AUTH_TOKEN must not be the development demo credential in production",
    );
  }
  return token;
}

async function platformFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = getBaseUrl();
  const token = getAuthToken();

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  const body = await response.json();

  if (!response.ok) {
    const error = new Error(
      typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
        : `API error ${response.status}`,
    ) as ApiError;
    (error as ApiError & { status: number }).status = response.status;
    (error as ApiError & { body: unknown }).body = body;
    throw error;
  }

  return body as T;
}

// ============================================================================
// Investigation Endpoints
// ============================================================================

export async function getInvestigationStatus(
  investigationId: string,
  caseId: string,
): Promise<InvestigationStatusResponse> {
  return platformFetch<InvestigationStatusResponse>(
    `/api/v1/investigations/${investigationId}?caseId=${encodeURIComponent(caseId)}`,
  );
}

export async function startInvestigation(params: {
  caseId: string;
  investigationId: string;
}): Promise<StartInvestigationResponse> {
  return platformFetch<StartInvestigationResponse>(
    "/api/v1/investigations/start",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

// ============================================================================
// Evidence Submission (I-PR2)
// ============================================================================

export async function submitEvidence(
  investigationId: string,
  request: Omit<EvidenceSubmissionRequest, "investigationId">,
): Promise<EvidenceSubmissionResponse> {
  // Client-side validation using canonical contracts schema before network roundtrip
  const parsed = EvidenceSubmissionRequestSchema.safeParse({
    ...request,
    investigationId,
  });
  if (!parsed.success) {
    throw new Error(
      `Validation failed: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }

  return platformFetch<EvidenceSubmissionResponse>(
    `/api/v1/investigations/${investigationId}/evidence`,
    {
      method: "POST",
      body: JSON.stringify(parsed.data),
    },
  );
}

// ============================================================================
// Observations (M-A06)
// ============================================================================

export async function listObservations(
  investigationId: string,
): Promise<ObservationsResponse> {
  return platformFetch<ObservationsResponse>(
    `/api/v1/investigations/${investigationId}/observations`,
  );
}

// ============================================================================
// Evidence List (M-A06)
// ============================================================================

export async function listEvidence(
  investigationId: string,
): Promise<EvidenceListResponse> {
  return platformFetch<EvidenceListResponse>(
    `/api/v1/investigations/${investigationId}/evidence`,
  );
}

// ============================================================================
// Case Catalogue (dashboard)
// ============================================================================

export async function listCases(): Promise<CasesResponse> {
  return platformFetch<CasesResponse>("/api/v1/cases");
}

export async function deleteCase(caseId: string): Promise<DeleteCaseResponse> {
  return platformFetch<DeleteCaseResponse>(`/api/v1/cases/${caseId}`, {
    method: "DELETE",
  });
}

// ============================================================================
// Health Check
// ============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return platformFetch<HealthResponse>("/health");
}
