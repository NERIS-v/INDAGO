// ============================================================================
// F-PR2 Demo Providers
//
// Canonical-shaped, deterministic implementations backed by the per-workspace
// in-memory store. They simulate latency (scaled by DEMO_TIMING_SCALE), respect
// AbortSignal, and surface failures as ProviderError. They are constructed by
// the factory per workspace and are deliberately NOT imported by UI components.
// ============================================================================

import type {
  CaseProvider,
  InvestigationProvider,
  EvidenceProvider,
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
  WorkspaceIdentity,
  GraphRealtimeCatalog,
} from "../types";
import { ProviderError } from "../types";
import type {
  Case,
  Evidence,
  EvidenceSubmissionRequest,
  UploadedFileReference,
  Source,
  Artifact,
  Entity,
} from "@indago/contracts";
import type { EvidenceSubmissionResponse, EvidenceListItem } from "@/lib/api/types";
import { createCapabilityStatusTable } from "../capabilities";
import { createDemoWorkspaceState, logDemoEvent } from "./state";
import type { DemoWorkspaceState } from "./state";
import { createDemoRealtimeProvider } from "./realtime";
import { baseLatency, heavyLatency, deterministicSleep } from "./latency";
import { demoFixtures } from "./demo-fixtures";
import { uploadDemoCatalog } from "./demo-fixtures/upload-demo-sequence";
import { MOCK_FOREIGN_CASES, FOREIGN_ENTITIES_DB } from "./demo-fixtures/cross-case";
import { ENTITY_LINK_BY_CANDIDATE } from "./demo-fixtures/entity-resolution";
import { createdNow } from "./demo-fixtures/times";
import type {
  IntelligenceCandidateView,
  ObservationContradiction,
  DiscoveryCandidate,
  ForeignCaseOverlay,
  ForeignGraphNode,
  ForeignGraphEdge,
} from "../types";
import {
  addDemoSessionEvidence,
  listDemoSessionEvidence,
} from "./session";
import {
  deterministicUuid,
  demoSubmissionIds,
  buildDemoEvidence,
} from "./submit";

function paginate<T>(
  items: T[],
  query: ProviderQuery | undefined,
): Paginated<T> {
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

function resolveSignal(query?: ProviderQuery): AbortSignal | undefined {
  return query?.signal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw ProviderError.cancelled();
}

/** PR-1 T4: global ascending timeline sort (stable; unknown precision last). */
function compareTimelineAscending(
  a: import("../types").TimelineItem,
  b: import("../types").TimelineItem,
): number {
  const ta = new Date(a.time).getTime();
  const tb = new Date(b.time).getTime();
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

export class DemoCaseProvider implements CaseProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async list(query?: ProviderQuery): Promise<Paginated<Case>> {
    await deterministicSleep(heavyLatency(this.config), query?.signal);
    throwIfAborted(query?.signal);
    return paginate(this.state.case ? [this.state.case] : [], query);
  }

  async get(id: string): Promise<Case> {
    await deterministicSleep(baseLatency(this.config));
    if (!this.state.case || id !== this.state.case.id) {
      throw ProviderError.notFound();
    }
    return this.state.case;
  }

  async remove(id: string): Promise<void> {
    await deterministicSleep(baseLatency(this.config));
    if (!this.state.case || id !== this.state.case.id) {
      throw ProviderError.notFound();
    }
    // The demo list-case store owns exactly one case boundary; removing it
    // empties the catalogue (honest: no fabricated replacement case).
    this.state.case = null;
  }
}

export class DemoInvestigationProvider implements InvestigationProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async get(id: string): Promise<import("@indago/contracts").Investigation> {
    await deterministicSleep(baseLatency(this.config));
    if (id !== this.state.investigation.id) throw ProviderError.notFound();
    return this.state.investigation;
  }

  async listByCase(
    caseId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Investigation>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (!this.state.case || caseId !== this.state.case.id) {
      return { items: [], page: 1, pageSize: 20, totalItems: 0, hasMore: false };
    }
    return paginate([this.state.investigation], query);
  }

  async start(
    _caseId: string,
    investigationId: string,
  ): Promise<{ runId: string }> {
    // Demo: creating an investigation is deterministic and does NOT touch the
    // platform's auto-pipeline (documented F-PR3 dependency). The deterministic
    // demo investigation already exists; we just return a stable run identity.
    await deterministicSleep(baseLatency(this.config));
    return { runId: deterministicUuid(`run:${investigationId}`) };
  }
}

