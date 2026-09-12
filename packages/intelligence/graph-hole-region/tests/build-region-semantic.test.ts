import { describe, it, expect } from 'vitest';
import { buildGraph } from '@indago/graphology-projection';
import type { GraphProjectionInput } from '@indago/graphology-projection';
import type { SemanticRetrievalPort, SemanticSearchResult, TemporalInterval } from '@indago/contracts';
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
  buildRegionSemanticQuery,
  sha256Hex,
  computeRegionId,
  sortedUnique,
} from '../src/index.js';
import type {
  RegionBuildDependencies,
  RegionSemanticContextResolver,
  SemanticContextItem,
} from '../src/index.js';
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
// orchestrator + production adapter, plus the budgets, failure isolation,
// provider-truncation handling, bounded-context query construction, identity
// and determinism/no-feedback invariants.
// ============================================================================

// A stable, authoritative context unit the injected resolver returns for the
// region. Queries are built from THIS text (never from retrieved text) plus
// sorted membership — so a query is never a bare/near-bare identifier payload.
const OBS_CTX = uuid(0x2f000001);
const CONTEXT_UNIT: SemanticContextItem = {
  sourceType: 'OBSERVATION',
  sourceId: OBS_CTX,
  content: 'regional source context describing movement and transit patterns',
};

const contextResolverFor =
  (unit: SemanticContextItem = CONTEXT_UNIT): RegionSemanticContextResolver =>
  async () => [unit];

function ctxQuery(nodeIds: readonly string[]): string {
  return buildRegionSemanticQuery([CONTEXT_UNIT], nodeIds);
}

// Fixed, deterministic resolved node ids for semantic hits.
const OBS_ISLE = uuid(0x40000001);
const OBS_LEAF = uuid(0x40000002);

