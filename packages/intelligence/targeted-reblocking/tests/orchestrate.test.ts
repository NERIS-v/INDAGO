import { describe, it, expect } from 'vitest';
import {
  TargetedReblockResultSchema,
  TARGETED_REBLOCK_MAX_CANDIDATES,
  TARGETED_REBLOCK_MAX_PAIRS,
  TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS,
} from '@indago/contracts';
import {
  blockTargetedRegion,
  runTargetedReblock,
  buildTargetedReblockIdentityKey,
  targetedReblockRunId,
  TargetedReblockError,
} from '../src/index.js';
import {
  CASE_ID,
  GRAPH_VERSION_ID,
  INVESTIGATION_ID,
  LONG_UUID,
  REGION_ID,
  REGION_POLICY_VERSION,
  makeCandidate,
  makeObservation,
} from './fixtures.js';
import type { TargetedReblockRegionReference } from '@indago/contracts';

// ============================================================================
// PR11 orchestrate — deterministic core pipeline
//
// HARD RULES under test:
//   § pure + deterministic — identical input → identical runId + accounting
//   § content-addressed runId — ANY change to the scoping or selected
//       universe yields a DIFFERENT run identity (never an ambiguous append)
//   § region membership — candidates outside region members never enter
//   § M-A08 VERBATIM reuse — pair drafts come from blockCandidates
//   § authority guard — wrong caseId/graphVersionId → hard reject
//   § hard bounds — every truncation is surfaced in accounting
//   § NO resolution — output is a comparison universe, never hypotheses
// ============================================================================

const REGION_REF: TargetedReblockRegionReference = {
  caseId: CASE_ID,
  graphVersionId: GRAPH_VERSION_ID,
  regionId: REGION_ID,
  regionPolicyVersion: REGION_POLICY_VERSION,
};

function emailUniverse(): ReturnType<typeof makeCandidate>[] {
  return [
    makeCandidate(1, { type: 'EMAIL', value: 'x@example.org', observation: 101 }),
    makeCandidate(2, { type: 'EMAIL', value: 'x@example.org', observation: 102 }),
  ];
}

const MEMBER_IDS = [
  LONG_UUID(101),
  LONG_UUID(102),
];

function coreCall(policy?: { maxCandidates?: number; maxPairs?: number }) {
  return blockTargetedRegion({
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    regionReference: REGION_REF,
    memberObservationIds: MEMBER_IDS,
    candidates: emailUniverse(),
    policy,
  });
}

