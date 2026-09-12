import { describe, it, expect } from 'vitest';
import type {
  SemanticNodeMappingRejection,
  SemanticSearchResult,
  SemanticSourceType,
} from '@indago/contracts';
import { SemanticNodeMappingReportSchema } from '@indago/contracts';
import {
  AuthoritativeSemanticNodeAdapter,
} from '../src/index.js';
import type {
  SemanticNodeMappingContext,
} from '../src/index.js';
import { sha256Hex } from '../src/index.js';
import { uuid } from './helpers/fixtures.js';

// ============================================================================
// Semantic → Node Adapter (Phase 5A-PR2) — authoritative-only mapping.
//
// The adapter must ALWAYS map hits through the injected M-A09/M-A10
// source → entity resolution and the M-A13 node membership. It must NEVER
// consult similarity, normalizedText, model metadata, or string similarity.
// ============================================================================

function hit(opts: {
  unit: string;
  sourceId: string;
  sourceType?: SemanticSourceType;
  similarity?: number;
  text?: string;
}): SemanticSearchResult {
  return {
    semanticTextUnitId: uuidFor(opts.unit),
    contentHash: sha256Hex(opts.unit),
    providerId: 'deterministic-test',
    modelId: 'deterministic',
    modelVersion: 'v1',
    dimensions: 768,
    embeddingPolicyVersion: 'v1',
    similarity: opts.similarity ?? 0.9,
    normalizedText: opts.text ?? '',
    sourceType: opts.sourceType ?? 'OBSERVATION',
    sourceId: uuidFor(opts.sourceId),
  };
}

