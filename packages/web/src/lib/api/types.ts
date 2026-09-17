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
  ProjectedGraph,
  TemporalBurstCandidateDTO,
  CommunityCandidateDTO,
  BridgeCandidateDTO,
  ConnectingPathCandidateDTO,
  CrossCaseMatch,
  LeadStatus,
  LeadPriority,
  LeadEvidenceVerdict,
  EntityHypothesis,
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

// ============================================================================
// Phase 4 — Graph (M-A10 / M-A13, PR3)
//
// Shapes returned by the platform Phase 4 graph endpoints. The envelopes are
// platform API response shapes (local types); the inner `graph` / candidate /
// match payloads are canonical contracts from @indago/contracts.
// ============================================================================

/** GET /investigations/:id/graph — the derived ProjectedGraph envelope. */
export interface ProjectedGraphResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly graph: ProjectedGraph;
}

/** One historical graph version as listed by GET /cases/:caseId/graph/versions.
 *  `caseId` is carried by the platform item; `investigationId` is NOT exposed
 *  by this route and is backfilled by the provider from the workspace identity. */
export interface GraphVersionListItemDTO {
  readonly id: string;
  readonly caseId: string;
  readonly versionNumber: number;
  readonly status: string;
  readonly projectionStatus: string;
  readonly parentGraphVersionId: string | null;
  readonly checkpointId: string | null;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The `version` half of GET /cases/:caseId/graph/versions/:vid — the same
 *  metadata as GraphVersionListItemDTO with `caseId` carried at the top level
 *  instead of on the item. */
export type GraphVersionMetadataDTO = Omit<GraphVersionListItemDTO, "caseId">;

/** GET /cases/:caseId/graph/versions — paginated (limit ∈ [1,100], offset ≥ 0),
 *  ordered by versionNumber ascending (the deterministic replay seam). */
export interface GraphVersionListResponse {
  readonly caseId: string;
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly count: number;
  readonly versions: GraphVersionListItemDTO[];
}

/** GET /cases/:caseId/graph/versions/:vid — a single historical graph version
 *  (versionNumber or UUID) with its projected graph. The response `version`
 *  metadata carries no caseId (it is at the top level). */
export interface GraphVersionDetailsResponse {
  readonly caseId: string;
  readonly version: GraphVersionMetadataDTO | null;
  readonly graph: ProjectedGraph;
}

// ============================================================================
// Phase 4 — Structural candidate endpoints
// ============================================================================

/** GET /investigations/:id/graph/bursts — temporal burst candidates. */
export interface TemporalBurstCandidatesResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly burstCount: number;
  readonly bursts: TemporalBurstCandidateDTO[];
}

/** GET /investigations/:id/graph/community-candidates — cohesion candidates. */
export interface CommunityCandidatesResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly candidateCount: number;
  readonly candidates: CommunityCandidateDTO[];
}

/** GET /investigations/:id/graph/bridges — bridge/connector candidates. */
export interface BridgeCandidatesResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly bridgeCount: number;
  readonly bridges: BridgeCandidateDTO[];
}

/** GET /investigations/:id/graph/traversal — bounded N-hop traversal paths. */
export interface TraversalResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly startEntityId: string;
  readonly pathCount: number;
  readonly paths: ConnectingPathCandidateDTO[];
}

/** GET /investigations/:id/graph/paths — bounded paths between two entities. */
export interface ConnectingPathsResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly from: string;
  readonly to: string;
  readonly pathCount: number;
  readonly paths: ConnectingPathCandidateDTO[];
}

// ============================================================================
// Phase 4 — Leads
//
// The platform lead routes serialize DurableLead rows directly (dates as ISO
// strings). This is the honest wire shape — the provider projects it into the
// canonical LeadSchema (see lib/providers/live/lead-projection.ts). `status` /
// `priority` / `posture` / `sourceCandidateType` are the canonical unions; the
// JSON blobs stay opaque (`unknown[]`-free records) because the routes carry
// them verbatim.
// ============================================================================

