import { describe, it, expect } from 'vitest';
import {
  InvestigationSchema,
  CaseSchema,
  SourceSchema,
  EvidenceSchema,
  ObservationSchema,
  EntitySchema,
  EntityHypothesisSchema,
  EntityRoleHypothesisSchema,
  RelationHypothesisSchema,
  HypothesisSchema,
  LeadSchema,
  InvestigativeGapSchema,
  EvidenceRequestSchema,
  ReviewTaskSchema,
  AuditEventSchema,
  DEFAULT_RUN_STATE_CONFIGURATION,
} from '../src/index.js';
import { FIXTURE_INVESTIGATION_1, FIXTURE_CASE_1 } from '../fixtures/investigation.js';
import { FIXTURE_SOURCE_1, FIXTURE_SOURCE_2 } from '../fixtures/sources.js';
import { FIXTURE_OBSERVATION_1, FIXTURE_OBSERVATION_2, FIXTURE_OBSERVATION_3 } from '../fixtures/observations.js';
import { FIXTURE_ENTITY_1, FIXTURE_ENTITY_2, FIXTURE_ENTITY_HYPOTHESIS_1, FIXTURE_ENTITY_ROLE_HYPOTHESIS_1 } from '../fixtures/entities.js';

// ============================================================================
// Contract Roundtrip Tests
//
// Verifies that fixture data validates against schemas.
// ============================================================================

describe('Domain Contract Roundtrips', () => {
  it('Investigation fixture validates', () => {
    const result = InvestigationSchema.safeParse(FIXTURE_INVESTIGATION_1);
    expect(result.success).toBe(true);
  });

  it('Case fixture validates', () => {
    const result = CaseSchema.safeParse(FIXTURE_CASE_1);
    expect(result.success).toBe(true);
  });

  it('Source fixtures validate', () => {
    expect(SourceSchema.safeParse(FIXTURE_SOURCE_1).success).toBe(true);
    expect(SourceSchema.safeParse(FIXTURE_SOURCE_2).success).toBe(true);
  });

  it('Observation fixtures validate', () => {
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_1).success).toBe(true);
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_2).success).toBe(true);
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_3).success).toBe(true);
  });

  it('Entity fixtures validate', () => {
    expect(EntitySchema.safeParse(FIXTURE_ENTITY_1).success).toBe(true);
    expect(EntitySchema.safeParse(FIXTURE_ENTITY_2).success).toBe(true);
  });

  it('EntityHypothesis fixture validates', () => {
    const result = EntityHypothesisSchema.safeParse(FIXTURE_ENTITY_HYPOTHESIS_1);
    expect(result.success).toBe(true);
  });

  it('EntityRoleHypothesis fixture validates', () => {
    const result = EntityRoleHypothesisSchema.safeParse(FIXTURE_ENTITY_ROLE_HYPOTHESIS_1);
    expect(result.success).toBe(true);
  });
});

describe('D: State Machine Round-Trip Tests', () => {
  it('ANALYZING → PAUSED → ANALYZING round-trip is valid', () => {
    const pauseTransition = DEFAULT_RUN_STATE_CONFIGURATION.validTransitions.find(
      (t) => t.from === 'ANALYZING' && t.to === 'PAUSED'
    );
    // PAUSED is NOT a target of ordinary transitions — it's handled by resume
    expect(pauseTransition).toBeUndefined();

    const resumeTransition = DEFAULT_RUN_STATE_CONFIGURATION.resumeTransitions.find(
      (rt) => rt.resumeToState === 'ANALYZING' && rt.pausedFromState === 'ANALYZING'
    );
    expect(resumeTransition).toBeDefined();
    expect(resumeTransition!.fromState).toBe('PAUSED');
  });

  it('DISCOVERING → PAUSED → DISCOVERING round-trip is valid', () => {
    const resumeTransition = DEFAULT_RUN_STATE_CONFIGURATION.resumeTransitions.find(
      (rt) => rt.resumeToState === 'DISCOVERING' && rt.pausedFromState === 'DISCOVERING'
    );
    expect(resumeTransition).toBeDefined();
    expect(resumeTransition!.fromState).toBe('PAUSED');
  });

  it('FAILED has recovery actions defined', () => {
    const failedRecoveries = DEFAULT_RUN_STATE_CONFIGURATION.recoveryActions.filter(
      (r) => r.fromState === 'FAILED'
    );
    expect(failedRecoveries.length).toBeGreaterThan(0);
  });

  it('RETRY_FROM_CHECKPOINT recovery goes to CREATED', () => {
    const recovery = DEFAULT_RUN_STATE_CONFIGURATION.recoveryActions.find(
      (r) => r.type === 'RETRY_FROM_CHECKPOINT'
    );
    expect(recovery).toBeDefined();
    expect(recovery!.targetState).toBe('CREATED');
  });

  it('SKIP_FAILED_STAGE recovery has no static target (computed at runtime)', () => {
    const recovery = DEFAULT_RUN_STATE_CONFIGURATION.recoveryActions.find(
      (r) => r.type === 'SKIP_FAILED_STAGE'
    );
    expect(recovery).toBeDefined();
    expect(recovery!.targetState).toBeUndefined();
  });

  it('MANUAL_INTERVENTION recovery stays in FAILED', () => {
    const recovery = DEFAULT_RUN_STATE_CONFIGURATION.recoveryActions.find(
      (r) => r.type === 'MANUAL_INTERVENTION'
    );
    expect(recovery).toBeDefined();
    expect(recovery!.targetState).toBe('FAILED');
  });
});

describe('E: Observation Strength Field', () => {
  it('FIXTURE_OBSERVATION_1 uses strength (not confidence)', () => {
    expect('confidence' in FIXTURE_OBSERVATION_1).toBe(false);
    expect(FIXTURE_OBSERVATION_1.strength).toBe(0.85);
  });

  it('FIXTURE_OBSERVATION_2 uses strength (not confidence)', () => {
    expect('confidence' in FIXTURE_OBSERVATION_2).toBe(false);
    expect(FIXTURE_OBSERVATION_2.strength).toBe(0.72);
  });

  it('FIXTURE_OBSERVATION_3 uses strength (not confidence)', () => {
    expect('confidence' in FIXTURE_OBSERVATION_3).toBe(false);
    expect(FIXTURE_OBSERVATION_3.strength).toBe(0.90);
  });
});

describe('Invalid Data Rejection', () => {
  it('rejects Investigation with empty title', () => {
    const result = InvestigationSchema.safeParse({
      ...FIXTURE_INVESTIGATION_1,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects Entity with invalid status', () => {
    const result = EntitySchema.safeParse({
      ...FIXTURE_ENTITY_1,
      status: 'INVALID_STATUS',
    });
    expect(result.success).toBe(false);
  });

  it('rejects EntityRoleHypothesis with roleReversible: false', () => {
    const result = EntityRoleHypothesisSchema.safeParse({
      ...FIXTURE_ENTITY_ROLE_HYPOTHESIS_1,
      roleReversible: false,
    });
    expect(result.success).toBe(false);
  });
});
