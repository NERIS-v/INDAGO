import { describe, it, expect } from 'vitest';
import {
  REASSESSMENT_POLICY_VERSION,
  PR12_MAX_CHANGES_PER_RUN,
  PR12_MAX_AFFECTED_HYPOTHESES_PER_CHANGE,
  PR12_MAX_AFFECTED_GROUPS_PER_CHANGE,
  PR12_MAX_AFFECTED_REGIONS_PER_CHANGE,
  PR12_MAX_REASSESSMENTS_PER_CHANGE,
  ReassessmentTriggerSchema,
  NewObservationTriggerSchema,
  NewEvidenceTriggerSchema,
  EntityResolutionAcceptedTriggerSchema,
  RelationAcceptedTriggerSchema,
  ReassessmentRequestedTriggerSchema,
  EFFECT_CLASS_BY_TRIGGER_TYPE,
  deriveReassessmentEffectClass,
  canonicalizeReassessmentChangeIdentity,
  REASSESSMENT_TRIGGER_TYPES,
  ReassessmentEffectClassSchema,
  ReassessmentAffectedSetSchema,
  ReassessmentPlanItemSchema,
  ReassessmentPlanSchema,
  ReassessmentOutcomeSchema,
  ReassessmentAccountingSchema,
  IncrementalReassessmentRunSchema,
  REASSESSMENT_OUTCOME_PRECEDENCE,
  ReassessmentRegionResultStatusSchema,
  ReassessmentRunStatusSchema,
  ReassessmentScopeSchema,
  REASSESSMENT_CHANGE_ID_NAMESPACE,
  ManualReassessmentScopeSchema,
} from '../src/index.js';

// ============================================================================
// Reassessment Contracts (Phase 5A-PR12)
//
// Verifies: policy version, bounds, discriminated union, effect-class mapping,
// trigger identity determinism, affected-set status semantics, outcome semantics,
// account shape, run record shape, plan canonicality, manual scope validation.
// ============================================================================

const CASE_ID = '550e8400-e29b-41d4-a716-446655440000';
const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const GRAPH_VERSION_ID_2 = '550e8400-e29b-41d4-a716-446655440020';
const OBSERVATION_ID = '550e8400-e29b-41d4-a716-446655440007';
const EVIDENCE_ID = '550e8400-e29b-41d4-a716-446655440010';
const ENTITY_HYPOTHESIS_ID = '550e8400-e29b-41d4-a716-446655440011';
const ENTITY_ID = '550e8400-e29b-41d4-a716-446655440012';
const RELATION_HYPOTHESIS_ID = '550e8400-e29b-41d4-a716-446655440013';
const RELATION_ID = '550e8400-e29b-41d4-a716-446655440014';
const REGION_ID = '550e8400-e29b-41d4-a716-446655440015';
const CANDIDATE_ID = '550e8400-e29b-41d4-a716-446655440016';
const GROUP_ID = '550e8400-e29b-41d4-a716-446655440017';
const HOLE_ID = '550e8400-e29b-41d4-a716-446655440018';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440019';

const OBSERVED_AT = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' } as const;
const OBSERVED_AT_ALT = { value: '2024-07-02T00:00:00.000Z', precision: 'exact' } as const;

// ============================================================================
// §1 Policy version and bounds
// ============================================================================

describe('PR12 policy version and bounds', () => {
  it('exports v1 policy version', () => {
    expect(REASSESSMENT_POLICY_VERSION).toBe('v1');
  });

  it('exports frozen fanout bounds', () => {
    expect(PR12_MAX_CHANGES_PER_RUN).toBe(25);
    expect(PR12_MAX_AFFECTED_HYPOTHESES_PER_CHANGE).toBe(50);
    expect(PR12_MAX_AFFECTED_GROUPS_PER_CHANGE).toBe(25);
    expect(PR12_MAX_AFFECTED_REGIONS_PER_CHANGE).toBe(10);
    expect(PR12_MAX_REASSESSMENTS_PER_CHANGE).toBe(10);
  });

  it('exports the complete frozen trigger type vocabulary', () => {
    expect(REASSESSMENT_TRIGGER_TYPES).toEqual([
      'NEW_OBSERVATION',
      'NEW_EVIDENCE',
      'ENTITY_RESOLUTION_ACCEPTED',
      'RELATION_ACCEPTED',
      'REASSESSMENT_REQUESTED',
    ]);
  });

  it('exports the change id namespace', () => {
    expect(REASSESSMENT_CHANGE_ID_NAMESPACE).toBe('indago:graph-hole-reassessment');
  });
});