export interface DurableLeadDTO {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly title: string;
  readonly description: string;
  readonly status: LeadStatus;
  readonly priority: LeadPriority;
  readonly confidence: number;
  readonly posture: string;
  readonly relatedEntityIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly relatedEvidenceIds: readonly string[];
  readonly gapIds: readonly string[];
  readonly sourceCandidateType: string;
  readonly sourceCandidateKey: string;
  readonly sourceCandidateSnapshot: unknown;
  readonly alternativeExplanations: unknown;
  readonly provenance: unknown;
  readonly assignedTo: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
}

export interface DurableLeadEvidenceLinkDTO {
  readonly id: string;
  readonly leadId: string;
  readonly observationId: string;
  readonly verdict: LeadEvidenceVerdict;
  readonly rationale: string | null;
  readonly addedBy: string;
  readonly createdAt: string;
}

export interface DurableLeadEventDTO {
  readonly id: string;
  readonly leadId: string;
  readonly caseId: string;
  readonly eventType: string;
  readonly actor: string;
  readonly payload: unknown;
  readonly sequence: number;
  readonly createdAt: string;
}

/** GET /investigations/:id/leads — full case-scoped lead list. */
export interface LeadListResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly leadCount: number;
  readonly leads: DurableLeadDTO[];
}

/** GET /investigations/:id/leads/:leadId — lead + event history + evidence links. */
export interface LeadDetailResponse {
  readonly lead: DurableLeadDTO;
  readonly events: DurableLeadEventDTO[];
  readonly evidence: DurableLeadEvidenceLinkDTO[];
}

/** POST /investigations/:id/leads/generate — structural lead generation result. */
export interface GenerateLeadsResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly candidatesConsidered: number;
  readonly leadsCreated: number;
  readonly leadsAlreadyExisted: number;
  readonly skipped: number;
  readonly reviewTriggered: boolean;
}

/** POST /investigations/:id/leads/:leadId/evidence — evidence attach result. */
export interface AttachLeadEvidenceResponse {
  readonly lead: DurableLeadDTO;
  readonly link: DurableLeadEvidenceLinkDTO;
  readonly created: boolean;
}

/** POST /investigations/:id/leads/:leadId/status — transition result. */
export interface TransitionLeadStatusResponse {
  readonly lead: DurableLeadDTO;
}

// ============================================================================
// Phase 4 — Cross-case discovery
// ============================================================================

/** GET /investigations/:id/cross-case-links — read-only shared-entity preview. */
export interface CrossCaseLinksResponse {
  readonly caseId: string;
  readonly targetCaseId: string;
  readonly matchCount: number;
  readonly matches: CrossCaseMatch[];
}

/** POST /investigations/:id/cross-case-links/generate — persisted cross-case leads. */
export interface GenerateCrossCaseLeadsResponse {
  readonly caseId: string;
  readonly targetCaseId: string;
  readonly candidatesConsidered: number;
  readonly leadsCreated: number;
  readonly leadsAlreadyExisted: number;
  readonly skipped: number;
  readonly reviewTriggered: boolean;
}

// ============================================================================
// Phase 4 — Run control (pause / resume / review resolution)
//
// POST /investigations/:id/pause, /resume, /review/resolve all return
// `{ run: RunSnapshot }` — the same {id, investigationId, caseId, status,
// state, currentStage} shape the run-status endpoint exposes (minus the
// timestamps), never a canonical Investigation.
// ============================================================================

export interface InvestigationRunSnapshotDTO {
  readonly id: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly status: string;
  readonly state: string;
  readonly currentStage: string | null;
}

export interface RunCommandResponse {
  readonly run: InvestigationRunSnapshotDTO;
}

// ============================================================================
// Phase 4 — Entities, Entity Hypotheses, Relations (PR-21)
//
// Shapes returned by the PR-21 read/authority endpoints. The platform serializes
// Durable entity/relation rows directly (entity-store.ts / relation-hypothesis-
// store.ts / relation-store.ts rowTo*); this is the honest wire shape the live
// providers project into canonical contracts (lib/providers/live/*-projection.ts).
// The entity-hypotheses endpoint returns ALREADY-canonical EntityHypothesis
// objects (validated via EntityHypothesisSchema at the platform boundary), so
// they pass straight through the provider seam.
// ============================================================================

