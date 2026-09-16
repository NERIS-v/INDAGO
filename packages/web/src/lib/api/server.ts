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
  ProjectedGraphResponse,
  GraphVersionListResponse,
  GraphVersionDetailsResponse,
  TemporalBurstCandidatesResponse,
  CommunityCandidatesResponse,
  BridgeCandidatesResponse,
  TraversalResponse,
  ConnectingPathsResponse,
  LeadListResponse,
  LeadDetailResponse,
  GenerateLeadsResponse,
  AttachLeadEvidenceResponse,
  TransitionLeadStatusResponse,
  CrossCaseLinksResponse,
  GenerateCrossCaseLeadsResponse,
  RunCommandResponse,
} from "./types.js";
import { EvidenceSubmissionRequestSchema, AttachLeadEvidenceRequestSchema, type LeadStatus } from "@indago/contracts";

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
// Phase 4 — Graph (M-A10 / M-A13, PR3)
// ============================================================================

/** GET /investigations/:id/graph — the derived projected graph for the case. */
export async function getInvestigationGraph(
  investigationId: string,
): Promise<ProjectedGraphResponse> {
  return platformFetch<ProjectedGraphResponse>(
    `/api/v1/investigations/${investigationId}/graph`,
  );
}

/** GET /cases/:caseId/graph/versions — paginated historical version listing,
 *  ordered by versionNumber ascending. */
export async function listGraphVersions(
  caseId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<GraphVersionListResponse> {
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.offset !== undefined) q.set("offset", String(params.offset));
  const query = q.toString();
  return platformFetch<GraphVersionListResponse>(
    `/api/v1/cases/${caseId}/graph/versions${query ? `?${query}` : ""}`,
  );
}

/** GET /cases/:caseId/graph/versions/:vid — historical graph for a specific
 *  version (versionNumber or GraphVersion UUID). Returns the version metadata
 *  plus the projected graph; the provider uses the metadata half only. */
export async function getGraphVersionDetails(
  caseId: string,
  versionId: string,
): Promise<GraphVersionDetailsResponse> {
  return platformFetch<GraphVersionDetailsResponse>(
    `/api/v1/cases/${caseId}/graph/versions/${encodeURIComponent(versionId)}`,
  );
}

// ============================================================================
// Phase 4 — Structural candidate endpoints
// ============================================================================

/** GET /investigations/:id/graph/bursts — temporal burst candidates. */
export async function listTemporalBursts(
  investigationId: string,
): Promise<TemporalBurstCandidatesResponse> {
  return platformFetch<TemporalBurstCandidatesResponse>(
    `/api/v1/investigations/${investigationId}/graph/bursts`,
  );
}

/** GET /investigations/:id/graph/community-candidates — cohesion candidates. */
export async function listCommunityCandidates(
  investigationId: string,
): Promise<CommunityCandidatesResponse> {
  return platformFetch<CommunityCandidatesResponse>(
    `/api/v1/investigations/${investigationId}/graph/community-candidates`,
  );
}

/** GET /investigations/:id/graph/bridges — bridge/connector candidates
 *  (maxResults bounded server-side, default platform cap). */
export async function listBridgeCandidates(
  investigationId: string,
  maxResults?: number,
): Promise<BridgeCandidatesResponse> {
  const query = maxResults !== undefined
    ? `?maxResults=${encodeURIComponent(maxResults)}`
    : "";
  return platformFetch<BridgeCandidatesResponse>(
    `/api/v1/investigations/${investigationId}/graph/bridges${query}`,
  );
}

/** GET /investigations/:id/graph/traversal — bounded N-hop traversal from a
 *  canonical entity. hops/maxPaths are optional; the platform falls back to
 *  its runtime defaults when absent. */
export async function traverseGraph(
  investigationId: string,
  startEntityId: string,
  hops?: number,
  maxPaths?: number,
): Promise<TraversalResponse> {
  const q = new URLSearchParams({ startEntityId });
  if (hops !== undefined) q.set("hops", String(hops));
  if (maxPaths !== undefined) q.set("maxPaths", String(maxPaths));
  return platformFetch<TraversalResponse>(
    `/api/v1/investigations/${investigationId}/graph/traversal?${q.toString()}`,
  );
}

/** GET /investigations/:id/graph/paths — bounded paths between two entities. */
export async function listConnectingPaths(
  investigationId: string,
  fromEntityId: string,
  toEntityId: string,
  hops?: number,
): Promise<ConnectingPathsResponse> {
  const q = new URLSearchParams({ from: fromEntityId, to: toEntityId });
  if (hops !== undefined) q.set("hops", String(hops));
  return platformFetch<ConnectingPathsResponse>(
    `/api/v1/investigations/${investigationId}/graph/paths?${q.toString()}`,
  );
}

// ============================================================================
// Phase 4 — Leads
// ============================================================================

