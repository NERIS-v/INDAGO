import { describe, it, expect } from 'vitest';
import {
  computeRegionId,
  buildRegionIdentity,
  hashRegionIdentity,
  sortedUnique,
} from '../src/index.js';
import type { RegionIdentityV1 } from '@indago/contracts';
import {
  CASE_A,
  CASE_B,
  VERSION_A,
  VERSION_B,
  EDGE_A,
  EDGE_B,
  NODE_CENTER,
  NODE_LEAF_A,
  NODE_LEAF_B,
  OBS_1,
  OBS_2,
} from './helpers/fixtures.js';

const TEMPORAL = {
  validFrom: { value: '2023-01-01T00:00:00.000Z', precision: 'exact' as const },
  validTo: { value: '2023-06-01T00:00:00.000Z', precision: 'exact' as const },
  precision: 'exact' as const,
  semantics: 'observed' as const,
};

function baseIdentity(overrides: Partial<RegionIdentityV1> = {}): RegionIdentityV1 {
  return {
    caseId: CASE_A,
    graphVersionId: VERSION_A,
    seedObservationIds: [OBS_1],
    nodeIds: [NODE_CENTER, NODE_LEAF_A],
    edgeIds: [EDGE_A],
    regionPolicyVersion: 'v1',
    semanticRetrievalPolicyVersion: 'v1',
    ...overrides,
  };
}

describe('sortedUnique', () => {
  it('sorts and deduplicates ids', () => {
    expect(sortedUnique(['b', 'a', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(sortedUnique([])).toEqual([]);
  });
});

describe('buildRegionIdentity', () => {
  it('sorts ID arrays and pins the frozen policy versions', () => {
    const identity = buildRegionIdentity({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_2, OBS_1, OBS_1],
      nodeIds: [NODE_LEAF_B, NODE_CENTER],
      edgeIds: [EDGE_B, EDGE_A],
    });
    expect(identity.seedObservationIds).toEqual([OBS_1, OBS_2]);
    expect(identity.nodeIds).toEqual([NODE_CENTER, NODE_LEAF_B]);
    expect(identity.edgeIds).toEqual([EDGE_A, EDGE_B]);
    expect(identity.regionPolicyVersion).toBe('v1');
    expect(identity.semanticRetrievalPolicyVersion).toBe('v1');
    expect(identity.temporalContext).toBeUndefined();
  });

  it('carries a temporal context through when provided', () => {
    const identity = buildRegionIdentity({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      temporalContext: TEMPORAL,
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_CENTER],
      edgeIds: [EDGE_A],
    });
    expect(identity.temporalContext).toEqual(TEMPORAL);
  });
});

describe('hashRegionIdentity', () => {
  it('produces a 64-character lowercase hex digest', () => {
    const digest = hashRegionIdentity(baseIdentity());
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest.length).toBe(64);
  });

  it('is stable across repeated calls', () => {
    const digest = hashRegionIdentity(baseIdentity());
    expect(hashRegionIdentity(baseIdentity())).toBe(digest);
  });
});

describe('computeRegionId determinism', () => {
  it('same inputs → same regionId', () => {
    const a = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_CENTER, NODE_LEAF_A],
      edgeIds: [EDGE_A],
    });
    const b = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_LEAF_A, NODE_CENTER],
      edgeIds: [EDGE_A],
    });
    expect(a.regionId).toBe(b.regionId);
    expect(a.identity).toEqual(b.identity);
  });

  it('a different case / version / temporal / seed / node / edge set changes the regionId', () => {
    const reference = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_CENTER],
      edgeIds: [EDGE_A],
    });

    const differentiators: Array<[string, RegionIdentityV1]> = [
      ['caseId', baseIdentity({ caseId: CASE_B })],
      ['graphVersionId', baseIdentity({ graphVersionId: VERSION_B })],
      ['temporalContext', baseIdentity({ temporalContext: TEMPORAL })],
      ['seedObservationIds', baseIdentity({ seedObservationIds: [OBS_2] })],
      ['nodeIds', baseIdentity({ nodeIds: [NODE_CENTER, NODE_LEAF_B] })],
      ['edgeIds', baseIdentity({ edgeIds: [EDGE_B] })],
    ];

    for (const [label, identity] of differentiators) {
      const { regionId } = computeRegionId({
        caseId: identity.caseId,
        graphVersionId: identity.graphVersionId,
        temporalContext: identity.temporalContext,
        seedObservationIds: identity.seedObservationIds,
        nodeIds: identity.nodeIds,
        edgeIds: identity.edgeIds,
      });
      expect(regionId).not.toBe(reference.regionId);
      expect(regionId).toMatch(/^[0-9a-f]{64}$/);
      void label;
    }
  });

  it('temporal context absent vs present are distinct regions', () => {
    const without = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_CENTER],
      edgeIds: [EDGE_A],
    });
    const withTemporal = computeRegionId({
      caseId: CASE_A,
      graphVersionId: VERSION_A,
      temporalContext: TEMPORAL,
      seedObservationIds: [OBS_1],
      nodeIds: [NODE_CENTER],
      edgeIds: [EDGE_A],
    });
    expect(without.regionId).not.toBe(withTemporal.regionId);
  });
});