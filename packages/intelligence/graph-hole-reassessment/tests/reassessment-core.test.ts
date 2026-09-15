import { describe, it, expect } from 'vitest';
import {
  buildReassessmentChangeId,
  resolveAffectedSet,
  buildReassessmentPlan,
  deriveReassessmentOutcome,
  nbeRecomputeRequired,
  satisfiesExpectedCondition,
} from '../src/index.js';
import type {
  ReassessmentTrigger,
  ReassessmentAffectedSet,
} from '@indago/contracts';

// ============================================================================
// graph-hole-reassessment pure core (Phase 5A-PR12)
//
// Determinism and semantics of: change identity, affected-set resolution,
// plan building, and the outcome / RESOLVED producer rules.
// ============================================================================

const CASE_ID = '550e8400-e29b-41d4-a716-446655440000';
const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const GRAPH_VERSION_ID_2 = '550e8400-e29b-41d4-a716-446655440020';
const OBSERVATION_ID = '550e8400-e29b-41d4-a716-446655440007';
const OBSERVATION_ID_2 = '550e8400-e29b-41d4-a716-446655440008';
const EVIDENCE_ID = '550e8400-e29b-41d4-a716-446655440010';
const ENTITY_HYPOTHESIS_ID = '550e8400-e29b-41d4-a716-446655440011';
const ENTITY_HYPOTHESIS_ID_2 = '550e8400-e29b-41d4-a716-44665544002b';
const ENTITY_ID = '550e8400-e29b-41d4-a716-446655440012';
const ENTITY_ID_2 = '550e8400-e29b-41d4-a716-44665544002c';
const RELATION_HYPOTHESIS_ID = '550e8400-e29b-41d4-a716-446655440013';
const RELATION_ID = '550e8400-e29b-41d4-a716-446655440014';
const REGION_A = '550e8400-e29b-41d4-a716-446655440015';
const REGION_B = '550e8400-e29b-41d4-a716-446655440025';
const CANDIDATE_A = '550e8400-e29b-41d4-a716-446655440016';
const CANDIDATE_B = '550e8400-e29b-41d4-a716-446655440026';
const GROUP_A = '550e8400-e29b-41d4-a716-446655440017';
const HOLE_A = '550e8400-e29b-41d4-a716-446655440019';

const OBSERVED_AT = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' } as const;
const OBSERVED_AT_ALT = { value: '2024-07-02T00:00:00.000Z', precision: 'exact' } as const;

function observationTrigger(observationId = OBSERVATION_ID): ReassessmentTrigger {
  return {
    triggerType: 'NEW_OBSERVATION',
    caseId: CASE_ID,
    observationId,
    computedAt: OBSERVED_AT,
  };
}

function evidenceTrigger(): ReassessmentTrigger {
  return { triggerType: 'NEW_EVIDENCE', caseId: CASE_ID, evidenceId: EVIDENCE_ID, computedAt: OBSERVED_AT };
}

function entityResolutionTrigger(): ReassessmentTrigger {
  return {
    triggerType: 'ENTITY_RESOLUTION_ACCEPTED',
    caseId: CASE_ID,
    entityHypothesisId: ENTITY_HYPOTHESIS_ID,
    entityId: ENTITY_ID,
    graphVersionId: GRAPH_VERSION_ID_2,
    computedAt: OBSERVED_AT,
  };
}

describe('buildReassessmentChangeId', () => {
  it('produces a 64-char hex digest', () => {
    const id = buildReassessmentChangeId(observationTrigger());
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for identical triggers', () => {
    expect(buildReassessmentChangeId(observationTrigger())).toBe(
      buildReassessmentChangeId(observationTrigger()),
    );
  });

  it('excludes computedAt — different times yield the same changeId', () => {
    const a = buildReassessmentChangeId({ ...observationTrigger(), computedAt: OBSERVED_AT });
    const b = buildReassessmentChangeId({ ...observationTrigger(), computedAt: OBSERVED_AT_ALT });
    expect(a).toBe(b);
  });

  it('distinguishes different observations / cases', () => {
    expect(buildReassessmentChangeId(observationTrigger(OBSERVATION_ID))).not.toBe(
      buildReassessmentChangeId(observationTrigger(OBSERVATION_ID_2)),
    );
    const otherCase = buildReassessmentChangeId({
      ...observationTrigger(),
      caseId: '550e8400-e29b-41d4-a716-4466554400ff',
    });
    expect(otherCase).not.toBe(buildReassessmentChangeId(observationTrigger()));
  });

  it('distinguishes entity resolution by graphVersionId', () => {
    const v2 = buildReassessmentChangeId(entityResolutionTrigger());
    const v1 = buildReassessmentChangeId({
      ...entityResolutionTrigger(),
      graphVersionId: GRAPH_VERSION_ID,
    });
    expect(v2).not.toBe(v1);
  });
});