// ============================================================================
// §2 Effect-class mapping (frozen)
// ============================================================================

describe('effect-class mapping', () => {
  it('NEW_OBSERVATION maps to EVIDENCE_AFFECTING', () => {
    expect(deriveReassessmentEffectClass({
      triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: OBSERVATION_ID, computedAt: OBSERVED_AT,
    })).toBe('EVIDENCE_AFFECTING');
  });

  it('NEW_EVIDENCE maps to EVIDENCE_AFFECTING', () => {
    expect(deriveReassessmentEffectClass({
      triggerType: 'NEW_EVIDENCE', caseId: CASE_ID, evidenceId: EVIDENCE_ID, computedAt: OBSERVED_AT,
    })).toBe('EVIDENCE_AFFECTING');
  });

  it('ENTITY_RESOLUTION_ACCEPTED maps to GRAPH_AFFECTING', () => {
    expect(deriveReassessmentEffectClass({
      triggerType: 'ENTITY_RESOLUTION_ACCEPTED', caseId: CASE_ID, entityHypothesisId: ENTITY_HYPOTHESIS_ID,
      entityId: ENTITY_ID, graphVersionId: GRAPH_VERSION_ID, computedAt: OBSERVED_AT,
    })).toBe('GRAPH_AFFECTING');
  });

  it('RELATION_ACCEPTED maps to GRAPH_AFFECTING', () => {
    expect(deriveReassessmentEffectClass({
      triggerType: 'RELATION_ACCEPTED', caseId: CASE_ID, relationHypothesisId: RELATION_HYPOTHESIS_ID,
      relationId: RELATION_ID, graphVersionId: GRAPH_VERSION_ID, computedAt: OBSERVED_AT,
    })).toBe('GRAPH_AFFECTING');
  });

  it('REASSESSMENT_REQUESTED without graphVersionId maps to MANUAL_REASSESSMENT', () => {
    expect(deriveReassessmentEffectClass({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'CASE_WIDE' }, computedAt: OBSERVED_AT,
    })).toBe('MANUAL_REASSESSMENT');
  });

  it('REASSESSMENT_REQUESTED with graphVersionId maps to GRAPH_AFFECTING', () => {
    expect(deriveReassessmentEffectClass({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'HOLES', holeIds: [HOLE_ID], graphVersionId: GRAPH_VERSION_ID },
      computedAt: OBSERVED_AT,
    })).toBe('GRAPH_AFFECTING');
  });

  it('mapping table covers every trigger type exactly once', () => {
    expect(Object.keys(EFFECT_CLASS_BY_TRIGGER_TYPE)).toEqual(
      expect.arrayContaining(REASSESSMENT_TRIGGER_TYPES),
    );
  });
});

// ============================================================================
// §3 Trigger discriminated union
// ============================================================================

