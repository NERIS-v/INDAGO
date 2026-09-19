// ============================================================================
// F-PR2 Live Providers
//
// Wrappers over the EXISTING platform API (via server actions → platformFetch).
// Reuses the server-side auth boundary — no new tokens, no client-side
// credentials, browser code never sees AUTH_TOKEN.
//
// Live convergence rules (Prompt 2/3):
//   - Wire a live method ONLY where the platform exposes the endpoint.
//   - Never silently fall back to demo; never fabricate data. A live failure
//     surfaces as a typed ProviderError (see ./errors.ts).
//   - The run-status endpoint carries no canonical Investigation metadata, so
//     get() projects run status via ./run-projection.ts (documented PROJECTION).
//   - Endpoints the platform does not yet expose throw
//     ProviderError.unsupported() (documented dependency) rather than returning
//     fabricated or demo data.
// ============================================================================

import type {
  InvestigationProvider,
  EvidenceProvider,
  CaseProvider,
  ObservationProvider,
  EntityProvider,
  GraphProvider,
  TimelineProvider,
  LeadProvider,
  GapProvider,
  ReviewProvider,
  RobustnessProvider,
  HypothesisProvider,
  CrossCaseProvider,
  RelationProvider,
  IntelligenceProvider,
  DataModeConfig,
  ProviderQuery,
  Paginated,
  WorkspaceProviders,
  RealtimeProvider,
  WorkspaceIdentity,
  GraphRealtimeCatalog,
  InvestigationRunSnapshotView,
  ReviewOutcome,
  ReviewCheckpoint,
  GenerateLeadsResult,
  EntityAcceptResult,
} from "../types";
import { ProviderError } from "../types";
import type {
  Investigation,
  Observation,
  Case,
  EvidenceSubmissionRequest,
  UploadedFileReference,
  GraphVersion,
  GraphNode,
  GraphEdge,
  GraphHole,
  Lead,
  LeadEvidenceLink,
  CrossCaseMatch,
  AttachLeadEvidenceRequest,
  LeadStatus,
  TemporalBurstCandidateDTO,
  CommunityCandidateDTO,
  BridgeCandidateDTO,
  ConnectingPathCandidateDTO,
  EntityHypothesis,
  Entity,
  RelationHypothesis,
} from "@indago/contracts";
import type {
  EvidenceSubmissionResponse,
  EvidenceListResponse,
  EvidenceListItem,
  ObservationsResponse,
  CasesResponse,
  GraphVersionListResponse,
  GraphVersionDetailsResponse,
  GraphVersionListItemDTO,
  LeadListResponse,
  LeadDetailResponse,
  EntitiesResponse,
  EntityHypothesesResponse,
  EntityAcceptResponse,
  RelationsResponse,
  CanonicalRelationsResponse,
  CanonicalRelationDTO,
  CentralityResponse,
  CommunitiesResponse,
  ValidAtGraphResponse,
  CentralityResultDTO,
  CommunityDetectionDTO,
} from "@/lib/api/types";
import { createCapabilityStatusTable } from "../capabilities";
import { createLiveRealtimeProvider } from "./realtime";
import { providerUnsupported, providerUnsupportedPaginated } from "./unsupported";
import { toLiveProviderError } from "./errors";
import { projectRunStatusToInvestigation } from "./run-projection";
import { projectGraphVersionFromListItem, projectGraphNode, projectGraphEdge } from "./graph-projection";
import { projectEntityFromDto, type EntityProjectionContext } from "./entity-projection";
import { projectRelationFromDto } from "./relation-projection";
import {
  projectLeadFromDto,
  projectLeadEvidenceLinkFromDto,
  type LeadProjectionContext,
} from "./lead-projection";
import {
  getInvestigationStatus,
  startInvestigation as apiStartInvestigation,
  submitEvidence as apiSubmitEvidence,
  listObservations as apiListObservations,
  listEvidence as apiListEvidence,
  listCases as apiListCases,
  deleteCase as apiDeleteCase,
  getInvestigationGraph as apiGetInvestigationGraph,
  listGraphVersions as apiListGraphVersions,
  getGraphVersionDetails as apiGetGraphVersionDetails,
  getTemporalBursts as apiListTemporalBursts,
  getCommunityCandidates as apiListCommunityCandidates,
  getCommunities as apiGetGraphCommunities,
  getCentrality as apiGetGraphCentrality,
  getValidAtGraph as apiGetGraphValidAt,
  getBridgeCandidates as apiListBridgeCandidates,
  traverseGraph as apiTraverseGraph,
  getConnectingPaths as apiListConnectingPaths,
  listLeads as apiListLeads,
  getLead as apiGetLead,
  generateLeads as apiGenerateLeads,
  attachLeadEvidence as apiAttachLeadEvidence,
  transitionLeadStatus as apiTransitionLeadStatus,
  listCrossCaseLinks as apiListCrossCaseLinks,
  pauseInvestigation as apiPauseInvestigation,
  resumeInvestigation as apiResumeInvestigation,
  resolveInvestigationReview as apiResolveInvestigationReview,
  listEntities as apiListEntities,
  listEntityHypotheses as apiListEntityHypotheses,
  acceptEntityHypothesis as apiAcceptEntityHypothesis,
  listRelations as apiListRelations,
  listCanonicalRelations as apiListCanonicalRelations,
  acceptRelationHypothesis as apiAcceptRelationHypothesis,
  rejectRelationHypothesis as apiRejectRelationHypothesis,
  reverseRelationHypothesis as apiReverseRelationHypothesis,
} from "@/lib/api/server-action";
import { uploadEvidence } from "@/lib/upload/uploadthing";