export class DemoEvidenceProvider implements EvidenceProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<EvidenceListItem>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    const fixtureEvidence = [...this.state.evidenceById.values()];
    const submitted = listDemoSessionEvidence(investigationId);
    return paginate(
      [...fixtureEvidence, ...submitted].map((e) => this.toListItem(e)),
      query,
    );
  }

  async get(id: string): Promise<EvidenceListItem> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.evidenceById.get(id);
    if (it) return this.toListItem(it);
    const submitted = listDemoSessionEvidence(this.state.investigation.id).find(
      (e) => e.id === id,
    );
    if (submitted) return this.toListItem(submitted);
    throw ProviderError.notFound();
  }

  private toListItem(evidence: Evidence): EvidenceListItem {
    return {
      id: evidence.id,
      caseId: evidence.caseId,
      investigationId: evidence.investigationId ?? this.state.investigation.id,
      type: evidence.type,
      title: evidence.title,
      description: evidence.description ?? null,
      status: evidence.status,
      sourceRef: evidence.provenance.sourceId,
      observedAt: evidence.observedAt ?? null,
      observationCount: evidence.observationIds.length,
      artifactIds: evidence.artifactIds,
      strength: evidence.strength,
      createdAt: evidence.createdAt.value,
    };
  }

  async prepareUpload(
    investigationId: string,
    files: File[],
    onProgress?: (progress: number) => void,
  ): Promise<UploadedFileReference[]> {
    if (files.length === 0) {
      throw ProviderError.validation("No files were selected to upload.");
    }
    // Deterministic simulated upload: two scaled steps, no randomness.
    onProgress?.(10);
    await deterministicSleep(baseLatency(this.config));
    onProgress?.(50);
    await deterministicSleep(baseLatency(this.config));
    onProgress?.(100);
    return files.map((f) => {
      const fileKey = deterministicUuid(
        `file:${investigationId}:${f.name}:${f.size}`,
      );
      return {
        fileKey: `demo:${fileKey}`,
        fileUrl: `demo://${fileKey}`,
        fileName: f.name,
        fileSize: f.size,
        mimeType: f.type || undefined,
      };
    });
  }

  async submit(
    investigationId: string,
    request: Omit<EvidenceSubmissionRequest, "investigationId">,
    signal?: AbortSignal,
  ): Promise<EvidenceSubmissionResponse> {
    await deterministicSleep(heavyLatency(this.config), signal);
    throwIfAborted(signal);
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    if (!request.files || request.files.length === 0) {
      throw ProviderError.validation("At least one file is required.");
    }

    const full: EvidenceSubmissionRequest = { ...request, investigationId };
    if (!this.state.case) {
      throw ProviderError.validation("Cannot submit evidence: no case is open.");
    }
    const ids = demoSubmissionIds(
      investigationId,
      full.files,
      full.sourceName,
    );
    const evidence = buildDemoEvidence(
      full,
      this.state.case.id,
      ids.sourceId,
      ids.evidenceId,
      ids.artifactIds,
    );

    // Deterministic demo state transition (session-scoped). The immutable
    // fixture constants are never mutated.
    addDemoSessionEvidence(investigationId, evidence);
    logDemoEvent(this.state, {
      id: deterministicUuid(`event:${investigationId}:${ids.operationId}`),
      investigationId,
      action: "evidence.uploaded",
      actor: "analyst",
      targetType: "EVIDENCE",
      targetId: ids.evidenceId,
      description: `Evidence submitted: ${full.evidenceTitle} (${full.files.length} file(s))`,
      timestamp: "2024-07-01T12:00:00.000Z",
    });

    return {
      message: "Evidence submission accepted",
      operationId: ids.operationId,
      correlationId: ids.correlationId,
      jobsEnqueued: full.files.length,
      fileCount: full.files.length,
    };
  }
}

