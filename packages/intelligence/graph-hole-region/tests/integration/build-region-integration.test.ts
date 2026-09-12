// ============================================================================
// Integration: buildRegion over a realistic buildGraph projection (M-A13).
//
// Proves the deterministic region builder works end-to-end against the REAL
// Graphology projection runtime, not mocks: seed observations → canonical
// entities → projected graph nodes → one-hop bounded expansion → bounded
// edges → saturation/limitation → stable content-addressed regionId.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { buildGraph } from '@indago/graphology-projection';
import { MAX_REGION_EDGES, MAX_REGION_NODES } from '@indago/contracts';
import {
  buildRegion,
  ProjectedGraphExpansionProvider,
} from '../../src/index.js';
import { uuid, node, edge, CASE_A, VERSION_A, OBS_1, OBS_2 } from '../helpers/fixtures.js';

// --- Fixture builder: a moderately connected communication network ---------
interface Net {
  projection: { caseId: string; nodes: { id: string; entityType: string | null; canonicalName: string }[]; edges: { id: string; relationType: string; source: string; target: string; provenance: unknown }[] };
  memberIds: string[];
}

function buildFixtures(): Net {
  const hub = uuid(0x0000a001);
  const members = Array.from({ length: 12 }, (_, i) => uuid(0x0000a010 + i));
  const downstream = Array.from({ length: 6 }, (_, i) => uuid(0x0000a100 + i));

  const nodes = [
    node(hub, 'Hub'),
    ...members.map((id, i) => node(id, `Member-${i}`)),
    ...downstream.map((id, i) => node(id, `Downstream-${i}`)),
  ];

  const edges: { id: string; relationType: string; source: string; target: string; provenance: unknown }[] = [];
  let e = 0;
  const rel = (source: string, target: string) => ({
    id: uuid(0x0000b000 + e++),
    relationType: 'communication',
    source,
    target,
    provenance: {},
  });
  for (const member of members) edges.push(rel(hub, member));
  // A sparse "downstream" chain off one member.
  edges.push(rel(members[0], downstream[0]));
  for (let i = 1; i < downstream.length; i++) edges.push(rel(downstream[i - 1], downstream[i]));
  // A few peer links between members (so the region adds edges beyond the seed).
  edges.push(rel(members[1], members[2]));
  edges.push(rel(members[3], members[4]));
  edges.push(rel(members[5], members[6]));

  return { projection: { caseId: CASE_A, nodes, edges }, memberIds: members };
}

function seeds(seedById: Record<string, { entityIds: string[] }>) {
  return async (ids: readonly string[]): Promise<Array<{ id: string; entityIds: string[] }>> =>
    ids.filter((id) => seedById[id] != null).map((id) => ({ id, entityIds: seedById[id].entityIds }));
}