describe('trigger discriminated union', () => {
  it('accepts NEW_OBSERVATION trigger', () => {
    const result = ReassessmentTriggerSchema.safeParse({
      triggerType: 'NEW_OBSERVATION',
      caseId: CASE_ID,
      observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
    });
    expect(result.success).toBe(true);
  });

  it('accepts ENTITY_RESOLUTION_ACCEPTED trigger', () => {
    const result = ReassessmentTriggerSchema.safeParse({
      triggerType: 'ENTITY_RESOLUTION_ACCEPTED',
      caseId: CASE_ID,
      entityHypothesisId: ENTITY_HYPOTHESIS_ID,
      entityId: ENTITY_ID,
      graphVersionId: GRAPH_VERSION_ID,
      computedAt: OBSERVED_AT,
    });
    expect(result.success).toBe(true);
  });

  it('accepts REASSESSMENT_REQUESTED trigger with minimal scope', () => {
    const result = ReassessmentTriggerSchema.safeParse({
      triggerType: 'REASSESSMENT_REQUESTED',
      caseId: CASE_ID,
      scope: { scope: 'CASE_WIDE' },
      computedAt: OBSERVED_AT,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown trigger type', () => {
    const result = ReassessmentTriggerSchema.safeParse({
      triggerType: 'UNKNOWN_TRIGGER',
      caseId: CASE_ID,
      observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra top-level fields', () => {
    const result = ReassessmentTriggerSchema.safeParse({
      triggerType: 'NEW_OBSERVATION',
      caseId: CASE_ID,
      observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
      affectedRegions: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects trigger without computedAt', () => {
    const result = ReassessmentTriggerSchema.safeParse({
      triggerType: 'NEW_OBSERVATION',
      caseId: CASE_ID,
      observationId: OBSERVATION_ID,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// §4 Manual scope validation
// ============================================================================

describe('manual scope validation', () => {
  it('accepts CASE_WIDE with no target arrays', () => {
    const result = ManualReassessmentScopeSchema.safeParse({ scope: 'CASE_WIDE' });
    expect(result.success).toBe(true);
  });

  it('accepts REGIONS with regionIds', () => {
    const result = ManualReassessmentScopeSchema.safeParse({
      scope: 'REGIONS', regionIds: [REGION_ID],
    });
    expect(result.success).toBe(true);
  });

  it('accepts HOLES with holeIds and optional requestToken', () => {
    const result = ManualReassessmentScopeSchema.safeParse({
      scope: 'HOLES', holeIds: [HOLE_ID], requestToken: 'force-re-run-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects extra scope fields', () => {
    const result = ManualReassessmentScopeSchema.safeParse({
      scope: 'CASE_WIDE', badField: true,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// §5 Trigger identity determinism
// ============================================================================

describe('canonical change identity', () => {
  it('returns the same canonical string for identical inputs', () => {
    const trigger = {
      triggerType: 'NEW_OBSERVATION' as const,
      caseId: CASE_ID,
      observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
    };
    expect(canonicalizeReassessmentChangeIdentity(trigger)).toBe(
      canonicalizeReassessmentChangeIdentity(trigger),
    );
  });

  it('excludes computedAt by construction — different times produce the same identity', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT_ALT,
    });
    expect(a).toBe(b);
  });

  it('produces different identities for different observations', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: '550e8400-e29b-41d4-a716-446655440099',
      computedAt: OBSERVED_AT,
    });
    expect(a).not.toBe(b);
  });

  it('produces different identities for different cases', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_EVIDENCE', caseId: CASE_ID, evidenceId: EVIDENCE_ID,
      computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_EVIDENCE', caseId: '550e8400-e29b-41d4-a716-4466554400ff', evidenceId: EVIDENCE_ID,
      computedAt: OBSERVED_AT,
    });
    expect(a).not.toBe(b);
  });

  it('entity-resolution identity includes graphVersionId', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'ENTITY_RESOLUTION_ACCEPTED', caseId: CASE_ID,
      entityHypothesisId: ENTITY_HYPOTHESIS_ID, entityId: ENTITY_ID,
      graphVersionId: GRAPH_VERSION_ID, computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'ENTITY_RESOLUTION_ACCEPTED', caseId: CASE_ID,
      entityHypothesisId: ENTITY_HYPOTHESIS_ID, entityId: ENTITY_ID,
      graphVersionId: GRAPH_VERSION_ID_2, computedAt: OBSERVED_AT,
    });
    expect(a).not.toBe(b);
  });

  it('relation-acceptance identity includes graphVersionId and relationId', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'RELATION_ACCEPTED', caseId: CASE_ID,
      relationHypothesisId: RELATION_HYPOTHESIS_ID, relationId: RELATION_ID,
      graphVersionId: GRAPH_VERSION_ID, computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'RELATION_ACCEPTED', caseId: CASE_ID,
      relationHypothesisId: RELATION_HYPOTHESIS_ID, relationId: RELATION_ID,
      graphVersionId: GRAPH_VERSION_ID, computedAt: OBSERVED_AT_ALT,
    });
    expect(a).toBe(b);
  });

  it('manual-request identity includes requestToken when present', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'HOLES', holeIds: [HOLE_ID] }, computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'HOLES', holeIds: [HOLE_ID], requestToken: 're-run-1' }, computedAt: OBSERVED_AT,
    });
    expect(a).not.toBe(b);
  });

  it('manual-request identity is stable across different scope arrays in same order', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'REGIONS', regionIds: [REGION_ID, CANDIDATE_ID] }, computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'REGIONS', regionIds: [REGION_ID, CANDIDATE_ID] }, computedAt: OBSERVED_AT,
    });
    expect(a).toBe(b);
  });

  it('manual-request identity is stable regardless of scope array order (arrays are sorted)', () => {
    const a = canonicalizeReassessmentChangeIdentity({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'CANDIDATES', candidateIds: [CANDIDATE_ID, REGION_ID] }, computedAt: OBSERVED_AT,
    });
    const b = canonicalizeReassessmentChangeIdentity({
      triggerType: 'REASSESSMENT_REQUESTED', caseId: CASE_ID,
      scope: { scope: 'CANDIDATES', candidateIds: [REGION_ID, CANDIDATE_ID] }, computedAt: OBSERVED_AT,
    });
    expect(a).toBe(b);
  });

  it('produces a string (stable canonical serialization)', () => {
    const canonical = canonicalizeReassessmentChangeIdentity({
      triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: OBSERVATION_ID,
      computedAt: OBSERVED_AT,
    });
    expect(typeof canonical).toBe('string');
    expect(canonical.length).toBeGreaterThan(0);
    // Should be valid JSON (from canonicalizeDeterministic)
    expect(() => JSON.parse(canonical)).not.toThrow();
  });
});

