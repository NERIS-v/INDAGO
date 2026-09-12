// ============================================================================
// Region builder types (Phase 5A-PR1)
//
// The runtime contract for building a bounded deterministic candidate-region.
// The REGION is the bounded analysis context; REGION IDENTITY ≠ CANDIDATE
// IDENTITY (see contracts intelligence/graph-hole-region.ts).
//
// Every output field is deterministic: sorted sets, no timestamps of now, no
// random ids, no environment state in the identity. Traceability fields
// (roundRecords, unresolved seeds) are EXPRESSLY separate from the identity.
// ============================================================================

import type {
  RegionIdentityV1,
  RegionStatus,
  SemanticExpansionTrace,
  SemanticRetrievalPort,
  SemanticSourceType,
  TemporalInterval,
} from '@indago/contracts';
import type { SemanticNodeAdapter } from './semantic-node-adapter.js';
import type { RegionSemanticContextResolver } from './semantic-query.js';

export const REGION_LIMITATION_CODES = [
  'OBSERVATION_RESOLUTION_FAILED',
  'NO_RESOLVABLE_SEED_NODES',
  'UNRESOLVED_SEED_ENTITIES',
  'CONTEXT_OBSERVATION_BOUND_REACHED',
  'REGION_NODE_BOUND_REACHED',
  'REGION_EDGE_BOUND_REACHED',
  'EXPANSION_ROUND_LIMIT_REACHED',
  'EXPANSION_PROVIDER_FAILURE',
  'SEMANTIC_RETRIEVAL_FAILURE',
  'SEMANTIC_NODE_BOUND_REACHED',
  'SEMANTIC_RESULTS_BOUND_REACHED',
  'SEMANTIC_RESULTS_TRUNCATED',
] as const;
export type RegionLimitationCode = (typeof REGION_LIMITATION_CODES)[number];

/** Limitations that mean the reported region was truncated by a hard bound. */
export const REGION_TRUNCATING_LIMITATIONS: readonly RegionLimitationCode[] = [
  'CONTEXT_OBSERVATION_BOUND_REACHED',
  'REGION_NODE_BOUND_REACHED',
  'REGION_EDGE_BOUND_REACHED',
  'EXPANSION_ROUND_LIMIT_REACHED',
  'SEMANTIC_NODE_BOUND_REACHED',
  'SEMANTIC_RESULTS_BOUND_REACHED',
  'SEMANTIC_RESULTS_TRUNCATED',
];

/**
 * Deterministic inputs to a region build. `seedObservationIds` are canonical
 * ObservationIds; `temporalContext` narrows the analysis window (M-A12) and is
 * part of the region identity.
 */
export interface BuildRegionInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly seedObservationIds: readonly string[];
  readonly temporalContext?: TemporalInterval | null;
}

/** Minimal seed observation shape consumed by node resolution. */
export interface SeedObservation {
  readonly id: string;
  readonly entityIds: readonly string[];
}

/** Resolve canonical seed observations by id (case-scoped by the caller). */
export type ObservationResolver = (
  ids: readonly string[],
) => Promise<readonly SeedObservation[]>;

export interface GraphExpansionRequest {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly memberNodeIds: readonly string[];
  readonly memberEdgeIds: readonly string[];
  readonly temporalContext?: TemporalInterval | null;
}

export interface GraphExpansionResult {
  /** Candidate frontier nodes one hop beyond the members (sorted, unique). */
  readonly candidateNodeIds: readonly string[];
}

export interface IncidentEdgesRequest {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly nodeIds: readonly string[];
  readonly temporalContext?: TemporalInterval | null;
}

/**
 * The region expansion seam:
 *  - expandGraph     — one-hop frontier expansion over the authoritative
 *                      projected graph (M-A13).
 *  - incidentEdges   — edges incident to a set of nodes.
 *
 * Semantic expansion is NOT part of this provider. It is an OPTIONAL builder
 * dependency (RegionBuildDependencies.semanticExpansion): the PR1.5 port
 * (recall layer) + the PR2 SemanticNodeAdapter (the ONLY place that may bridge
 * semantic text units → canonical graph nodes). When the dependency is absent
 * PR1 runs with semantic expansion disabled (status DISABLED) — always a valid
 * region.
 */
export interface GraphExpansionProvider {
  readonly caseId: string;
  readonly graphVersionId: string;
  hasNode(nodeId: string): boolean;
  expandGraph(request: GraphExpansionRequest): Promise<GraphExpansionResult>;
  incidentEdges(request: IncidentEdgesRequest): Promise<readonly string[]>;
}