// ============================================================================
// Affected-set resolution
// ============================================================================

const hypotheses = [
  {
    id: ENTITY_HYPOTHESIS_ID,
    kind: 'ENTITY' as const,
    supportingObservationIds: [OBSERVATION_ID],
    contradictingObservationIds: [],
    candidateEntityIds: [ENTITY_ID],
  },
  {
    id: RELATION_HYPOTHESIS_ID,
    kind: 'RELATION' as const,
    supportingObservationIds: [],
    contradictingObservationIds: [],
    candidateEntityIds: [ENTITY_ID_2],
  },
];

const groups = [{ id: GROUP_A, memberHypothesisIds: [ENTITY_HYPOTHESIS_ID] }];

const regions = [
  { id: REGION_A, nodeIds: [ENTITY_ID], edgeIds: [], seedObservationIds: [OBSERVATION_ID] },
  { id: REGION_B, nodeIds: [ENTITY_ID_2], edgeIds: [], seedObservationIds: [] },
];

const holes = [
  { id: HOLE_A, candidateId: CANDIDATE_A, regionId: REGION_A, supportingHypothesisIds: [ENTITY_HYPOTHESIS_ID] },
  { id: '550e8400-e29b-41d4-a716-446655440029', candidateId: CANDIDATE_B, regionId: REGION_B, supportingHypothesisIds: [] },
];

function resolve(trigger: ReassessmentTrigger, overrides: Record<string, unknown> = {}): ReassessmentAffectedSet {
  return resolveAffectedSet({
    trigger,
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    changeId: buildReassessmentChangeId(trigger),
    changeReference: {
      nodeIds: trigger.triggerType === 'ENTITY_RESOLUTION_ACCEPTED' ? [ENTITY_ID] : [],
      edgeIds: [],
      changedObservationIds:
        trigger.triggerType === 'NEW_OBSERVATION'
          ? [trigger.observationId]
          : trigger.triggerType === 'NEW_EVIDENCE'
            ? [OBSERVATION_ID]
            : [],
    },
    hypotheses,
    groups,
    regions,
    holes,
    ...overrides,
  } as never);
}

describe('affected-set resolution — evidence-affecting', () => {
  it('NEW_OBSERVATION surfaces the referencing hypothesis, group, region and candidate', () => {
    const set = resolve(observationTrigger());
    expect(set.effectClass).toBe('EVIDENCE_AFFECTING');
    expect(set.status).toBe('AFFECTED_COMPLETE');
    expect(set.affectedEntityHypothesisIds).toEqual([ENTITY_HYPOTHESIS_ID]);
    expect(set.affectedRelationHypothesisIds).toEqual([]);
    expect(set.affectedGroupIds).toEqual([GROUP_A]);
    expect(set.affectedRegionIds).toEqual([REGION_A]);
    expect(set.affectedCandidateIds).toEqual([CANDIDATE_A]);
    expect(set.truncated).toBe(false);
  });

  it('NEW_EVIDENCE affects observations already grounded to it', () => {
    const set = resolve(evidenceTrigger());
    expect(set.affectedObservationIds).toEqual([OBSERVATION_ID]);
    expect(set.affectedRegionIds).toEqual([REGION_A]);
  });

  it('reports NO_AFFECTED when no hypothesis references the new observation', () => {
    const set = resolve(observationTrigger(OBSERVATION_ID_2));
    expect(set.status).toBe('NO_AFFECTED');
    expect(set.affectedRegionIds).toEqual([]);
    expect(set.affectedCandidateIds).toEqual([]);
    expect(set.truncated).toBe(false);
  });

  it('respects the region fanout bound and marks AFFECTED_TRUNCATED', () => {
    const set = resolve(observationTrigger(), {
      bounds: { maxAffectedRegions: 0, maxReassessments: 10 },
    });
    expect(set.status).toBe('AFFECTED_TRUNCATED');
    expect(set.truncated).toBe(true);
    expect(set.affectedRegionIds).toEqual([]);
  });

  it('sorts affected id collections canonically', () => {
    const set = resolve(observationTrigger(), {
      hypotheses: [
        { id: ENTITY_HYPOTHESIS_ID_2, kind: 'ENTITY' as const, supportingObservationIds: [OBSERVATION_ID], contradictingObservationIds: [], candidateEntityIds: [ENTITY_ID] },
        { id: ENTITY_HYPOTHESIS_ID, kind: 'ENTITY' as const, supportingObservationIds: [OBSERVATION_ID], contradictingObservationIds: [], candidateEntityIds: [ENTITY_ID] },
      ],
    });
    expect(set.affectedEntityHypothesisIds).toEqual([ENTITY_HYPOTHESIS_ID, ENTITY_HYPOTHESIS_ID_2]);
  });
});

