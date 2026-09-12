import { describe, it, expect } from 'vitest';
import type {
  SemanticRetrievalPort,
  SemanticRetrievalRequest as RegionSemanticRetrievalRequest,
  SemanticSearchResult,
} from '@indago/contracts';
import { SemanticRetrievalResultSchema } from '@indago/contracts';

// ============================================================================
// Phase 5A-PR1.5 — semantic-retrieval seam CONFORMANCE
//
// The expansion seam `retrieveSemanticContext?` returns NODE ids (a region is
// a bounded set of canonical graph nodes); the semantic capability
// (contracts SemanticRetrievalPort / SemanticSearchService) returns TEXT UNITS.
// This conformance test pins the SHAPE contract a PR2 adapter must satisfy:
//
//   1. The seam stays optional and node-typed (never semantic-unit-typed).
//   2. A valid SemanticRetrievalPort implementation is ADAPTABLE to the seam
//      through a mapping step (semantic unit → node id). This mapping is the
//      ENTIRE future PR2 surface — nothing in PR1.5 implements it.
//   3. The port itself is typed as an honest contract (no TestDouble, no
//      nullable fields, no silent-catch semantics).
//
// The adapter below is TEST-ONLY by construction (throws on unresolved node
// ids, deterministically); it must NOT be shipped as production code.
// ============================================================================

describe('Phase 5A-PR1.5 semantic-retrieval seam conformance', () => {
  it('the expansion seam keeps retrieveSemanticContext optional and node-shaped', () => {
    // Type-level pin: a provider without the method is still valid.
    const providerWithoutSemantics = {
      caseId: 'case-1',
      graphVersionId: 'gv-1',
      hasNode: (id: string) => id.startsWith('n-'),
      expandGraph: async () => ({ candidateNodeIds: [] }),
      incidentEdges: async () => [],
    };
    // Assignability check at runtime: the seam requires an OPTIONAL method.
    const seam: { retrieveSemanticContext?: (request: RegionSemanticRetrievalRequest) => Promise<readonly string[]> } = providerWithoutSemantics;
    expect(seam.retrieveSemanticContext).toBeUndefined();

    // A valid seam implementation returns node ids — even a stub that does.
    const seamImpl: { retrieveSemanticContext?: (request: RegionSemanticRetrievalRequest) => Promise<readonly string[]> } = {
      retrieveSemanticContext: async () => ['n-1', 'n-2'],
    };
    void seamImpl;
  });

  it('the contract result schema rejects a fabricated result', () => {
    const caseId = '11111111-1111-4111-8111-111111111111';
    const queryHash = '4bedba549e02ff9f47aa9ddef1b5f1c7b0d4f7b28f78642ef9c3a0d3c3f1c1a7';

    // The contracts boundary must accept only an honest shape.
    const honestPort: SemanticRetrievalPort = {
      retrieve: async () => ({
        caseId,
        queryHash,
        semanticRetrievalPolicyVersion: 'v1',
        embeddingPolicyVersion: 'v1',
        results: [],
        truncated: false,
      }),
    };

    const result = honestPort.retrieve({
      caseId,
      query: 'wire transfer',
    });
    void result;
    expect(SemanticRetrievalResultSchema.safeParse({
      caseId,
      queryHash,
      semanticRetrievalPolicyVersion: 'v1',
      embeddingPolicyVersion: 'v1',
      results: [],
      truncated: false,
    }).success).toBe(true);

    // A malformed result (no semanticRetrievalPolicyVersion) must be rejected.
    expect(SemanticRetrievalResultSchema.safeParse({
      caseId,
      queryHash,
      results: [],
      truncated: false,
    }).success).toBe(false);
  });

  it('a PR2 adapter must map semantic units to node ids — test-only pin', async () => {
    // TEST-ONLY adapter: the seam's mapping step. Not production code.
    const caseScopedIndex = new Map<string, string>([
      ['u-1', 'n-1'],
      ['u-2', 'n-2'],
    ]);

    const mapUnitsToNodes = (
      results: readonly SemanticSearchResult[],
      index: Map<string, string>,
    ): readonly string[] => {
      const ids = results.map((r) => index.get(r.semanticTextUnitId));
      for (const id of ids) {
        if (id === undefined) {
          throw new Error('PR2 adapter: unresolved semanticTextUnitId → node');
        }
      }
      return [...new Set(ids as string[])].sort();
    };

    const results: readonly SemanticSearchResult[] = [
      {
        semanticTextUnitId: 'u-1',
        contentHash: 'h1',
        providerId: 'deterministic-test',
        modelId: 'deterministic',
        modelVersion: 'v1',
        dimensions: 768,
        embeddingPolicyVersion: 'v1',
        similarity: 0.9,
        normalizedText: 'a transaction',
        sourceType: 'observation',
        sourceId: 'obs-1',
      },
    ];

    expect(mapUnitsToNodes(results, caseScopedIndex)).toEqual(['n-1']);
  });
});