export class DemoObservationProvider implements ObservationProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Observation>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([...this.state.observationById.values()], query);
  }

  async listByEntity(
    entityId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Observation>> {
    await deterministicSleep(baseLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    const entity = this.state.entityById.get(entityId);
    if (!entity) throw ProviderError.notFound();
    const all = [...this.state.observationById.values()];
    return paginate(
      all.filter((o) => o.entityIds.includes(entityId)),
      query,
    );
  }
}

export class DemoEntityProvider implements EntityProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Entity>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([...this.state.entityById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").Entity> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.entityById.get(id);
    if (it) return it;
    // Foreign-island entities (cross-case boundary) are canonical Entity-shaped
    // records owned by the cross-case fixture. The UI resolves them through this
    // provider seam so it never imports the foreign DB directly.
    const foreign = FOREIGN_ENTITIES_DB[id];
    if (foreign) {
      return {
        ...(foreign as Entity),
        observationIds: foreign.observationIds ?? [],
        evidenceIds: foreign.evidenceIds ?? [],
        hypothesisIds: foreign.hypothesisIds ?? [],
        roleHypothesisIds: foreign.roleHypothesisIds ?? [],
      };
    }
    throw ProviderError.notFound();
  }
}

export class DemoGraphProvider implements GraphProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async getVersion(investigationId: string): Promise<import("@indago/contracts").GraphVersion> {
    await deterministicSleep(baseLatency(this.config));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return demoFixtures.graphVersion;
  }

  async getNodes(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").GraphNode>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.graphNodeById.values()], query);
  }

  async getEdges(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").GraphEdge>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.graphEdgeById.values()], query);
  }

  async getGraphHoles(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").GraphHole>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([], query);
  }

  async getOverlayCatalog(): Promise<GraphRealtimeCatalog> {
    return uploadDemoCatalog;
  }
}

export class DemoTimelineProvider implements TimelineProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async getTimeline(
    investigationId: string,
  ): Promise<import("../types").InvestigationTimeline> {
    await deterministicSleep(baseLatency(this.config));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    // PR-1 T4: the InvestigationTimeline contract declares a single global
    // ascending sort. The fixture is grouped by band (ascending within each
    // band); the provider normalizes to the documented contract so consumers
    // never see a band-grouped order. Stable for equal timestamps; unknown
    // precision is pushed last. Engine clients are order-independent.
    return {
      ...this.state.timeline,
      items: [...this.state.timeline.items].sort(compareTimelineAscending),
    };
  }
}

export class DemoLeadProvider implements LeadProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Lead>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.leadById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").Lead> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.leadById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }
}

export class DemoGapProvider implements GapProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").InvestigativeGap>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.gapById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").InvestigativeGap> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.gapById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }

  async evidenceRequests(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").EvidenceRequest>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.evidenceRequestById.values()], query);
  }
}

export class DemoReviewProvider implements ReviewProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listTasks(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").ReviewTask>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.reviewTaskById.values()], query);
  }
}

export class DemoRobustnessProvider implements RobustnessProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async getResult(
    investigationId: string,
    hypothesisId: string,
  ): Promise<import("@indago/contracts").RobustnessResult> {
    await deterministicSleep(heavyLatency(this.config));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    if (demoFixtures.robustness.hypothesisId !== hypothesisId) {
      throw ProviderError.notFound("No robustness result for this hypothesis.");
    }
    return demoFixtures.robustness;
  }
}

export class DemoHypothesisProvider implements HypothesisProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Hypothesis>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.hypothesisById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").Hypothesis> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.hypothesisById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }
}

export class DemoCrossCaseProvider implements CrossCaseProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listMatches(
    caseId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").CrossCaseMatch>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (!this.state.case || caseId !== this.state.case.id) {
      return { items: [], page: 1, pageSize: 20, totalItems: 0, hasMore: false };
    }
    return paginate(demoFixtures.crossCase, query);
  }

  /** PR-1 T2: the foreign-island overlays the graph UI draws. Demo serves its
   *  deterministic cobalt/crimson islands through this seam (keyed by ref); the
   *  UI no longer imports them from the fixture module. */
  async listForeignOverlays(
    caseId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<ForeignCaseOverlay>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (!this.state.case || caseId !== this.state.case.id) {
      return { items: [], page: 1, pageSize: 20, totalItems: 0, hasMore: false };
    }
    const overlays: ForeignCaseOverlay[] = Object.entries(MOCK_FOREIGN_CASES).map(([ref, m]) => ({
      ref,
      caseId: m.id,
      title: m.title,
      summary: m.summary,
      localTargetMatch: m.localTargetMatch,
      bridgeSupport: m.bridgeSupport,
      nodes: m.nodes as ForeignGraphNode[],
      edges: m.edges as ForeignGraphEdge[],
    }));
    return paginate(overlays, query);
  }
}

