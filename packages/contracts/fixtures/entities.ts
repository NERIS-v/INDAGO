import type { Entity, EntityHypothesis, EntityRoleHypothesis } from '../src/domain/entity.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Entity Fixtures
// ============================================================================

export const FIXTURE_ENTITY_1: Entity = {
  id: FIXTURE_IDS.entity1,
  caseId: FIXTURE_IDS.case1,
  canonicalName: 'Alice Johnson',
  status: 'ACTIVE',
  observationIds: [FIXTURE_IDS.observation1, FIXTURE_IDS.observation2],
  evidenceIds: [FIXTURE_IDS.evidence1, FIXTURE_IDS.evidence2],
  hypothesisIds: [FIXTURE_IDS.entityHypothesis1],
  roleHypothesisIds: [FIXTURE_IDS.entityRoleHypothesis1],
  sourceIdentifiers: [
    { sourceId: FIXTURE_IDS.source1.toString(), identifier: 'ACCT-001', context: 'Financial records' },
    { sourceId: FIXTURE_IDS.source2.toString(), identifier: 'alice@corp.com', context: 'Email' },
  ],
  createdAt: { value: '2025-01-15T10:01:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-16T14:01:00Z', precision: 'exact' },
};

export const FIXTURE_ENTITY_2: Entity = {
  id: FIXTURE_IDS.entity2,
  caseId: FIXTURE_IDS.case1,
  canonicalName: 'Bob Smith',
  status: 'ACTIVE',
  observationIds: [FIXTURE_IDS.observation1, FIXTURE_IDS.observation3],
  evidenceIds: [FIXTURE_IDS.evidence1],
  hypothesisIds: [],
  roleHypothesisIds: [],
  createdAt: { value: '2025-01-15T10:01:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T10:02:00Z', precision: 'exact' },
};

export const FIXTURE_ENTITY_HYPOTHESIS_1: EntityHypothesis = {
  id: FIXTURE_IDS.entityHypothesis1,
  caseId: FIXTURE_IDS.case1,
  entityId: FIXTURE_IDS.entity1,
  candidateEntities: [
    {
      entityId: FIXTURE_IDS.entity1,
      confidence: 0.92,
      evidence: [FIXTURE_IDS.observation1, FIXTURE_IDS.observation2],
      sourceCount: 2,
    },
    {
      entityId: FIXTURE_IDS.entity3,
      confidence: 0.15,
      evidence: [FIXTURE_IDS.observation2],
      sourceCount: 1,
    },
  ],
  comparisonStatus: 'NOT_COMPARED',
  score: 0.92,
  scoreModelVersion: 'indago:resolution-score:v1',
  status: 'PARTIALLY_RESOLVED',
  provenance: {
    sourceId: FIXTURE_IDS.source1,
    extractor: 'er-engine-v1',
  },
  createdAt: { value: '2025-01-15T10:05:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-16T14:05:00Z', precision: 'exact' },
};

export const FIXTURE_ENTITY_ROLE_HYPOTHESIS_1: EntityRoleHypothesis = {
  id: FIXTURE_IDS.entityRoleHypothesis1,
  entityId: FIXTURE_IDS.entity1,
  role: 'suspect',
  roleScore: 0.78,
  evidenceBasis: [FIXTURE_IDS.observation1],
  roleReversible: true,
  provenance: {
    sourceId: FIXTURE_IDS.source1,
    extractor: 'role-classifier-v1',
  },
  createdAt: { value: '2025-01-15T10:06:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T10:06:00Z', precision: 'exact' },
};
