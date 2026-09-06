// ============================================================================
// F-PR2 Provider Architecture — Core Types
//
// Defines the domain-specific provider interfaces, the data-mode resolution,
// the provider error model, and the per-workspace provider bundle.
//
// Design rules (from F-PR2 spec):
//  - "use client" components never import Demo/Live providers, and never
//    branch on DataMode. They consume the WorkspaceProviderBundle through
//    the Workspace context.
//  - Providers return CANONICAL contract-shaped data (from @indago/contracts).
//  - Where no canonical contract exists (timeline/spanning), the shape is
//    documented as a local type rather than invented in the contracts package.
//  - Non-demo cases MUST resolve to LIVE. There is no silent live -> mock
//    fallback. "auto" only applies in development.
//  - Exactly ONE provider bundle per workspace (not a global singleton).
// ============================================================================

import type {
  Case,
  Investigation,
  Observation,
  Entity,
  Lead,
  InvestigativeGap,
  EvidenceRequest,
  ReviewTask,
  GraphVersion,
  GraphNode,
  GraphEdge,
  GraphHole,
  CrossCaseMatch,
  Hypothesis,
  RobustnessResult,
  EvidenceSubmissionRequest,
  UploadedFileReference,
  RelationHypothesis,
  Source,
  Artifact,
  EntityMentionCandidate,
  CandidatePair,
  CandidateResolution,
  EntityHypothesis,
} from "@indago/contracts";
import type { EvidenceSubmissionResponse, EvidenceListItem } from "@/lib/api/types";
import type { SseEvent as ContractSseEvent } from "@/lib/realtime/sse-client";
import type { CapabilityStatusTable } from "./capabilities";
import type {
  HypothesisAssessment,
  HypothesisDecisionInput,
  HypothesisDecisionRecord,
  HypothesisTestInput,
} from "@/lib/intel/reverse-hypothesis/hypothesis-model";

// ============================================================================
// Data Mode
// ============================================================================

export type DataMode = "demo" | "live" | "auto";

/** The effective (non-auto) mode a workspace actually runs with. */
export type AppDataMode = "demo" | "live";

export interface DataModeConfig {
  /** Resolved mode for all investigations. */
  readonly mode: DataMode;
  /** The canonical demo workspace ID used when mode is "demo". */
  readonly demoCaseId: string;
  /** Demo timing multiplier (e.g. latency = baseLatency * DEMO_TIMING_SCALE). */
  readonly demoTimingScale: number;
  /** True only when running in a development environment. */
  readonly isDevelopment: boolean;
}

// ============================================================================
// Provider Error Model
//
// Every provider failure is surfaced as a ProviderError with a stable code,
// category, and message. This feeds the existing ErrorDisplay component.
// Mirrors the canonical ErrorCategorySchema values.
// ============================================================================

export type ProviderErrorCode =
  | "UNSUPPORTED"
  | "NETWORK"
  | "VALIDATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "SERVER"
  | "TIMEOUT"
  | "CANCELLED";

export type ProviderErrorCategory =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "EXTERNAL_SERVICE"
  | "INTERNAL";

const CATEGORY_BY_CODE: Record<ProviderErrorCode, ProviderErrorCategory> = {
  UNSUPPORTED: "EXTERNAL_SERVICE",
  NETWORK: "EXTERNAL_SERVICE",
  VALIDATION: "VALIDATION",
  AUTHORIZATION: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  SERVER: "INTERNAL",
  TIMEOUT: "EXTERNAL_SERVICE",
  CANCELLED: "CONFLICT",
};

