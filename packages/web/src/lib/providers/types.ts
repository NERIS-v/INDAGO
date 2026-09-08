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
  Evidence,
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
  AssessmentStatus,
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
// Phase-1 intelligence projections (documented local, PASS 2)
//
// OPTIONAL, read-only projections a demo/real-case workspace may attach to its
// provider bundle. Live/OFS workspaces simply omit them. Every score is an
// investigative-relevance estimate produced by the deterministic Phase-1
// derivation — never a probability of guilt or truth.
// ============================================================================

export interface Phase1Alternative {
  readonly key: string;
  readonly label: string;
  readonly statement: string;
  readonly basisObservationIds: readonly string[];
}

export interface BridgeCandidateRanking {
  readonly candidateId: string;
  readonly entityId: string;
  readonly label: string;
  readonly roleLabel?: string;
  readonly temporalCompatibility: boolean;
  readonly score: number;
  readonly rank: number;
  readonly status: "CANDIDATE" | "SELECTED" | "REJECTED";
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly alternativeExplanation: string;
  readonly scoreLabel: "DERIVED_BY_DEMO_LOGIC";
}

export interface CrossCaseSignal {
  readonly analysisId: string;
  readonly sourceCaseId: string;
  readonly targetCaseId: string;
  readonly startedAt: { readonly value: string; readonly precision: "exact" };
  readonly signal: string;
  readonly rationale: string;
  readonly supportingEntityIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly candidateRanking: readonly BridgeCandidateRanking[];
  readonly scoreLabel: "DERIVED_BY_DEMO_LOGIC";
}

