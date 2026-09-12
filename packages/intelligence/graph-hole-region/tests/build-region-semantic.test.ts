import { describe, it, expect } from 'vitest';
import { buildGraph } from '@indago/graphology-projection';
import type { GraphProjectionInput } from '@indago/graphology-projection';
import type { SemanticRetrievalPort, SemanticSearchResult } from '@indago/contracts';
import {
  MAX_CONTEXT_OBSERVATIONS,
  MAX_REGION_NODES,
  MAX_SEMANTIC_NODES_ADDED,
  MAX_SEMANTIC_RESULTS_PER_ROUND,
  MAX_TOTAL_SEMANTIC_RESULTS,
} from '@indago/contracts';
import {
  buildRegion,
  ProjectedGraphExpansionProvider,
  AuthoritativeSemanticNodeAdapter,
  regionSemanticQueryOf,
  sha256Hex,
  computeRegionId,
  sortedUnique,
} from '../src/index.js';
import type { RegionBuildDependencies } from '../src/index.js';
import {
  uuid,
  node,
  edge,
  CASE_A,
  CASE_B,
  VERSION_A,
  NODE_CENTER,
  NODE_LEAF_A,
  NODE_LEAF_B,
  NODE_ISLE,
  EDGE_A,
  EDGE_B,
  OBS_1,
} from './helpers/fixtures.js';

// ============================================================================
// Phase 5A-PR2 — buildRegion semantic node-expansion integration
//
// Pins the six semantic expansion statuses end-to-end through the real
// orchestrator + production adapter, plus the budgets, determinism, no-feedback
// and case-isolation invariants.
// ============================================================================

const OBS_ISLE = uuid(0x40000001);

function hit(unit: string, sourceId: string): SemanticSearchResult {
  return {
    semanticTextUnitId: uuid(0x50100000),
    contentHash: sha256Hex(unit),
    providerId: 'deterministic-test',
    modelId: 'deterministic',
    modelVersion: 'v1',
    dimensions: 768,
    embeddingPolicyVersion: 'v1',
    similarity: 0.9,
    normalizedText: unit,
    sourceType: 'OBSERVATION',
    sourceId,
  };
}

const centerResolver: RegionBuildDependencies['resolveObservations'] = async (ids) =>
  ids.filter((id) => id === OBS_1).map((id) => ({ id, entityIds: [NODE_CENTER] }));

function depsFor(
  projection: GraphProjectionInput,
  opts: {
    port?: SemanticRetrievalPort;
    resolveSourceEntities?: (input: {
      caseId: string;
      sourceType: string;
      sourceId: string;
    }) => Promise<readonly string[]>;
    resolveObservations?: RegionBuildDependencies['resolveObservations'];
  } = {},
): RegionBuildDependencies {
  const built = buildGraph(projection);
  const provider = new ProjectedGraphExpansionProvider(built, VERSION_A);
  const deps: RegionBuildDependencies = {
    context: provider,
    resolveObservations: opts.resolveObservations ?? centerResolver,
  };
  if (opts.port != null && opts.resolveSourceEntities != null) {
    deps.semanticExpansion = {
      port: opts.port,
      adapter: new AuthoritativeSemanticNodeAdapter(),
      resolveSourceEntities: opts.resolveSourceEntities,
    };
  }
  return deps;
}

/** Center + leaves (star) plus a DISCONNECTED node only semantics can reach. */
function projectionWithIsle(): GraphProjectionInput {
  return {
    caseId: CASE_A,
    nodes: [
      node(NODE_CENTER, 'Center'),
      node(NODE_LEAF_A, 'Leaf-A'),
      node(NODE_LEAF_B, 'Leaf-B'),
      node(NODE_ISLE, 'Isle'),
    ],
    edges: [
      edge(EDGE_A, NODE_CENTER, NODE_LEAF_A),
      edge(EDGE_B, NODE_CENTER, NODE_LEAF_B),
    ],
  };
}

const isleResolver = async (input: {
  caseId: string;
  sourceType: string;
  sourceId: string;
}): Promise<readonly string[]> => {
  if (input.caseId !== CASE_A) return [];
  if (input.sourceType === 'OBSERVATION' && input.sourceId === OBS_ISLE) return [NODE_ISLE];
  return [];
};