describe('affected-set resolution — graph-affecting', () => {
  it('ENTITY_RESOLUTION_ACCEPTED selects overlap regions and supersession targets', () => {
    const set = resolve(entityResolutionTrigger());
    expect(set.effectClass).toBe('GRAPH_AFFECTING');
    expect(set.status).toBe('AFFECTED_COMPLETE');
    expect(set.affectedRegionIds).toEqual([REGION_A]);
    expect(set.affectedCandidateIds).toEqual([CANDIDATE_A]);
  });
});

describe('affected-set resolution — manual', () => {
  it('CASE_WIDE selects every candidate', () => {
    const set = resolveAffectedSet({
      trigger: {
        triggerType: 'REASSESSMENT_REQUESTED',
        caseId: CASE_ID,
        scope: { scope: 'CASE_WIDE' },
        computedAt: OBSERVED_AT,
      },
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      changeId: 'manual-1',
      changeReference: { nodeIds: [], edgeIds: [], changedObservationIds: [] },
      hypotheses,
      groups,
      regions,
      holes,
    });
    expect(set.status).toBe('AFFECTED_COMPLETE');
    expect(set.affectedRegionIds).toEqual([REGION_A, REGION_B]);
    expect(set.affectedCandidateIds).toEqual([CANDIDATE_A, CANDIDATE_B]);
  });

  it('CANDIDATES scope selects only regions hosting those candidates', () => {
    const set = resolveAffectedSet({
      trigger: {
        triggerType: 'REASSESSMENT_REQUESTED',
        caseId: CASE_ID,
        scope: { scope: 'CANDIDATES', candidateIds: [CANDIDATE_B] },
        computedAt: OBSERVED_AT,
      },
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      changeId: 'manual-2',
      changeReference: { nodeIds: [], edgeIds: [], changedObservationIds: [] },
      hypotheses,
      groups,
      regions,
      holes,
    });
    expect(set.affectedRegionIds).toEqual([REGION_B]);
    expect(set.affectedCandidateIds).toEqual([CANDIDATE_B]);
  });

  it('HOLES scope selects only the regions hosting those holes', () => {
    const set = resolveAffectedSet({
      trigger: {
        triggerType: 'REASSESSMENT_REQUESTED',
        caseId: CASE_ID,
        scope: { scope: 'HOLES', holeIds: [HOLE_A] },
        computedAt: OBSERVED_AT,
      },
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      changeId: 'manual-3',
      changeReference: { nodeIds: [], edgeIds: [], changedObservationIds: [] },
      hypotheses,
      groups,
      regions,
      holes,
    });
    expect(set.affectedRegionIds).toEqual([REGION_A]);
    expect(set.affectedCandidateIds).toEqual([CANDIDATE_A]);
  });
});

// ============================================================================
// Reassessment plan
// ============================================================================

describe('buildReassessmentPlan', () => {
  it('produces canonical items ordered by regionId asc and recomputeIdentity=false for evidence', () => {
    const set = resolve(observationTrigger());
    const plan = buildReassessmentPlan(set, {
      candidatesByRegion: { [REGION_A]: [CANDIDATE_A] },
    });
    expect(plan.map((i) => i.regionId)).toEqual([REGION_A]);
    expect(plan[0].recomputeIdentity).toBe(false);
    expect(plan[0].candidateIds).toEqual([CANDIDATE_A]);
    expect(plan[0].graphVersionId).toBe(GRAPH_VERSION_ID);
  });

  it('graph-affecting items recompute identity and drop candidate bindings', () => {
    const set = resolve(entityResolutionTrigger());
    const plan = buildReassessmentPlan(set);
    expect(plan[0].regionId).toBe(REGION_A);
    expect(plan[0].recomputeIdentity).toBe(true);
    expect(plan[0].candidateIds).toEqual([]);
    expect(plan[0].graphVersionId).toBe(GRAPH_VERSION_ID);
  });

  it('is stable (same input, same plan; candidate arrays sorted)', () => {
    const set = resolve(observationTrigger(), {
      hypotheses: [
        { id: ENTITY_HYPOTHESIS_ID, kind: 'ENTITY' as const, supportingObservationIds: [OBSERVATION_ID], contradictingObservationIds: [], candidateEntityIds: [ENTITY_ID] },
      ],
    });
    const a = buildReassessmentPlan(set);
    const b = buildReassessmentPlan(set);
    expect(a).toEqual(b);
  });
});

// ============================================================================
// Outcome derivation
// ============================================================================