export interface PredictionFreeze {
  readonly id: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly frozenAt: { readonly value: string; readonly precision: "exact" };
  readonly runId: string;
  readonly stage: "PHASE_1_PREDICTION_FREEZE";
  readonly rankedLead: {
    readonly rank: number;
    readonly candidateScore: number;
    readonly roleLabel: string;
    readonly entityId: string;
    readonly entityLabel: string;
    readonly leadId: string;
    readonly selectedBy: readonly string[];
  };
  readonly hypothesisId?: string;
  readonly graphHoleId?: string;
  readonly evidenceRequestId?: string;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly alternatives: readonly Phase1Alternative[];
  readonly candidateRanking: readonly BridgeCandidateRanking[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly fingerprint: string;
  readonly scoreLabel: "DERIVED_BY_DEMO_LOGIC";
}

// ============================================================================
// PASS 3 — Live Breakthrough Ingestion projections (documented local)
//
// OPTIONAL, read-only projections describing a deterministic live-ingest run of
// the fenced Exhibit-719 material (WORLD JAI ALAI PURCHASE REPORT (May 11,
// 1981)) into the enriched Case-B workspace. Attached to the provider bundle
// ONLY on workspaces that carry the breakthrough; absent everywhere else (never
// fabricated). Scores remain DERIVED_BY_DEMO_LOGIC investigative-relevance
// estimates — never guilt statements.
// ============================================================================

/** Status of a graph-hole reassessment after partial/full resolution. */
export type GraphHoleResolutionStatus = "PARTIALLY_RESOLVED" | "RESOLVED";

/** One graph-hole reassessment inside a Phase1PostFreezeDelta. */
export interface Phase1GraphHoleResolution {
  readonly graphHoleId: string;
  readonly status: GraphHoleResolutionStatus;
  readonly derivedFromEvidenceIds: readonly string[];
}

/** One gap status transition inside a Phase1PostFreezeDelta. */
export interface Phase1GapStatusChange {
  readonly gapId: string;
  readonly from: string;
  readonly to: string;
}

/** Post-freeze comparison delta produced by an Exhibit-719 breakthrough run. */
export interface Phase1PostFreezeDelta {
  readonly caseId: string;
  readonly investigationId: string;
  readonly appliedAt: { readonly value: string; readonly precision: "exact" };
  readonly evidenceIngestedIds: readonly string[];
  readonly observationExtractedIds: readonly string[];
  readonly entityResolvedIds: readonly string[];
  readonly relationCreatedIds: readonly string[];
  readonly graphEdgesAdded: readonly string[];
  readonly graphHolesResolved: readonly Phase1GraphHoleResolution[];
  readonly hypothesisRefinement: string | null;
  readonly evidenceRequestIdsCompleted: readonly string[];
  readonly gapStatusChanges: readonly Phase1GapStatusChange[];
  readonly freezeFingerprintBefore: string;
  readonly freezeFingerprintAfter: string;
  readonly leakSafeClass: string;
}

/** Deterministic record of one Exhibit-719 breakthrough ingestion run. */
export interface BreakthroughRecord {
  readonly determinismLabel: string;
  readonly ingestedAt: { readonly value: string; readonly precision: "exact" };
  readonly evidenceId: string;
  readonly evidenceClass: string;
  readonly evidenceStatus: string;
  readonly extractedObservationIds: readonly string[];
  readonly resolvedEntityIds: readonly string[];
  readonly relationId: string;
  readonly edgeId: string;
  readonly hypothesisId: string;
  readonly gapId: string;
  readonly gapStatus: string;
  readonly evidenceRequestId: string;
  readonly evidenceRequestStatus: string;
  readonly freezeFingerprintBefore: string;
  readonly freezeFingerprintAfter: string;
  readonly summary: string;
}

/** One reassessed InvestigativeGap carried by a BreakthroughStatePatch. */
export interface BreakthroughGapReassessment {
  readonly id: string;
  readonly record: InvestigativeGap;
}

/** One completed EvidenceRequest carried by a BreakthroughStatePatch. */
export interface BreakthroughEvidenceRequestCompletion {
  readonly id: string;
  readonly record: EvidenceRequest;
}

/** Patch of canonical records a breakthrough run inserts or reassesses. */
export interface BreakthroughStatePatch {
  readonly sources: readonly Source[];
  readonly artifacts: readonly Artifact[];
  readonly evidence: readonly Evidence[];
  readonly observations: readonly Observation[];
  readonly relations: readonly RelationHypothesis[];
  readonly graphEdges: readonly GraphEdge[];
  readonly hypotheses: readonly Hypothesis[];
  readonly gapReassessments: readonly BreakthroughGapReassessment[];
  readonly evidenceRequestCompletions: readonly BreakthroughEvidenceRequestCompletion[];
}

/** Everything a breakthrough run produces (patch + projections + delta). */
export interface BreakthroughRunResult {
  readonly patch: BreakthroughStatePatch;
  readonly record: BreakthroughRecord;
  readonly delta: Phase1PostFreezeDelta;
}

// ============================================================================
// PASS 4 — Phase 2 Motive / Causal-Hypothesis projections (documented local)
//
// OPTIONAL, read-only projections describing the Phase-2 causal-hypothesis
// investigation ("why was Roger Wheeler killed?") in the enriched Case-B
// workspace: three canonical competing hypotheses (H1/H2/H3, §17 exact
// wording), a deterministic motive-scoring comparison, a pre-evidence freeze,
// a Reasoning Ledger, and (for the live S1 ingestion) a Phase-2 delta/record.
// Attached ONLY on workspaces that carry the derivation; absent everywhere
// else (never fabricated). Scores are DERIVED_BY_DEMO_LOGIC investigative-
// relevance estimates — never guilt/probability statements.
// ============================================================================

export type MotiveHypothesisKey = "H1" | "H2" | "H3";

/** The canonical competing hypothesis frame (title + §17 exact wording). */
export interface MotiveHypothesisFrame {
  readonly key: MotiveHypothesisKey;
  readonly hypothesisId: string;
  readonly title: string;
  readonly statement: string;
  readonly summary: string;
}

/** Display-only FOR/AGAINST grouping for ONE hypothesis card — the demo §14
 *  narrative readout. Purely presentational: it never feeds the score-driving
 *  rows (scores stay derived from the pool lexicons in the data layer). Each id
 *  resolves against the workspace observation provider. */
export interface Phase2EvidenceReadoutRow {
  readonly supporting: readonly string[];
  readonly contradicting: readonly string[];
}

/** PASS 4 — per-key evidence readout for the Hypothesis-route surface
 *  (optional, real Case-B demo only; absent ⇒ the surface falls back to the
 *  score rows' supporting/contradicting sets). */
export type Phase2EvidenceReadout = Readonly<
  Record<MotiveHypothesisKey, Phase2EvidenceReadoutRow>
>;

/** One hypothesis row inside a Phase-2 score comparison. */
export interface MotiveHypothesisScoreRow {
  readonly hypothesisId: string;
  readonly key: MotiveHypothesisKey;
  readonly title: string;
  /** Deterministic investigative-relevance score (DERIVED_BY_DEMO_LOGIC). */
  readonly score: number;
  readonly rank: number;
  /** Reverse-hypothesis-style classification status from the observation sets. */
  readonly assessmentStatus: AssessmentStatus;
  /** Canonical Hypothesis row status carried at this point in time. */
  readonly canonicalStatus: string;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly exclusiveObservationIds: readonly string[];
  readonly poolSize: number;
  readonly scoreLabel: "DERIVED_BY_DEMO_LOGIC";
}

/** A scored H1/H2/H3 comparison at one point in time (pre/post evidence). */
export interface MotiveHypothesisComparison {
  readonly stage: "PRE_EVIDENCE" | "POST_EVIDENCE";
  readonly rows: readonly MotiveHypothesisScoreRow[];
}

/** Deterministic frozen snapshot of the pre-evidence H1/H2/H3 comparison. */
export interface Phase2AssessmentFreeze {
  readonly id: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly frozenAt: { readonly value: string; readonly precision: "exact" };
  readonly runId: string;
  readonly stage: "PHASE_2_PRE_EVIDENCE_FREEZE";
  readonly hypothesisIds: readonly string[];
  readonly rows: readonly MotiveHypothesisScoreRow[];
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly fingerprint: string;
  readonly scoreLabel: "DERIVED_BY_DEMO_LOGIC";
  readonly caveat: string;
}

/** Action vocabulary of the Reasoning Ledger — from the platform's existing
 *  action set; the ledger NEVER returns a guilt/proven verdict. */
export type ReasoningLedgerAction =
  | "REQUEST_RECORDS"
  | "REVIEW_RELATIONSHIP"
  | "ESCALATE_FOR_HUMAN_REVIEW"
  | "PRESERVE_EVIDENCE"
  | "OPEN_NEW_LEAD"
  | "RECORD_REASONING";

export interface ReasoningLedgerEntry {
  readonly id: string;
  readonly ledgerId: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly ordering: number;
  readonly kind: string;
  readonly title: string;
  readonly detail: string;
  readonly action: ReasoningLedgerAction;
  readonly derivedFrom: readonly string[];
  readonly at: { readonly value: string; readonly precision: "exact" };
}

/** Deterministic reasoning ledger spanning Phase 1 + Phase 2 decision trail. */
export interface ReasoningLedger {
  readonly id: string;
  readonly investigationId: string;
  readonly caseId: string;
  readonly entries: readonly ReasoningLedgerEntry[];
}

export interface Phase2ScoreState {
  readonly stage: "PRE_EVIDENCE" | "POST_EVIDENCE";
  readonly rows: readonly MotiveHypothesisScoreRow[];
  readonly observationIds: readonly string[];
  readonly fingerprint: string;
}

export interface Phase2HoleStatusChange {
  readonly graphHoleId: string;
  readonly status: GraphHoleResolutionStatus;
  readonly derivedFromEvidenceIds: readonly string[];
}

/** Post-S1 comparison delta produced by the Phase-2 second-evidence ingestion. */
export interface Phase2EvidenceDelta {
  readonly caseId: string;
  readonly investigationId: string;
  readonly appliedAt: { readonly value: string; readonly precision: "exact" };
  readonly evidenceIngestedIds: readonly string[];
  readonly observationExtractedIds: readonly string[];
  readonly relationCreatedIds: readonly string[];
  readonly graphNodesAdded: readonly string[];
  readonly graphEdgesAdded: readonly string[];
  readonly hypothesisPromotedIds: readonly string[];
  readonly evidenceRequestIdsCompleted: readonly string[];
  readonly gapStatusChanges: readonly Phase1GapStatusChange[];
  readonly holeStatusChanges: readonly Phase2HoleStatusChange[];
  readonly before: Phase2ScoreState;
  readonly after: Phase2ScoreState;
  readonly rankingChanged: boolean;
  readonly leakSafeClass: string;
}

/** Deterministic record of one Phase-2 second-evidence (S1) ingestion run. */
export interface Phase2S1Record {
  readonly determinismLabel: string;
  readonly ingestedAt: { readonly value: string; readonly precision: "exact" };
  readonly evidenceId: string;
  readonly evidenceClass: string;
  readonly evidenceStatus: string;
  /** The physical corporate audit document is honestly BLOCKED (research
   *  required); the ingested fallback is the House-report public account. */
  readonly physicalDocStatus: "BLOCKED";
  readonly fallback: "REPORT_TEXT_ACCOUNT";
  readonly extractedObservationIds: readonly string[];
  readonly relationId: string;
  readonly nodeId: string;
  readonly edgeId: string;
  readonly hypothesesPromoted: readonly string[];
  readonly gapId: string;
  readonly gapStatus: string;
  readonly evidenceRequestId: string;
  readonly evidenceRequestStatus: string;
  readonly freezeFingerprintBefore: string;
  readonly freezeFingerprintAfter: string;
  readonly summary: string;
}

/** Patch of canonical records a Phase-2 S1 run inserts or reassesses. */
export interface Phase2StatePatch {
  readonly sources: readonly Source[];
  readonly artifacts: readonly Artifact[];
  readonly evidence: readonly Evidence[];
  readonly observations: readonly Observation[];
  readonly relations: readonly RelationHypothesis[];
  readonly graphNodes: readonly GraphNode[];
  readonly graphEdges: readonly GraphEdge[];
  readonly hypotheses: readonly Hypothesis[];
  readonly gapReassessments: readonly BreakthroughGapReassessment[];
  readonly evidenceRequestCompletions: readonly BreakthroughEvidenceRequestCompletion[];
}

/** Everything a Phase-2 S1 run produces (patch + record + delta). */
export interface Phase2RunResult {
  readonly patch: Phase2StatePatch;
  readonly record: Phase2S1Record;
  readonly delta: Phase2EvidenceDelta;
  readonly ledgerEntries: readonly ReasoningLedgerEntry[];
}

/** One hop of the later-historical hearsay chain (the validation overlay). */
export interface Phase2HearsayChainHop {
  readonly hopLabel: string;
  readonly entityId: string;
  readonly note: string;
}

/** Later-historical validation layer (class-5 timing): the House-report
 *  testimony surfaced LONG after the Phase-2 analysis, hearsay-attributed to a
 *  witness who never met the security chief directly. Single-source hearsay is
 *  rendered as LATER_HISTORICAL_KNOWLEDGE and NEVER PROVEN/CONFIRMED. */
export interface Phase2HistoricalValidation {
  readonly hypothesisIds: readonly string[];
  readonly classification: "LATER_HISTORICAL_KNOWLEDGE";
  readonly verdict: "CORROBORATED" | "PARTIALLY_CORROBORATED" | "NOT_CORROBORATED" | "UNRESOLVED";
  readonly witnessEntityId: string;
  readonly hearsayChain: readonly Phase2HearsayChainHop[];
  readonly nonMeeting: string;
  readonly stance: "SOURCE_CREDIBILITY";
  readonly mannerOfProof: "UNRESOLVED";
  readonly derivedFrom: readonly string[];
  readonly at: { readonly value: string; readonly precision: "exact" };
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
  /** PASS 2 — OPTIONAL read-only Phase-1 intelligence projections. Demo/real-case
   *  workspaces attach them; live/OFS workspaces omit them (never fabricated). */
  readonly crossCaseSignal?: CrossCaseSignal;
  readonly predictionFreeze?: PredictionFreeze;
  /** PASS 3 — OPTIONAL read-only breakthrough projections (post-freeze delta +
   *  breakthrough record), present only on workspaces carrying the Exhibit-719
   *  live ingestion. Live/OFS workspaces omit them (never fabricated). */
  readonly postFreezeDelta?: Phase1PostFreezeDelta;
  readonly breakthroughRecord?: BreakthroughRecord;
  /** PASS 4 — OPTIONAL read-only Phase-2 motive-investigation projections
   *  (pre-evidence freeze, post-evidence delta, reasoning ledger, and the
   *  later-historical validation overlay), present only on enriched real-case
   *  workspaces. Live/OFS workspaces omit them (never fabricated). */
  readonly phase2AssessmentFreeze?: Phase2AssessmentFreeze;
  readonly phase2EvidenceDelta?: Phase2EvidenceDelta;
  readonly phase2HistoricalValidation?: Phase2HistoricalValidation;
  readonly phase2Ledger?: ReasoningLedger;
  /** PASS 4 — display-only FOR/AGAINST readout (demo §14) for the route surface. */
  readonly phase2EvidenceReadout?: Phase2EvidenceReadout;
  /** PASS 4 — the second-evidence (S1) observation records resolved through the
   *  phase-2 seam so the route surface can render their content. Delivered as a
   *  projection, never as base-envelope records (the pre-ingest fixture arrays
   *  stay clean and pre-evidence scoring is unaffected). */
  readonly phase2SecondEvidence?: readonly Observation[];
  /** PASS 4 — the cross-case connection evidence (H. Paul Rico ↔ hitman /
   *  Boston-gang link revealed by the Case-A network operation). The route
   *  surface surfaces its observation in H1's supporting set ONLY when the
   *  workspace graph carries the SOLID (ACTIVE) edge between the two nodes —
   *  the "?" graph hole alone never unlocks it. */
  readonly phase2ConnectionEvidence?: {
    readonly observation: Observation;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  };
  /** PASS 4 — Phase-2 PROGRESSION gate. Even a workspace whose envelope carries
   *  the derived Phase-2 data keeps it HIDDEN until the session-level Phase-2
   *  kickoff has actually happened (the deterministic demo transition). Absent
   *  (live/OFS) → the Phase-2 surfaces never render. */
  readonly phase2Ready?: boolean;
}