/** GET /investigations/:id/entities — a Durable canonical Entity row subset
 *  (entity-store.ts rowToEntity). `investigationId` is nullable on the wire and
 *  is backfilled by the provider from the workspace identity. */
export interface EntityListItemDTO {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly canonicalName: string;
  readonly entityType?: string | null;
  readonly status: string;
  readonly observationIds: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly sourceIdentifiers?:
    | readonly { readonly sourceId: string; readonly identifier: string }[]
    | null;
  readonly provenance?: unknown;
  readonly metadata?: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** GET /investigations/:id/entities envelope. */
export interface EntitiesResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly entityCount: number;
  readonly mentionCount: number;
  readonly entities: EntityListItemDTO[];
}

/** GET /investigations/:id/entity-hypotheses — ALREADY-canonical EntityHypothesis
 *  objects (the platform validates them through EntityHypothesisSchema). */
export interface EntityHypothesesResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly count: number;
  readonly hypotheses: EntityHypothesis[];
}

/** POST /investigations/:id/entity-hypotheses/:hid/accept — M-A09.5 materialization
 *  result. `entityId` is the (possibly reused) canonical entity that resulted. */
export interface EntityAcceptResponse {
  readonly entityId: string;
  readonly hypothesisId: string;
  readonly status: string;
  readonly materialized: boolean;
  readonly reusedExisting: boolean;
}

/** GET /investigations/:id/relations — a Durable RelationHypothesis row subset
 *  (relation-hypothesis-store.ts rowToRelationHypothesis). `validityInterval`
 *  is the platform column name (NOT canonical `temporalInterval`); the provider
 *  projects it. `evidenceStrength` is relationship quality, NOT the canonical
 *  structural `strength`, and is intentionally not mapped. */
export interface RelationHypothesisDTO {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly status: string;
  readonly scoreModelVersion?: string;
  readonly evidenceCount?: number;
  readonly evidenceStrength?: number;
  readonly sourceCoverage?: number;
  readonly temporalCoverage?: number;
  readonly directed: boolean;
  readonly provenance?: unknown;
  readonly metadata?: unknown;
  readonly validityInterval?: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** GET /investigations/:id/relations envelope. */
export interface RelationsResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly count: number;
  readonly relations: RelationHypothesisDTO[];
}

/** GET /investigations/:id/canonical-relations — the ACCEPTED, materialized
 *  relations (relation-store.ts rowToRelation). No canonical contracts shape
 *  exists for a materialized relation, so this is the provider-owned DTO the UI
 *  consumes through the RelationProvider.listCanonical seam. */
export interface CanonicalRelationDTO {
  readonly id: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly directed: boolean;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly status: string;
  readonly scoreModelVersion?: string;
  readonly evidenceCount?: number;
  readonly provenance?: unknown;
  readonly hypothesisId: string;
  readonly validityInterval?: unknown;
  readonly temporalAssertions?: unknown;
  readonly createdAt: string;
  readonly reversedAt: string | null;
}

/** GET /investigations/:id/canonical-relations envelope. */
export interface CanonicalRelationsResponse {
  readonly investigationId: string;
  readonly caseId: string;
  readonly count: number;
  readonly relations: CanonicalRelationDTO[];
}

/** POST /investigations/:id/relation-hypotheses/:hid/accept — M-A10 accept
 *  materialization result. */
export interface RelationAcceptResponse {
  readonly relationId: string;
  readonly hypothesisId: string;
  readonly status: string;
  readonly materialized: boolean;
  readonly reusedExisting: boolean;
}

/** POST /investigations/:id/relation-hypotheses/:hid/reject | /reverse —
 *  status-only responses (the reject/reverse routes return the durable status
 *  and hypothesis id; no canonical relation is created on reject). */
export interface RelationDecisionResponse {
  readonly status: string;
  readonly hypothesisId: string;
}