/** Stateless port: the first-ever query (the seed-state query) maps; later ones empty. */
function islePort(firstQuery: string): SemanticRetrievalPort {
  return {
    retrieve: async (request) => ({
      caseId: request.caseId,
      queryHash: sha256Hex(request.query),
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: 'v1',
      results: request.query === firstQuery ? [hit('isle-unit', OBS_ISLE)] : [],
      truncated: false,
    }),
  };
}

describe('buildRegion — semantic expansion statuses', () => {
  it('SUCCESS: maps a disconnected node + traces rounds; region SATURATED and deterministic', async () => {
    const firstQuery = regionSemanticQueryOf([NODE_CENTER]);
    const deps = depsFor(projectionWithIsle(), {
      port: islePort(firstQuery),
      resolveSourceEntities: isleResolver,
    });
    const input = { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] };

    const region = await buildRegion(input, deps);

    expect(region.status).toBe('SATURATED');
    expect(region.nodeIds).toEqual(sortedUnique([NODE_CENTER, NODE_LEAF_A, NODE_LEAF_B, NODE_ISLE]));

    const sem = region.semanticExpansion;
    expect(sem.status).toBe('SUCCESS');
    expect(sem.totalSemanticResults).toBe(1);
    expect(sem.totalMappedNodes).toBe(1);
    expect(sem.totalUnresolved).toBe(0);
    expect(sem.totalRejected).toBe(0);
    expect(sem.semanticNodeBoundReached).toBe(false);
    expect(sem.totalResultsBoundReached).toBe(false);
    expect(sem.rounds).toHaveLength(3);
    expect(sem.rounds[0].round).toBe(1);
    expect(sem.rounds[0].admittedNodeIds).toEqual([NODE_ISLE]);
    expect(sem.rounds[0].mappedCount).toBe(1);
    expect(sem.rounds[0].requestedLimit).toBe(MAX_SEMANTIC_RESULTS_PER_ROUND);
    expect(sem.rounds[0].retrievedCount).toBe(1);
    expect(sem.rounds[1].admittedNodeIds).toEqual([]);
    expect(sem.rounds[2].admittedNodeIds).toEqual([]);

    // Round-record observation surface: the mapped observation entered round 1.
    expect(region.roundRecords[0].addedObservationIds).toEqual([OBS_ISLE]);
    expect(region.roundRecords[1].addedObservationIds).toEqual([]);

    // The round-trace query obeys region-membership-only construction.
    expect(sem.rounds[0].query).toBe(firstQuery);
    expect(sem.rounds[1].query).toBe(regionSemanticQueryOf(region.nodeIds));
    expect(sem.rounds[2].query).toBe(regionSemanticQueryOf(region.nodeIds));
    expect(sem.rounds[1].query).not.toBe(firstQuery);
    expect(sem.rounds[1].query.split(' ')).toEqual([...region.nodeIds].sort());
    for (const r of sem.rounds) {
      expect(r.query).not.toContain('isle-unit');
      expect(r.queryHash).toBe(sha256Hex(r.query));
    }

    // Identity is content-addressed over regions ONLY (no semantic trace).
    expect(region.identity.seedObservationIds).toEqual([OBS_1]);
    const manual = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      temporalContext: null,
      seedObservationIds: [OBS_1],
      nodeIds: region.nodeIds,
      edgeIds: region.edgeIds,
    }).regionId;
    expect(region.regionId).toBe(manual);

    // Determinism: a second build is deep-equal (stateless port).
    const again = await buildRegion(input, deps);
    expect(again).toEqual(region);

    // The low-similarity hit is irrelevant: mapping is authoritative-only.
    expect(region.roundRecords[0].addedNodeIds).toContain(NODE_ISLE);
  });

  it('EMPTY: zero hits is an honest empty, not a downgrade', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: islePort(regionSemanticQueryOf([NODE_CENTER])),
      resolveSourceEntities: isleResolver,
    });
    // Make the port return nothing for every query.
    deps.semanticExpansion = {
      ...deps.semanticExpansion!,
      port: {
        retrieve: async (request) => ({
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: [],
          truncated: false,
        }),
      },
    };

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    expect(region.semanticExpansion.status).toBe('EMPTY');
    expect(region.semanticExpansion.totalSemanticResults).toBe(0);
    expect(region.semanticExpansion.totalMappedNodes).toBe(0);
    expect(region.semanticExpansion.rounds).toHaveLength(3);
    for (const r of region.semanticExpansion.rounds) {
      expect(r.retrievedCount).toBe(0);
    }
    expect(region.nodeIds).toEqual(sortedUnique([NODE_CENTER, NODE_LEAF_A, NODE_LEAF_B]));
    expect(region.status).toBe('SATURATED');
  });

  it('PARTIAL: some hits map, at least one is unresolved', async () => {
    const ghostObs = uuid(0x40000098);
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async (request) => ({
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: [hit('isle-unit', OBS_ISLE), hit('ghost-unit', ghostObs)],
          truncated: false,
        }),
      },
      resolveSourceEntities: async (input) => {
        if (input.caseId !== CASE_A || input.sourceType !== 'OBSERVATION') return [];
        if (input.sourceId === OBS_ISLE) return [NODE_ISLE];
        return [];
      },
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    const sem = region.semanticExpansion;
    expect(sem.status).toBe('PARTIAL');
    expect(sem.totalSemanticResults).toBe(6);
    expect(sem.totalMappedNodes).toBe(1);
    expect(sem.totalUnresolved).toBe(3);
    expect(sem.totalRejected).toBe(0);
    expect(sem.rounds).toHaveLength(3);
    expect(sem.rounds[0].retrievedCount).toBe(2);
    expect(sem.rounds[0].mappedCount).toBe(1);
    expect(sem.rounds[0].unresolvedCount).toBe(1);
    // Unresolved ghost never becomes a node and never enters the observation surface.
    expect(region.nodeIds).toContain(NODE_ISLE);
    expect(region.roundRecords[0].addedObservationIds).toEqual([OBS_ISLE]);
    // Repeated obs novelty keeps the region from saturating → round-limit LIMITED.
    expect(region.limitations).toContain('EXPANSION_ROUND_LIMIT_REACHED');
    expect(region.status).toBe('LIMITED');
  });

  it('DEGRADED: a failing port degrades the region (never a fake success)', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async () => {
          throw new Error('semantic retrieval unavailable');
        },
      },
      resolveSourceEntities: isleResolver,
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('SEMANTIC_RETRIEVAL_FAILURE');
    expect(region.truncated).toBe(false);
    expect(region.expansionRounds).toBe(0);
    expect(region.roundRecords).toEqual([]);
    const sem = region.semanticExpansion;
    expect(sem.status).toBe('DEGRADED');
    expect(sem.rounds).toEqual([]);
    expect(sem.totalSemanticResults).toBe(0);
    // Recovered recall, no fabricated nodes: still a valid seed-only region.
    expect(region.nodeIds).toEqual([NODE_CENTER]);
    expect(region.edgeIds).toEqual(sortedUnique([EDGE_A, EDGE_B]));
  });

  it('DEGRADED: a cross-case retrieval envelope is rejected at the boundary', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async (request) => ({
          caseId: CASE_B,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: [],
          truncated: false,
        }),
      },
      resolveSourceEntities: isleResolver,
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('SEMANTIC_RETRIEVAL_FAILURE');
    expect(region.semanticExpansion.status).toBe('DEGRADED');
    expect(region.nodeIds).toEqual([NODE_CENTER]);
  });

  it('LIMITED: semantic results + node budgets stop expansion at 50/50', async () => {
    const islands = Array.from({ length: 60 }, (_, i) => uuid(0x31000000 + i));
    const islandObs = Array.from({ length: 60 }, (_, i) => uuid(0x22000000 + i));
    const projection: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [
        node(NODE_CENTER, 'Center'),
        node(NODE_LEAF_A, 'Leaf-A'),
        node(NODE_LEAF_B, 'Leaf-B'),
        ...islands.map((id, i) => node(id, `Island-${i}`)),
      ],
      edges: [
        edge(EDGE_A, NODE_CENTER, NODE_LEAF_A),
        edge(EDGE_B, NODE_CENTER, NODE_LEAF_B),
      ],
    };

    let call = 0;
    const port: SemanticRetrievalPort = {
      retrieve: async (request) => {
        const start = call * MAX_SEMANTIC_RESULTS_PER_ROUND;
        call += 1;
        return {
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: islandObs
            .slice(start, start + request.limit)
            .map((ob) => hit(`u-${ob}`, ob)),
          truncated: false,
        };
      },
    };
    const resolveSourceEntities = async (input: {
      caseId: string;
      sourceType: string;
      sourceId: string;
    }): Promise<readonly string[]> => {
      if (input.caseId !== CASE_A || input.sourceType !== 'OBSERVATION') return [];
      const idx = islandObs.indexOf(input.sourceId);
      return idx >= 0 ? [islands[idx] as string] : [];
    };

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      depsFor(projection, { port, resolveSourceEntities }),
    );

    expect(region.status).toBe('LIMITED');
    expect(region.limitations).toContain('SEMANTIC_RESULTS_BOUND_REACHED');
    expect(region.limitations).toContain('SEMANTIC_NODE_BOUND_REACHED');

    const sem = region.semanticExpansion;
    expect(sem.status).toBe('LIMITED');
    expect(sem.totalResultsBoundReached).toBe(true);
    expect(sem.semanticNodeBoundReached).toBe(true);
    expect(sem.totalSemanticResults).toBe(MAX_TOTAL_SEMANTIC_RESULTS);
    expect(sem.totalMappedNodes).toBe(MAX_SEMANTIC_NODES_ADDED);
    expect(sem.rounds).toHaveLength(3);
    expect(sem.rounds.map((r) => r.requestedLimit)).toEqual([
      MAX_SEMANTIC_RESULTS_PER_ROUND,
      MAX_SEMANTIC_RESULTS_PER_ROUND,
      10,
    ]);
    expect(sem.rounds.map((r) => r.retrievedCount)).toEqual([20, 20, 10]);
    expect(sem.rounds[0].admittedNodeIds).toHaveLength(20);
    expect(sem.rounds[1].admittedNodeIds).toHaveLength(20);
    expect(sem.rounds[2].admittedNodeIds).toHaveLength(10);

    // Hard region-node budget is never exceeded even with semantics pouring in.
    expect(region.expansionRounds).toBe(3);
    expect(sem.totalMappedNodes + region.resolvedSeedNodeIds.length).toBeLessThanOrEqual(
      MAX_REGION_NODES,
    );
    expect(region.nodeIds.length).toBe(1 + 2 + 50);
    expect(region.nodeIds).toEqual(region.nodeIds.slice().sort());
    expect(region.roundRecords[2].budgetBoundReached).toBe(true);
    expect(region.roundRecords[2].addedNodeIds).toHaveLength(10);

    // The context observation cap stays respected (seed + 50 mapped, all unique).
    expect(region.roundRecords[2].totalObservationIds).toBeLessThanOrEqual(
      MAX_CONTEXT_OBSERVATIONS,
    );
  });

  it('semantic nodes pull their incident edges into the region', async () => {
    const nodeS1 = uuid(0x32000001);
    const nodeS2 = uuid(0x32000002);
    const obsS1 = uuid(0x2a000001);
    const edgeS = uuid(0x15000001);
    const projection: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [
        node(NODE_CENTER, 'Center'),
        node(NODE_ISLE, 'Isle'),
        node(nodeS1, 'Sem-1'),
        node(nodeS2, 'Sem-2'),
      ],
      edges: [edge(edgeS, nodeS1, nodeS2)],
    };
    const firstQuery = regionSemanticQueryOf([NODE_CENTER]);
    const deps = depsFor(projection, {
      port: {
        retrieve: async (request) => ({
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: request.query === firstQuery ? [hit('sem1-unit', obsS1)] : [],
          truncated: false,
        }),
      },
      resolveSourceEntities: async (input) => {
        if (input.caseId !== CASE_A) return [];
        if (input.sourceType === 'OBSERVATION' && input.sourceId === obsS1) return [nodeS1];
        return [];
      },
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    expect(region.nodeIds).toContain(nodeS1);
    expect(region.edgeIds).toContain(edgeS);
    expect(region.semanticExpansion.status).toBe('SUCCESS');
    // Edge added in the same round the semantic node entered.
    expect(region.roundRecords[0].addedEdgeIds).toContain(edgeS);
  });
});