function hit(unit: string, sourceId: string, textOverride?: string): SemanticSearchResult {
  return {
    semanticTextUnitId: uuid(0x50100000),
    contentHash: sha256Hex(textOverride ?? unit),
    providerId: 'deterministic-test',
    modelId: 'deterministic',
    modelVersion: 'v1',
    dimensions: 768,
    embeddingPolicyVersion: 'v1',
    similarity: 0.9,
    normalizedText: textOverride ?? unit,
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
    getSemanticContextForRegion?: RegionSemanticContextResolver;
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
      getSemanticContextForRegion: opts.getSemanticContextForRegion ?? contextResolverFor(),
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

function emptyPort(): SemanticRetrievalPort {
  return {
    retrieve: async (request) => ({
      caseId: request.caseId,
      queryHash: sha256Hex(request.query),
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: 'v1',
      results: [],
      truncated: false,
    }),
  };
}

describe('buildRegion — semantic expansion statuses', () => {
  it('SUCCESS: maps a disconnected node + traces rounds; region SATURATED and deterministic', async () => {
    const firstQuery = ctxQuery([NODE_CENTER]);
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
    expect(sem.providerTruncated).toBe(false);
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

    // Queries are built from bounded authoritative context + sorted membership
    // (NOT bare identifiers, NOT retrieved text — no semantic feedback loop).
    expect(sem.rounds[0].query).toBe(firstQuery);
    expect(sem.rounds[1].query).toBe(ctxQuery(region.nodeIds));
    expect(sem.rounds[2].query).toBe(ctxQuery(region.nodeIds));
    expect(sem.rounds[1].query).not.toBe(firstQuery);
    expect(sem.rounds[0].query).toContain('movement and transit patterns');
    expect(sem.rounds[0].query).toContain('nodes:');
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
    // Semantic bounds do not stop graph rounds: graph caps never fired.
    for (const record of region.roundRecords) {
      expect(record.budgetBoundReached).toBe(false);
    }
  });

  it('EMPTY: zero hits is an honest empty, not a downgrade', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: emptyPort(),
      resolveSourceEntities: isleResolver,
    });

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
    expect(sem.providerTruncated).toBe(false);
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

  it('DEGRADED: a failing port degrades the region but NEVER halts graph expansion', async () => {
    let portCalls = 0;
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async () => {
          portCalls += 1;
          throw new Error('semantic retrieval unavailable');
        },
      },
      resolveSourceEntities: isleResolver,
    });
    const controlDeps = depsFor(projectionWithIsle(), {
      port: undefined,
      resolveSourceEntities: undefined,
    });
    const input = { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] };

    const region = await buildRegion(input, deps);
    const control = await buildRegion(input, controlDeps);

    // FAILURE ISOLATION: the same deterministic M-A13 graph expansion still ran —
    // identical membership, round records, edges and regionId as the control PR1
    // build (which never even tried semantics).
    expect(region.nodeIds).toEqual(control.nodeIds);
    expect(region.edgeIds).toEqual(control.edgeIds);
    expect(region.roundRecords).toEqual(control.roundRecords);
    expect(region.expansionRounds).toBe(3);
    expect(region.roundRecords).toHaveLength(3);
    expect(region.regionId).toBe(control.regionId);

    // The semantic sub-system is honest about the failure: DEGRADED, never a
    // fake empty and never allowed to pretend it saturated.
    expect(region.status).toBe('DEGRADED');
    expect(control.status).toBe('SATURATED');
    expect(region.limitations).toContain('SEMANTIC_RETRIEVAL_FAILURE');
    expect(region.truncated).toBe(false);
    const sem = region.semanticExpansion;
    expect(sem.status).toBe('DEGRADED');
    expect(sem.rounds).toEqual([]);
    expect(sem.totalSemanticResults).toBe(0);
    // Semantic fault surfaced once; retrieval was disabled for the rest of the build.
    expect(portCalls).toBe(1);
    // No fabricated nodes: membership is exactly the PR1 graph expansion.
    expect(region.nodeIds).toEqual(sortedUnique([NODE_CENTER, NODE_LEAF_A, NODE_LEAF_B]));
    expect(region.edgeIds).toEqual(sortedUnique([EDGE_A, EDGE_B]));
  });

  it('DEGRADED: a cross-case retrieval envelope is rejected at the boundary; graph still expands', async () => {
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
    expect(region.expansionRounds).toBe(3);
    expect(region.roundRecords).toHaveLength(3);
    expect(region.nodeIds).toEqual(sortedUnique([NODE_CENTER, NODE_LEAF_A, NODE_LEAF_B]));
  });

  it('LIMITED: semantic results + node budgets stop expansion at 50/50 (graph caps stay quiet)', async () => {
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
    expect(sem.providerTruncated).toBe(false);
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

    // BUDGET SEPARATION: semantic bounds disable future semantic rounds but are
    // NOT graph caps — no round reports a graph budget break, and all three
    // graph rounds ran.
    expect(region.expansionRounds).toBe(3);
    for (const record of region.roundRecords) {
      expect(record.budgetBoundReached).toBe(false);
    }
    // Hard region-node budget is never exceeded even with semantics pouring in.
    expect(sem.totalMappedNodes + region.resolvedSeedNodeIds.length).toBeLessThanOrEqual(
      MAX_REGION_NODES,
    );
    expect(region.nodeIds.length).toBe(1 + 2 + 50);
    expect(region.nodeIds).toEqual(region.nodeIds.slice().sort());
    expect(region.roundRecords[2].addedNodeIds).toHaveLength(10);

    // The context observation cap stays respected (seed + mapped obs, all unique).
    expect(region.roundRecords[2].totalObservationIds).toBeLessThanOrEqual(
      MAX_CONTEXT_OBSERVATIONS,
    );
  });

  it('LIMITED: an explicit provider truncation disables later retrieval but not graph rounds', async () => {
    const islands = Array.from({ length: 20 }, (_, i) => uuid(0x33000000 + i));
    const islandObs = Array.from({ length: 20 }, (_, i) => uuid(0x25000000 + i));
    const projection: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [
        node(NODE_CENTER, 'Center'),
        node(NODE_LEAF_A, 'Leaf-A'),
        node(NODE_LEAF_B, 'Leaf-B'),
        ...islands.map((id, i) => node(id, `Island-${i}`)),
      ],
      edges: [edge(EDGE_A, NODE_CENTER, NODE_LEAF_A), edge(EDGE_B, NODE_CENTER, NODE_LEAF_B)],
    };
    let calls = 0;
    const port: SemanticRetrievalPort = {
      retrieve: async (request) => {
        calls += 1;
        return {
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: islandObs.slice(0, request.limit).map((ob) => hit(`t-${ob}`, ob)),
          truncated: true,
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

    // provider-reported truncation ⇒ semantic LIMITed, and only round 1 retrieved.
    const sem = region.semanticExpansion;
    expect(sem.status).toBe('LIMITED');
    expect(sem.providerTruncated).toBe(true);
    expect(sem.totalSemanticResults).toBe(MAX_SEMANTIC_RESULTS_PER_ROUND);
    expect(sem.rounds).toHaveLength(1);
    expect(sem.rounds[0].truncated).toBe(true);
    expect(calls).toBe(1);
    expect(region.limitations).toContain('SEMANTIC_RESULTS_TRUNCATED');
    expect(region.status).toBe('LIMITED');
    expect(region.truncated).toBe(true);

    // Graph expansion proceeded all three rounds (semantic truncation is not a
    // graph cap, and it does not fabricate results).
    expect(region.expansionRounds).toBe(3);
    expect(region.roundRecords).toHaveLength(3);
    expect(region.nodeIds).toContain(NODE_LEAF_A);
    expect(region.nodeIds).toContain(NODE_LEAF_B);
    expect(region.nodeIds.length).toBe(3 + MAX_SEMANTIC_RESULTS_PER_ROUND);
    expect(region.semanticExpansion.totalMappedNodes).toBe(
      MAX_SEMANTIC_RESULTS_PER_ROUND,
    );
    // Never inferred from retrievedCount < requestedLimit: here the flag is real.
    // (The SUCCESS test above proves a short result set WITHOUT the flag stays
    // non-truncated.)
  });

  it('does NOT infer truncation from retrievedCount < requestedLimit', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async (request) => ({
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: request.query === ctxQuery([NODE_CENTER]) ? [hit('isle-unit', OBS_ISLE)] : [],
          truncated: false,
        }),
      },
      resolveSourceEntities: isleResolver,
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    const sem = region.semanticExpansion;
    expect(sem.status).toBe('SUCCESS');
    expect(sem.providerTruncated).toBe(false);
    for (const r of sem.rounds) {
      expect(r.truncated).toBe(false);
    }
    // retrievedCount (1) < requestedLimit (20) across every round — never read as truncation.
    expect(sem.rounds.every((r) => r.retrievedCount < r.requestedLimit)).toBe(true);
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
    const firstQuery = ctxQuery([NODE_CENTER]);
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

  it('duplicate semantic hits across rounds recount no node', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async (request) => ({
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          results: [hit('isle-unit', OBS_ISLE)],
          truncated: false,
        }),
      },
      resolveSourceEntities: isleResolver,
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    const sem = region.semanticExpansion;
    // The same hit maps every round; the node is admitted exactly once.
    expect(sem.rounds).toHaveLength(3);
    expect(sem.totalSemanticResults).toBe(3);
    expect(sem.totalMappedNodes).toBe(1);
    expect(sem.rounds[0].admittedNodeIds).toEqual([NODE_ISLE]);
    expect(sem.rounds[1].admittedNodeIds).toEqual([]);
    expect(sem.rounds[2].admittedNodeIds).toEqual([]);
  });

  it('observation surface is independent of node admission (mapped obs surfaces even when admission is blocked)', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async (request) => ({
          caseId: request.caseId,
          queryHash: sha256Hex(request.query),
          semanticRetrievalPolicyVersion: 'v1',
          embeddingPolicyVersion: 'v1',
          // Every round returns BOTH hits; the leaf node is graph-resident, the
          // isle node is admitted only once.
          results: [hit('isle-unit', OBS_ISLE), hit('leaf-unit', OBS_LEAF)],
          truncated: false,
        }),
      },
      resolveSourceEntities: async (input) => {
        if (input.caseId !== CASE_A || input.sourceType !== 'OBSERVATION') return [];
        if (input.sourceId === OBS_ISLE) return [NODE_ISLE];
        if (input.sourceId === OBS_LEAF) return [NODE_LEAF_A];
        return [];
      },
    });

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );

    // Round 2 admits nothing (isle already resident, leaf graph-resident) yet
    // STILL surfaces the mapped leaf observation — recall context is independent
    // of node admission/budget.
    expect(region.semanticExpansion.rounds[1].admittedNodeIds).toEqual([]);
    expect(region.roundRecords[1].addedObservationIds).toContain(OBS_LEAF);
    expect(region.roundRecords[1].addedNodeIds).toEqual([]);
    // And the isle observation entered round 1 alongside its node.
    expect(region.roundRecords[0].addedObservationIds).toEqual([OBS_ISLE, OBS_LEAF]);
  });
});

