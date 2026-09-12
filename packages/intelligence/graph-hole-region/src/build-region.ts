// ============================================================================
// buildRegion — deterministic candidate-region builder (Phase 5A-PR1)
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
//        - optional PR2 semantic seam adds observations
//        - hard budgets applied to nodes / edges / observations
//        - saturation evaluated AFTER each round (two CONSECUTIVE satisfying
//          rounds required; a round that hits a hard bound cannot count)
//   3. FINALIZE
//        - status by documented precedence: DEGRADED > LIMITED > SATURATED
//        - identity + regionId = sha256(canonicalizeRegionIdentity(identity))
//
// Semantic invariants:
//   - a region is context, NOT a graph-hole candidate (detection is later PRs)
//   - SATURATED != completeness; LIMITED is never downgraded to SATURATED;
//     provider failure is never rewarded with SATURATED
//   - case isolation is enforced twice (orchestrator + provider authority)
//   - every output ID set is sorted/unique; nothing ties regionId to execution
// ============================================================================

import {
  MAX_CONTEXT_OBSERVATIONS,
  MAX_REGION_EDGES,
  MAX_REGION_EXPANSION_ROUNDS,
  MAX_REGION_NODES,
  MAX_SEMANTIC_RESULTS_PER_ROUND,
  MAX_TOTAL_SEMANTIC_RESULTS,
  RegionIdentityV1Schema,
} from '@indago/contracts';
import type { RegionStatus } from '@indago/contracts';
import { SATURATION_DEFINITION_V1, SaturationTracker } from './calculate-saturation.js';
import { applyBudget } from './region-bounds.js';
import { computeRegionId, sortedUnique } from './region-identity.js';
import { resolveSeedNodeIds } from './resolve-observation-nodes.js';
import { RegionBuildError } from './types.js';
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

  const temporalContext = input.temporalContext ?? undefined;
  const seedAttempt = sortedUnique(input.seedObservationIds);
  const degradations = new Limitations();

  // ---- Seeds: resolve observations (provider failure → degraded, never saturated) ----
  let seedObservations: readonly SeedObservation[];
  try {
    seedObservations = await deps.resolveObservations(seedAttempt);
  } catch {
    degradations.add('OBSERVATION_RESOLUTION_FAILED');
    return finalizeRegion(input, degradations, {
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
    return finalizeRegion(input, degradations, {
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
    return finalizeRegion(input, degradations, {
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
  let totalSemanticResults = 0;
  const observationSet = new Set(observationIds);

  if (!hardStop) {
    let saturated = false;
    for (let round = 1; round <= MAX_REGION_EXPANSION_ROUNDS; round++) {
      let providerFailure = false;

      // ---- Optional PR2 semantic seam ----
      let addedObservations: readonly string[] = [];
      if (deps.context.retrieveSemanticContext) {
        try {
          const results = sortedUnique(
            await deps.context.retrieveSemanticContext({
              caseId: input.caseId,
              graphVersionId: input.graphVersionId,
              regionNodeIds: nodeIds,
temporalContext: temporalContext,
            }),
          ).filter((id) => !observationSet.has(id));
          const perRound = applyBudget(results, 0, MAX_SEMANTIC_RESULTS_PER_ROUND).kept;
          const remainingTotal = MAX_TOTAL_SEMANTIC_RESULTS - totalSemanticResults;
          const admitted = applyBudget(perRound, 0, remainingTotal).kept;
          addedObservations = admitted;
          totalSemanticResults += admitted.length;
          for (const id of admitted) observationSet.add(id);
        } catch {
          degradations.add('EXPANSION_PROVIDER_FAILURE');
          providerFailure = true;
        }
      }

      if (providerFailure) break;

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
      const boundedNodes = applyBudget(candidateNodeIds, nodeIds.length, MAX_REGION_NODES);
      const addedNodes = [...boundedNodes.kept];
      if (boundedNodes.boundReached) {
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

      const budgetBoundReached =
        boundedNodes.boundReached ||
        edgeBoundReached ||
        observationBoundReached;

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

  return finalizeRegion(input, degradations, {
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
  };
}

/**
 * Status precedence (documented, deterministic):
 *   DEGRADED  — known incomplete/degraded context (unresolved seeds,
 *               provider failure) — never redeems to SATURATED.
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
      [
        'CONTEXT_OBSERVATION_BOUND_REACHED',
        'REGION_NODE_BOUND_REACHED',
        'REGION_EDGE_BOUND_REACHED',
        'EXPANSION_ROUND_LIMIT_REACHED',
      ].includes(code),
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