// ============================================================================
// §6 Affected-set status semantics
// ============================================================================

describe('affected-set status semantics', () => {
  it('NO_AFFECTED status is valid and produces empty arrays', () => {
    const result = ReassessmentAffectedSetSchema.safeParse({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      changeId: 'abc123',
      effectClass: 'EVIDENCE_AFFECTING',
      status: 'NO_AFFECTED',
      affectedObservationIds: [],
      affectedEntityHypothesisIds: [],
      affectedRelationHypothesisIds: [],
      affectedGroupIds: [],
      affectedRegionIds: [],
      affectedCandidateIds: [],
      truncated: false,
      accounting: {
        observationUniverseCount: 0,
        hypothesisUniverseCount: 0,
        candidateUniverseCount: 0,
        groupUniverseCount: 0,
        regionUniverseCount: 0,
      },
    });
    expect(result.success).toBe(true);
  });

  it('AFFECTED_TRUNCATED status requires truncated=true', () => {
    const result = ReassessmentAffectedSetSchema.safeParse({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      changeId: 'abc123',
      effectClass: 'EVIDENCE_AFFECTING',
      status: 'AFFECTED_TRUNCATED',
      affectedObservationIds: [OBSERVATION_ID],
      affectedEntityHypothesisIds: [],
      affectedRelationHypothesisIds: [],
      affectedGroupIds: [],
      affectedRegionIds: [],
      affectedCandidateIds: [],
      truncated: true,
      accounting: {
        observationUniverseCount: 100,
        hypothesisUniverseCount: 50,
        candidateUniverseCount: 30,
        groupUniverseCount: 10,
        regionUniverseCount: 5,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown status value', () => {
    const result = ReassessmentAffectedSetSchema.safeParse({
      caseId: CASE_ID, graphVersionId: GRAPH_VERSION_ID, changeId: 'x',
      effectClass: 'EVIDENCE_AFFECTING', status: 'UNKNOWN',
      affectedObservationIds: [], affectedEntityHypothesisIds: [],
      affectedRelationHypothesisIds: [], affectedGroupIds: [],
      affectedRegionIds: [], affectedCandidateIds: [],
      truncated: false, accounting: {
        observationUniverseCount: 0, hypothesisUniverseCount: 0,
        candidateUniverseCount: 0, groupUniverseCount: 0, regionUniverseCount: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// §7 Outcome semantics and precedence
// ============================================================================

describe('outcome semantics', () => {
  it('valid outcomes are the frozen five', () => {
    expect(ReassessmentOutcomeSchema.options).toEqual([
      'STRENGTHENED', 'WEAKENED', 'RESOLVED', 'CONTRADICTED', 'SUPERSEDED',
    ]);
  });

  it('outcome precedence ordering is SUPERSEDED > RESOLVED > CONTRADICTED > direction', () => {
    expect(REASSESSMENT_OUTCOME_PRECEDENCE.SUPERSEDED).toBeLessThan(
      REASSESSMENT_OUTCOME_PRECEDENCE.RESOLVED,
    );
    expect(REASSESSMENT_OUTCOME_PRECEDENCE.RESOLVED).toBeLessThan(
      REASSESSMENT_OUTCOME_PRECEDENCE.CONTRADICTED,
    );
    expect(REASSESSMENT_OUTCOME_PRECEDENCE.CONTRADICTED).toBeLessThan(
      REASSESSMENT_OUTCOME_PRECEDENCE.STRENGTHENED,
    );
  });

  it('region result status vocabulary covers the required states', () => {
    expect(ReassessmentRegionResultStatusSchema.options).toEqual([
      'REUSED', 'RECOMPUTED', 'SKIPPED_CONTEXT_UNCHANGED',
      'SKIPPED_NO_CHANGE', 'FAILED',
    ]);
  });

  it('run status vocabulary covers the required states', () => {
    expect(ReassessmentRunStatusSchema.options).toEqual([
      'COMPLETED', 'PARTIAL', 'FAILED', 'NO_OP',
    ]);
  });
});

// ============================================================================
// §8 Reassessment plan
// ============================================================================

describe('reassessment plan', () => {
  it('validates a minimal plan item', () => {
    const result = ReassessmentPlanItemSchema.safeParse({
      regionId: REGION_ID,
      graphVersionId: GRAPH_VERSION_ID,
      effectClass: 'EVIDENCE_AFFECTING',
      recomputeIdentity: false,
      candidateIds: [CANDIDATE_ID],
    });
    expect(result.success).toBe(true);
  });

  it('allows empty candidateIds for graph-affecting items', () => {
    const result = ReassessmentPlanItemSchema.safeParse({
      regionId: REGION_ID,
      graphVersionId: GRAPH_VERSION_ID,
      effectClass: 'GRAPH_AFFECTING',
      recomputeIdentity: true,
      candidateIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates a canonical plan array', () => {
    const result = ReassessmentPlanSchema.safeParse([
      { regionId: REGION_ID, graphVersionId: GRAPH_VERSION_ID, effectClass: 'EVIDENCE_AFFECTING', recomputeIdentity: false, candidateIds: [CANDIDATE_ID] },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects plan item with extra fields', () => {
    const result = ReassessmentPlanItemSchema.safeParse({
      regionId: REGION_ID, graphVersionId: GRAPH_VERSION_ID,
      effectClass: 'EVIDENCE_AFFECTING', recomputeIdentity: false,
      candidateIds: [CANDIDATE_ID], badField: true,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// §9 Accounting shape
// ============================================================================

describe('accounting shape', () => {
  it('validates a complete accounting record', () => {
    const result = ReassessmentAccountingSchema.safeParse({
      policyVersion: 'v1',
      appliedChangeCount: 1,
      coalescedChangeCount: 0,
      pendingChangeCount: 0,
      affectedRegionCount: 1,
      regionsReused: 0,
      regionsRecomputed: 1,
      regionsSkippedContextUnchanged: 0,
      regionsFailed: 0,
      regionsTruncated: 0,
      aiAnalysesRun: 1,
      aiAnalysesSkipped: 0,
      assessmentsAppended: 1,
      holesStrengthened: 0,
      holesWeakened: 0,
      holesResolved: 0,
      holesContradicted: 0,
      holesSuperseded: 0,
      nextBestEvidenceRecomputed: false,
      truncated: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects accounting with extra fields', () => {
    const result = ReassessmentAccountingSchema.safeParse({
      policyVersion: 'v1',
      appliedChangeCount: 0, coalescedChangeCount: 0, pendingChangeCount: 0,
      affectedRegionCount: 0, regionsReused: 0, regionsRecomputed: 0,
      regionsSkippedContextUnchanged: 0, regionsFailed: 0, regionsTruncated: 0,
      aiAnalysesRun: 0, aiAnalysesSkipped: 0, assessmentsAppended: 0,
      holesStrengthened: 0, holesWeakened: 0, holesResolved: 0,
      holesContradicted: 0, holesSuperseded: 0, nextBestEvidenceRecomputed: false,
      truncated: false, unknownField: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects accounting with wrong policy version', () => {
    const result = ReassessmentAccountingSchema.safeParse({
      policyVersion: 'v2',
      appliedChangeCount: 0, coalescedChangeCount: 0, pendingChangeCount: 0,
      affectedRegionCount: 0, regionsReused: 0, regionsRecomputed: 0,
      regionsSkippedContextUnchanged: 0, regionsFailed: 0, regionsTruncated: 0,
      aiAnalysesRun: 0, aiAnalysesSkipped: 0, assessmentsAppended: 0,
      holesStrengthened: 0, holesWeakened: 0, holesResolved: 0,
      holesContradicted: 0, holesSuperseded: 0, nextBestEvidenceRecomputed: false,
      truncated: false,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// §10 Run record completeness
// ============================================================================

describe('run record shape', () => {
  it('validates a minimal COMPLETED run record', () => {
    const result = IncrementalReassessmentRunSchema.safeParse({
      runId: RUN_ID,
      caseId: CASE_ID,
      changeId: 'change-abc',
      trigger: {
        triggerType: 'NEW_OBSERVATION',
        caseId: CASE_ID,
        observationId: OBSERVATION_ID,
        computedAt: OBSERVED_AT,
      },
      effectClass: 'EVIDENCE_AFFECTING',
      graphVersionId: GRAPH_VERSION_ID,
      computedAt: OBSERVED_AT,
      policyVersion: 'v1',
      affectedSet: {
        caseId: CASE_ID, graphVersionId: GRAPH_VERSION_ID,
        changeId: 'change-abc', effectClass: 'EVIDENCE_AFFECTING',
        status: 'NO_AFFECTED',
        affectedObservationIds: [], affectedEntityHypothesisIds: [],
        affectedRelationHypothesisIds: [], affectedGroupIds: [],
        affectedRegionIds: [], affectedCandidateIds: [],
        truncated: false,
        accounting: { observationUniverseCount: 0, hypothesisUniverseCount: 0,
          candidateUniverseCount: 0, groupUniverseCount: 0, regionUniverseCount: 0 },
      },
      plan: [],
      regionResults: [],
      accounting: {
        policyVersion: 'v1', appliedChangeCount: 1, coalescedChangeCount: 0,
        pendingChangeCount: 0, affectedRegionCount: 0, regionsReused: 0,
        regionsRecomputed: 0, regionsSkippedContextUnchanged: 0, regionsFailed: 0,
        regionsTruncated: 0, aiAnalysesRun: 0, aiAnalysesSkipped: 0,
        assessmentsAppended: 0, holesStrengthened: 0, holesWeakened: 0,
        holesResolved: 0, holesContradicted: 0, holesSuperseded: 0,
        nextBestEvidenceRecomputed: false, truncated: false,
      },
      status: 'NO_OP',
    });
    expect(result.success).toBe(true);
  });

  it('rejects run record with extra top-level fields', () => {
    const result = IncrementalReassessmentRunSchema.safeParse({
      runId: RUN_ID, caseId: CASE_ID, changeId: 'x',
      trigger: { triggerType: 'NEW_OBSERVATION', caseId: CASE_ID, observationId: OBSERVATION_ID, computedAt: OBSERVED_AT },
      effectClass: 'EVIDENCE_AFFECTING', graphVersionId: GRAPH_VERSION_ID,
      computedAt: OBSERVED_AT, policyVersion: 'v1',
      affectedSet: { caseId: CASE_ID, graphVersionId: GRAPH_VERSION_ID, changeId: 'x',
        effectClass: 'EVIDENCE_AFFECTING', status: 'NO_AFFECTED',
        affectedObservationIds: [], affectedEntityHypothesisIds: [],
        affectedRelationHypothesisIds: [], affectedGroupIds: [],
        affectedRegionIds: [], affectedCandidateIds: [], truncated: false,
        accounting: { observationUniverseCount: 0, hypothesisUniverseCount: 0,
          candidateUniverseCount: 0, groupUniverseCount: 0, regionUniverseCount: 0 } },
      plan: [], regionResults: [],
      accounting: { policyVersion: 'v1', appliedChangeCount: 0, coalescedChangeCount: 0,
        pendingChangeCount: 0, affectedRegionCount: 0, regionsReused: 0,
        regionsRecomputed: 0, regionsSkippedContextUnchanged: 0, regionsFailed: 0,
        regionsTruncated: 0, aiAnalysesRun: 0, aiAnalysesSkipped: 0,
        assessmentsAppended: 0, holesStrengthened: 0, holesWeakened: 0,
        holesResolved: 0, holesContradicted: 0, holesSuperseded: 0,
        nextBestEvidenceRecomputed: false, truncated: false },
      status: 'NO_OP',
      extraField: true,
    });
    expect(result.success).toBe(false);
  });
});