/** Same seam, named the way the PR1 design review refers to it. */
export type RegionExpansionContextProvider = GraphExpansionProvider;

/**
 * Optional PR2 semantic expansion wiring:
 *   - `port` supplies retrieval (recall).
 *   - `adapter` bridges text units → nodes authoritatively.
 *   - `resolveSourceEntities` is the M-A09/M-A10 source → canonical entity
 *     lookup (must be case-scoped by the caller).
 *   - `getSemanticContextForRegion` is the AUTHORITATIVE regional source
 *     context dependency used to build every query (case/graph-version/
 *     temporal-scoped, read-only, bounded). Queries are NEVER built from
 *     retrieved text, so no semantic feedback loop can form.
 *
 * Without this dependency a region builds with semantic expansion disabled
 * (status DISABLED). When configured, a semantic failure degrades the semantic
 * sub-system but NEVER halts the deterministic M-A13 graph expansion of the
 * same build.
 */
export interface SemanticExpansionDependency {
  readonly port: SemanticRetrievalPort;
  readonly adapter: SemanticNodeAdapter;
  readonly resolveSourceEntities: (input: {
    readonly caseId: string;
    readonly sourceType: SemanticSourceType;
    readonly sourceId: string;
  }) => Promise<readonly string[]>;
  readonly getSemanticContextForRegion: RegionSemanticContextResolver;
}

export interface RegionBuildDependencies {
  readonly context: GraphExpansionProvider;
  readonly resolveObservations: ObservationResolver;
  readonly semanticExpansion?: SemanticExpansionDependency;
}

// ============================================================================
// Output
// ============================================================================

export interface RegionExpansionRoundRecord {
  /** One-based expansion round number (round 0 = seed establishment). */
  readonly round: number;
  readonly addedNodeIds: readonly string[];
  readonly addedEdgeIds: readonly string[];
  readonly addedObservationIds: readonly string[];
  readonly totalNodeIds: number;
  readonly totalEdgeIds: number;
  readonly totalObservationIds: number;
  /** Undefined (null) when the denominator is zero (documented rule). */
  readonly nodeNoveltyRatio: number | null;
  readonly observationNoveltyRatio: number | null;
  /** true when a hard budget was exhausted during this round. */
  readonly budgetBoundReached: boolean;
}

/**
 * A finished bounded candidate-region. `identity` + `regionId` are the
 * content-addressed context; everything else is deterministic traceability
 * metadata that is deliberately NOT part of the identity.
 */
export interface GraphHoleRegion {
  readonly regionId: string;
  readonly identity: RegionIdentityV1;
  readonly status: RegionStatus;
  readonly truncated: boolean;
  readonly limitations: readonly RegionLimitationCode[];
  readonly maxExpansionRounds: number;
  readonly maxRegionNodes: number;
  readonly maxRegionEdges: number;
  readonly maxContextObservations: number;
  /** Expansion rounds actually executed (0 for a rejected/seed-only region). */
  readonly expansionRounds: number;
  readonly seedObservationIds: readonly string[];
  /** Canonical graph nodes the seed observations resolved to (round 0). */
  readonly resolvedSeedNodeIds: readonly string[];
  /** Canonical entity ids referenced by seeds but NOT present in this case's projected graph. */
  readonly unresolvedSeedEntityIds: readonly string[];
  /** Edges already in the region from the seed context (seed nodes' incident edges). */
  readonly seedEdgeIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly roundRecords: readonly RegionExpansionRoundRecord[];
  /**
   * Deterministic trace of the optional semantic-expansion pass (PR2).
   * status DISABLED when no semantic provider is configured. Deliberately NOT
   * part of the region identity/regionId.
   */
  readonly semanticExpansion: SemanticExpansionTrace;
}

export type RegionBuildErrorCode =
  | 'EMPTY_SEED_OBSERVATIONS'
  | 'AUTHORITY_MISMATCH'
  | 'INVALID_REGION_IDENTITY';

/** Typed, deterministic failure for invalid region-build inputs (reject, not a region). */
export class RegionBuildError extends Error {
  constructor(
    readonly code: RegionBuildErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RegionBuildError';
  }
}

export interface RegionBuilder {
  build(input: BuildRegionInput): Promise<GraphHoleRegion>;
}