export interface ProviderErrorOptions {
  readonly code?: ProviderErrorCode;
  readonly category?: ProviderErrorCategory;
  readonly cause?: unknown;
  readonly retryable?: boolean;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.code = options.code ?? "SERVER";
    this.category =
      options.category ?? CATEGORY_BY_CODE[this.code];
    this.retryable = options.retryable ?? this.code === "NETWORK";
    if (options.cause !== undefined) this.cause = options.cause;
  }

  static unsupported(message = "This operation is not supported in the current data mode."): ProviderError {
    return new ProviderError(message, { code: "UNSUPPORTED" });
  }

  static network(message = "Network error while reaching the data provider.", cause?: unknown): ProviderError {
    return new ProviderError(message, { code: "NETWORK", cause });
  }

  static notFound(message = "The requested resource was not found."): ProviderError {
    return new ProviderError(message, { code: "NOT_FOUND" });
  }

  static validation(message = "The data provider returned an invalid response.", cause?: unknown): ProviderError {
    return new ProviderError(message, { code: "VALIDATION", cause });
  }

  static authorization(message = "The request is not authorized."): ProviderError {
    return new ProviderError(message, { code: "AUTHORIZATION" });
  }

  static timeout(message = "The data provider timed out."): ProviderError {
    return new ProviderError(message, { code: "TIMEOUT", retryable: true });
  }

  static cancelled(message = "The operation was cancelled."): ProviderError {
    return new ProviderError(message, { code: "CANCELLED", retryable: false });
  }

  static server(message = "The data provider returned an unexpected error.", cause?: unknown): ProviderError {
    return new ProviderError(message, { code: "SERVER", cause });
  }
}

/** Any thrown error is normalized to a ProviderError for feeding ErrorDisplay. */
export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  return ProviderError.server(
    err instanceof Error ? err.message : "An unexpected error occurred.",
    err,
  );
}

// ============================================================================
// Timeline / Spanning (documented local types)
//
// NOTE: There is NO canonical Timeline or Spanning schema in @indago/contracts.
// Per F-PR2 scope rules we document this as a dependency rather than invent
// optimistic schema in the contracts package. These local interfaces are the
// frontend's assumption and are marked as such.
// ============================================================================

export interface TimelineBand {
  readonly id: string;
  readonly label: string;
  readonly kind: "observation" | "evidence" | "relationship" | "milestone";
  readonly entityIds?: string[];
  /** Convenience projection; individual items are the source of truth. */
  readonly observations?: TimelineItem[];
}

export interface TimelineItem {
  readonly id: string;
  readonly time: string;
  readonly precision: "exact" | "day" | "month" | "unknown";
  readonly label: string;
  readonly bandId: string;
  readonly observationId?: string;
  readonly evidenceId?: string;
  readonly entityIds?: string[];
}

export interface InvestigationTimeline {
  readonly investigationId: string;
  readonly bands: TimelineBand[];
  /** Sorted ascending by time. */
  readonly items: TimelineItem[];
}

// ============================================================================
// Catalog Page Types (documented local) — thin, read-only view projections
// ============================================================================

export interface Paginated<T> {
  readonly items: T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly hasMore: boolean;
}

export interface ProviderQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly signal?: AbortSignal;
}

// ============================================================================
// Graph Realtime Overlay Catalog (documented local)
//
// Maps realtime events to graph deltas so UI components can render live
// entities/edges/holes without importing demo fixtures. The catalog itself is
// DATA owned by the provider seam (demo returns its choreography catalog; live
// returns {} because the platform does not expose graph deltas yet). UI code
// receives the catalog through GraphProvider.getOverlayCatalog() and never
// imports demo/live files.
// ============================================================================

export interface GraphRealtimeCatalogEntry {
  readonly kind: "node" | "edge" | "hole" | "hole-resolve";
  readonly node?: GraphNode;
  readonly edge?: GraphEdge;
  readonly hole?: GraphHole;
  readonly extraEdges?: readonly GraphEdge[];
  readonly resolvesHoleId?: string;
}

export type GraphRealtimeCatalog = Record<string, GraphRealtimeCatalogEntry>;

/** Deterministic lookup key (action + targetId) for a catalog entry. */
export function catalogKey(action: string, targetId: string): string {
  return `${action}:${targetId}`;
}