describe('blockTargetedRegion determinism', () => {
  it('identical input → identical runId, identityKey, accounting, drafts', () => {
    const a = coreCall();
    const b = coreCall();
    expect(a.result.runId).toBe(b.result.runId);
    expect(a.result.identityKey).toBe(b.result.identityKey);
    expect(a.result.accounting).toEqual(b.result.accounting);
    expect(a.drafts).toEqual(b.drafts);
  });

  it('output validates against the TargetReblockResultSchema', () => {
    const { result } = coreCall();
    expect(() => TargetedReblockResultSchema.parse(result)).not.toThrow();
  });

  it('runId is the sha256 hex of the identityKey', () => {
    const { result } = coreCall();
    expect(result.runId).toBe(targetedReblockRunId(result.identityKey));
    expect(result.runId).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('content-addressed run identity', () => {
  it('changes when the case changes', () => {
    const a = coreCall();
    const otherCase = LONG_UUID(990);
    const b = blockTargetedRegion({
      caseId: otherCase,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: { ...REGION_REF, caseId: otherCase },
      memberObservationIds: MEMBER_IDS,
      candidates: emailUniverse(),
    });
    expect(b.result.runId).not.toBe(a.result.runId);
  });

  it('changes when the region changes', () => {
    const a = coreCall();
    const b = blockTargetedRegion({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: { ...REGION_REF, regionId: `c${'d'.repeat(63)}` },
      memberObservationIds: MEMBER_IDS,
      candidates: emailUniverse(),
    });
    expect(b.result.runId).not.toBe(a.result.runId);
  });

  it('changes when the selected candidate universe changes', () => {
    const a = coreCall();
    const bigger = blockTargetedRegion({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: REGION_REF,
      memberObservationIds: MEMBER_IDS,
      candidates: [...emailUniverse(), makeCandidate(3, { type: 'EMAIL', value: 'y@example.org', observation: 102 })],
    });
    expect(bigger.result.runId).not.toBe(a.result.runId);
  });
});

describe('targeted reblock core boundary', () => {
  it('reuses M-A08: identical-email candidates produce exactly one draft unchanged', () => {
    const { result, drafts } = coreCall();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.blockingPasses).toEqual(['EXACT_STRONG_IDENTIFIER']);
    expect(result.accounting.pairsGenerated).toBe(1);
    expect(result.accounting.blockingMetrics.blocksGenerated).toBe(1);
    expect(result.accounting.blockingMetrics.blocksSkippedOversized).toBe(0);
  });

  it('never admits a candidate outside the region membership', () => {
    const { result, drafts } = blockTargetedRegion({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: REGION_REF,
      memberObservationIds: [LONG_UUID(101)],
      candidates: [
        makeCandidate(1, { type: 'EMAIL', value: 'x@example.org', observation: 101 }),
        makeCandidate(2, { type: 'EMAIL', value: 'x@example.org', observation: 102 }),
      ],
    });
    expect(result.accounting.candidateUniverseRequested).toBe(2);
    expect(result.accounting.candidateUniverseEligible).toBe(1);
    expect(result.accounting.candidateUniverseProcessed).toBe(1);
    expect(result.accounting.candidateUniverseTruncated).toBe(0);
    expect(drafts).toHaveLength(0);
  });

  it('never produces resolution artifacts (comparison universe only)', () => {
    const { drafts } = coreCall();
    for (const draft of drafts) {
      expect(draft).not.toHaveProperty('entityHypothesisId');
      expect(draft).not.toHaveProperty('approvedBy');
      expect(draft).not.toHaveProperty('rejectedBy');
    }
  });
});

describe('authority + reference guards', () => {
  it('rejects a region referenced by a different case', () => {
    expect(() =>
      blockTargetedRegion({
        caseId: CASE_ID,
        graphVersionId: GRAPH_VERSION_ID,
        regionReference: { ...REGION_REF, caseId: LONG_UUID(990) },
        memberObservationIds: MEMBER_IDS,
        candidates: emailUniverse(),
      }),
    ).toThrowError(TargetedReblockError);
  });

  it('rejects a region referenced by a different graph version', () => {
    expect(() =>
      blockTargetedRegion({
        caseId: CASE_ID,
        graphVersionId: GRAPH_VERSION_ID,
        regionReference: { ...REGION_REF, graphVersionId: LONG_UUID(991) },
        memberObservationIds: MEMBER_IDS,
        candidates: emailUniverse(),
      }),
    ).toThrowError(TargetedReblockError);
  });

  it('rejects a malformed region reference', () => {
    expect(() =>
      blockTargetedRegion({
        caseId: CASE_ID,
        graphVersionId: GRAPH_VERSION_ID,
        regionReference: { ...REGION_REF, regionId: '' },
        memberObservationIds: MEMBER_IDS,
        candidates: emailUniverse(),
      }),
    ).toThrowError(/Malformed targeted-reblock region reference/);
  });
});

describe('hard bounds are surfaced, never silent', () => {
  it('candidate universe bound truncates deterministically and flags it', () => {
    const { result } = coreCall({ maxCandidates: 1 });
    expect(result.accounting.candidateUniverseProcessed).toBe(1);
    expect(result.accounting.candidateUniverseTruncated).toBe(1);
    expect(result.accounting.candidateBoundReached).toBe(true);
  });

  it('candidate bound yields a DIFFERENT run identity than the unbounded run', () => {
    const full = coreCall();
    const capped = coreCall({ maxCandidates: 1 });
    expect(capped.result.runId).not.toBe(full.result.runId);
    expect(capped.result.selectedCandidateIds).toHaveLength(1);
  });

  it('pair bound truncates drafts and flags pairsTruncated', () => {
    const candidates = [
      makeCandidate(1, { type: 'EMAIL', value: 'x1@example.org', observation: 101 }),
      makeCandidate(2, { type: 'EMAIL', value: 'x1@example.org', observation: 102 }),
      makeCandidate(3, { type: 'EMAIL', value: 'x2@example.org', observation: 103 }),
      makeCandidate(4, { type: 'EMAIL', value: 'x2@example.org', observation: 104 }),
    ];
    const memberIds = [LONG_UUID(101), LONG_UUID(102), LONG_UUID(103), LONG_UUID(104)];
    const { result, drafts } = blockTargetedRegion({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: REGION_REF,
      memberObservationIds: memberIds,
      candidates,
      policy: { maxPairs: 1 },
    });
    expect(result.accounting.pairsGenerated).toBe(2);
    expect(result.accounting.pairsTruncated).toBe(true);
    expect(drafts).toHaveLength(1);
  });
});

describe('runTargetedReblock convenience pipeline', () => {
  it('resolves members (with temporal filter) then runs the core', () => {
    const { result, drafts } = runTargetedReblock({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      investigationId: INVESTIGATION_ID,
      regionReference: REGION_REF,
      seedObservationIds: [LONG_UUID(101)],
      nodeObservations: [
        makeObservation(102, { eventTime: '2026-03-15T00:00:00.000Z' }),
        makeObservation(199, { eventTime: '2026-07-01T00:00:00.000Z' }),
      ],
      temporalContext: {
        validFrom: { value: '2026-03-01T00:00:00.000Z', precision: 'exact' },
        validTo: { value: '2026-03-31T23:59:59.999Z', precision: 'exact' },
      },
      candidates: [...emailUniverse(), makeCandidate(9, { type: 'EMAIL', value: 'z@example.org', observation: 199 })],
    });

    expect(result.accounting.regionObservationCount).toBe(2);
    expect(result.accounting.regionObservationBoundReached).toBe(false);
    expect(result.provenance.memberObservationIds).not.toContain(LONG_UUID(199));
    // outsider candidate excluded because its observation is not a member
    expect(result.accounting.candidateUniverseEligible).toBe(2);
    expect(drafts).toHaveLength(1);
  });

  it('surfaces the region observation bound via the convenience wrapper', () => {
    const { result } = runTargetedReblock({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: REGION_REF,
      seedObservationIds: [LONG_UUID(101), LONG_UUID(102), LONG_UUID(103)],
      nodeObservations: [],
      candidates: emailUniverse(),
      policy: { maxRegionObservations: 2 },
    });
    expect(result.accounting.regionObservationBoundReached).toBe(true);
    expect(result.accounting.regionObservationCount).toBe(2);
  });

  it('delegates to blockTargetedRegion so determinism holds end to end', () => {
    const a = runTargetedReblock({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: REGION_REF,
      seedObservationIds: [LONG_UUID(101)],
      nodeObservations: [makeObservation(102, { eventTime: '2026-03-15T00:00:00.000Z' })],
      candidates: emailUniverse(),
    });
    const b = runTargetedReblock({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionReference: REGION_REF,
      seedObservationIds: [LONG_UUID(101)],
      nodeObservations: [makeObservation(102, { eventTime: '2026-03-15T00:00:00.000Z' })],
      candidates: emailUniverse(),
    });
    expect(a.result).toEqual(b.result);
    expect(a.drafts).toEqual(b.drafts);
  });
});

describe('frozen policy constants are exported for the platform gate', () => {
  it('exposes the frozen V1 bounds', () => {
    expect(TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS).toBe(500);
    expect(TARGETED_REBLOCK_MAX_CANDIDATES).toBe(200);
    expect(TARGETED_REBLOCK_MAX_PAIRS).toBe(5000);
  });

  it('buildTargetedReblockIdentityKey is pure and ordered', () => {
    const input = {
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      regionId: REGION_ID,
      regionPolicyVersion: 'v1',
      policyVersion: 'v1' as const,
      selectedCandidateIds: [LONG_UUID(2), LONG_UUID(1)],
    };
    const a = buildTargetedReblockIdentityKey(input);
    const b = buildTargetedReblockIdentityKey({
      ...input,
      selectedCandidateIds: [LONG_UUID(1), LONG_UUID(2)],
    });
    expect(a).toBe(b);
  });
});