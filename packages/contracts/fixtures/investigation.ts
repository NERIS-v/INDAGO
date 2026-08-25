import type { Investigation } from '../src/domain/investigation.js';
import type { Case } from '../src/domain/case.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Investigation & Case Fixtures
// ============================================================================

export const FIXTURE_CASE_1: Case = {
  id: FIXTURE_IDS.case1,
  title: 'Operation Financial Shadow',
  description: 'Investigation into suspicious financial transfers',
  status: 'ACTIVE',
  assignedTo: 'investigator-mayur',
  createdAt: { value: '2025-01-15T09:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-16T14:00:00Z', precision: 'exact' },
  investigationIds: [FIXTURE_IDS.investigation1],
  sourceIds: [FIXTURE_IDS.source1, FIXTURE_IDS.source2],
  entityIds: [FIXTURE_IDS.entity1, FIXTURE_IDS.entity2],
  evidenceIds: [FIXTURE_IDS.evidence1, FIXTURE_IDS.evidence2, FIXTURE_IDS.evidence3],
};

export const FIXTURE_INVESTIGATION_1: Investigation = {
  id: FIXTURE_IDS.investigation1,
  caseId: FIXTURE_IDS.case1,
  title: 'Financial Transfer Analysis',
  description: 'Analyze suspicious financial transfers between entities',
  status: 'ACTIVE',
  priority: 'HIGH',
  owner: 'investigator-mayur',
  createdAt: { value: '2025-01-15T09:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-16T14:00:00Z', precision: 'exact' },
  entityIds: [FIXTURE_IDS.entity1, FIXTURE_IDS.entity2],
  evidenceIds: [FIXTURE_IDS.evidence1, FIXTURE_IDS.evidence2],
  hypothesisIds: [FIXTURE_IDS.hypothesis1],
  leadIds: [FIXTURE_IDS.lead1],
  confidence: 0.75,
};