describe('integration — buildRegion over a real Graphology projection', () => {
  it('builds a bounded deterministic region from seed observations', async () => {
    const { projection, memberIds } = buildFixtures();
    const built = buildGraph(projection);
    const provider = new ProjectedGraphExpansionProvider(built, VERSION_A);

    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      {
        context: provider,
        resolveObservations: seeds({ [OBS_1]: { entityIds: [memberIds[0]] } }),
      },
    );

    expect(['SATURATED', 'LIMITED']).toContain(region.status);
    // A LIMITED status is precisely a truncating stop on this dense hub network.
    expect(region.truncated).toBe(region.status === 'LIMITED');
    expect(region.regionId).toMatch(/^[0-9a-f]{64}$/);
    expect(region.nodeIds.length).toBeGreaterThan(1);
    expect(region.nodeIds.length).toBeLessThanOrEqual(MAX_REGION_NODES);
    expect(region.edgeIds.length).toBeLessThanOrEqual(MAX_REGION_EDGES);
    expect(region.resolvedSeedNodeIds).toEqual([memberIds[0]]);
    expect(region.seedObservationIds).toEqual([OBS_1]);
    // Every claimed edge is really part of the projection input (no invented ids).
    const knownEdges = new Set(projection.edges.map((r) => r.id));
    for (const edgeId of region.edgeIds) expect(knownEdges.has(edgeId)).toBe(true);
    // Sorted + unique output sets.
    expect(region.nodeIds).toEqual([...new Set(region.nodeIds)].sort());
    expect(region.edgeIds).toEqual([...new Set(region.edgeIds)].sort());
    // Nodes connect through the hub: the seed's peer region must contain the hub.
    expect(region.nodeIds).toContain(projection.nodes[0].id);
  });

  it('is fully deterministic across repeated builds', async () => {
    const { projection, memberIds } = buildFixtures();
    const a = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      {
        context: new ProjectedGraphExpansionProvider(buildGraph(projection), VERSION_A),
        resolveObservations: seeds({ [OBS_1]: { entityIds: [memberIds[0]] } }),
      },
    );
    const b = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      {
        context: new ProjectedGraphExpansionProvider(buildGraph(projection), VERSION_A),
        resolveObservations: seeds({ [OBS_1]: { entityIds: [memberIds[0]] } }),
      },
    );
    expect(b.regionId).toBe(a.regionId);
    expect(b.nodeIds).toEqual(a.nodeIds);
    expect(b.edgeIds).toEqual(a.edgeIds);
    expect(b.status).toBe(a.status);
    expect(b.roundRecords).toEqual(a.roundRecords);
  });

  it('orders the input seeds without changing the region identity', async () => {
    const { projection, memberIds } = buildFixtures();
    const seedById = {
      [OBS_1]: { entityIds: [memberIds[0]] },
      [OBS_2]: { entityIds: [memberIds[1]] },
    };
    const input = { caseId: CASE_A, graphVersionId: VERSION_A };
    const a = await buildRegion(
      { ...input, seedObservationIds: [OBS_2, OBS_1] },
      {
        context: new ProjectedGraphExpansionProvider(buildGraph(projection), VERSION_A),
        resolveObservations: seeds(seedById),
      },
    );
    const b = await buildRegion(
      { ...input, seedObservationIds: [OBS_1, OBS_2] },
      {
        context: new ProjectedGraphExpansionProvider(buildGraph(projection), VERSION_A),
        resolveObservations: seeds(seedById),
      },
    );
    expect(b.regionId).toBe(a.regionId);
    expect(b.identity.seedObservationIds).toEqual([OBS_1, OBS_2]);
  });

  it('a seed entity from another case degrades the region instead of crossing cases', async () => {
    const { projection, memberIds } = buildFixtures();
    const stranger = uuid(0x0000dead);
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1, OBS_2] },
      {
        context: new ProjectedGraphExpansionProvider(buildGraph(projection), VERSION_A),
        resolveObservations: seeds({
          [OBS_1]: { entityIds: [memberIds[0]] },
          [OBS_2]: { entityIds: [stranger] },
        }),
      },
    );
    expect(region.status).toBe('DEGRADED');
    expect(region.limitations).toContain('UNRESOLVED_SEED_ENTITIES');
    expect(region.unresolvedSeedEntityIds).toEqual([stranger]);
    expect(region.nodeIds).not.toContain(stranger);
  });

  it('scales to a large seed set without exceeding the node bound or inventing ids', async () => {
    const { projection, memberIds } = buildFixtures();
    const seedById: Record<string, { entityIds: string[] }> = {};
    const observations: string[] = [];
    memberIds.forEach((memberId, i) => {
      const obsId = uuid(0x0000c000 + i);
      seedById[obsId] = { entityIds: [memberId] };
      observations.push(obsId);
    });
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: observations },
      {
        context: new ProjectedGraphExpansionProvider(buildGraph(projection), VERSION_A),
        resolveObservations: seeds(seedById),
      },
    );
    expect(region.nodeIds.length).toBeLessThanOrEqual(MAX_REGION_NODES);
    expect(region.nodeIds).toContain(projection.nodes[0].id);
    expect(region.resolvedSeedNodeIds).toHaveLength(memberIds.length);
    for (const seed of region.seedObservationIds) expect(observations).toContain(seed);
  });
});