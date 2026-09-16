// ============================================================================
// PR13 determinism certification (pure, no DB)
//
// Certifies that the FROZEN identity/context digests of Phase 5A are
// deterministic by construction: identical logical inputs always converge to
// identical canonical strings and 64-hex SHA-256 digests, node/sketch ID order
// is irrelevant, and every identity dimension is hash-sensitive.
//
// Pure functions only — no Prisma, no network, fully offline.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  canTransitionGraphHoleStatus,
  canonicalizeGraphHoleCandidateIdentity,
  canonicalizeRegionIdentity,
  GraphHolePersistenceStatusSchema,
} from '@indago/contracts';
import { hashRegionIdentity } from '@indago/graph-hole-region';
import { computeReassessmentContextSha256 } from '../src/reassessment/region-context.js';

const HEX64 = /^[0-9a-f]{64}$/;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

const CANDIDATE = {
  caseId: 'case-determinism-1',
  graphVersionId: 'ver-determinism-1',
  holeType: 'MISSING_EDGE',
  canonicalNodeIds: ['n:alpha', 'n:beta', 'n:gamma'],
  expectedRelationshipType: 'association',
  detectionPolicyVersion: 'v1',
} as const;

const REGION_IDENTITY = {
  caseId: 'case-determinism-1',
  graphVersionId: 'ver-determinism-1',
  seedObservationIds: ['obs:x1', 'obs:x2'],
  nodeIds: ['n:gamma', 'n:alpha', 'n:beta'],
  edgeIds: ['e:r1', 'e:r2'],
  regionPolicyVersion: 'v1',
  semanticRetrievalPolicyVersion: 'v1',
} as const;

const SKETCH = {
  regionId: 'region-determinism-1',
  regionStatus: 'SATURATED',
  regionTruncated: false,
  regionLimitations: ['expansion-round-budget-reached'],
  nodeIds: ['n:alpha', 'n:beta', 'n:gamma'],
  edgeIds: ['e:r1', 'e:r2'],
  observationIds: ['obs:x1', 'obs:x2', 'obs:x3'],
  hypothesisIds: ['hyp:y1', 'hyp:y2'],
  presentRelations: [
    { sourceNodeId: 'n:alpha', targetNodeId: 'n:beta', relationType: 'association', directed: false },
    { sourceNodeId: 'n:beta', targetNodeId: 'n:gamma', relationType: 'association', directed: false },
  ],
} as const;

