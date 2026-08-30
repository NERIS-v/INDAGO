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
  CrossCaseProvider,
  DataModeConfig,
  ProviderQuery,
  Paginated,
  WorkspaceProviders,
  RealtimeProvider,
  WorkspaceIdentity,
} from "../types";
import { ProviderError } from "../types";
import type {
  Investigation,
  Observation,
  Case,
  EvidenceSubmissionRequest,
  UploadedFileReference,
} from "@indago/contracts";
import type {
  EvidenceSubmissionResponse,
  EvidenceListResponse,
  EvidenceListItem,
  ObservationsResponse,
  CasesResponse,
} from "@/lib/api/types";
import { createLiveRealtimeProvider } from "./realtime";
import { providerUnsupported, providerUnsupportedPaginated } from "./unsupported";
import { toLiveProviderError } from "./errors";
import { projectRunStatusToInvestigation } from "./run-projection";
import {
  getInvestigationStatus,
  startInvestigation as apiStartInvestigation,
  submitEvidence as apiSubmitEvidence,
  listObservations as apiListObservations,
  listEvidence as apiListEvidence,
  listCases as apiListCases,
} from "@/lib/api/server-action";
import { uploadEvidence } from "@/lib/upload/uploadthing";

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
}

class UnsupportedEntityProvider implements EntityProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("entities.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("entities.get");
  }
}

class UnsupportedGraphProvider implements GraphProvider {
  getVersion(): Promise<never> {
    return providerUnsupported("graph.getVersion");
  }
  getNodes(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("graph.getNodes");
  }
  getEdges(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("graph.getEdges");
  }
  getGraphHoles(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("graph.getGraphHoles");
  }
}

class UnsupportedTimelineProvider implements TimelineProvider {
  getTimeline(): Promise<never> {
    return providerUnsupported("timeline.getTimeline");
  }
}

class UnsupportedLeadProvider implements LeadProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("leads.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("leads.get");
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

class UnsupportedCrossCaseProvider implements CrossCaseProvider {
  listMatches(): Promise<Paginated<never>> {
    return providerUnsupportedPaginated("crossCase.listMatches");
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
    cases: new LiveCaseProvider(),
    investigations: new LiveInvestigationProvider(identity.caseId),
    evidence: new LiveEvidenceProvider(),
    observations: new LiveObservationProvider(),
    entities: new UnsupportedEntityProvider(),
    graph: new UnsupportedGraphProvider(),
    timeline: new UnsupportedTimelineProvider(),
    leads: new UnsupportedLeadProvider(),
    gaps: new UnsupportedGapProvider(),
    review: new UnsupportedReviewProvider(),
    robustness: new UnsupportedRobustnessProvider(),
    crossCase: new UnsupportedCrossCaseProvider(),
    realtime,
  };
}