describe('buildRegion — temporal context reaches the semantic retrieval boundary', () => {
  it('passes the region temporal context through the query dependency and the port request', async () => {
    const TEMPORAL: TemporalInterval = {
      validFrom: { value: '2024-01-01T00:00:00Z', precision: 'day' },
      validTo: { value: '2024-02-01T00:00:00Z', precision: 'day' },
      precision: 'day',
      semantics: 'observed',
    };
    const observedTemporal: Array<TemporalInterval | null | undefined> = [];
    const resolverTemporal: Array<TemporalInterval | null | undefined> = [];
    const firstQuery = ctxQuery([NODE_CENTER]);
    const deps = depsFor(projectionWithIsle(), {
      port: {
        retrieve: async (request) => {
          observedTemporal.push(request.temporalContext);
          return {
            caseId: request.caseId,
            queryHash: sha256Hex(request.query),
            semanticRetrievalPolicyVersion: 'v1',
            embeddingPolicyVersion: 'v1',
            results: request.query === firstQuery ? [hit('isle-unit', OBS_ISLE)] : [],
            truncated: false,
          };
        },
      },
      resolveSourceEntities: isleResolver,
      getSemanticContextForRegion: async (request) => {
        resolverTemporal.push(request.temporalContext ?? null);
        return [CONTEXT_UNIT];
      },
    });

    const region = await buildRegion(
      {
        caseId: CASE_A,
        graphVersionId: VERSION_A,
        seedObservationIds: [OBS_1],
        temporalContext: TEMPORAL,
      },
      deps,
    );

    // The authoritative retrieval boundary (the port's storage/engine) receives
    // the temporal context; so does the case/temporal-scoped context resolver —
    // and the adapter performs NO temporal revalidation of its own.
    for (const captured of observedTemporal) {
      expect(captured).toEqual(TEMPORAL);
    }
    for (const captured of resolverTemporal) {
      expect(captured).toEqual(TEMPORAL);
    }
    expect(region.nodeIds).toContain(NODE_ISLE);
  });
});