/** GET /investigations/:id/leads — full case-scoped lead list (optionally
 *  filtered by canonical status). */
export async function listLeads(
  investigationId: string,
  status?: LeadStatus,
): Promise<LeadListResponse> {
  const query = status !== undefined
    ? `?status=${encodeURIComponent(status)}`
    : "";
  return platformFetch<LeadListResponse>(
    `/api/v1/investigations/${investigationId}/leads${query}`,
  );
}

/** GET /investigations/:id/leads/:leadId — single lead + events + evidence. */
export async function getLead(
  investigationId: string,
  leadId: string,
): Promise<LeadDetailResponse> {
  return platformFetch<LeadDetailResponse>(
    `/api/v1/investigations/${investigationId}/leads/${leadId}`,
  );
}

/** POST /investigations/:id/leads/generate — structural lead generation
 *  (idempotent over unchanged graph state). */
export async function generateLeads(
  investigationId: string,
): Promise<GenerateLeadsResponse> {
  return platformFetch<GenerateLeadsResponse>(
    `/api/v1/investigations/${investigationId}/leads/generate`,
    { method: "POST" },
  );
}

/** POST /investigations/:id/leads/:leadId/evidence — attach FOR/AGAINST
 *  evidence. Validated client-side against the canonical request schema. */
export async function attachLeadEvidence(
  investigationId: string,
  leadId: string,
  request: {
    observationId: string;
    verdict: "FOR" | "AGAINST";
    rationale?: string;
  },
): Promise<AttachLeadEvidenceResponse> {
  const parsed = AttachLeadEvidenceRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new Error(
      `Validation failed: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }
  return platformFetch<AttachLeadEvidenceResponse>(
    `/api/v1/investigations/${investigationId}/leads/${leadId}/evidence`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
}

/** POST /investigations/:id/leads/:leadId/status — guarded status transition. */
export async function transitionLeadStatus(
  investigationId: string,
  leadId: string,
  toStatus: LeadStatus,
): Promise<TransitionLeadStatusResponse> {
  return platformFetch<TransitionLeadStatusResponse>(
    `/api/v1/investigations/${investigationId}/leads/${leadId}/status`,
    { method: "POST", body: JSON.stringify({ toStatus }) },
  );
}

// ============================================================================
// Phase 4 — Cross-case discovery
// ============================================================================

/** GET /investigations/:id/cross-case-links — read-only shared-entity preview
 *  against an explicit target case boundary. */
export async function listCrossCaseLinks(
  investigationId: string,
  targetCaseId: string,
): Promise<CrossCaseLinksResponse> {
  return platformFetch<CrossCaseLinksResponse>(
    `/api/v1/investigations/${investigationId}/cross-case-links?targetCaseId=${encodeURIComponent(targetCaseId)}`,
  );
}

/** POST /investigations/:id/cross-case-links/generate — persisted cross-case
 *  leads under this case (idempotent over unchanged graph state). */
export async function generateCrossCaseLeads(
  investigationId: string,
  targetCaseId: string,
): Promise<GenerateCrossCaseLeadsResponse> {
  return platformFetch<GenerateCrossCaseLeadsResponse>(
    `/api/v1/investigations/${investigationId}/cross-case-links/generate?targetCaseId=${encodeURIComponent(targetCaseId)}`,
    { method: "POST" },
  );
}

// ============================================================================
// Phase 4 — Run control (pause / resume / review resolution)
// ============================================================================

/** POST /investigations/:id/pause — human-invoked pause (reason required). */
export async function pauseInvestigation(
  investigationId: string,
  reason: string,
): Promise<RunCommandResponse> {
  return platformFetch<RunCommandResponse>(
    `/api/v1/investigations/${investigationId}/pause`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

/** POST /investigations/:id/resume — resume a PAUSED run. */
export async function resumeInvestigation(
  investigationId: string,
): Promise<RunCommandResponse> {
  return platformFetch<RunCommandResponse>(
    `/api/v1/investigations/${investigationId}/resume`,
    { method: "POST" },
  );
}

/** POST /investigations/:id/review/resolve — human resolution of
 *  REVIEW_REQUIRED (APPROVED → COMPLETED, NEEDS_EVIDENCE → WAITING_FOR_EVIDENCE). */
export async function resolveInvestigationReview(
  investigationId: string,
  outcome: "APPROVED" | "NEEDS_EVIDENCE",
  notes?: string,
): Promise<RunCommandResponse> {
  const body: { outcome: "APPROVED" | "NEEDS_EVIDENCE"; notes?: string } = {
    outcome,
  };
  if (notes !== undefined) body.notes = notes;
  return platformFetch<RunCommandResponse>(
    `/api/v1/investigations/${investigationId}/review/resolve`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ============================================================================
// Health Check
// ============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return platformFetch<HealthResponse>("/health");
}
