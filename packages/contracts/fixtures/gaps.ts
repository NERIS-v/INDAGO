import type { InvestigativeGap } from '../src/domain/investigative-gap.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Gap Fixtures
// ============================================================================

export const FIXTURE_GAP_1: InvestigativeGap = {
  id: FIXTURE_IDS.gap1,
  investigationId: FIXTURE_IDS.investigation1,
  caseId: FIXTURE_IDS.case1,
  type: 'MISSING_EVIDENCE',
  title: 'Missing communication records for Entity B',
  description: 'No email or phone records found for Entity B during the relevant time period',
  status: 'IDENTIFIED',
  priority: 'HIGH',
  impact: 0.72,
  expectedInformationValue: 0.65,
  relatedEntityIds: [FIXTURE_IDS.entity2],
  relatedHypothesisIds: [FIXTURE_IDS.hypothesis1],
  createdAt: { value: '2025-01-15T12:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T12:00:00Z', precision: 'exact' },
};
