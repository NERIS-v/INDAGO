import { describe, it, expect } from 'vitest';
import { buildGraph } from '@indago/graphology-projection';
import type { GraphProjectionInput } from '@indago/graphology-projection';
import {
  buildRegion,
  createRegionBuilder,
  RegionBuildError,
  ProjectedGraphExpansionProvider,
} from '../src/index.js';
import { MAX_CONTEXT_OBSERVATIONS, MAX_REGION_EDGES, MAX_REGION_NODES } from '@indago/contracts';
import type { TemporalInterval } from '@indago/contracts';
import type { GraphExpansionProvider, RegionBuildDependencies } from '../src/index.js';
import {
  uuid,
  node,
  edge,
  starProjection,
  resolverFor,
  CASE_A,
  CASE_B,
  VERSION_A,
  VERSION_B,
  NODE_CENTER,
  NODE_LEAF_A,
  NODE_LEAF_B,
  NODE_LEAF_C,
  EDGE_A,
  EDGE_B,
  EDGE_C,
  OBS_1,
  OBS_2,
  ENT_UNKNOWN_CASE,
} from './helpers/fixtures.js';

const window: TemporalInterval = {
  validFrom: { value: '2023-01-01T00:00:00.000Z', precision: 'exact' },
  validTo: { value: '2023-06-01T00:00:00.000Z', precision: 'exact' },
  precision: 'exact',
  semantics: 'observed',
};

function depsFor(
  projection: GraphProjectionInput,
  overrides: Partial<{
    version: string;
    resolveObservations: RegionBuildDependencies['resolveObservations'];
    context: GraphExpansionProvider;
  }> = {},
): RegionBuildDependencies {
  const built = buildGraph(projection);
  const provider = overrides.context ?? new ProjectedGraphExpansionProvider(built, VERSION_A);
  return {
    context: provider,
    resolveObservations:
      overrides.resolveObservations ??
      resolverFor({ [OBS_1]: { entityIds: [NODE_CENTER] } }),
  };
}

/** Seed observation → center, fully resolvable. */
const centerResolver = resolverFor({ [OBS_1]: { entityIds: [NODE_CENTER] } });

describe('buildRegion — seed requirements', () => {
  it('throws EMPTY_SEED_OBSERVATIONS with no seeds', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]));
    await expect(
      buildRegion({ caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [] }, deps),
    ).rejects.toMatchObject({ code: 'EMPTY_SEED_OBSERVATIONS' });
  });

  it('throws AUTHORITY_MISMATCH when the input case does not match the provider', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]));
    await expect(
      buildRegion({ caseId: CASE_B, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] }, deps),
    ).rejects.toMatchObject({ code: 'AUTHORITY_MISMATCH' });
  });

  it('throws AUTHORITY_MISMATCH when the input graphVersionId differs', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]));
    await expect(
      buildRegion({ caseId: CASE_A, graphVersionId: VERSION_B, seedObservationIds: [OBS_1] }, deps),
    ).rejects.toMatchObject({ code: 'AUTHORITY_MISMATCH' });
  });
});

describe('buildRegion — no resolvable seeds is DEGRADED', () => {
  it('never invents nodes and reports NO_RESOLVABLE_SEED_NODES', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]), {
      resolveObservations: resolverFor({ [OBS_1]: { entityIds: [ENT_UNKNOWN_CASE] } }),
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('NO_RESOLVABLE_SEED_NODES');
    expect(region.nodeIds).toEqual([]);
    expect(region.edgeIds).toEqual([]);
    expect(region.unresolvedSeedEntityIds).toEqual([ENT_UNKNOWN_CASE]);
    expect(region.truncated).toBe(false);
  });
});