// ============================================================================
// Cross-Case Overlay (documented local)
//
// The foreign-island topology the graph UI draws when an analyst opens a
// case boundary. Owned by the CrossCaseProvider seam so UI code never imports
// demo fixtures. `ref` is a stable presentation key (e.g. "cobalt"); `caseId`
// is the canonical foreign case id.
// ============================================================================

export interface ForeignGraphNode {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly isForeign: true;
  readonly structuralImportance: number;
}

export interface ForeignGraphEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly support: number;
  readonly isForeignEdge: true;
}

export interface ForeignCaseOverlay {
  readonly ref: string;
  readonly caseId: string;
  readonly title: string;
  readonly summary: string;
  readonly localTargetMatch: string;
  readonly bridgeSupport: number;
  readonly nodes: readonly ForeignGraphNode[];
  readonly edges: readonly ForeignGraphEdge[];
}

// ============================================================================
// Intelligence domain projections (documented local)
//
//  - ObservationContradiction   a first-class, never-auto-resolved A/∼A pairing
//                               between two observations. Mirrors the canonical
//                               CounterEvidenceSignal taxonomy (contradictionType
//                               + EvidenceStrength) while remaining a local
//                               projection: the canonical signal couples an
//                               observation to a HYPOTHESIS, but an observation↔
//                               observation pair has no hypothesis.
//  - IntelligenceCandidateView  the ER comparison surface the UI renders,
//                               composing canonical CandidatePair +
//                               CandidateResolution + EntityHypothesis.
//  - DiscoveryCandidate         a deterministic structural candidate surfaced
//                               by Discovery Mode, derived only from canonical
//                               graph data (degree / structuralImportance /
//                               cut-edges). NOT a relevance or guilt ranking.
// ============================================================================

export interface ObservationContradiction {
  readonly id: string;
  readonly investigationId: string;
  /** The observation asserting A. */
  readonly leftObservationId: string;
  /** The observation asserting ∼A. */
  readonly rightObservationId: string;
  readonly contradictionType:
    | "DIRECT_REFUTATION"
    | "TEMPORAL_IMPOSSIBILITY"
    | "LOGICAL_INCONSISTENCY"
    | "SOURCE_CREDIBILITY"
    | "INCOMPLETE_INFORMATION";
  readonly strength: number;
  readonly description: string;
  readonly evidenceIds: readonly [string, string];
  readonly detectedAt: { readonly value: string; readonly precision: "exact" };
}

export interface IntelligenceCandidateView {
  readonly resolutionId: string;
  readonly pair: CandidatePair;
  readonly left: EntityMentionCandidate;
  readonly right: EntityMentionCandidate;
  /** Canonical hypothesis lifecycle state (UNRESOLVED → ACCEPTED → REVERSED). */
  readonly hypothesis: EntityHypothesis;
  /** Deterministic engine comparison output. */
  readonly comparison: CandidateResolution;
  /** Canonical entity the RIGHT candidate is currently linked to, if any. The
   *  LEFT candidate may have NO linked entity — that absence IS the ambiguity. */
  readonly leftEntity: Entity | null;
  readonly rightEntity: Entity | null;
}

export interface DiscoveryCandidate {
  readonly id: string;
  readonly nodeId: string;
  readonly entityId: string;
  readonly label: string;
  readonly type: string;
  readonly degree: number;
  readonly structuralImportance: number;
  readonly observationCount: number;
  readonly sourceCount: number;
  readonly contradictedEdgeIds: readonly string[];
  readonly bridgeNote: string | null;
  readonly reasons: readonly string[];
  readonly supportingObservationIds: readonly string[];
}

// ============================================================================
// Realtime domain types (canonical contract SSE is SseEvent; the realtime
// seam adds normalization + deduplication on top of that transport).
// ============================================================================