describe('buildRegion — semantic query construction', () => {
  it('builds queries from authoritative context content, never retrieved text', async () => {
    // Two builds with the SAME hit but wildly different retrieved normalizedText
    // (the only thing about a hit that "feedback" could ever feed back).
    const buildWith = async (text: string) => {
      const deps = depsFor(projectionWithIsle(), {
        port: {
          retrieve: async (request) => ({
            caseId: request.caseId,
            queryHash: sha256Hex(request.query),
            semanticRetrievalPolicyVersion: 'v1',
            embeddingPolicyVersion: 'v1',
            results:
              request.query === ctxQuery([NODE_CENTER])
                ? [hit('isle-unit', OBS_ISLE, text)]
                : [],
            truncated: false,
          }),
        },
        resolveSourceEntities: isleResolver,
      });
      return buildRegion(
        { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
        deps,
      );
    };

    const [regionA, regionB] = await Promise.all([
      buildWith('ALPHA RETRIEVED TOKEN SEQUENCE ONE'),
      buildWith('ZEBRA RETRIEVED TOKEN SEQUENCE TWO'),
    ]);

    // Identical query text ⇒ identical queryHash, membership and region id.
    expect(regionA.semanticExpansion.rounds).toEqual(regionB.semanticExpansion.rounds);
    expect(regionA.regionId).toBe(regionB.regionId);
    for (const roundTrace of regionA.semanticExpansion.rounds) {
      expect(roundTrace.query).not.toContain('ALPHA');
      expect(roundTrace.query).not.toContain('ZEBRA');
      expect(roundTrace.query).toContain('movement and transit patterns');
    }
  });

  it('reordered retrieval results yield the same region (deterministic admission)', async () => {
    const isleObs2 = uuid(0x40000003);
    const ISLE_A = uuid(0x34000001);
    const ISLE_B = uuid(0x34000002);
    const projection: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [
        node(NODE_CENTER, 'Center'),
        node(NODE_LEAF_A, 'Leaf-A'),
        node(NODE_LEAF_B, 'Leaf-B'),
        node(ISLE_A, 'Isle-A'),
        node(ISLE_B, 'Isle-B'),
      ],
      edges: [edge(EDGE_A, NODE_CENTER, NODE_LEAF_A), edge(EDGE_B, NODE_CENTER, NODE_LEAF_B)],
    };
    const buildWith = async (order: 'ab' | 'ba') => {
      const deps = depsFor(projection, {
        port: {
          retrieve: async (request) => ({
            caseId: request.caseId,
            queryHash: sha256Hex(request.query),
            semanticRetrievalPolicyVersion: 'v1',
            embeddingPolicyVersion: 'v1',
            results:
              request.query === ctxQuery([NODE_CENTER])
                ? order === 'ab'
                  ? [hit('a-unit', OBS_ISLE), hit('b-unit', isleObs2)]
                  : [hit('b-unit', isleObs2), hit('a-unit', OBS_ISLE)]
                : [],
            truncated: false,
          }),
        },
        resolveSourceEntities: async (input) => {
          if (input.caseId !== CASE_A || input.sourceType !== 'OBSERVATION') return [];
          if (input.sourceId === OBS_ISLE) return [ISLE_A];
          if (input.sourceId === isleObs2) return [ISLE_B];
          return [];
        },
      });
      return buildRegion(
        { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
        deps,
      );
    };

    const regionA = await buildWith('ab');
    const regionB = await buildWith('ba');

    expect(regionA.nodeIds).toEqual(regionB.nodeIds);
    expect(regionA.edgeIds).toEqual(regionB.edgeIds);
    expect(regionA.regionId).toBe(regionB.regionId);
    expect(regionA).toEqual(regionB);
    // Both islands admitted in round 1 with SORTED admission (order-independent).
    expect(regionA.semanticExpansion.rounds[0].admittedNodeIds).toEqual(
      [...[ISLE_A, ISLE_B]].sort(),
    );
    expect(regionA.roundRecords[0].addedObservationIds).toEqual([OBS_ISLE, isleObs2].sort());
  });

  it('query text is deterministic across repeated builds of identical input', async () => {
    const deps = depsFor(projectionWithIsle(), {
      port: islePort(ctxQuery([NODE_CENTER])),
      resolveSourceEntities: isleResolver,
    });
    const input = { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] };
    const [first, second] = await Promise.all([
      buildRegion(input, deps),
      buildRegion(input, deps),
    ]);
    expect(first).toEqual(second);
  });
});