describe('buildRegion — saturation without semantic context', () => {
  it('a star saturates after two empty rounds following one novel round', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B, NODE_LEAF_C]), {
      resolveObservations: centerResolver,
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('SATURATED');
    expect(region.limitations).toEqual([]);
    expect(region.nodeIds).toEqual([NODE_CENTER, NODE_LEAF_A, NODE_LEAF_B, NODE_LEAF_C]);
    expect(region.edgeIds).toHaveLength(3);
    expect(region.expansionRounds).toBe(3);
    expect(region.roundRecords[0].addedNodeIds).toEqual([
      NODE_LEAF_A,
      NODE_LEAF_B,
      NODE_LEAF_C,
    ]);
    expect(region.roundRecords[2].nodeNoveltyRatio).toBe(0);
  });

  it('an isolated seed saturates after two entirely empty rounds', async () => {
    const projection: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [node(NODE_CENTER, 'Center')],
      edges: [],
    };
    const deps = depsFor(projection, { resolveObservations: centerResolver });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('SATURATED');
    expect(region.nodeIds).toEqual([NODE_CENTER]);
    expect(region.edgeIds).toEqual([]);
    expect(region.expansionRounds).toBe(2);
    expect(region.roundRecords).toHaveLength(2);
  });

  it('SATURATED never fires while the region is still novel (3-level tree → LIMITED)', async () => {
    // Root + 2 + 4 + 8 leaves; each round stays above the novelty threshold.
    const root = NODE_CENTER;
    const lvl1 = [uuid(0x40000001), uuid(0x40000002)];
    const lvl2 = [uuid(0x40000011), uuid(0x40000012), uuid(0x40000013), uuid(0x40000014)];
    const lvl3 = Array.from({ length: 8 }, (_, i) => uuid(0x40000020 + i));
    const nodes = [
      node(root, 'Root'),
      ...lvl1.map((id, i) => node(id, `L1-${i}`)),
      ...lvl2.map((id, i) => node(id, `L2-${i}`)),
      ...lvl3.map((id, i) => node(id, `L3-${i}`)),
    ];
    const edges: GraphProjectionInput['edges'] = [
      edge(uuid(0x50000001), root, lvl1[0]),
      edge(uuid(0x50000002), root, lvl1[1]),
      edge(uuid(0x50000011), lvl1[0], lvl2[0]),
      edge(uuid(0x50000012), lvl1[0], lvl2[1]),
      edge(uuid(0x50000013), lvl1[1], lvl2[2]),
      edge(uuid(0x50000014), lvl1[1], lvl2[3]),
      ...lvl2.map((parent, i) =>
        edge(uuid(0x50000100 + i * 2), parent, lvl3[i * 2]),
      ),
      ...lvl2.map((parent, i) =>
        edge(uuid(0x50000101 + i * 2), parent, lvl3[i * 2 + 1]),
      ),
    ];
    const deps = depsFor({ caseId: CASE_A, nodes, edges }, { resolveObservations: centerResolver });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('LIMITED');
    expect(region.limitations).toContain('EXPANSION_ROUND_LIMIT_REACHED');
    expect(region.truncated).toBe(true);
    expect(region.nodeIds).toHaveLength(15);
    expect(region.edgeIds).toHaveLength(14);
    expect(region.expansionRounds).toBe(3);
  });
});

