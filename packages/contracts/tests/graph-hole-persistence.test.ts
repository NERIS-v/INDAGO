// Phase 5A-PR6 — Graph-Hole persistence contracts.
//
// PR6 freezes the PERSISTED GraphHole representation support: the intelligence
// assessment status vocabulary + transitions, and the deterministic detector
// contribution identity key. This test pins those contracts so the platform
// store and future consumers cannot drift.

import { describe, expect, it } from 'vitest';
import {
  GraphHolePersistenceStatusSchema,
  GRAPH_HOLE_STATUS_TRANSITIONS,
  canTransitionGraphHoleStatus,
  GraphHoleAssessmentTypeSchema,
  GRAPH_HOLE_CONTRIBUTION_IDENTITY_NAMESPACE,
  buildDetectorContributionIdentityKey,
} from '../src/index.js';

const STATUSES = ['ACTIVE', 'SUPERSEDED', 'REJECTED', 'RESOLVED'] as const;
const ASSESSMENT_TYPES = [
  'QUALIFICATION',
  'REASSESSMENT',
  'SUPERSESSION',
  'REJECTION',
  'REVIVAL',
  'RESOLUTION',
] as const;

describe('GraphHolePersistenceStatusSchema', () => {
  it('parses exactly the four intelligence assessment statuses', () => {
    for (const s of STATUSES) {
      expect(GraphHolePersistenceStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects non-status strings', () => {
    for (const bad of ['OPEN', 'CLOSED', 'PENDING', 'DRAFT', 'PROMOTED']) {
      expect(GraphHolePersistenceStatusSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('GRAPH_HOLE_STATUS_TRANSITIONS', () => {
  it('covers every declared status exactly once', () => {
    const keys = Object.keys(GRAPH_HOLE_STATUS_TRANSITIONS).sort();
    expect(keys).toEqual([...STATUSES].sort());
  });

  it('allows ACTIVE -> SUPERSEDED | REJECTED | RESOLVED', () => {
    for (const to of ['SUPERSEDED', 'REJECTED', 'RESOLVED']) {
      expect(canTransitionGraphHoleStatus('ACTIVE', to as never)).toBe(true);
    }
  });

  it('does not allow ACTIVE -> ACTIVE', () => {
    expect(canTransitionGraphHoleStatus('ACTIVE', 'ACTIVE')).toBe(false);
  });

  it('allows REJECTED -> ACTIVE (revival)', () => {
    expect(canTransitionGraphHoleStatus('REJECTED', 'ACTIVE')).toBe(true);
  });

  it('REJECTED may not side-step to SUPERSEDED/RESOLVED', () => {
    expect(canTransitionGraphHoleStatus('REJECTED', 'SUPERSEDED')).toBe(false);
    expect(canTransitionGraphHoleStatus('REJECTED', 'RESOLVED')).toBe(false);
  });

  it('SUPERSEDED and RESOLVED are terminal', () => {
    for (const from of ['SUPERSEDED', 'RESOLVED'] as const) {
      for (const to of STATUSES) {
        expect(canTransitionGraphHoleStatus(from, to)).toBe(false);
      }
    }
  });

  it('shape is stable (exact transition map)', () => {
    expect(GRAPH_HOLE_STATUS_TRANSITIONS).toEqual({
      ACTIVE: ['SUPERSEDED', 'REJECTED', 'RESOLVED'],
      REJECTED: ['ACTIVE'],
      SUPERSEDED: [],
      RESOLVED: [],
    });
  });
});

describe('GraphHoleAssessmentTypeSchema', () => {
  it('parses exactly the six assessment/state-event types', () => {
    for (const t of ASSESSMENT_TYPES) {
      expect(GraphHoleAssessmentTypeSchema.parse(t)).toBe(t);
    }
    expect(GraphHoleAssessmentTypeSchema.safeParse('DEFINITION').success).toBe(false);
  });
});

describe('buildDetectorContributionIdentityKey', () => {
  const input = {
    candidateId: 'cand-abc',
    detectorType: 'MISSING_EDGE',
    detectionPolicyVersion: 'v1',
  };

  it('is deterministic', () => {
    expect(buildDetectorContributionIdentityKey(input)).toBe(
      buildDetectorContributionIdentityKey(input),
    );
  });

  it('carries the frozen namespace and all identity parts', () => {
    const key = buildDetectorContributionIdentityKey(input);
    expect(key.startsWith(`${GRAPH_HOLE_CONTRIBUTION_IDENTITY_NAMESPACE}:`)).toBe(true);
    expect(key).toContain(input.candidateId);
    expect(key).toContain(input.detectorType);
    expect(key).toContain(input.detectionPolicyVersion);
  });

  it('is structurally unambiguous (namespace then exactly three value segments)', () => {
    const key = buildDetectorContributionIdentityKey(input);
    const parts = key.split(':');
    expect(parts.slice(0, 3)).toEqual(['indago', 'graph-hole-contribution', 'v1']);
    expect(parts.slice(3)).toEqual([input.candidateId, input.detectorType, input.detectionPolicyVersion]);
    // Value segments never contain a colon, so reconstruction is one-to-one.
    for (const value of [input.candidateId, input.detectorType, input.detectionPolicyVersion]) {
      expect(value).not.toContain(':');
    }
  });

  it('distinguishes different detector types of the same candidate', () => {
    const a = buildDetectorContributionIdentityKey({
      ...input,
      detectorType: 'MISSING_EDGE',
    });
    const b = buildDetectorContributionIdentityKey({
      ...input,
      detectorType: 'ISOLATED_NODE',
    });
    expect(a).not.toBe(b);
  });

  it('distinguishes different candidates of the same detector', () => {
    const a = buildDetectorContributionIdentityKey(input);
    const b = buildDetectorContributionIdentityKey({ ...input, candidateId: 'cand-xyz' });
    expect(a).not.toBe(b);
  });

  it('distinguishes policy versions', () => {
    const a = buildDetectorContributionIdentityKey(input);
    const b = buildDetectorContributionIdentityKey({ ...input, detectionPolicyVersion: 'v2' });
    expect(a).not.toBe(b);
  });
});