describe('buildRegion — region identity independence from the semantic sub-system', () => {
  it('A/B/C: identity changes only when semantic ADMISSION changes membership', async () => {
    const OBS_CTR = uuid(0x40000020);
    const input = { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] };

    // A — PR1 control: no semantic dependency at all.
    const regionA = await buildRegion(input, depsFor(projectionWithIsle(), {}));

    // B — semantic enabled but admits nothing new (hit maps to an already-resident node).
    const regionB = await buildRegion(
      input,
      depsFor(projectionWithIsle(), {
        port: {
          retrieve: async (request) => ({
            caseId: request.caseId,
            queryHash: sha256Hex(request.query),
            semanticRetrievalPolicyVersion: 'v1',
            embeddingPolicyVersion: 'v1',
            results: [hit('center-unit', OBS_CTR)],
            truncated: false,
          }),
        },
        resolveSourceEntities: async (input2) => {
          if (input2.caseId !== CASE_A || input2.sourceType !== 'OBSERVATION') return [];
          if (input2.sourceId === OBS_CTR) return [NODE_CENTER];
          return [];
        },
      }),
    );

    // C — semantic enabled and it ADMITS a disconnected node.
    const regionC = await buildRegion(
      input,
      depsFor(projectionWithIsle(), {
        port: islePort(ctxQuery([NODE_CENTER])),
        resolveSourceEntities: isleResolver,
      }),
    );

    // B's membership is identical to A (semantic hit produced no admission), so
    // the region id is UNCHANGED even though semantic expansion was enabled.
    expect(regionB.nodeIds).toEqual(regionA.nodeIds);
    expect(regionB.edgeIds).toEqual(regionA.edgeIds);
    expect(regionB.regionId).toBe(regionA.regionId);
    expect(regionB.semanticExpansion.status).toBe('SUCCESS');

    // C's membership gained NODE_ISLE, so its id differs — membership changes
    // via semantic admission DO deterministically change the region identity.
    const expectedCIds = sortedUnique([...regionA.nodeIds, NODE_ISLE]);
    expect(regionC.nodeIds).toEqual(expectedCIds);
    expect(regionC.regionId).not.toBe(regionA.regionId);
    const manualC = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      temporalContext: null,
      seedObservationIds: [OBS_1],
      nodeIds: regionC.nodeIds,
      edgeIds: regionC.edgeIds,
    }).regionId;
    expect(regionC.regionId).toBe(manualC);
  });
});