import type { Lead } from '../src/domain/lead.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Lead Fixtures
// ============================================================================

export const FIXTURE_LEAD_1: Lead = {
  id: FIXTURE_IDS.lead1,
  investigationId: FIXTURE_IDS.investigation1,
  caseId: FIXTURE_IDS.case1,
  title: 'Trace financial flow to offshore accounts',
  description: 'Investigate whether the $50,000 transfer was routed through offshore accounts',
  status: 'ACTIVE',
  priority: 'HIGH',
  confidence: 0.68,
  posture: 'T1_INVESTIGATIVE_LEAD',
  relatedEntityIds: [FIXTURE_IDS.entity1, FIXTURE_IDS.entity2],
  supportingObservationIds: [FIXTURE_IDS.observation1],
  relatedEvidenceIds: [FIXTURE_IDS.evidence1],
  sourceCandidateType: "MANUAL",
  sourceCandidateKey: "contract-test-key",
  sourceCandidateSnapshot: {},
  alternativeExplanations: [],
  contradictingObservationIds: [],
  provenance: {
    entries: [
      {
        sourceId: FIXTURE_IDS.source1,
        extractor: 'lead-generator-v1',
        derivedFrom: [FIXTURE_IDS.observation1],
      },
    ],
    createdAt: { value: '2025-01-15T11:00:00Z', precision: 'exact' },
  },
  createdAt: { value: '2025-01-15T11:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T11:00:00Z', precision: 'exact' },
};