describe('buildRegion — hard budget bounds → LIMITED, never downgraded', () => {
  it('node bound reached on the first expansion round', async () => {
    const leaves = Array.from({ length: 120 }, (_, i) => uuid(0x60000000 + i));
    const deps = depsFor(starProjection(CASE_A, leaves), {
      resolveObservations: centerResolver,
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('LIMITED');
    expect(region.limitations).toContain('REGION_NODE_BOUND_REACHED');
    expect(region.truncated).toBe(true);
    expect(region.nodeIds).toHaveLength(MAX_REGION_NODES);
    // All 120 star edges fit the seed edge budget (250), so the region keeps them.
    expect(region.edgeIds).toHaveLength(120);
    expect(region.expansionRounds).toBe(1);
    expect(region.roundRecords[0].budgetBoundReached).toBe(true);
  });

  it('edge bound reached even before any expansion round', async () => {
    // Seed context: center + leaf with 400 parallel edges → hard edge budget.
    const project: GraphProjectionInput = {
      caseId: CASE_A,
      nodes: [node(NODE_CENTER, 'Center'), node(NODE_LEAF_A, 'LeafA')],
      edges: Array.from({ length: 400 }, (_, i) =>
        edge(uuid(0x70000000 + i), NODE_CENTER, NODE_LEAF_A),
      ),
    };
    const deps = depsFor(project, {
      resolveObservations: resolverFor({
        [OBS_1]: { entityIds: [NODE_CENTER, NODE_LEAF_A] },
      }),
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('LIMITED');
    expect(region.limitations).toContain('REGION_EDGE_BOUND_REACHED');
    expect(region.truncated).toBe(true);
    expect(region.edgeIds).toHaveLength(MAX_REGION_EDGES);
    expect(region.seedEdgeIds).toHaveLength(MAX_REGION_EDGES);
    expect(region.expansionRounds).toBe(0);
  });

  it('too many seed observations trips the observation context bound', async () => {
    const nodes = Array.from({ length: MAX_CONTEXT_OBSERVATIONS + 10 }, (_, i) =>
      node(uuid(0x80000000 + i), `N-${i}`),
    );
    const seeds: Record<string, { entityIds: string[] }> = {};
    const observations: string[] = [];
    nodes.forEach((n, i) => {
      const obsId = uuid(0x81000000 + i);
      seeds[obsId] = { entityIds: [n.id] };
      observations.push(obsId);
    });
    const deps = depsFor({ caseId: CASE_A, nodes, edges: [] }, {
      resolveObservations: resolverFor(seeds),
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: observations },
      deps,
    );
    expect(region.status).toBe('LIMITED');
    expect(region.limitations).toContain('CONTEXT_OBSERVATION_BOUND_REACHED');
    expect(region.truncated).toBe(true);
    expect(region.nodeIds.length).toBe(MAX_CONTEXT_OBSERVATIONS + 10);
    expect(region.expansionRounds).toBe(0);
  });
});

describe('buildRegion — degraded paths', () => {
  it('an unresolvable seed entity degrades the whole region', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]), {
      resolveObservations: resolverFor({
        [OBS_1]: { entityIds: [NODE_CENTER] },
        [OBS_2]: { entityIds: [ENT_UNKNOWN_CASE] },
      }),
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1, OBS_2] },
      deps,
    );
    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('UNRESOLVED_SEED_ENTITIES');
    expect(region.unresolvedSeedEntityIds).toEqual([ENT_UNKNOWN_CASE]);
    expect(region.resolvedSeedNodeIds).toContain(NODE_CENTER);
  });

  it('observation resolution failure degrades without expanding', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]), {
      resolveObservations: async () => {
        throw new Error('store down');
      },
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('OBSERVATION_RESOLUTION_FAILED');
    expect(region.nodeIds).toEqual([]);
    expect(region.expansionRounds).toBe(0);
  });

  it('graph expansion failure degrades after seeding', async () => {
    const failingContext: GraphExpansionProvider = {
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      hasNode: (id) => id === NODE_CENTER,
      expandGraph: async () => {
        throw new Error('graph unavailable');
      },
      incidentEdges: async () => [],
    };
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]), {
      context: failingContext,
      resolveObservations: centerResolver,
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('EXPANSION_PROVIDER_FAILURE');
    expect(region.nodeIds).toEqual([NODE_CENTER]);
    expect(region.expansionRounds).toBe(0);
  });
});

describe('buildRegion — temporal context', () => {
  function temporalProjection(): GraphProjectionInput {
    const projection = starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B, NODE_LEAF_C], [
      EDGE_A,
      EDGE_B,
      EDGE_C,
    ]);
    projection.edges[0].temporalRange = {
      validFrom: { value: '2023-02-01T00:00:00.000Z' },
      validTo: { value: '2023-03-01T00:00:00.000Z' },
    };
    projection.edges[1].temporalRange = {
      validFrom: { value: '2024-01-01T00:00:00.000Z' },
    };
    return projection;
  }

  it('excludes out-of-window edges from expansion and edge ids', async () => {
    const projection = temporalProjection();
    const deps = depsFor(projection, { resolveObservations: centerResolver });
    const region = await buildRegion(
      {
        caseId: CASE_A,
        graphVersionId: VERSION_A,
        seedObservationIds: [OBS_1],
        temporalContext: window,
      },
      deps,
    );
    expect(region.status).toBe('SATURATED');
    expect(region.nodeIds).toEqual([NODE_CENTER, NODE_LEAF_A, NODE_LEAF_C]);
    expect(region.edgeIds).toEqual([EDGE_A, EDGE_C]);
  });

  it('the window changes the region identity', async () => {
    const projection = temporalProjection();
    const withWindow = await buildRegion(
      {
        caseId: CASE_A,
        graphVersionId: VERSION_A,
        seedObservationIds: [OBS_1],
        temporalContext: window,
      },
      depsFor(projection, { resolveObservations: centerResolver }),
    );
    const withoutWindow = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      depsFor(projection, { resolveObservations: centerResolver }),
    );
    expect(withWindow.regionId).not.toBe(withoutWindow.regionId);
    expect(withoutWindow.nodeIds).toEqual([
      NODE_CENTER,
      NODE_LEAF_A,
      NODE_LEAF_B,
      NODE_LEAF_C,
    ]);
    expect(withoutWindow.edgeIds).toEqual([EDGE_A, EDGE_B, EDGE_C]);
  });

  it('identical inputs (including window) build identical regions', async () => {
    const projection = temporalProjection();
    const a = await buildRegion(
      {
        caseId: CASE_A,
        graphVersionId: VERSION_A,
        seedObservationIds: [OBS_1],
        temporalContext: window,
      },
      depsFor(projection, { resolveObservations: centerResolver }),
    );
    const b = await buildRegion(
      {
        caseId: CASE_A,
        graphVersionId: VERSION_A,
        seedObservationIds: [OBS_1],
        temporalContext: window,
      },
      depsFor(projection, { resolveObservations: centerResolver }),
    );
    expect(b.regionId).toBe(a.regionId);
    expect(b.nodeIds).toEqual(a.nodeIds);
    expect(b.edgeIds).toEqual(a.edgeIds);
    expect(b.roundRecords).toEqual(a.roundRecords);
  });
});