export class DemoRelationProvider implements RelationProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  /** List relation hypotheses for an investigation (default demo: REL_1..REL_6). */
  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").RelationHypothesis>> {
    await deterministicSleep(baseLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([...this.state.relationById.values()], query);
  }
  /** Single relation hypothesis lookup. */
  async get(id: string): Promise<import("@indago/contracts").RelationHypothesis> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.relationById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }
}

export class DemoIntelligenceProvider implements IntelligenceProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  private assertInvestigation(investigationId: string): void {
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
  }

  /** Compose the ER comparison surface from the mutable ER store. The LEFT
   *  candidate intentionally has NO linked canonical entity — that absence IS
   *  the ambiguity. */
  private buildCandidate(resolutionId: string): IntelligenceCandidateView | null {
    const hypothesis = this.state.entityHypothesisById.get(resolutionId);
    if (!hypothesis?.candidatePairId) return null;
    const pair = this.state.candidatePairById.get(hypothesis.candidatePairId);
    if (!pair) return null;
    const comparison = this.state.candidateResolutionById.get(pair.id);
    const left = this.state.candidateById.get(pair.leftCandidateId);
    const right = this.state.candidateById.get(pair.rightCandidateId);
    if (!comparison || !left || !right) return null;
    const leftEntityId = ENTITY_LINK_BY_CANDIDATE[left.id];
    const rightEntityId = ENTITY_LINK_BY_CANDIDATE[right.id];
    return {
      resolutionId: hypothesis.id,
      pair,
      left,
      right,
      hypothesis,
      comparison,
      leftEntity: leftEntityId ? this.state.entityById.get(leftEntityId) ?? null : null,
      rightEntity: rightEntityId ? this.state.entityById.get(rightEntityId) ?? null : null,
    };
  }

  async listCandidates(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<IntelligenceCandidateView>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    this.assertInvestigation(investigationId);
    const views = [...this.state.entityHypothesisById.values()]
      .map((h) => this.buildCandidate(h.id))
      .filter((v): v is IntelligenceCandidateView => v !== null);
    return paginate(views, query);
  }

  async listContradictions(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<ObservationContradiction>> {
    await deterministicSleep(baseLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    this.assertInvestigation(investigationId);
    return paginate([...this.state.contradictions], query);
  }

  async getCandidate(
    investigationId: string,
    resolutionId: string,
  ): Promise<IntelligenceCandidateView> {
    await deterministicSleep(baseLatency(this.config));
    this.assertInvestigation(investigationId);
    const view = this.buildCandidate(resolutionId);
    if (!view) throw ProviderError.notFound();
    return view;
  }

  /** Deliberate analyst decision — records "keep unresolved". Never auto-resolves. */
  async keepUnresolved(
    investigationId: string,
    resolutionId: string,
  ): Promise<IntelligenceCandidateView> {
    await deterministicSleep(baseLatency(this.config));
    this.assertInvestigation(investigationId);
    const view = this.assertView(resolutionId);
    const now = createdNow();
    this.state.entityHypothesisById.set(view.hypothesis.id, {
      ...view.hypothesis,
      status: "UNRESOLVED",
      comparisonStatus: "COMPARED_AND_UNRESOLVED",
      updatedAt: now,
    });
    this.state.candidateResolutionById.set(view.comparison.candidatePairId, {
      ...view.comparison,
      status: "UNRESOLVED",
      comparisonStatus: "COMPARED_AND_UNRESOLVED",
    });
    this.state.erAuditById.set(resolutionId, { action: "keep-unresolved", by: "analyst", at: now });
    return this.requireView(resolutionId);
  }

  /** Deliberate analyst decision — accepts the identity match. Records the
   *  decision only: no canonical merge, no silent graph rewire. */
  async accept(
    investigationId: string,
    resolutionId: string,
  ): Promise<IntelligenceCandidateView> {
    await deterministicSleep(baseLatency(this.config));
    this.assertInvestigation(investigationId);
    const view = this.assertView(resolutionId);
    const now = createdNow();
    this.state.entityHypothesisById.set(view.hypothesis.id, {
      ...view.hypothesis,
      status: "ACCEPTED",
      comparisonStatus: "RESOLVED_MATCH",
      updatedAt: now,
    });
    this.state.candidateResolutionById.set(view.comparison.candidatePairId, {
      ...view.comparison,
      status: "ACCEPTED",
      comparisonStatus: "RESOLVED_MATCH",
    });
    this.state.erAuditById.set(resolutionId, { action: "accept", by: "analyst", at: now });
    return this.requireView(resolutionId);
  }

  /** Deliberate analyst decision — reverses a prior resolution. REVERSED keeps
   *  the hypothesis and its audit history (reversal never deletes). */
  async reverse(
    investigationId: string,
    resolutionId: string,
  ): Promise<IntelligenceCandidateView> {
    await deterministicSleep(baseLatency(this.config));
    this.assertInvestigation(investigationId);
    const view = this.assertView(resolutionId);
    if (view.hypothesis.status !== "ACCEPTED" && view.hypothesis.status !== "REJECTED") {
      throw ProviderError.validation(
        "Only a resolved hypothesis (ACCEPTED or REJECTED) can be reversed.",
      );
    }
    const now = createdNow();
    this.state.entityHypothesisById.set(view.hypothesis.id, {
      ...view.hypothesis,
      status: "REVERSED",
      comparisonStatus: "COMPARED_AND_UNRESOLVED",
      updatedAt: now,
    });
    this.state.candidateResolutionById.set(view.comparison.candidatePairId, {
      ...view.comparison,
      status: "REVERSED",
      comparisonStatus: "COMPARED_AND_UNRESOLVED",
    });
    this.state.erAuditById.set(resolutionId, { action: "reverse", by: "analyst", at: now });
    return this.requireView(resolutionId);
  }

  /** Deterministic Discovery Mode candidates (structural, NOT relevance). */
  async listDiscovery(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<DiscoveryCandidate>> {
    await deterministicSleep(baseLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    this.assertInvestigation(investigationId);
    return paginate(demoFixtures.discoveryCandidates, query);
  }

  async getSource(id: string): Promise<Source> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.sourceById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }

  async getArtifact(id: string): Promise<Artifact> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.artifactById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }

  private assertView(resolutionId: string): IntelligenceCandidateView {
    const view = this.buildCandidate(resolutionId);
    if (!view) throw ProviderError.notFound();
    return view;
  }

  private requireView(resolutionId: string): IntelligenceCandidateView {
    const view = this.buildCandidate(resolutionId);
    if (!view) throw ProviderError.server("ER candidate store corrupted.");
    return view;
  }
}

/**
 * Build the full per-workspace demo provider bundle.
 * Creates its own in-memory state and realtime provider, so each bundle is
 * isolated (never a global singleton). Validates fixtures at construction.
 *
 * The identity is explicit: identity.workspaceId keys this bundle's state,
 * identity.caseId / identity.investigationId are surfaced on the bundle (and
 * for the deterministic case equal the fixture CASE_ID / INVESTIGATION_ID).
 */
export function createWorkspaceDemoProviders(
  identity: WorkspaceIdentity,
  config: DataModeConfig,
): WorkspaceProviders {
  const state = createDemoWorkspaceState(identity.workspaceId);
  const realtime = createDemoRealtimeProvider(state, config);
  const cases = new DemoCaseProvider(state, config);
  const investigations = new DemoInvestigationProvider(state, config);
  const evidence = new DemoEvidenceProvider(state, config);
  const observations = new DemoObservationProvider(state, config);
  const entities = new DemoEntityProvider(state, config);
  const graph = new DemoGraphProvider(state, config);
  const timeline = new DemoTimelineProvider(state, config);
  const leads = new DemoLeadProvider(state, config);
  const gaps = new DemoGapProvider(state, config);
  const review = new DemoReviewProvider(state, config);
  const robustness = new DemoRobustnessProvider(state, config);
  const hypotheses = new DemoHypothesisProvider(state, config);
  const crossCase = new DemoCrossCaseProvider(state, config);
  const relations = new DemoRelationProvider(state, config);
  const intelligence = new DemoIntelligenceProvider(state, config);

  return {
    workspaceId: identity.workspaceId,
    caseId: identity.caseId,
    investigationId: identity.investigationId,
    mode: "demo",
    capabilities: createCapabilityStatusTable(config, "demo"),
    cases,
    investigations,
    evidence,
    observations,
    entities,
    graph,
    timeline,
    leads,
    gaps,
    review,
    robustness,
    hypotheses,
    crossCase,
    relations,
    intelligence,
    realtime,
  };
}
