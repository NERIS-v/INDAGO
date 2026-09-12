// ============================================================================
// buildRegion — deterministic candidate-region builder (Phase 5A-PR1 + PR2)
//
// Orchestrates observation-seeded, bounded, deterministic region construction
// over the existing M-A13 projected graph runtime (Graphology projection).
//
// Pipeline:
//   1. ROUND 0 (seed establishment, NEVER counted for saturation)
//        - resolve seed observations → canonical entityIds → graph node ids
//        - unbounded seeds / unwritable seeds are handled explicitly
//        - seed context edges collected (temporal-filtered) and edge-budgeted
//   2. EXPANSION ROUNDS 1..MAX_REGION_EXPANSION_ROUNDS
//        - one-hop frontier expansion via GraphExpansionProvider.expandGraph
//        - OPTIONAL PR2 semantic expansion: the round's query is built from
//          BOUNDED AUTHORITATIVE regional context (injected resolver; never
//          retrieved text — NO semantic feedback loop) + sorted membership;
//          the SemanticNodeAdapter maps hits → authoritative canonical graph
//          nodes (source → M-A09/M-A10 entity → M-A13 node), admitted under
//          the shared region-node budget. Isolated by case, bounded by
//          MAX_SEMANTIC_RESULTS_PER_ROUND / MAX_TOTAL_SEMANTIC_RESULTS /
//          MAX_SEMANTIC_NODES_ADDED.
//        - FAILURE ISOLATION: a semantic provider/adapter/context failure
//          disables semantic expansion for the REST of the build (DEGRADED,
//          SEMANTIC_RETRIEVAL_FAILURE) and NEVER halts the deterministic
//          M-A13 graph expansion. Semantic bounds/truncation likewise only
//          disable FUTURE semantic retrieval; graph rounds always proceed.
//        - hard budgets applied to nodes / edges / observations
//        - saturation evaluated AFTER each round (two CONSECUTIVE satisfying
//          rounds required; a round that hits a hard bound cannot count)
//   3. FINALIZE
//        - status by documented precedence: DEGRADED > LIMITED > SATURATED
//        - identity + regionId = sha256(canonicalizeRegionIdentity(identity))
//          (semantic expansion trace is traceability ONLY, never in the id;
//          semantic ADMITTED nodes/edges ARE membership and DO change the id)
//
// Semantic invariants:
//   - a region is context, NOT a graph-hole candidate (detection is later PRs)
//   - SATURATED != completeness; LIMITED is never downgraded to SATURATED;
//     provider failure is never rewarded with SATURATED
//   - case isolation is enforced twice (orchestrator + provider authority)
//   - every output ID set is sorted/unique; nothing ties regionId to execution
//   - semantic mapping is authoritative only; no similarity/string resolution,
//     no fabricated nodes, no semantic feedback loop (queries depend solely on
//     authoritative pre-round region state, never on retrieved text)
// ============================================================================

import {
  MAX_CONTEXT_OBSERVATIONS,
  MAX_REGION_EDGES,
  MAX_REGION_EXPANSION_ROUNDS,
  MAX_REGION_NODES,
  MAX_SEMANTIC_NODES_ADDED,
  MAX_SEMANTIC_RESULTS_PER_ROUND,
  MAX_TOTAL_SEMANTIC_RESULTS,
  RegionIdentityV1Schema,
} from '@indago/contracts';
import type {
  RegionStatus,
  SemanticExpansionRoundTrace,
  SemanticExpansionStatus,
  SemanticExpansionTrace,
  SemanticNodeMappingReport,
} from '@indago/contracts';
import { SATURATION_DEFINITION_V1, SaturationTracker } from './calculate-saturation.js';
import { applyBudget } from './region-bounds.js';
import { computeRegionId, sortedUnique } from './region-identity.js';
import { buildRegionSemanticQuery } from './semantic-query.js';
import { resolveSeedNodeIds } from './resolve-observation-nodes.js';
import { RegionBuildError, REGION_TRUNCATING_LIMITATIONS } from './types.js';
import type {
  BuildRegionInput,
  GraphHoleRegion,
  RegionBuildDependencies,
  RegionBuilder,
  RegionExpansionRoundRecord,
  RegionLimitationCode,
  SeedObservation,
} from './types.js';