/**
 * Page an in-memory array into the canonical Paginated<T> shape. Live
 * endpoints return bounded/complete sets; the platform variants that support
 * server-side paging (graph versions) are paged on their own.
 */
function paginateItems<T>(items: readonly T[], query?: ProviderQuery): Paginated<T> {
  if (query?.signal?.aborted) throw ProviderError.cancelled();
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page,
    pageSize,
    totalItems: items.length,
    hasMore: start + pageSize < items.length,
  };
}

/**
 * Live implementation of InvestigationProvider.
 *
 * get() → platform GET /investigations/:id (run-status), projected into the
 * canonical Investigation where the fields exist and with documented neutral
 * defaults elsewhere (see run-projection.ts). start() → platform
 * POST /investigations/start. listByCase() has no platform endpoint yet and
 * stays UNSUPPORTED.
 */
export class LiveInvestigationProvider implements InvestigationProvider {
  constructor(private readonly caseId: string) {}

  async get(id: string): Promise<Investigation> {
    let run: Parameters<typeof projectRunStatusToInvestigation>[1];
    try {
      run = await getInvestigationStatus(id, this.caseId);
    } catch (err) {
      // A backend failure is NEVER turned into a fabricated Investigation.
      throw toLiveProviderError(err);
    }
    try {
      return projectRunStatusToInvestigation(
        { investigationId: id, caseId: this.caseId },
        run,
      );
    } catch (err) {
      throw ProviderError.validation(
        "Live investigation projection failed for the run-status response.",
        err,
      );
    }
  }

  async listByCase(
    _caseId: string,
    _query?: ProviderQuery,
  ): Promise<Paginated<Investigation>> {
    return providerUnsupportedPaginated("investigation.listByCase");
  }