function uuidFor(seed: string): string {
  const hex = Buffer.from(seed, 'utf8').toString('hex').padEnd(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** Deterministic source → entity lookup (authority stand-in). */
function resolverFor(
  map: Record<string, readonly string[]>,
): SemanticNodeMappingContext['resolveSourceEntities'] {
  return async (input) => map[`${input.sourceType}:${input.sourceId}`] ?? [];
}

const CASE = uuid(0x00110000);
const NODE_X = uuid(0x00120001);
const NODE_Y = uuid(0x00120002);

describe('AuthoritativeSemanticNodeAdapter', () => {
  const makeContext = (overrides: Partial<SemanticNodeMappingContext> = {}): SemanticNodeMappingContext => ({
    caseId: CASE,
    graphVersionId: uuid(0x00130001),
    resolveSourceEntities: resolverFor({}),
    hasNode: () => false,
    ...overrides,
  });

  it('maps hits authoritatively: source → entity → node', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const context = makeContext({
      resolveSourceEntities: resolverFor({
        [`OBSERVATION:${uuidFor('obs-x')}`]: [NODE_X],
        [`OBSERVATION:${uuidFor('obs-y')}`]: [NODE_Y],
      }),
      hasNode: (id) => id === NODE_X || id === NODE_Y,
    });

    const report = await adapter.mapSemanticResultsToNodes(
      ['obs-x', 'obs-y'].map((s) => hit({ unit: `unit-${s}`, sourceId: s })),
      context,
    );

    expect(report.mappedCount).toBe(2);
    expect(report.unresolvedCount).toBe(0);
    expect(report.rejectedCount).toBe(0);
    expect(report.mappedNodeIds).toEqual([NODE_X, NODE_Y]);
    expect(report.rejectedReasons).toEqual([]);
    expect(report.attribution.map((a) => a.outcome)).toEqual(['MAPPED', 'MAPPED']);
  });

  it('reports UNRESOLVED when the source has no canonical entity', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const report = await adapter.mapSemanticResultsToNodes(
      [hit({ unit: 'u-ghost', sourceId: 'obs-ghost' })],
      makeContext({ hasNode: () => true }),
    );

    expect(report.mappedCount).toBe(0);
    expect(report.unresolvedCount).toBe(1);
    expect(report.rejectedCount).toBe(0);
    expect(report.mappedNodeIds).toEqual([]);
    expect(report.rejectedReasons).toEqual([{ reason: 'UNRESOLVED', count: 1 }]);
    expect(report.attribution[0].outcome).toBe('UNRESOLVED');
    expect(report.attribution[0].rejectionReason).toBe('UNRESOLVED');
  });

  it('reports NON_NODE_SOURCE when the entity is absent from this graph version', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const context = makeContext({
      resolveSourceEntities: resolverFor({ [`OBSERVATION:${uuidFor('obs-off')}`]: [NODE_X] }),
      hasNode: () => false,
    });

    const report = await adapter.mapSemanticResultsToNodes(
      [hit({ unit: 'u-off', sourceId: 'obs-off' })],
      context,
    );

    expect(report.mappedCount).toBe(0);
    expect(report.rejectedCount).toBe(1);
    expect(report.unresolvedCount).toBe(0);
    expect(report.rejectedReasons).toEqual([{ reason: 'NON_NODE_SOURCE', count: 1 }]);
    expect(report.attribution[0].outcome).toBe('REJECTED');
    expect(report.attribution[0].rejectionReason).toBe('NON_NODE_SOURCE');
  });

  it('maps one hit to several nodes and deduplicates across hits', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const context = makeContext({
      resolveSourceEntities: resolverFor({
        [`OBSERVATION:${uuidFor('obs-multi')}`]: [NODE_X, NODE_Y],
        [`OBSERVATION:${uuidFor('obs-dup')}`]: [NODE_X],
      }),
      hasNode: () => true,
    });

    const report = await adapter.mapSemanticResultsToNodes(
      ['obs-multi', 'obs-dup'].map((s) => hit({ unit: `unit-${s}`, sourceId: s })),
      context,
    );

    expect(report.mappedCount).toBe(2);
    expect(report.mappedNodeIds).toEqual([NODE_X, NODE_Y]);
    expect(report.attribution[0].mappedNodeIds).toEqual([NODE_X, NODE_Y]);
  });

  it('aggregates mixed outcomes with sorted, zero-omitted rejection reasons', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const context = makeContext({
      resolveSourceEntities: resolverFor({
        [`OBSERVATION:${uuidFor('obs-x')}`]: [NODE_X],
        [`OBSERVATION:${uuidFor('obs-off')}`]: [NODE_Y],
      }),
      hasNode: (id) => id === NODE_X,
    });

    const report = await adapter.mapSemanticResultsToNodes(
      [hit({ unit: 'u-x', sourceId: 'obs-x' }), hit({ unit: 'u-off', sourceId: 'obs-off' }), hit({ unit: 'u-ghost', sourceId: 'obs-ghost' })],
      context,
    );

    expect(report.mappedCount).toBe(1);
    expect(report.unresolvedCount).toBe(1);
    expect(report.rejectedCount).toBe(1);
    expect(report.rejectedReasons).toEqual([
      { reason: 'NON_NODE_SOURCE', count: 1 },
      { reason: 'UNRESOLVED', count: 1 },
    ]);
  });

  it('never consults similarity, model metadata or normalizedText for resolution', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const calls: string[] = [];
    const context = makeContext({
      resolveSourceEntities: resolverFor({
        [`OBSERVATION:${uuidFor('obs-sim')}`]: [NODE_X],
      }),
      hasNode: () => true,
    });

    // Two hits for the same source with totally different similarity/text — the
    // adapter must map both identically (the retrieval rank is NOT used).
    const low = hit({ unit: 'u-low', sourceId: 'obs-sim', similarity: 0.01, text: 'irrelevant text' });
    const high = hit({ unit: 'u-high', sourceId: 'obs-sim', similarity: 0.99, text: 'irrelevant text' });
    context.resolveSourceEntities = async (input) => {
      calls.push(`${input.sourceType}:${input.sourceId}`);
      return [NODE_X];
    };

    const report = await adapter.mapSemanticResultsToNodes([low, high], context);
    expect(report.mappedCount).toBe(2);
    expect(report.mappedNodeIds).toEqual([NODE_X]);
    // Only source identity reached the resolver; never normalizedText.
    for (const call of calls) expect(call).toContain('OBSERVATION:');
  });

  it('scopes every resolver call to the mapping context case', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const seen = new Set<string>();
    const context = makeContext({
      resolveSourceEntities: async (input) => {
        seen.add(input.caseId);
        return [NODE_X];
      },
      hasNode: () => true,
    });

    await adapter.mapSemanticResultsToNodes(
      [hit({ unit: 'u-1', sourceId: 'obs-1' }), hit({ unit: 'u-2', sourceId: 'obs-2' })],
      context,
    );
    expect(seen.size).toBe(1);
    expect(seen.has(CASE)).toBe(true);
  });

  it('is fully deterministic and emits contract-conformant reports', async () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();
    const context = makeContext({
      resolveSourceEntities: resolverFor({
        [`OBSERVATION:${uuidFor('obs-x')}`]: [NODE_X],
        [`OBSERVATION:${uuidFor('obs-off')}`]: [NODE_Y],
      }),
      hasNode: (id) => id === NODE_X,
    });
    const hits = [
      hit({ unit: 'u-ghost', sourceId: 'obs-ghost' }),
      hit({ unit: 'u-x', sourceId: 'obs-x' }),
      hit({ unit: 'u-off', sourceId: 'obs-off' }),
    ];

    const a = await adapter.mapSemanticResultsToNodes(hits, context);
    const b = await adapter.mapSemanticResultsToNodes(hits, context);
    expect(b).toEqual(a);

    const parsed = SemanticNodeMappingReportSchema.safeParse(a);
    expect(parsed.success).toBe(true);
    const reasons: SemanticNodeMappingRejection[] = a.rejectedReasons.map((r) => r.reason);
    expect(reasons).toEqual([...reasons].sort());
  });

  describe('adversarial authority hardening', () => {
    const adapter = new AuthoritativeSemanticNodeAdapter();

    it('a high-similarity hit with NO resolved entity is UNRESOLVED, never guessed', async () => {
      const report = await adapter.mapSemanticResultsToNodes(
        [
          hit({
            unit: 'u-1',
            sourceId: 'obs-hot',
            similarity: 0.9999,
            text: 'string that smells like an entity name',
          }),
        ],
        makeContext({ hasNode: () => true }),
      );
      expect(report.mappedCount).toBe(0);
      expect(report.unresolvedCount).toBe(1);
      expect(report.rejectedReasons).toEqual([{ reason: 'UNRESOLVED', count: 1 }]);
    });

    it('a perfect name-match on normalizedText is inert without authority', async () => {
      const report = await adapter.mapSemanticResultsToNodes(
        [hit({ unit: 'u-name', sourceId: 'obs-name', text: 'Node-X-Alpha' })],
        makeContext({ hasNode: () => true }),
      );
      expect(report.mappedCount).toBe(0);
      expect(report.unresolvedCount).toBe(1);
    });

    it('a sourceId that LOOKS like a nodeId (bare uuid) is still UNRESOLVED without authority', async () => {
      const report = await adapter.mapSemanticResultsToNodes(
        [
          hit({
            unit: 'u-nodelike',
            sourceId: NODE_X,
            text: 'identical to the node id string',
          }),
        ],
        // Empty resolver: no entity is authoritative in THIS case/graph.
        makeContext({ hasNode: () => true }),
      );
      expect(report.mappedCount).toBe(0);
      expect(report.unresolvedCount).toBe(1);
      expect(report.mappedNodeIds).not.toContain(NODE_X);
    });

    it('an entity that exists only in ANOTHER case is never admitted by string likeness', async () => {
      const OTHER_CASE = uuid(0x00110001);
      const context = makeContext({
        // The resolver yields NODE_X only for the OTHER case — the adapter must
        // call it with the MAPPING case only, so nothing resolves here.
        resolveSourceEntities: async (input) =>
          input.caseId === OTHER_CASE ? [NODE_X] : [],
        hasNode: (id) => id === NODE_X,
      });

      const report = await adapter.mapSemanticResultsToNodes(
        [hit({ unit: 'u-cross', sourceId: 'obs-cross' })],
        context,
      );
      expect(report.mappedCount).toBe(0);
      expect(report.unresolvedCount).toBe(1);
      expect(report.mappedNodeIds).toEqual([]);
    });

    it('an entity name/spelling match can never bypass authoritative resolution', async () => {
      const report = await adapter.mapSemanticResultsToNodes(
        [
          hit({
            unit: 'u-alt',
            sourceId: 'obj-1',
            text: 'Functional Analyst at regional transit authority',
            similarity: 0.95,
          }),
        ],
        makeContext({ hasNode: () => true }),
      );
      const parsed = SemanticNodeMappingReportSchema.safeParse(report);
      expect(parsed.success).toBe(true);
      expect(report.mappedCount).toBe(0);
      expect(report.unresolvedCount).toBe(1);
    });
  });
});