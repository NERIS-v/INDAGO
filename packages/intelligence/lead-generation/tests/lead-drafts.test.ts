import { describe, it, expect } from 'vitest';
import {
  buildBridgeLeadDraft,
  buildTemporalBurstLeadDraft,
  buildCommunityLeadDraft,
  buildCrossCaseLeadDraft,
} from '../src/lead-drafts.js';
import type { Provenance } from '@indago/contracts';

const names: Record<string, string> = {
  'entity-a': 'Alice',
  'entity-b': 'Bob',
  'entity-c': 'Carol',
};
const entityName = (id: string) => names[id] ?? id;

const realProvenance: Provenance[] = [
  { sourceId: '11111111-1111-4111-8111-111111111111', extractor: 'test-extractor@1.0.0' },
];

describe('buildBridgeLeadDraft', () => {
  const params = {
    caseId: 'case-1',
    candidate: {
      edgeId: 'edge-1',
      nodeIds: ['entity-a', 'entity-b'] as [string, string],
      relationType: 'association',
      bridgeImpact: 3,
      componentSize: 6,
    },
    evidenceBasis: ['obs-1', 'obs-2'],
    contradictions: [],
    entityName,
    provenanceEntries: realProvenance,
  };

  it('derives confidence as bridgeImpact / componentSize', async () => {
    const draft = await buildBridgeLeadDraft(params);
    expect(draft.confidence).toBeCloseTo(0.5);
  });

  it('includes both entity names in the title', async () => {
    const draft = await buildBridgeLeadDraft(params);
    expect(draft.title).toContain('Alice');
    expect(draft.title).toContain('Bob');
  });

  it('sets posture to T1_INVESTIGATIVE_LEAD always', async () => {
    const draft = await buildBridgeLeadDraft(params);
    expect(draft.posture).toBe('T1_INVESTIGATIVE_LEAD');
  });

  it('attaches alternative explanations', async () => {
    const draft = await buildBridgeLeadDraft(params);
    expect(draft.alternativeExplanations.length).toBeGreaterThan(0);
  });

  it('is idempotent: same candidate -> same lead id', async () => {
    const a = await buildBridgeLeadDraft(params);
    const b = await buildBridgeLeadDraft(params);
    expect(a.id).toBe(b.id);
  });

  it('throws rather than fabricating provenance when none is supplied', async () => {
    await expect(buildBridgeLeadDraft({ ...params, provenanceEntries: [] })).rejects.toThrow(/refusing to fabricate/);
  });

  it('carries evidence FOR/AGAINST through to supporting/contradicting fields', async () => {
    const draft = await buildBridgeLeadDraft({
      ...params,
      evidenceBasis: ['obs-1'],
      contradictions: ['obs-2'],
    });
    expect(draft.supportingObservationIds).toEqual(['obs-1']);
    expect(draft.contradictingObservationIds).toEqual(['obs-2']);
  });
});

describe('buildTemporalBurstLeadDraft', () => {
  const params = {
    caseId: 'case-1',
    candidate: {
      nodeId: 'entity-a',
      windowStart: '2024-03-10T00:00:00.000Z',
      windowEnd: '2024-03-11T00:00:00.000Z',
      eventCount: 4,
      baselineRate: 1,
      burstScore: 4,
      edgeIds: ['edge-1', 'edge-2'],
    },
    evidenceBasis: ['obs-1'],
    entityName,
    provenanceEntries: realProvenance,
  };

  it('derives confidence via the saturating transform burstScore/(1+burstScore)', async () => {
    const draft = await buildTemporalBurstLeadDraft(params);
    expect(draft.confidence).toBeCloseTo(4 / 5);
  });

  it('confidence approaches but never reaches 1 for very high burst scores', async () => {
    const draft = await buildTemporalBurstLeadDraft({
      ...params,
      candidate: { ...params.candidate, burstScore: 1000 },
    });
    expect(draft.confidence).toBeLessThan(1);
    expect(draft.confidence).toBeGreaterThan(0.99);
  });

  it('is idempotent per (nodeId, windowStart)', async () => {
    const a = await buildTemporalBurstLeadDraft(params);
    const b = await buildTemporalBurstLeadDraft(params);
    expect(a.id).toBe(b.id);
  });

  it('produces a different id for a different window on the same node', async () => {
    const a = await buildTemporalBurstLeadDraft(params);
    const b = await buildTemporalBurstLeadDraft({
      ...params,
      candidate: { ...params.candidate, windowStart: '2024-04-01T00:00:00.000Z' },
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe('buildCommunityLeadDraft', () => {
  const params = {
    caseId: 'case-1',
    candidate: {
      communityId: 7,
      memberNodeIds: ['entity-a', 'entity-b', 'entity-c'],
      size: 3,
      truncated: false,
      cohesion: 0.8,
      internalEdgeCount: 3,
    },
    evidenceBasis: ['obs-1'],
    entityName,
    provenanceEntries: realProvenance,
  };

  it('derives confidence directly from cohesion', async () => {
    const draft = await buildCommunityLeadDraft(params);
    expect(draft.confidence).toBe(0.8);
  });

  it('keys identity on the sorted member set, not the (unstable) communityId', async () => {
    const a = await buildCommunityLeadDraft(params);
    const b = await buildCommunityLeadDraft({
      ...params,
      candidate: { ...params.candidate, communityId: 999 }, // different numbering, same members
    });
    expect(a.id).toBe(b.id);
  });

  it('produces a different id for a different member set', async () => {
    const a = await buildCommunityLeadDraft(params);
    const b = await buildCommunityLeadDraft({
      ...params,
      candidate: { ...params.candidate, memberNodeIds: ['entity-a', 'entity-b'], size: 2 },
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe('buildCrossCaseLeadDraft', () => {
  const params = {
    caseId: 'case-1',
    candidate: {
      sourceCaseId: 'case-1',
      targetCaseId: 'case-2',
      sourceEntityId: 'entity-a',
      targetEntityId: 'entity-b',
      matchScore: 1.0,
      sharedEvidenceTypes: ['FINANCIAL'],
    },
    evidenceBasis: ['obs-1'],
    entityName,
    provenanceEntries: realProvenance,
  };

  it('derives confidence directly from matchScore', async () => {
    const draft = await buildCrossCaseLeadDraft(params);
    expect(draft.confidence).toBe(1.0);
  });

  it('is order-independent: querying from either case direction yields the same lead id', async () => {
    const a = await buildCrossCaseLeadDraft(params);
    const b = await buildCrossCaseLeadDraft({
      ...params,
      candidate: {
        ...params.candidate,
        sourceCaseId: 'case-2',
        targetCaseId: 'case-1',
        sourceEntityId: 'entity-b',
        targetEntityId: 'entity-a',
      },
    });
    expect(a.id).toBe(b.id);
  });
});
