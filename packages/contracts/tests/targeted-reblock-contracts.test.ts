import { describe, expect, it } from 'vitest';
import {
  AuditActionSchema,
  AuditEventSchema,
  TARGETED_REBLOCK_POLICY_VERSION,
  TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS,
  TARGETED_REBLOCK_MAX_CANDIDATES,
  TARGETED_REBLOCK_MAX_PAIRS,
  TARGETED_REBLOCK_MAX_OPERATIONS_PER_VERSION,
  TARGETED_REBLOCK_MEMBERSHIP_RULE,
  TargetedReblockRegionReferenceSchema,
  TargetedReblockAccountingSchema,
  TargetedReblockProvenanceSchema,
  TargetedReblockRunRecordSchema,
  type TargetedReblockRegionReference,
  type TargetedReblockAccounting,
  type TargetedReblockProvenance,
} from '../src/index.js';

// ============================================================================
// Phase 5A-PR11 Targeted Reblocking Contract Tests
//
// Verifies: frozen V1 policy constants, the single frozen membership rule,
// strict region-reference validation against semantic UUID id types, and
// that accounting/provenance/run-record schemas are strict (no undisclosed
// fields, no invented resolution artifacts).
// ============================================================================

const REGION_REF: TargetedReblockRegionReference = {
  caseId: '11111111-1111-4111-8111-111111111111',
  graphVersionId: '22222222-2222-4222-8222-222222222222',
  regionId: `${'a'.repeat(64)}`,
  regionPolicyVersion: 'v1',
};

function makeAccounting(overrides: Partial<TargetedReblockAccounting> = {}): TargetedReblockAccounting {
  return {
    policyVersion: 'v1',
    regionReference: REGION_REF,
    membershipRule: 'REGION_OBSERVATION_MEMBERSHIP_V1',
    regionObservationCount: 10,
    regionObservationBoundReached: false,
    candidateUniverseRequested: 8,
    candidateUniverseEligible: 8,
    candidateUniverseProcessed: 8,
    candidateUniverseTruncated: 0,
    candidateBoundReached: false,
    pairsGenerated: 12,
    pairsTruncated: false,
    blockingMetrics: {
      blocksGenerated: 5,
      blocksSkippedOversized: 0,
      rejectedSameObservation: 2,
    },
    ...overrides,
  };
}

function makeProvenance(overrides: Partial<TargetedReblockProvenance> = {}): TargetedReblockProvenance {
  return {
    runId: `${'a'.repeat(64)}`,
    policyVersion: 'v1',
    membershipRule: 'REGION_OBSERVATION_MEMBERSHIP_V1',
    selectedCandidateIds: ['a', 'b'].sort(),
    memberObservationIds: ['c', 'd'].sort(),
    ...overrides,
  };
}

describe('TARGETED_REBLOCK policy constants', () => {
  it('freezes the V1 policy version and membership rule', () => {
    expect(TARGETED_REBLOCK_POLICY_VERSION).toBe('v1');
    expect(TARGETED_REBLOCK_MEMBERSHIP_RULE).toBe('REGION_OBSERVATION_MEMBERSHIP_V1');
  });

  it('freezes the V1 bounds and the operational per-version gate', () => {
    expect(TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS).toBe(500);
    expect(TARGETED_REBLOCK_MAX_CANDIDATES).toBe(200);
    expect(TARGETED_REBLOCK_MAX_PAIRS).toBe(5000);
    expect(TARGETED_REBLOCK_MAX_OPERATIONS_PER_VERSION).toBe(50);
  });
});