describe('PR13 determinism (pure)', () => {
  it('D1: candidate identity converges — node order, key order irrelevant; digest is hex64', () => {
    const a = canonicalizeGraphHoleCandidateIdentity(CANDIDATE);
    const reordered = canonicalizeGraphHoleCandidateIdentity({
      ...CANDIDATE,
      canonicalNodeIds: ['n:gamma', 'n:alpha', 'n:beta'],
    });
    expect(a).toBe(reordered);
    expect(sha256Hex(a)).toMatch(HEX64);
  });

  it('D2: every candidate identity dimension is hash-sensitive', () => {
    const base = sha256Hex(canonicalizeGraphHoleCandidateIdentity(CANDIDATE));
    const variants = [
      { ...CANDIDATE, caseId: 'case-determinism-2' },
      { ...CANDIDATE, graphVersionId: 'ver-determinism-2' },
      { ...CANDIDATE, holeType: 'ISOLATED_NODE' },
      { ...CANDIDATE, canonicalNodeIds: ['n:alpha', 'n:beta', 'n:delta'] },
      { ...CANDIDATE, expectedRelationshipType: undefined },
    ];
    for (const variant of variants) {
      expect(sha256Hex(canonicalizeGraphHoleCandidateIdentity(variant as never))).not.toBe(base);
    }
  });

  it('D3: region identity converges — ID array order irrelevant; regionId is hex64', () => {
    const a = canonicalizeRegionIdentity(REGION_IDENTITY);
    const reordered = canonicalizeRegionIdentity({
      ...REGION_IDENTITY,
      nodeIds: ['n:alpha', 'n:gamma', 'n:beta'],
      seedObservationIds: ['obs:x2', 'obs:x1'],
      edgeIds: ['e:r2', 'e:r1'],
    });
    expect(a).toBe(reordered);
    expect(sha256Hex(a)).toMatch(HEX64);
    expect(hashRegionIdentity(REGION_IDENTITY)).toMatch(HEX64);
  });

  it('D4: region identity is hash-sensitive on every dimension', () => {
    const base = hashRegionIdentity(REGION_IDENTITY);
    const variants = [
      { ...REGION_IDENTITY, caseId: 'case-determinism-2' },
      { ...REGION_IDENTITY, graphVersionId: 'ver-determinism-2' },
      { ...REGION_IDENTITY, seedObservationIds: ['obs:x1'] },
      { ...REGION_IDENTITY, nodeIds: ['n:alpha', 'n:beta', 'n:delta'] },
      { ...REGION_IDENTITY, edgeIds: ['e:r1'] },
      { ...REGION_IDENTITY, regionPolicyVersion: 'v2' },
      { ...REGION_IDENTITY, semanticRetrievalPolicyVersion: 'v2' },
    ];
    for (const variant of variants) {
      expect(hashRegionIdentity(variant as never)).not.toBe(base);
    }
  });

  it('D5: reassessment context sha convergences — sketch order irrelevant; hex64', () => {
    const scope = { caseId: 'case-determinism-1', graphVersionId: 'ver-determinism-1' };
    const a = computeReassessmentContextSha256(scope, SKETCH);
    const reordered = computeReassessmentContextSha256(scope, {
      ...SKETCH,
      nodeIds: ['n:gamma', 'n:alpha', 'n:beta'],
      observationIds: ['obs:x3', 'obs:x1', 'obs:x2'],
      presentRelations: [...SKETCH.presentRelations].reverse(),
      regionLimitations: ['expansion-round-budget-reached'],
    });
    expect(a).toBe(reordered);
    expect(a).toMatch(HEX64);
  });

  it('D6: context sha is sensitive to region scope and region state', () => {
    const scope = { caseId: 'case-determinism-1', graphVersionId: 'ver-determinism-1' };
    const base = computeReassessmentContextSha256(scope, SKETCH);
    const variants = [
      { ...SKETCH, regionId: 'region-determinism-2' },
      { ...SKETCH, regionStatus: 'LIMITED' },
      { ...SKETCH, nodeIds: ['n:alpha', 'n:beta', 'n:delta'] },
      { ...SKETCH, hypothesisIds: ['hyp:y1'] },
    ];
    for (const variant of variants) {
      expect(computeReassessmentContextSha256(scope, variant as never)).not.toBe(base);
    }
    // caseId is deliberately OUT-OF-BAND from the context hash (region tracing
    // + graphVersionId carry case identity); only graphVersionId participates.
    expect(
      computeReassessmentContextSha256(
        { caseId: 'case-determinism-9', graphVersionId: scope.graphVersionId },
        SKETCH,
      ),
    ).toBe(base);
    expect(
      computeReassessmentContextSha256(
        { caseId: scope.caseId, graphVersionId: 'ver-determinism-9' },
        SKETCH,
      ),
    ).not.toBe(base);
  });

  it('D7: sortedUnique is order-independent and idempotent', () => {
    expect(sortedUnique(['c', 'a', 'b', 'a'])).toEqual(['a', 'b', 'c']);
    expect(sortedUnique(['c', 'a', 'b', 'a'])).toEqual(sortedUnique(['b', 'a', 'c']));
    expect(sortedUnique(['x'])).toEqual(['x']);
    expect(sortedUnique([])).toEqual([]);
  });

  it('D8: frozen lifecycle transition matrix holds exactly', () => {
    const statuses = GraphHolePersistenceStatusSchema.options;
    const legal: Record<string, readonly string[]> = {
      ACTIVE: ['SUPERSEDED', 'REJECTED', 'RESOLVED'],
      REJECTED: ['ACTIVE'],
      SUPERSEDED: [],
      RESOLVED: [],
    };
    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransitionGraphHoleStatus(from, to)).toBe(legal[from].includes(to));
      }
    }
  });
});