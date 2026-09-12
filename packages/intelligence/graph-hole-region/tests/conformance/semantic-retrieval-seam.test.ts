import { describe, it, expect } from 'vitest';
import { buildGraph } from '@indago/graphology-projection';
import type { GraphProjectionInput } from '@indago/graphology-projection';
import type { SemanticRetrievalPort, SemanticSearchResult } from '@indago/contracts';
import { SemanticRetrievalResultSchema } from '@indago/contracts';
import {
  buildRegion,
  ProjectedGraphExpansionProvider,
  AuthoritativeSemanticNodeAdapter,
  buildRegionSemanticQuery,
  sha256Hex,
} from '../../src/index.js';
import type { RegionBuildDependencies, SemanticContextItem } from '../../src/index.js';
import {
  uuid,
  node,
  edge,
  CASE_A,
  VERSION_A,
  NODE_CENTER,
  NODE_LEAF_A,
  NODE_LEAF_B,
  NODE_ISLE,
  EDGE_A,
  EDGE_B,
  OBS_1,
} from '../helpers/fixtures.js';

// ============================================================================
// Phase 5A-PR2 — semantic node-expansion CONFORMANCE
//
// PR2 replaces the PR1.5 seam (`retrieveSemanticContext?`, observation-typed,
// test-only) with a frozen, production surface:
//
//   1. Semantic expansion is an OPTIONAL builder dependency
//      (RegionBuildDependencies.semanticExpansion). A PR1 build without it is
//      fully valid and reports semanticExpansion.status === DISABLED.
//   2. The only build-time bridge is the production AuthoritativeSemanticNodeAdapter:
//      hits are mapped case-scoped source → canonical entity → graph node. The
//      adapter must NEVER fabricate nodes, and never consult similarity/text.
//   3. Node addition is bounded, deterministic, and traced on GraphHoleRegion.
// ============================================================================

const OBS_ISLE = uuid(0x40000001);

// Authoritative regional context unit the injected resolver returns; queries
// are built deterministically from this bounded context + sorted membership.
const CONTEXT_UNIT: SemanticContextItem = {
  sourceType: 'OBSERVATION',
  sourceId: uuid(0x2f000001),
  content: 'authoritative regional context describing transit movement patterns',
};

function ctxQuery(nodeIds: readonly string[]): string {
  return buildRegionSemanticQuery([CONTEXT_UNIT], nodeIds);
}

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

function depsFor(results: SemanticSearchResult[]) {
  const built = buildGraph(projectionWithIsle());
  const provider = new ProjectedGraphExpansionProvider(built, VERSION_A);
  const port: SemanticRetrievalPort = {
    retrieve: async (request) => ({
      caseId: request.caseId,
      queryHash: sha256Hex(request.query),
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: 'v1',
      results,
      truncated: false,
    }),
  };
  const resolveSourceEntities = async (input: {
    caseId: string;
    sourceType: string;
    sourceId: string;
  }): Promise<readonly string[]> => {
    if (input.caseId !== CASE_A) return [];
    if (input.sourceType === 'OBSERVATION' && input.sourceId === OBS_ISLE) return [NODE_ISLE];
    return [];
  };
  const getSemanticContextForRegion = async () => [CONTEXT_UNIT];
  const deps: RegionBuildDependencies = {
    context: provider,
    resolveObservations: async (ids) => {
      const out: Array<{ id: string; entityIds: readonly string[] }> = [];
      for (const id of ids) {
        if (id === OBS_1) out.push({ id, entityIds: [NODE_CENTER] });
      }
      return out;
    },
    semanticExpansion:
      results.length > 0
        ? {
            port,
            adapter: new AuthoritativeSemanticNodeAdapter(),
            resolveSourceEntities,
            getSemanticContextForRegion,
          }
        : undefined,
  };
  return deps;
}

describe('Phase 5A-PR2 semantic node-expansion conformance', () => {
  it('PR1 without semantic expansion is valid and reports DISABLED', async () => {
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      depsFor([]),
    );

    expect(region.semanticExpansion.status).toBe('DISABLED');
    expect(region.semanticExpansion.rounds).toEqual([]);
    expect(region.semanticExpansion.totalSemanticResults).toBe(0);
    expect(region.roundRecords).toHaveLength(3);
    expect(region.regionId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps authoritative hits into the region and traces them on the result', async () => {
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      depsFor([hit('isle-unit', OBS_ISLE)]),
    );

    // The only reachable nodes from the seed are center + leaves; the Isle
    // node exists in the graph but is DISCONNECTED — enterable only through
    // semantic node expansion.
    expect(region.nodeIds).toContain(NODE_ISLE);
    expect(region.nodeIds).toContain(NODE_CENTER);
    expect(region.nodeIds).toContain(NODE_LEAF_A);

    expect(region.semanticExpansion.status).toBe('SUCCESS');
    expect(region.semanticExpansion.rounds[0].admittedNodeIds).toEqual([NODE_ISLE]);
    // Query construction: bounded authoritative context content + sorted
    // membership — never bare identifiers, never retrieved text.
    expect(region.semanticExpansion.rounds[0].query).toBe(
      ctxQuery([NODE_CENTER]),
    );
    expect(region.semanticExpansion.rounds[1].query).toBe(
      ctxQuery(region.nodeIds),
    );
    expect(region.semanticExpansion.rounds[2].query).toBe(
      ctxQuery(region.nodeIds),
    );
    for (const roundTrace of region.semanticExpansion.rounds) {
      expect(roundTrace.query).toContain('transit movement patterns');
      expect(roundTrace.query).not.toContain('isle-unit');
      expect(roundTrace.queryHash).toBe(sha256Hex(roundTrace.query));
    }
    expect(region.semanticExpansion.totalMappedNodes).toBeGreaterThan(0);
    // The mapped observation surfaces into the region's observation context.
    expect(region.roundRecords[0].addedObservationIds).toContain(OBS_ISLE);
    // Semantic contributions never leak into the identity.
    expect(region.identity.seedObservationIds).toEqual([OBS_1]);
  });

  it('never fabricates nodes: unresolved hits admit nothing', async () => {
    const region = await buildRegion(
      { caseId: CASE_A, graphVersionId: VERSION_A, seedObservationIds: [OBS_1] },
      depsFor([hit('ghost-unit', uuid(0x40000099))]),
    );

    expect(region.semanticExpansion.status).toBe('EMPTY');
    expect(region.semanticExpansion.totalMappedNodes).toBe(0);
    expect(region.semanticExpansion.rounds[0].admittedNodeIds).toEqual([]);
    expect(region.nodeIds).not.toContain(NODE_ISLE);
    // Graph-only expansion still proceeds normally.
    expect(region.nodeIds).toContain(NODE_LEAF_A);
    expect(region.nodeIds).toContain(NODE_LEAF_B);
    expect(region.roundRecords).toHaveLength(3);
  });

  it('the port contract stays honest (no fabricated envelope)', () => {
    const envelope = {
      caseId: CASE_A,
      queryHash: '4bedba549e02ff9f47aa9ddef1b5f1c7b0d4f7b28f78642ef9c3a0d3c3f1c1a7',
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: 'v1',
      results: [],
      truncated: false,
    };
    expect(SemanticRetrievalResultSchema.safeParse(envelope).success).toBe(true);
    const { semanticRetrievalPolicyVersion: _dropped, ...malformed } = envelope;
    void _dropped;
    expect(SemanticRetrievalResultSchema.safeParse(malformed).success).toBe(false);
  });
});