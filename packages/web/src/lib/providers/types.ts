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
  Evidence,
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
  RobustnessResult,
  EvidenceSubmissionRequest,
  UploadedFileReference,
} from "@indago/contracts";
import type { EvidenceSubmissionResponse } from "@/lib/api/types";
import type { SseEvent as ContractSseEvent } from "@/lib/realtime/sse-client";

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
  listByInvestigation(investigationId: string, query?: ProviderQuery): Promise<Paginated<Evidence>>;
  get(id: string): Promise<Evidence>;
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

export interface CrossCaseProvider {
  listMatches(caseId: string, query?: ProviderQuery): Promise<Paginated<CrossCaseMatch>>;
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
  readonly cases: CaseProvider;
  readonly investigations: InvestigationProvider;
  readonly evidence: EvidenceProvider;
  readonly observations: ObservationProvider;
  readonly entities: EntityProvider;
  readonly graph: GraphProvider;
  readonly timeline: TimelineProvider;
  readonly leads: LeadProvider;
  readonly gaps: GapProvider;
  readonly review: ReviewProvider;
  readonly robustness: RobustnessProvider;
  readonly crossCase: CrossCaseProvider;
  readonly realtime: RealtimeProvider;
}