const SATURATION_DEFINITION = SATURATION_DEFINITION_V1;

export async function buildRegion(
  input: BuildRegionInput,
  deps: RegionBuildDependencies,
): Promise<GraphHoleRegion> {
  assertBuildable(input, deps);

  const semanticExpansion = deps.semanticExpansion;
  const semanticState: SemanticState = {
    enabled: semanticExpansion !== undefined,
    held: false,
    failure: false,
    nodeBound: false,
    resultsBound: false,
    providerTruncated: false,
    mappedSomething: false,
    unresolvedOrRejected: false,
    rounds: [],
    totalResults: 0,
    totalMappedNodes: 0,
    totalUnresolved: 0,
    totalRejected: 0,
    pendingQuery: '',
    pendingQueryHash: '',
    pendingRequestedLimit: 0,
    pendingRetrievedCount: 0,
    pendingTruncated: false,
  };
  const semanticTrace = () => semanticTraceOf(semanticState);

  const temporalContext = input.temporalContext ?? undefined;
  const seedAttempt = sortedUnique(input.seedObservationIds);
  const degradations = new Limitations();

  // ---- Seeds: resolve observations (provider failure → degraded, never saturated) ----
  let seedObservations: readonly SeedObservation[];
  try {
    seedObservations = await deps.resolveObservations(seedAttempt);
  } catch {
    degradations.add('OBSERVATION_RESOLUTION_FAILED');
    return finalizeRegion(input, degradations, semanticTrace(), {
      nodeIds: [],
      edgeIds: [],
      seedObservationIds: seedAttempt,
      resolvedSeedNodeIds: [],
      unresolvedSeedEntityIds: [],
      seedEdgeIds: [],
      roundRecords: [],
      expansionRounds: 0,
    });
  }
  seedObservations = [...seedObservations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Seed observations that actually came back (intersect the attempted set).
  const attempted = new Set(seedAttempt);
  const observationIds = sortedUnique(
    seedObservations.map((o) => o.id).filter((id) => attempted.has(id)),
  );

  // ---- Resolution: observation entityIds → canonical graph nodes (no invention) ----
  const resolution = resolveSeedNodeIds(
    seedObservations,
    (id) => deps.context.hasNode(id),
  );
  const resolvedSeedNodeIds = resolution.resolvedNodeIds;
  const unresolvedSeedEntityIds = resolution.unresolvedEntityIds;

  if (unresolvedSeedEntityIds.length > 0) {
    degradations.add('UNRESOLVED_SEED_ENTITIES');
  }
  if (resolvedSeedNodeIds.length === 0) {
    degradations.add('NO_RESOLVABLE_SEED_NODES');
    return finalizeRegion(input, degradations, semanticTrace(), {
      nodeIds: [],
      edgeIds: [],
      seedObservationIds: observationIds.length > 0 ? observationIds : seedAttempt,
      resolvedSeedNodeIds: [],
      unresolvedSeedEntityIds,
      seedEdgeIds: [],
      roundRecords: [],
      expansionRounds: 0,
    });
  }

  // ---- Seed context (round 0): initial nodes + incident edges with edge budget ----
  let nodeIds = [...resolvedSeedNodeIds];
  let edgeIds: string[] = [];
  let seedEdgeIds: readonly string[] = [];
  let hardStop = false;
  try {
    const incident = await deps.context.incidentEdges({
      caseId: input.caseId,
      graphVersionId: input.graphVersionId,
      nodeIds: resolvedSeedNodeIds,
      temporalContext: temporalContext,
    });
    const boundedEdges = applyBudget(sortedUnique(incident), 0, MAX_REGION_EDGES);
    edgeIds = [...boundedEdges.kept];
    seedEdgeIds = [...boundedEdges.kept];
    if (boundedEdges.boundReached) {
      degradations.add('REGION_EDGE_BOUND_REACHED');
      hardStop = true;
    }
  } catch {
    degradations.add('EXPANSION_PROVIDER_FAILURE');
    return finalizeRegion(input, degradations, semanticTrace(), {
      nodeIds,
      edgeIds,
      seedObservationIds: observationIds.length > 0 ? observationIds : seedAttempt,
      resolvedSeedNodeIds,
      unresolvedSeedEntityIds,
      seedEdgeIds,
      roundRecords: [],
      expansionRounds: 0,
    });
  }

  // Seed observation context cap (defensive; normally ≪ MAX_CONTEXT_OBSERVATIONS).
  if (observationIds.length > MAX_CONTEXT_OBSERVATIONS) {
    degradations.add('CONTEXT_OBSERVATION_BOUND_REACHED');
    hardStop = true;
  }

  const roundRecords: RegionExpansionRoundRecord[] = [];
  const tracker = new SaturationTracker(SATURATION_DEFINITION);
  let expansionRounds = 0;
  const observationSet = new Set(observationIds);

  if (!hardStop) {
    let saturated = false;
    for (let round = 1; round <= MAX_REGION_EXPANSION_ROUNDS; round++) {
      // ---- Optional PR2 semantic expansion (retrieve + authoritative map) ----
      // FAILURE ISOLATION: a semantic failure / provider truncation / reached
      // semantic bound disables FUTURE semantic retrieval only. It NEVER halts
      // the deterministic M-A13 graph expansion of this round or any later one.
      let semanticMapping: SemanticNodeMappingReport | null = null;
      semanticState.held = false;
      if (
        semanticExpansion !== undefined &&
        !semanticState.failure &&
        !semanticState.resultsBound &&
        !semanticState.nodeBound &&
        !semanticState.providerTruncated
      ) {
        try {
          const contextItems = await semanticExpansion.getSemanticContextForRegion({
            caseId: input.caseId,
            graphVersionId: input.graphVersionId,
            nodeIds,
            observationIds: [...observationSet].sort(),
            temporalContext: temporalContext,
          });
          const query = buildRegionSemanticQuery(contextItems, nodeIds);
          const requestedLimit = Math.min(
            MAX_SEMANTIC_RESULTS_PER_ROUND,
            MAX_TOTAL_SEMANTIC_RESULTS - semanticState.totalResults,
          );
          const envelope = await semanticExpansion.port.retrieve({
            caseId: input.caseId,
            query,
            temporalContext: temporalContext,
            limit: requestedLimit,
          });
          if (envelope.caseId !== input.caseId) {
            throw new RegionBuildError(
              'AUTHORITY_MISMATCH',
              `Semantic retrieval returned case ${envelope.caseId} for a ${input.caseId} region.`,
            );
          }
          semanticState.totalResults += envelope.results.length;
          if (semanticState.totalResults >= MAX_TOTAL_SEMANTIC_RESULTS) {
            semanticState.resultsBound = true;
            degradations.add('SEMANTIC_RESULTS_BOUND_REACHED');
          }
          semanticState.pendingQuery = query;
          semanticState.pendingQueryHash = envelope.queryHash;
          semanticState.pendingRequestedLimit = requestedLimit;
          semanticState.pendingRetrievedCount = envelope.results.length;
          semanticState.pendingTruncated = envelope.truncated;
          if (envelope.truncated) {
            // Only the explicit provider-reported contract field counts — never
            // inferred from retrievedCount < requestedLimit. Once truncated,
            // semantic expansion stays limited and no further retrieval happens.
            semanticState.providerTruncated = true;
            degradations.add('SEMANTIC_RESULTS_TRUNCATED');
          }

          semanticMapping = await semanticExpansion.adapter.mapSemanticResultsToNodes(
            envelope.results,
            {
              caseId: input.caseId,
              graphVersionId: input.graphVersionId,
              resolveSourceEntities: semanticExpansion.resolveSourceEntities,
              hasNode: (id) => deps.context.hasNode(id),
            },
          );
          semanticState.totalUnresolved += semanticMapping.unresolvedCount;
          semanticState.totalRejected += semanticMapping.rejectedCount;
          if (semanticMapping.mappedCount > 0) semanticState.mappedSomething = true;
          if (semanticMapping.unresolvedCount + semanticMapping.rejectedCount > 0) {
            semanticState.unresolvedOrRejected = true;
          }
          semanticState.held = true;
        } catch {
          // Semantic-only failure: keep the deterministic graph expansion of
          // this round and every later round; disable semantic expansion for
          // the rest of the build (DEGRADED + SEMANTIC_RETRIEVAL_FAILURE).
          semanticState.failure = true;
          degradations.add('SEMANTIC_RETRIEVAL_FAILURE');
        }
      }

      // ---- Graph expansion: one-hop frontier ----
      let candidateNodeIds: readonly string[] = [];
      try {
        const result = await deps.context.expandGraph({
          caseId: input.caseId,
          graphVersionId: input.graphVersionId,
          memberNodeIds: nodeIds,
          memberEdgeIds: edgeIds,
          temporalContext: temporalContext,
        });
        candidateNodeIds = result.candidateNodeIds;
      } catch {
        degradations.add('EXPANSION_PROVIDER_FAILURE');
        break;
      }

      // ---- Apply budgets (deterministic prefix of sorted candidates) ----
      // Graph frontier first, then semantic nodes against the SAME region-node
      // budget, so semantic admission can never push the region past MAX_REGION_NODES.
      const boundedNodes = applyBudget(candidateNodeIds, nodeIds.length, MAX_REGION_NODES);
      const graphKept = [...boundedNodes.kept];
      let nodeBoundReached = boundedNodes.boundReached;
      if (boundedNodes.boundReached) {
        degradations.add('REGION_NODE_BOUND_REACHED');
      }

      let admittedNodes: string[] = [];
      let addedObservations: string[] = [];
      if (semanticMapping !== null) {
        const existing = new Set(nodeIds);
        const freshNodes = semanticMapping.mappedNodeIds.filter((id) => !existing.has(id));
        const remainingRegionNodes = MAX_REGION_NODES - (nodeIds.length + graphKept.length);
        const semanticNodeBudget = Math.min(
          MAX_SEMANTIC_NODES_ADDED - semanticState.totalMappedNodes,
          remainingRegionNodes,
        );
        const boundedSemantic = applyBudget(freshNodes, 0, Math.max(0, semanticNodeBudget));
        admittedNodes = [...boundedSemantic.kept];
        semanticState.totalMappedNodes += admittedNodes.length;

        if (boundedSemantic.boundReached || semanticState.totalMappedNodes >= MAX_SEMANTIC_NODES_ADDED) {
          semanticState.nodeBound = true;
          degradations.add('SEMANTIC_NODE_BOUND_REACHED');
        }
        if (remainingRegionNodes <= 0 && freshNodes.length > 0) {
          nodeBoundReached = true;
          degradations.add('REGION_NODE_BOUND_REACHED');
        }

        // Observation context surface: source ids of every OBSERVATION-type hit
        // the adapter mapped (semantic recall surfaced new context observations;
        // bounded overall by the results budget and the observation cap).
        const obsIds = new Set<string>();
        for (const hit of semanticMapping.attribution) {
          if (hit.sourceType !== 'OBSERVATION' || hit.outcome !== 'MAPPED') continue;
          obsIds.add(hit.sourceId);
        }
        addedObservations = [...obsIds].sort();
        for (const id of addedObservations) observationSet.add(id);

        if (semanticState.held) {
          semanticState.rounds.push({
            round,
            query: semanticState.pendingQuery,
            queryHash: semanticState.pendingQueryHash,
            requestedLimit: semanticState.pendingRequestedLimit,
            retrievedCount: semanticState.pendingRetrievedCount,
            truncated: semanticState.pendingTruncated,
            admittedNodeIds: admittedNodes,
            mappedCount: semanticMapping.mappedCount,
            unresolvedCount: semanticMapping.unresolvedCount,
            rejectedCount: semanticMapping.rejectedCount,
          });
        }
      }

      let addedNodes = sortedUnique([...graphKept, ...admittedNodes]);
      const regionRemaining = MAX_REGION_NODES - nodeIds.length;
      if (addedNodes.length > regionRemaining) {
        addedNodes = addedNodes.slice(0, regionRemaining);
        nodeBoundReached = true;
        degradations.add('REGION_NODE_BOUND_REACHED');
      }

      let addedEdges: string[] = [];
      let edgeBoundReached = false;
      if (addedNodes.length > 0) {
        let incidentCandidates: string[] = [];
        try {
          const incident = await deps.context.incidentEdges({
            caseId: input.caseId,
            graphVersionId: input.graphVersionId,
            nodeIds: addedNodes,
            temporalContext: temporalContext,
          });
          incidentCandidates = [...incident].sort();
        } catch {
          degradations.add('EXPANSION_PROVIDER_FAILURE');
          break;
        }
        const existingEdges = new Set(edgeIds);
        const newEdgeCandidates = incidentCandidates.filter((id) => !existingEdges.has(id));
        const boundedEdges = applyBudget(newEdgeCandidates, edgeIds.length, MAX_REGION_EDGES);
        addedEdges = [...boundedEdges.kept];
        edgeBoundReached = boundedEdges.boundReached;
        if (edgeBoundReached) {
          degradations.add('REGION_EDGE_BOUND_REACHED');
        }
      }

      // ---- Observation context cap (if semantic seam added any) ----
      let observationBoundReached = false;
      if (observationSet.size > MAX_CONTEXT_OBSERVATIONS) {
        observationBoundReached = true;
        degradations.add('CONTEXT_OBSERVATION_BOUND_REACHED');
      }

      nodeIds = sortedUnique([...nodeIds, ...addedNodes]);
      edgeIds = sortedUnique([...edgeIds, ...addedEdges]);

      // BUDGET SEPARATION: `budgetBoundReached` reflects ONLY the graph/region
      // hard caps (node, edge, observation). A semantic bound/truncation/failure
      // disables future semantic retrieval but never stops graph rounds — so it
      // must not count as a graph budget break. (The trace still exposes every
      // semantic stop reason via status + limitation codes.)
      const budgetBoundReached =
        nodeBoundReached || edgeBoundReached || observationBoundReached;

      const record: RegionExpansionRoundRecord = {
        round,
        addedNodeIds: addedNodes,
        addedEdgeIds: addedEdges,
        addedObservationIds: addedObservations,
        totalNodeIds: nodeIds.length,
        totalEdgeIds: edgeIds.length,
        totalObservationIds: observationSet.size,
        nodeNoveltyRatio:
          nodeIds.length > 0 ? addedNodes.length / nodeIds.length : null,
        observationNoveltyRatio:
          observationSet.size > 0 ? addedObservations.length / observationSet.size : null,
        budgetBoundReached,
      };
      roundRecords.push(record);
      expansionRounds = round;

      // ---- Stop conditions ----
      if (budgetBoundReached) {
        // A reached hard bound stops expansion; status becomes LIMITED
        // (never silently downgraded to SATURATED).
        break;
      }
      const saturatedNow = tracker.observe({
        addedObservations: addedObservations.length,
        totalObservations: observationSet.size,
        addedNodes: addedNodes.length,
        totalNodes: nodeIds.length,
        budgetBoundReached: false,
      });
      if (saturatedNow) {
        saturated = true;
        break;
      }
    }

    if (
      !hardStop &&
      !saturated &&
      expansionRounds >= MAX_REGION_EXPANSION_ROUNDS &&
      !degradations.hasTruncatingLimitation()
    ) {
      // Rounds exhausted without saturation and without a hard node/edge/obs
      // cap firing in the final round.
      degradations.add('EXPANSION_ROUND_LIMIT_REACHED');
    }
  }

  return finalizeRegion(input, degradations, semanticTrace(), {
    nodeIds,
    edgeIds,
    seedObservationIds: observationIds.length > 0 ? observationIds : seedAttempt,
    resolvedSeedNodeIds,
    unresolvedSeedEntityIds,
    seedEdgeIds,
    roundRecords,
    expansionRounds,
  });
}

interface RegionParts {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly seedObservationIds: readonly string[];
  readonly resolvedSeedNodeIds: readonly string[];
  readonly unresolvedSeedEntityIds: readonly string[];
  readonly seedEdgeIds: readonly string[];
  readonly roundRecords: readonly RegionExpansionRoundRecord[];
  readonly expansionRounds: number;
}

function finalizeRegion(
  input: BuildRegionInput,
  degradations: Limitations,
  semanticExpansion: SemanticExpansionTrace,
  parts: RegionParts,
): GraphHoleRegion {
  const { identity, regionId } = computeRegionId({
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    temporalContext: input.temporalContext ?? null,
    seedObservationIds: parts.seedObservationIds,
    nodeIds: parts.nodeIds,
    edgeIds: parts.edgeIds,
  });

  const parsed = RegionIdentityV1Schema.safeParse(identity);
  if (!parsed.success) {
    throw new RegionBuildError(
      'INVALID_REGION_IDENTITY',
      `Region identity failed the frozen contract: ${parsed.error.message}`,
    );
  }

  const status = resolveStatus(
    degradations.asArray(),
    parts.expansionRounds,
  );
  const truncating = degradations.truncating;

  return {
    regionId,
    identity: parsed.data,
    status,
    truncated: truncating,
    limitations: degradations.asArray(),
    maxExpansionRounds: MAX_REGION_EXPANSION_ROUNDS,
    maxRegionNodes: MAX_REGION_NODES,
    maxRegionEdges: MAX_REGION_EDGES,
    maxContextObservations: MAX_CONTEXT_OBSERVATIONS,
    expansionRounds: parts.expansionRounds,
    seedObservationIds: parts.seedObservationIds,
    resolvedSeedNodeIds: parts.resolvedSeedNodeIds,
    unresolvedSeedEntityIds: parts.unresolvedSeedEntityIds,
    seedEdgeIds: parts.seedEdgeIds,
    nodeIds: parts.nodeIds,
    edgeIds: parts.edgeIds,
    roundRecords: parts.roundRecords,
    semanticExpansion,
  };
}

/**
 * Status precedence (documented, deterministic):
 *   DEGRADED  — known incomplete/degraded context (unresolved seeds,
 *               provider failure — graph or semantic) — never redeems to SATURATED.
 *   LIMITED   — a hard budget/round bound stopped the process.
 *   SATURATED — natural stopping condition, no bound exhausted.
 * Rounds-exhausted is treated as LIMITED (EXPANSION_ROUND_LIMIT_REACHED).
 */
function resolveStatus(
  limitations: readonly RegionLimitationCode[],
  _expansionRounds: number,
): RegionStatus {
  const degraded = [
    'OBSERVATION_RESOLUTION_FAILED',
    'NO_RESOLVABLE_SEED_NODES',
    'UNRESOLVED_SEED_ENTITIES',
    'EXPANSION_PROVIDER_FAILURE',
    'SEMANTIC_RETRIEVAL_FAILURE',
  ].some((code) => (limitations as readonly string[]).includes(code));
  if (degraded) return 'DEGRADED';
  if (limitations.length > 0) return 'LIMITED';
  return 'SATURATED';
}

function assertBuildable(input: BuildRegionInput, deps: RegionBuildDependencies): void {
  if (input.seedObservationIds.length === 0) {
    throw new RegionBuildError(
      'EMPTY_SEED_OBSERVATIONS',
      'A candidate region requires at least one seed observation.',
    );
  }
  if (input.caseId !== deps.context.caseId || input.graphVersionId !== deps.context.graphVersionId) {
    throw new RegionBuildError(
      'AUTHORITY_MISMATCH',
      `buildRegion input ${input.caseId}@${input.graphVersionId} does not match the `
        + `expansion provider authority ${deps.context.caseId}@${deps.context.graphVersionId}.`,
    );
  }
}

/** Deterministic, ordered, deduplicated limitation accumulator. */
class Limitations {
  private readonly codes: RegionLimitationCode[] = [];
  private readonly seen = new Set<RegionLimitationCode>();

  add(code: RegionLimitationCode): void {
    if (this.seen.has(code)) return;
    this.seen.add(code);
    this.codes.push(code);
  }

  get truncating(): boolean {
    return this.codes.some((code) =>
      (REGION_TRUNCATING_LIMITATIONS as readonly string[]).includes(code),
    );
  }

  hasTruncatingLimitation(): boolean {
    return this.truncating;
  }

  asArray(): readonly RegionLimitationCode[] {
    return [...this.codes];
  }
}

/**
 * Factory: binds a RegionBuilder to a fixed expansion context + observation
 * resolver. The returned builder is deterministic and case-scoped via deps.
 */
export function createRegionBuilder(deps: RegionBuildDependencies): RegionBuilder {
  return {
    build(input: BuildRegionInput): Promise<GraphHoleRegion> {
      return buildRegion(input, deps);
    },
  };
}

// ============================================================================
// Semantic expansion state + status resolution (PR2)
// ============================================================================

interface SemanticState {
  readonly enabled: boolean;
  /** true when a retrieved round is awaiting its round-record entry (after budget). */
  held: boolean;
  failure: boolean;
  nodeBound: boolean;
  resultsBound: boolean;
  /** true once the provider explicitly reported result truncation (contract field). */
  providerTruncated: boolean;
  mappedSomething: boolean;
  unresolvedOrRejected: boolean;
  rounds: SemanticExpansionRoundTrace[];
  totalResults: number;
  totalMappedNodes: number;
  totalUnresolved: number;
  totalRejected: number;
  pendingQuery: string;
  pendingQueryHash: string;
  pendingRequestedLimit: number;
  pendingRetrievedCount: number;
  pendingTruncated: boolean;
}

function semanticExpansionStatusOf(state: SemanticState): SemanticExpansionStatus {
  if (!state.enabled) return 'DISABLED';
  if (state.failure) return 'DEGRADED';
  if (state.nodeBound || state.resultsBound || state.providerTruncated) return 'LIMITED';
  if (state.mappedSomething) return state.unresolvedOrRejected ? 'PARTIAL' : 'SUCCESS';
  return 'EMPTY';
}

function semanticTraceOf(state: SemanticState): SemanticExpansionTrace {
  return {
    status: semanticExpansionStatusOf(state),
    rounds: state.rounds,
    totalSemanticResults: state.totalResults,
    totalMappedNodes: state.totalMappedNodes,
    totalUnresolved: state.totalUnresolved,
    totalRejected: state.totalRejected,
    semanticNodeBoundReached: state.nodeBound,
    totalResultsBoundReached: state.resultsBound,
    providerTruncated: state.providerTruncated,
  };
}