describe('TargetedReblockRegionReferenceSchema', () => {
  it('accepts a valid region reference', () => {
    expect(TargetedReblockRegionReferenceSchema.safeParse(REGION_REF).success).toBe(true);
  });

  it('rejects a non-UUID caseId / graphVersionId', () => {
    expect(
      TargetedReblockRegionReferenceSchema.safeParse({ ...REGION_REF, caseId: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(
      TargetedReblockRegionReferenceSchema.safeParse({ ...REGION_REF, graphVersionId: 'x' }).success,
    ).toBe(false);
  });

  it('is strict: rejects undisclosed fields', () => {
    expect(
      TargetedReblockRegionReferenceSchema.safeParse({ ...REGION_REF, extra: 'nope' as never }).success,
    ).toBe(false);
  });
});

describe('TargetedReblockAccountingSchema', () => {
  it('accepts a valid accounting block', () => {
    expect(TargetedReblockAccountingSchema.safeParse(makeAccounting()).success).toBe(true);
  });

  it('rejects a policyVersion other than the frozen v1', () => {
    expect(
      TargetedReblockAccountingSchema.safeParse(makeAccounting({ policyVersion: 'v2' as 'v1' })).success,
    ).toBe(false);
  });

  it('rejects negative counts', () => {
    expect(
      TargetedReblockAccountingSchema.safeParse(makeAccounting({ candidateUniverseProcessed: -1 })).success,
    ).toBe(false);
  });

  it('is strict: rejects undisclosed fields', () => {
    expect(
      TargetedReblockAccountingSchema.safeParse({ ...makeAccounting(), hidden: 1 as never }).success,
    ).toBe(false);
  });
});

describe('TargetedReblockProvenanceSchema', () => {
  it('requires sorted-deteministic arrays and the canonical membership rule', () => {
    const good = makeProvenance();
    expect(TargetedReblockProvenanceSchema.safeParse(good).success).toBe(true);
    expect(
      TargetedReblockProvenanceSchema.safeParse(
        makeProvenance({ membershipRule: 'FUZZY' as 'REGION_OBSERVATION_MEMBERSHIP_V1' }),
      ).success,
    ).toBe(false);
  });
});

describe('TargetedReblockRunRecordSchema', () => {
  it('accepts a complete persisted run record', () => {
    const record = {
      id: '33333333-3333-4333-8333-333333333333',
      runId: makeProvenance().runId,
      identityKey: 'indago:targeted-reblock::v1',
      caseId: REGION_REF.caseId,
      investigationId: '44444444-4444-4444-8444-444444444444',
      graphVersionId: REGION_REF.graphVersionId,
      regionId: REGION_REF.regionId,
      regionPolicyVersion: 'v1',
      policyVersion: 'v1',
      requestedAt: '2026-09-01T00:00:00.000Z',
      accounting: makeAccounting(),
      counts: {
        pairDraftCount: 12,
        pairCreatedCount: 10,
        pairReusedCount: 2,
        resolverHandoffCount: 12,
        resolverProposedCount: 3,
      },
      provenance: makeProvenance(),
      truncated: false,
      createdAt: '2026-09-01T00:00:00.001Z',
    };
    expect(TargetedReblockRunRecordSchema.safeParse(record).success).toBe(true);
  });

  it('returns the count structure (never a resolution verdict) from the schema', () => {
    // The only "resolution" surface is a handoff/proposal COUNT — the run
    // record itself must never carry accepted/rejected entity decisions.
    const shape = Object.keys(TargetedReblockRunRecordSchema.shape);
    expect(shape).toContain('counts');
    expect(shape).not.toContain('entityHypothesisId');
    expect(shape).not.toContain('approvedBy');
  });
});

describe('TargetedReblock audit integration', () => {
  it('adds a dedicated audit action + target type for targeted reblock runs', () => {
    expect(AuditActionSchema.safeParse('TARGETED_REBLOCK_COMPLETED').success).toBe(true);
    const event = {
      id: '55555555-5555-4555-8555-555555555555',
      investigationId: REGION_REF.caseId,
      action: 'TARGETED_REBLOCK_COMPLETED',
      actor: 'TARGETED_REBLOCK_PIPELINE',
      timestamp: { value: '2026-09-01T00:00:00.000Z', precision: 'exact' },
      targetType: 'REBLOCK_RUN',
      targetId: makeProvenance().runId,
      description: 'Targeted reblock run completed',
    };
    expect(AuditEventSchema.safeParse(event).success).toBe(true);
  });
});