  async start(
    caseId: string,
    investigationId: string,
  ): Promise<{ runId: string }> {
    try {
      const result = await apiStartInvestigation({ caseId, investigationId });
      return { runId: result.runId };
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  private mapRunSnapshot(
    run: { id: string; status: string; state: string; currentStage: string | null },
    investigationId: string,
  ): InvestigationRunSnapshotView {
    return {
      runId: run.id,
      investigationId,
      caseId: this.caseId,
      status: run.status,
      state: run.state,
      currentStage: run.currentStage,
    };
  }

  /** POST /investigations/:id/pause — the platform requires a non-empty reason. */
  async pause(id: string, reason?: string): Promise<InvestigationRunSnapshotView> {
    if (!reason || reason.trim().length === 0) {
      throw ProviderError.validation(
        "A pause reason is required (the platform pause endpoint rejects an empty reason).",
      );
    }
    try {
      const response = await apiPauseInvestigation(id, reason);
      return this.mapRunSnapshot(response.run, id);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async resume(id: string): Promise<InvestigationRunSnapshotView> {
    try {
      const response = await apiResumeInvestigation(id);
      return this.mapRunSnapshot(response.run, id);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async resolveReview(
    id: string,
    outcome: ReviewOutcome,
    notes?: string,
  ): Promise<InvestigationRunSnapshotView> {
    try {
      const response = await apiResolveInvestigationReview(id, outcome, notes);
      return this.mapRunSnapshot(response.run, id);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  /** Presence-only review checkpoint: non-null ONLY while state === REVIEW_REQUIRED. */
  async getReviewCheckpoint(id: string): Promise<ReviewCheckpoint | null> {
    let status: Awaited<ReturnType<typeof getInvestigationStatus>>;
    try {
      status = await getInvestigationStatus(id, this.caseId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    if (status.state !== "REVIEW_REQUIRED") return null;
    return {
      runId: status.id,
      investigationId: id,
      caseId: this.caseId,
      status: status.status,
      state: status.state,
      currentStage: status.currentStage ?? null,
    };
  }
}

/**
 * Live implementation of EvidenceProvider.
 *
 * submit() → platform POST /investigations/:id/evidence (via server action).
 * prepareUpload() → the platform's UploadThing casePackUploader (client-side
 * helper), returning UploadThing file references. listByInvestigation() →
 * platform GET /investigations/:id/evidence (via server action), mapped into
 * the documented EvidenceListItem projection — the platform persists a
 * narrower Evidence row than the canonical EvidenceSchema (no strength /
 * posture / provenance.extractor) and refuses to fabricate those fields, so
 * strength is never supplied here. get() has no platform single-get endpoint
 * yet and stays UNSUPPORTED.
 */
export class LiveEvidenceProvider implements EvidenceProvider {
  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<EvidenceListItem>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: EvidenceListResponse;
    try {
      response = await apiListEvidence(investigationId);
    } catch (err) {
      // A backend failure is NEVER turned into a fabricated evidence list.
      throw toLiveProviderError(err);
    }
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const slice = response.evidence.slice(start, start + pageSize);
    return {
      items: slice,
      page,
      pageSize,
      totalItems: response.evidence.length,
      hasMore: start + pageSize < response.evidence.length,
    };
  }

  get(_id: string): Promise<EvidenceListItem> {
    return providerUnsupported("evidence.get");
  }

  async prepareUpload(
    investigationId: string,
    files: File[],
    onProgress?: (progress: number) => void,
  ): Promise<UploadedFileReference[]> {
    if (files.length === 0) {
      throw ProviderError.validation("No files were selected to upload.");
    }
    try {
      const uploaded = await uploadEvidence({
        investigationId,
        files,
        onUploadProgress: onProgress
          ? (data) => onProgress(data.progress)
          : undefined,
      });
      return uploaded.map((u) => ({
        fileKey: u.fileKey,
        fileUrl: u.fileUrl,
        fileName: u.fileName,
        fileSize: u.fileSize,
      }));
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async submit(
    investigationId: string,
    request: Omit<EvidenceSubmissionRequest, "investigationId">,
    signal?: AbortSignal,
  ): Promise<EvidenceSubmissionResponse> {
    if (signal?.aborted) throw ProviderError.cancelled();
    try {
      return await apiSubmitEvidence(investigationId, request);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }
}

/**
 * Live implementation of ObservationProvider.
 *
 * listByInvestigation() → platform GET /investigations/:id/observations (via
 * server action). The platform returns the full case-scoped set (caseId is
 * derived server-side from the persisted run — never client-supplied); paging
 * is applied here over that authoritative list. listByEntity() has no platform
 * endpoint yet and stays UNSUPPORTED rather than fabricating a filter.
 */
export class LiveObservationProvider implements ObservationProvider {
  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<Observation>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: ObservationsResponse;
    try {
      response = await apiListObservations(investigationId);
    } catch (err) {
      // A backend failure is NEVER turned into a fabricated observation list.
      throw toLiveProviderError(err);
    }
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const slice = response.observations.slice(start, start + pageSize);
    return {
      items: slice,
      page,
      pageSize,
      totalItems: response.observations.length,
      hasMore: start + pageSize < response.observations.length,
    };
  }

  listByEntity(): Promise<Paginated<Observation>> {
    return providerUnsupportedPaginated("observations.listByEntity");
  }
}

// ---------------------------------------------------------------------------
// Unsupported live providers (platform endpoints not yet exposed).
// Each method throws an explicit UNSUPPORTED ProviderError.
// ---------------------------------------------------------------------------

/**
 * Live CaseProvider. list() → platform GET /api/v1/cases (via server action);
 * the platform reassembles durable Case rows into canonical CaseSchema objects
 * (id = caseId, read-time derived counts), so no projection or fabrication
 * happens here. get() has no platform single-case endpoint yet and stays
 * UNSUPPORTED.
 */
export class LiveCaseProvider implements CaseProvider {
  async list(query?: ProviderQuery): Promise<Paginated<Case>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: CasesResponse;
    try {
      response = await apiListCases();
    } catch (err) {
      // A backend failure is NEVER turned into a fabricated case list.
      throw toLiveProviderError(err);
    }
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const slice = response.cases.slice(start, start + pageSize);
    return {
      items: slice,
      page,
      pageSize,
      totalItems: response.cases.length,
      hasMore: start + pageSize < response.cases.length,
    };
  }
  get(_id: string): Promise<Case> {
    return providerUnsupported("cases.get");
  }
  /** remove() → platform DELETE /api/v1/cases/:caseId (via server action). */
  async remove(id: string): Promise<void> {
    try {
      await apiDeleteCase(id);
    } catch (err) {
      // 404 (already gone elsewhere), 403 (access), 409 (active runs) and
      // 5xx are surfaced as typed ProviderErrors for the UI.
      throw toLiveProviderError(err);
    }
  }
}

/**
 * Live implementation of EntityProvider (PR-21).
 *
 *   - listByInvestigation() → GET /investigations/:id/entities, projected into
 *     the canonical Entity (see ./entity-projection.ts). `investigationId` is
 *     backfilled from the workspace identity when the wire row is nullable.
 *   - get() has no single-entity endpoint, so it resolves an id against the
 *     case-scoped entity list (authoritative, no fabrication); an absent id
 *     rejects typed NOT_FOUND.
 *   - listEntityHypotheses() → GET /investigations/:id/entity-hypotheses, which
 *     returns ALREADY-canonical EntityHypothesis objects (validated through
 *     EntityHypothesisSchema at the platform boundary) — passed through verbatim.
 *   - acceptEntityHypothesis() → POST /investigations/:id/entity-hypotheses/
 *     :hid/accept (M-A09.5), mapping the materialization result.
 *
 * The platform exposes NO entity reject/reverse authority — those actions are
 * never offered, so the provider does not expose them either.
 */
export class LiveEntityProvider implements EntityProvider {
  constructor(private readonly context: EntityProjectionContext) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<Entity>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: EntitiesResponse;
    try {
      response = await apiListEntities(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    try {
      return paginateItems(
        response.entities.map((dto) => projectEntityFromDto(dto, this.context)),
        query,
      );
    } catch (err) {
      throw ProviderError.validation(
        "Live entity projection failed for the entities response.",
        err,
      );
    }
  }

  async get(id: string): Promise<Entity> {
    let response: EntitiesResponse;
    try {
      response = await apiListEntities(this.context.investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    const dto = response.entities.find((e) => e.id === id);
    if (!dto) throw ProviderError.notFound("Entity not found.");
    try {
      return projectEntityFromDto(dto, this.context);
    } catch (err) {
      throw ProviderError.validation(
        "Live entity projection failed for the requested entity.",
        err,
      );
    }
  }

  async listEntityHypotheses(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<EntityHypothesis>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: EntityHypothesesResponse;
    try {
      response = await apiListEntityHypotheses(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return paginateItems(response.hypotheses, query);
  }

  async acceptEntityHypothesis(
    investigationId: string,
    hypothesisId: string,
  ): Promise<EntityAcceptResult> {
    let response: EntityAcceptResponse;
    try {
      response = await apiAcceptEntityHypothesis(investigationId, hypothesisId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return {
      entityId: response.entityId,
      hypothesisId: response.hypothesisId,
      status: response.status,
      materialized: response.materialized,
      reusedExisting: response.reusedExisting,
    };
  }
}

/**
 * Live implementation of GraphProvider (Phase 4).
 *
 * The platform's graph surface:
 *   - GET /investigations/:id/graph  → the CURRENT projected graph (nodes/
 *     edges/truncation), rebuilt on demand from canonical entities + relations;
 *   - GET /cases/:caseId/graph/versions → the historical version list,
 *     ordered by versionNumber ascending (metadata only — case-scoped).
 *
 * getVersion() resolves the LATEST recorded version via the version list
 * (limit=1 probe for total, then offset=total-1) and projects it into the
 * canonical GraphVersion. When the case has NO recorded version (no entities/
 * relations materialized), getVersion throws typed UNSUPPORTED — never
 * fabricates a version identity.
 *
 * getNodes()/getEdges() stream the current projection from the graph endpoint.
 * getGraphHoles() returns an authoritative EMPTY list: the platform exposes no
 * graph-hole endpoint (holes are derived during analysis and surface through
 * the leads/candidates seam), so absence is the honest datum — exactly the
 * same rule that keeps getOverlayCatalog() → {}. Requesting nodes/edges/holes
 * in parallel (as graph-panel does) therefore never fails on a missing seam.
 *
 * The P4 structural-candidate methods hit the candidate endpoints and are
 * typed on the canonical candidate DTOs.
 */
export class LiveGraphProvider implements GraphProvider {
  constructor(private readonly caseId: string) {}

  private async fetchLatestVersion(): Promise<GraphVersionListItemDTO> {
    const probe = await apiListGraphVersions(this.caseId, { limit: 1 });
    if (probe.total === 0) {
      throw ProviderError.unsupported(
        "graph.getVersion: the platform has no recorded graph version for this case yet (no entities/relations have materialized).",
      );
    }
    const page = await apiListGraphVersions(this.caseId, {
      limit: 1,
      offset: probe.total - 1,
    });
    const latest = page.versions[0];
    if (!latest) {
      throw ProviderError.server(
        "The graph version list returned an empty latest page.",
      );
    }
    return latest;
  }

  async getVersion(investigationId: string): Promise<GraphVersion> {
    let latest: GraphVersionListItemDTO;
    try {
      latest = await this.fetchLatestVersion();
    } catch (err) {
      throw toLiveProviderError(err);
    }
    try {
      return projectGraphVersionFromListItem(latest, investigationId);
    } catch (err) {
      throw ProviderError.validation(
        "Live graph version projection failed for the latest recorded version.",
        err,
      );
    }
  }

  async listVersions(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<GraphVersion>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    const page = query?.page ?? 1;
    const pageSize = Math.min(query?.pageSize ?? 20, 100);
    try {
      const response: GraphVersionListResponse = await apiListGraphVersions(
        this.caseId,
        { limit: pageSize, offset: (page - 1) * pageSize },
      );
      const items = response.versions.map((v) =>
        projectGraphVersionFromListItem(v, investigationId),
      );
      return {
        items,
        page,
        pageSize,
        totalItems: response.total,
        hasMore: (page - 1) * pageSize + items.length < response.total,
      };
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async getVersionById(
    investigationId: string,
    graphVersionId: string,
  ): Promise<GraphVersion> {
    let response: GraphVersionDetailsResponse;
    try {
      response = await apiGetGraphVersionDetails(this.caseId, graphVersionId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    if (!response.version) {
      throw ProviderError.notFound("Graph version not found.");
    }
    try {
      return projectGraphVersionFromListItem(
        { ...response.version, caseId: response.caseId },
        investigationId,
      );
    } catch (err) {
      throw ProviderError.validation(
        "Live graph version projection failed for the requested version.",
        err,
      );
    }
  }

  async getNodes(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<GraphNode>> {
    let current: { versionId: string; nodes: GraphNode[] };
    try {
      const latest = await this.fetchLatestVersion();
      const graph = await apiGetInvestigationGraph(investigationId);
      current = {
        versionId: latest.id,
        nodes: graph.graph.nodes.map((n) =>
          projectGraphNode(n, { investigationId, versionId: latest.id }),
        ),
      };
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return paginateItems(current.nodes, query);
  }

  async getEdges(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<GraphEdge>> {
    let current: { versionId: string; edges: GraphEdge[] };
    try {
      const latest = await this.fetchLatestVersion();
      const graph = await apiGetInvestigationGraph(investigationId);
      current = {
        versionId: latest.id,
        edges: graph.graph.edges.map((e) =>
          projectGraphEdge(e, { investigationId, versionId: latest.id }),
        ),
      };
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return paginateItems(current.edges, query);
  }

  getGraphHoles(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<GraphHole>> {
    return Promise.resolve({
      items: [],
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 20,
      totalItems: 0,
      hasMore: false,
    });
  }

  getOverlayCatalog(): Promise<GraphRealtimeCatalog> {
    return Promise.resolve({});
  }

  async getTemporalBursts(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<TemporalBurstCandidateDTO>> {
    try {
      const response = await apiListTemporalBursts(investigationId);
      return paginateItems(response.bursts, query);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  /** PR-22: AUTHORITATIVE community detection (deterministic Louvain) →
   *  GET /graph/communities. Distinct from community CANDIDATES. */
  async getCommunities(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<CommunityDetectionDTO>> {
    try {
      const response: CommunitiesResponse = await apiGetGraphCommunities(investigationId);
      return paginateItems(response.communities, query);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  /** PR-22: P4 cohesion-scored community CANDIDATES →
   *  GET /graph/community-candidates. Kept separate from authoritative
   *  getCommunities(). */
  async getCommunityCandidates(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<CommunityCandidateDTO>> {
    try {
      const response = await apiListCommunityCandidates(investigationId);
      return paginateItems(response.candidates, query);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  /** PR-22: authoritative degree centrality rank → GET /graph/centrality.
   *  Structural metric (relation volume), never culpability. */
  async getCentrality(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<CentralityResultDTO>> {
    try {
      const response: CentralityResponse = await apiGetGraphCentrality(investigationId);
      return paginateItems(response.centrality, query);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  /** PR-22: authoritative graph projection valid at a domain instant →
   *  GET /cases/:caseId/graph/valid-at?at=<ISO> (case-scoped). The investigation
   *  is resolved server-side from the persisted run; the CASE scope comes from
   *  this provider's resolved caseId — never an arbitrary browser value, so the
   *  caller-supplied caseId is intentionally ignored for authorization. */
  async getValidAt(_caseId: string, at: string): Promise<ValidAtGraphResponse> {
    try {
      const response = await apiGetGraphValidAt(this.caseId, at);
      return response;
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async getBridges(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<BridgeCandidateDTO>> {
    try {
      const response = await apiListBridgeCandidates(investigationId);
      return paginateItems(response.bridges, query);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async traverse(
    investigationId: string,
    startEntityId: string,
    hops?: number,
    maxPaths?: number,
  ): Promise<Paginated<ConnectingPathCandidateDTO>> {
    try {
      const response = await apiTraverseGraph(
        investigationId,
        startEntityId,
        hops,
        maxPaths,
      );
      return paginateItems(response.paths);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async connectingPaths(
    investigationId: string,
    fromEntityId: string,
    toEntityId: string,
    hops?: number,
  ): Promise<Paginated<ConnectingPathCandidateDTO>> {
    try {
      const response = await apiListConnectingPaths(
        investigationId,
        fromEntityId,
        toEntityId,
        hops,
      );
      return paginateItems(response.paths);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }
}

/**
 * Live implementation of RelationProvider (PR-21).
 *
 *   - listByInvestigation() → GET /investigations/:id/relations, projected into
 *     the canonical RelationHypothesis (see ./relation-projection.ts).
 *   - get() has no single-relation endpoint, so it resolves an id against BOTH
 *     the relation-hypothesis list and the canonical-relation list (a graph-edge
 *     canonical relation id reverse-looks-up to its hypothesis), authoritative
 *     and never fabricated; an unknown id rejects typed NOT_FOUND.
 *   - listCanonical() → GET /investigations/:id/canonical-relations, the ACCEPTED
 *     materialized relations (provider-owned CanonicalRelationDTO).
 *   - accept()/reject()/reverse() POST the authority route, then RE-READ the
 *     relation hypothesis so the returned status always reflects the durable
 *     platform state (never an optimistic assumption).
 */
export class LiveRelationProvider implements RelationProvider {
  constructor(private readonly investigationId: string) {}

  private async readHypothesis(
    investigationId: string,
    id: string,
  ): Promise<RelationHypothesis | null> {
    let response: RelationsResponse;
    try {
      response = await apiListRelations(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    const dto = response.relations.find((r) => r.id === id);
    if (!dto) return null;
    return projectRelationFromDto(dto);
  }

  private async readCanonical(
    investigationId: string,
    id: string,
  ): Promise<CanonicalRelationDTO | null> {
    let response: CanonicalRelationsResponse;
    try {
      response = await apiListCanonicalRelations(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return response.relations.find((r) => r.id === id) ?? null;
  }

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<RelationHypothesis>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: RelationsResponse;
    try {
      response = await apiListRelations(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    try {
      return paginateItems(
        response.relations.map((dto) => projectRelationFromDto(dto)),
        query,
      );
    } catch (err) {
      throw ProviderError.validation(
        "Live relation projection failed for the relations response.",
        err,
      );
    }
  }

  async get(id: string): Promise<RelationHypothesis> {
    const investigationId = this.investigationId;
    // First try the relation-hypothesis universe directly.
    const direct = await this.readHypothesis(investigationId, id);
    if (direct) return direct;
    // Fall back to reverse-looking-up a graph-edge canonical relation id.
    const canonical = await this.readCanonical(investigationId, id);
    if (canonical) {
      const viaCanonical = await this.readHypothesis(
        investigationId,
        canonical.hypothesisId,
      );
      if (viaCanonical) return viaCanonical;
      throw ProviderError.notFound("Relation hypothesis not found.");
    }
    throw ProviderError.notFound("Relation hypothesis not found.");
  }

  async listCanonical(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<CanonicalRelationDTO>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: CanonicalRelationsResponse;
    try {
      response = await apiListCanonicalRelations(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return paginateItems(response.relations, query);
  }

  async accept(
    investigationId: string,
    relationHypothesisId: string,
  ): Promise<RelationHypothesis> {
    try {
      await apiAcceptRelationHypothesis(investigationId, relationHypothesisId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    // RE-READ so the returned status reflects the durable platform state.
    const updated = await this.readHypothesis(
      investigationId,
      relationHypothesisId,
    );
    if (!updated) {
      throw ProviderError.server(
        "The accepted relation hypothesis could not be re-read.",
      );
    }
    return updated;
  }

  async reject(
    investigationId: string,
    relationHypothesisId: string,
    _reason?: string,
  ): Promise<RelationHypothesis> {
    try {
      await apiRejectRelationHypothesis(investigationId, relationHypothesisId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    const updated = await this.readHypothesis(
      investigationId,
      relationHypothesisId,
    );
    if (!updated) {
      throw ProviderError.server(
        "The rejected relation hypothesis could not be re-read.",
      );
    }
    return updated;
  }

  async reverse(
    investigationId: string,
    relationHypothesisId: string,
    _reason?: string,
  ): Promise<RelationHypothesis> {
    try {
      await apiReverseRelationHypothesis(investigationId, relationHypothesisId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    const updated = await this.readHypothesis(
      investigationId,
      relationHypothesisId,
    );
    if (!updated) {
      throw ProviderError.server(
        "The reversed relation hypothesis could not be re-read.",
      );
    }
    return updated;
  }
}

class UnsupportedIntelligenceProvider implements IntelligenceProvider {
  listContradictions(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("intelligence.listContradictions");
  }
  listCandidates(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("intelligence.listCandidates");
  }
  getCandidate(): Promise<never> {
    return providerUnsupported("intelligence.getCandidate");
  }
  keepUnresolved(): Promise<never> {
    return providerUnsupported("intelligence.keepUnresolved");
  }
  accept(): Promise<never> {
    return providerUnsupported("intelligence.accept");
  }
  reverse(): Promise<never> {
    return providerUnsupported("intelligence.reverse");
  }
  listDiscovery(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("intelligence.listDiscovery");
  }
  getSource(): Promise<never> {
    return providerUnsupported("intelligence.getSource");
  }
  getArtifact(): Promise<never> {
    return providerUnsupported("intelligence.getArtifact");
  }
  testHypothesis(): Promise<never> {
    return providerUnsupported("intelligence.testHypothesis");
  }
  recordHypothesisDecision(): Promise<never> {
    return providerUnsupported("intelligence.recordHypothesisDecision");
  }
  listHypothesisDecisions(): Promise<never> {
    return providerUnsupported("intelligence.listHypothesisDecisions");
  }
}

class UnsupportedTimelineProvider implements TimelineProvider {
  getTimeline(): Promise<never> {
    return providerUnsupported("timeline.getTimeline");
  }
}

class UnsupportedGapProvider implements GapProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("gaps.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("gaps.get");
  }
  evidenceRequests(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("gaps.evidenceRequests");
  }
}

class UnsupportedReviewProvider implements ReviewProvider {
  listTasks(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("review.listTasks");
  }
}

class UnsupportedRobustnessProvider implements RobustnessProvider {
  getResult(): Promise<never> {
    return providerUnsupported("robustness.getResult");
  }
}

class UnsupportedHypothesisProvider implements HypothesisProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("hypotheses.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("hypotheses.get");
  }
}

/**
 * Live implementation of LeadProvider (Phase 4).
 *
 * The platform lead routes serialize DurableLead rows; this provider projects
 * them into the canonical Lead (see lead-projection.ts). get() reconstructs
 * the single-lead read against THIS workspace's investigation (the canonical
 * Lead covers the envelope's event history implicitly via provenance).
 */
export class LiveLeadProvider implements LeadProvider {
  constructor(private readonly ctx: LeadProjectionContext) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<Lead>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let response: LeadListResponse;
    try {
      response = await apiListLeads(investigationId);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    return paginateItems(
      response.leads.map((dto) => projectLeadFromDto(dto, this.ctx)),
      query,
    );
  }

  async get(id: string): Promise<Lead> {
    let response: LeadDetailResponse;
    try {
      response = await apiGetLead(this.ctx.investigationId, id);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    try {
      return projectLeadFromDto(response.lead, this.ctx);
    } catch (err) {
      throw ProviderError.validation(
        "Live lead projection failed for the requested lead.",
        err,
      );
    }
  }

  async generate(investigationId: string): Promise<GenerateLeadsResult> {
    try {
      const response = await apiGenerateLeads(investigationId);
      return {
        candidatesConsidered: response.candidatesConsidered,
        leadsCreated: response.leadsCreated,
        leadsAlreadyExisted: response.leadsAlreadyExisted,
        skipped: response.skipped,
        reviewTriggered: response.reviewTriggered,
      };
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async attachEvidence(
    investigationId: string,
    leadId: string,
    request: AttachLeadEvidenceRequest,
  ): Promise<LeadEvidenceLink> {
    try {
      const response = await apiAttachLeadEvidence(
        investigationId,
        leadId,
        request,
      );
      return projectLeadEvidenceLinkFromDto(response.link);
    } catch (err) {
      throw toLiveProviderError(err);
    }
  }

  async transitionStatus(
    investigationId: string,
    leadId: string,
    toStatus: LeadStatus,
  ): Promise<Lead> {
    let response: Awaited<ReturnType<typeof apiTransitionLeadStatus>>;
    try {
      response = await apiTransitionLeadStatus(investigationId, leadId, toStatus);
    } catch (err) {
      throw toLiveProviderError(err);
    }
    try {
      return projectLeadFromDto(response.lead, this.ctx);
    } catch (err) {
      throw ProviderError.validation(
        "Live lead projection failed for the transitioned lead.",
        err,
      );
    }
  }
}

/**
 * Live implementation of CrossCaseProvider (Phase 4).
 *
 * listMatches() enumerates the authenticated case catalogue, then reads the
 * read-only shared-entity preview (GET /investigations/:id/cross-case-links)
 * against every OTHER case boundary, all-or-nothing: a failure to read one
 * target case MUST NOT be presented as a complete cross-case surface, so the
 * first typed failure rejects the whole call.
 *
 * listForeignOverlays() has no backend route and stays UNSUPPORTED (never
 * fabricates or reuses demo islands).
 */
export class LiveCrossCaseProvider implements CrossCaseProvider {
  constructor(private readonly identity: WorkspaceIdentity) {}

  async listMatches(
    caseId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<CrossCaseMatch>> {
    if (query?.signal?.aborted) throw ProviderError.cancelled();
    let all: Case[];
    try {
      all = (await apiListCases()).cases;
    } catch (err) {
      throw toLiveProviderError(err);
    }
    const targets = all.filter((c) => c.id !== caseId);
    const perCase = await Promise.all(
      targets.map(async (target) => {
        try {
          const response = await apiListCrossCaseLinks(
            this.identity.investigationId,
            target.id,
          );
          return response.matches;
        } catch (err) {
          throw toLiveProviderError(err);
        }
      }),
    );
    return paginateItems(perCase.flat(), query);
  }

  listForeignOverlays(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("crossCase.listForeignOverlays");
  }
}

/**
 * Build the full per-workspace LIVE provider bundle. No global singleton.
 * The explicit identity is surfaced on the bundle; investigation-scoped calls
 * receive the investigation id from the caller.
 *
 * The identity.caseId is threaded into the investigation provider so live
 * get() can pass the canonical case boundary to the platform (which re-verifies
 * it — the frontend never fabricates case access).
 */
export function createLiveWorkspaceProviders(
  identity: WorkspaceIdentity,
  _config: DataModeConfig,
): WorkspaceProviders {
  const realtime: RealtimeProvider = createLiveRealtimeProvider();
  return {
    workspaceId: identity.workspaceId,
    caseId: identity.caseId,
    investigationId: identity.investigationId,
    mode: "live",
    capabilities: createCapabilityStatusTable(_config, "live"),
    cases: new LiveCaseProvider(),
    investigations: new LiveInvestigationProvider(identity.caseId),
    evidence: new LiveEvidenceProvider(),
    observations: new LiveObservationProvider(),
    entities: new LiveEntityProvider({ investigationId: identity.investigationId }),
    graph: new LiveGraphProvider(identity.caseId),
    timeline: new UnsupportedTimelineProvider(),
    leads: new LiveLeadProvider({ investigationId: identity.investigationId }),
    gaps: new UnsupportedGapProvider(),
    review: new UnsupportedReviewProvider(),
    robustness: new UnsupportedRobustnessProvider(),
    hypotheses: new UnsupportedHypothesisProvider(),
    crossCase: new LiveCrossCaseProvider(identity),
    relations: new LiveRelationProvider(identity.investigationId),
    intelligence: new UnsupportedIntelligenceProvider(),
    realtime,
  };
}