/** Canonical transport event normalized by the realtime seam. */
export type ProviderEvent = ContractSseEvent;

export type RealtimeStatus = "disconnected" | "connecting" | "connected" | "error";

// ============================================================================
// Provider Interfaces
// ============================================================================

export interface InvestigationProvider {
  get(id: string): Promise<Investigation>;
  listByCase(caseId: string, query?: ProviderQuery): Promise<Paginated<Investigation>>;
  /** Create/start an investigation for a case. Deterministic in demo; maps to
   *  the platform POST /investigations/start in live. */
  start(caseId: string, investigationId: string): Promise<{ runId: string }>;
}

export interface EvidenceProvider {
  /** List evidence for an investigation. Returns the documented local
   *  EvidenceListItem projection — the platform persists a narrower Evidence
   *  row than the canonical EvidenceSchema (no strength / posture / extractor)
   *  and refuses to fabricate those fields. */
  listByInvestigation(investigationId: string, query?: ProviderQuery): Promise<Paginated<EvidenceListItem>>;
  get(id: string): Promise<EvidenceListItem>;
  /** Upload raw File objects into a transport, returning provider-supplied
   *  file references. Keeps UploadThing out of UI components. In demo this is
   *  deterministic and synthesizes references without a network upload. */
  prepareUpload(
    investigationId: string,
    files: File[],
    onProgress?: (progress: number) => void,
  ): Promise<UploadedFileReference[]>;
  /** Submit evidence through the provider boundary (canonical request). */
  submit(
    investigationId: string,
    request: Omit<EvidenceSubmissionRequest, "investigationId">,
    signal?: AbortSignal,
  ): Promise<EvidenceSubmissionResponse>;
}

/** Case-level catalog (e.g. the Case List / dashboard). */
export interface CaseProvider {
  list(query?: ProviderQuery): Promise<Paginated<Case>>;
  get(id: string): Promise<Case>;
  /** Hard-delete a case boundary. Provider implementors decide semantics. */
  remove(id: string): Promise<void>;
}

export interface ObservationProvider {
  listByInvestigation(investigationId: string, query?: ProviderQuery): Promise<Paginated<Observation>>;
  listByEntity(entityId: string, query?: ProviderQuery): Promise<Paginated<Observation>>;
}

export interface EntityProvider {
  listByInvestigation(investigationId: string, query?: ProviderQuery): Promise<Paginated<Entity>>;
  get(id: string): Promise<Entity>;
}