describe('deriveReassessmentOutcome', () => {
  const baseCurrent = {
    independentSupportUnitCount: 2,
    evidenceSupportScore: 0.8,
    structuralScore: 0.7,
    expectedInformationValue: 0.9,
    contradictingObservationIds: [],
    expectedRelationshipType: 'communication',
    canonicalNodeIds: [ENTITY_ID, ENTITY_ID_2],
  };

  const basePrior = {
    independentSupportUnitCount: 2,
    evidenceSupportScore: 0.8,
    structuralScore: 0.7,
    expectedInformationValue: 0.9,
    contradictingObservationIds: [],
  };

  it('produces null (no change) when nothing moved', () => {
    expect(deriveReassessmentOutcome({
      prior: basePrior,
      current: baseCurrent,
      presentRelations: [],
      replacementCreated: false,
      candidateReplaced: false,
    })).toBeNull();
  });

  it('WEAKENED when support decreased (never RESOLVED)', () => {
    const outcome = deriveReassessmentOutcome({
      prior: { ...basePrior, independentSupportUnitCount: 3 },
      current: { ...baseCurrent, independentSupportUnitCount: 2 },
      presentRelations: [],
      replacementCreated: false,
      candidateReplaced: false,
    });
    expect(outcome).toBe('WEAKENED');
  });

  it('STRENGTHENED when support increased', () => {
    const outcome = deriveReassessmentOutcome({
      prior: basePrior,
      current: { ...baseCurrent, evidenceSupportScore: 0.95 },
      presentRelations: [],
      replacementCreated: false,
      candidateReplaced: false,
    });
    expect(outcome).toBe('STRENGTHENED');
  });

  it('CONTRADICTED when a new contradicting observation appears', () => {
    const outcome = deriveReassessmentOutcome({
      prior: basePrior,
      current: { ...baseCurrent, contradictingObservationIds: [OBSERVATION_ID_2] },
      presentRelations: [],
      replacementCreated: false,
      candidateReplaced: false,
    });
    expect(outcome).toBe('CONTRADICTED');
  });

  it('RESOLVED when an authoritative relation now satisfies the expected condition', () => {
    const outcome = deriveReassessmentOutcome({
      prior: basePrior,
      current: baseCurrent,
      presentRelations: [
        {
          sourceNodeId: ENTITY_ID,
          targetNodeId: ENTITY_ID_2,
          relationType: 'communication',
          directed: true,
        },
      ],
      replacementCreated: false,
      candidateReplaced: false,
    });
    expect(outcome).toBe('RESOLVED');
  });

  it('NOT RESOLVED when relation type does not match expectation', () => {
    const satisfied = satisfiesExpectedCondition(baseCurrent, [
      { sourceNodeId: ENTITY_ID, targetNodeId: ENTITY_ID_2, relationType: 'employment', directed: true },
    ]);
    expect(satisfied).toBe(false);
  });

  it('RESOLVED produced only when expectedRelationshipType is present', () => {
    expect(satisfiesExpectedCondition(
      { ...baseCurrent, expectedRelationshipType: null },
      [{ sourceNodeId: ENTITY_ID, targetNodeId: ENTITY_ID_2, relationType: 'communication', directed: true }],
    )).toBe(false);
  });

  it('SUPERSEDED takes precedence over RESOLVED', () => {
    const outcome = deriveReassessmentOutcome({
      prior: basePrior,
      current: baseCurrent,
      presentRelations: [
        { sourceNodeId: ENTITY_ID, targetNodeId: ENTITY_ID_2, relationType: 'communication', directed: true },
      ],
      replacementCreated: true,
      candidateReplaced: true,
    });
    expect(outcome).toBe('SUPERSEDED');
  });

  it('does NOT report SUPERSEDED without an actual replacement record', () => {
    const outcome = deriveReassessmentOutcome({
      prior: basePrior,
      current: { ...baseCurrent, evidenceSupportScore: 0.75 },
      presentRelations: [],
      replacementCreated: false,
      candidateReplaced: true,
    });
    expect(outcome).toBe('WEAKENED');
  });
});

// ============================================================================
// PR10 recompute gating
// ============================================================================

describe('nbeRecomputeRequired', () => {
  it('false when candidate key sets are equal', () => {
    expect(nbeRecomputeRequired({
      prevCandidateKeySet: ['a', 'b'],
      newCandidateKeySet: ['b', 'a'],
    })).toBe(false);
  });

  it('true when the candidate set changes', () => {
    expect(nbeRecomputeRequired({
      prevCandidateKeySet: ['a'],
      newCandidateKeySet: ['a', 'b'],
    })).toBe(true);
  });

  it('true when the utility signature changes', () => {
    expect(nbeRecomputeRequired({
      prevCandidateKeySet: ['a'],
      newCandidateKeySet: ['a'],
      prevUtilitySignature: 'util-v1',
      newUtilitySignature: 'util-v2',
    })).toBe(true);
  });
});