describe('buildRegion — determinism and identity', () => {
  it('seed order independence', async () => {
    const seeds: Record<string, { entityIds: string[] }> = {
      [OBS_1]: { entityIds: [NODE_CENTER] },
      [OBS_2]: { entityIds: [NODE_LEAF_A] },
    };
    const projection = starProjection(CASE_A, [NODE_LEAF_A]);
    const a = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_2, OBS_1] },
      depsFor(projection, { resolveObservations: resolverFor(seeds) }),
    );
    const b = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1, OBS_2] },
      depsFor(projection, { resolveObservations: resolverFor(seeds) }),
    );
    expect(b.regionId).toBe(a.regionId);
    expect(b.nodeIds).toEqual(a.nodeIds);
  });

  it('a different graph version produces a different regionId', async () => {
    const projection = starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B]);
    const built = buildGraph(projection);
    const providerA = new ProjectedGraphExpansionProvider(built, VERSION_A);
    const providerB = new ProjectedGraphExpansionProvider(built, VERSION_B);
    const a = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      { context: providerA, resolveObservations: centerResolver },
    );
    const b = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_B, seedObservationIds: [OBS_1] },
      { context: providerB, resolveObservations: centerResolver },
    );
    expect(b.regionId).not.toBe(a.regionId);
    expect(a.identity.seedObservationIds).toEqual([OBS_1]);
  });

  it('regionId is a 64-char lowercase sha256 hex digest', async () => {
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B]));
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(region.regionId).toMatch(/^[0-9a-f]{64}$/);
    expect(region.nodeIds).toEqual(region.nodeIds.slice().sort());
  });
});

describe('buildRegion — optional PR2 semantic seam is capped', () => {
  it('calls retrieveSemanticContext and respects both semantic budgets', async () => {
    let calls = 0;
    const semanticContext: GraphExpansionProvider = {
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      hasNode: (id) => id === NODE_CENTER,
      expandGraph: async () => ({ candidateNodeIds: [] }),
      incidentEdges: async () => [],
      retrieveSemanticContext: async () => {
        const offset = calls * 20;
        calls += 1;
        return Array.from({ length: 20 }, (_, i) => uuid(0x90000000 + offset + i));
      },
    };
    const deps = depsFor(starProjection(CASE_A, [NODE_LEAF_A]), {
      context: semanticContext,
      resolveObservations: centerResolver,
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      deps,
    );
    expect(calls).toBe(3);
    expect(region.roundRecords[0].addedObservationIds).toHaveLength(20);
    expect(region.roundRecords[1].addedObservationIds).toHaveLength(20);
    expect(region.roundRecords[2].addedObservationIds).toHaveLength(10);
    const totalSemantic = region.roundRecords.reduce(
      (sum, r) => sum + r.addedObservationIds.length,
      0,
    );
    expect(totalSemantic).toBe(50);
    // The semantic observation ids never leak into the identity (seeds only).
    expect(region.identity.seedObservationIds).toEqual([OBS_1]);
  });
});

describe('createRegionBuilder', () => {
  it('binds deps and builds repeatedly and deterministically', async () => {
    const builder = createRegionBuilder(
      depsFor(starProjection(CASE_A, [NODE_LEAF_A, NODE_LEAF_B])),
    );
    const a = await builder.build({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_1],
    });
    const b = await builder.build({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_1],
    });
    expect(b).toEqual(a);
    expect(a.regionId).toMatch(/^[0-9a-f]{64}$/);
    expect(builder).toBeTruthy();
  });

  it('a wrong-case build rejects with the typed error', async () => {
    const builder = createRegionBuilder(depsFor(starProjection(CASE_A, [NODE_LEAF_A])));
    await expect(
      builder.build({ caseId: CASE_B, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] }),
    ).rejects.toBeInstanceOf(RegionBuildError);
  });
});