export interface GraphProvider {
  getVersion(investigationId: string): Promise<GraphVersion>;
  getNodes(investigationId: string, query?: ProviderQuery): Promise<Paginated<GraphNode>>;
  getEdges(investigationId: string, query?: ProviderQuery): Promise<Paginated<GraphEdge>>;
  getGraphHoles(investigationId: string, query?: ProviderQuery): Promise<Paginated<GraphHole>>;
  /** Provider-owned realtime overlay catalog (DATA, not UI). Demo returns its
   *  deterministic choreography catalog; live returns {} because the platform
   *  does not expose graph deltas yet (typed unsupported, no fabrication). */
  getOverlayCatalog(): Promise<GraphRealtimeCatalog>;
  /** Optional: enumerate a case's historical graph versions, ascending by
   *  versionNumber. Demo returns its deterministic version series; live is
   *  UNSUPPORTED and must NOT fabricate or reuse demo data. Absent method →
   *  consumers render an honest "historical surface unavailable" state. */
  listVersions?(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<GraphVersion>>;
  /** Optional: resolve a single historical GraphVersion's metadata by id. */
  getVersionById?(
    investigationId: string,
    graphVersionId: string,
  ): Promise<GraphVersion>;
}

export interface RelationProvider {
  listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<RelationHypothesis>>;
  get(id: string): Promise<RelationHypothesis>;
  /** PR-8 relation authority — deliberate analyst mutations of a relation
   *  hypothesis, mirroring the platform's relation-hypothesis accept/reject/
   *  reverse routes. OPTIONAL: an absent method means "authority unavailable on
   *  this provider seam" and consumers render an honest unavailable state. */
  accept?(
    investigationId: string,
    relationHypothesisId: string,
  ): Promise<RelationHypothesis>;
  reject?(
    investigationId: string,
    relationHypothesisId: string,
    reason?: string,
  ): Promise<RelationHypothesis>;
  reverse?(
    investigationId: string,
    relationHypothesisId: string,
    reason?: string,
  ): Promise<RelationHypothesis>;
}

export interface IntelligenceProvider {
  /** All first-class A/∼A observation contradictions for an investigation. */
  listContradictions(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<ObservationContradiction>>;
  /** ER comparison candidates (default demo: the OBS_8 identity ambiguity). */
  listCandidates(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<IntelligenceCandidateView>>;
  getCandidate(investigationId: string, resolutionId: string): Promise<IntelligenceCandidateView>;
  /** Deliberate analyst decision: record "keep unresolved". Never auto-resolves. */
  keepUnresolved(investigationId: string, resolutionId: string): Promise<IntelligenceCandidateView>;
  /** Deliberate analyst decision: accept the identity match. Records the decision
   *  only — no canonical entity merge, no silent graph rewire. */
  accept(investigationId: string, resolutionId: string): Promise<IntelligenceCandidateView>;
  /** Deliberate analyst decision: reverse a prior resolution. REVERSED ≠ delete —
   *  the hypothesis keeps its audit history. */
  reverse(investigationId: string, resolutionId: string): Promise<IntelligenceCandidateView>;
  /** Deterministic Discovery Mode candidates (structural, NOT relevance). */
  listDiscovery(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<DiscoveryCandidate>>;
  getSource(id: string): Promise<Source>;
  getArtifact(id: string): Promise<Artifact>;
  /** F-PR9 Reverse Hypothesis — run an investigator-written hypothesis through
   *  the deterministic reverse-test model. The provider interprets and
   *  classifies against saved observations; the assessment carries the full
   *  three-way result (SUPPORTING / CONTRADICTING / UNRESOLVED), the
   *  generated inverse conditions, and a provenance trail. NEVER returns a
   *  truth/confidence verdict — absence of evidence is never contradiction.
   *  Demo is deterministic; live is typed-unsupported (no platform endpoint). */
  testHypothesis(
    investigationId: string,
    input: HypothesisTestInput,
  ): Promise<HypothesisAssessment>;
  /** F-PR9 — record a deliberate analyst decision against a tested hypothesis.
   *  Session/workspace-scoped only; never mutates canonical evidence. Demo
   *  persists in the workspace state; live is typed-unsupported. Returns the
   *  current session decision trail. */
  recordHypothesisDecision(
    investigationId: string,
    input: HypothesisDecisionInput,
  ): Promise<readonly HypothesisDecisionRecord[]>;
  /** F-PR9 — read the session decision trail for an investigation. */
  listHypothesisDecisions(
    investigationId: string,
  ): Promise<readonly HypothesisDecisionRecord[]>;
}

export interface TimelineProvider {
  getTimeline(investigationId: string): Promise<InvestigationTimeline>;
}

export interface LeadProvider {
  listByInvestigation(investigationId: string, query?: ProviderQuery): Promise<Paginated<Lead>>;
  get(id: string): Promise<Lead>;
}

export interface GapProvider {
  listByInvestigation(investigationId: string, query?: ProviderQuery): Promise<Paginated<InvestigativeGap>>;
  get(id: string): Promise<InvestigativeGap>;
  evidenceRequests(investigationId: string, query?: ProviderQuery): Promise<Paginated<EvidenceRequest>>;
}

export interface ReviewProvider {
  listTasks(investigationId: string, query?: ProviderQuery): Promise<Paginated<ReviewTask>>;
}

export interface RobustnessProvider {
  getResult(investigationId: string, hypothesisId: string): Promise<RobustnessResult>;
}

/** Working-hypothesis seam. The canonical Hypothesis model (contracts) is the
 *  single hypothesis shape — the provider only EXPOSES existing hypotheses, it
 *  never derives new ones. Demo returns its deterministic seeded hypotheses;
 *  live is UNSUPPORTED (no platform hypothesis endpoint yet) and must not
 *  fabricate or reuse demo data. */
export interface HypothesisProvider {
  listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<Hypothesis>>;
  get(id: string): Promise<Hypothesis>;
}

export interface CrossCaseProvider {
  listMatches(caseId: string, query?: ProviderQuery): Promise<Paginated<CrossCaseMatch>>;
  /** Case-boundary overlays for the graph UI (foreign islands). Provider-owned
   *  DATA: demo returns its deterministic cobalt/crimson islands keyed by ref;
   *  live is UNSUPPORTED (no backend route) and must NOT fabricate or reuse
   *  demo data. UI consumes this seam — it never imports cross-case fixtures. */
  listForeignOverlays(caseId: string, query?: ProviderQuery): Promise<Paginated<ForeignCaseOverlay>>;
}

export interface RealtimeProvider {
  /** Open the stream for the given investigation. */
  connect(investigationId: string): void;
  /** Register a listener; returns an unsubscribe function. */
  subscribe(listener: (event: ProviderEvent) => void): () => void;
  /** Close the stream. */
  disconnect(): void;
  /** Current connection status. */
  getStatus(): RealtimeStatus;
  /** Fire a named on-demand choreography (demo only). */
  triggerSequence?(key: string): void;
}

// ============================================================================
// Workspace Identity
//
// Three distinct identity concepts are intentionally separate and MUST NOT be
// conflated:
//
//  - caseId          the case identity; used ONLY for DataMode resolution.
//  - investigationId the investigation identity; used by
//                    investigations.get(), listByInvestigation(), and
//                    realtime.connect().
//  - workspaceId     the frontend workspace identity; identifies the provider
//                    bundle instance. Not synonymous with caseId or
//                    investigationId.
//
// For the deterministic demo case CASE_ID and INVESTIGATION_ID are different
// UUIDs, and the factory preserves that separation throughout.
// ============================================================================

export interface WorkspaceIdentity {
  readonly workspaceId: string;
  readonly caseId: string;
  readonly investigationId: string;
}

// ============================================================================
// Workspace Provider Bundle
//
// A single coherent set of providers scoped to one workspace. Created by the
// factory per workspace — never a global singleton. The bundle exposes the
// abstract provider interfaces only; UI never imports Demo/Live concrete
// implementations.
// ============================================================================

export interface WorkspaceProviders extends WorkspaceIdentity {
  readonly mode: Exclude<DataMode, "auto">;
  /** Declared capability status for THIS workspace in THIS effective mode
   *  (lib/providers/capabilities). UI/nav/representation seams read this
   *  instead of importing Demo/Live implementations or branching on provider
   *  behavior. A capability reported "not-ready" cannot be silently demo-served:
   *  calls fail typed. */
  readonly capabilities: CapabilityStatusTable;
  readonly cases: CaseProvider;
  readonly investigations: InvestigationProvider;
  readonly evidence: EvidenceProvider;
  readonly observations: ObservationProvider;
  readonly entities: EntityProvider;
  readonly graph: GraphProvider;
  readonly relations: RelationProvider;
  readonly intelligence: IntelligenceProvider;
  readonly timeline: TimelineProvider;
  readonly leads: LeadProvider;
  readonly gaps: GapProvider;
  readonly review: ReviewProvider;
  readonly robustness: RobustnessProvider;
  readonly hypotheses: HypothesisProvider;
  readonly crossCase: CrossCaseProvider;
  readonly realtime: RealtimeProvider;
}
