import type { Observation } from '../src/domain/observation.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Observation Fixtures
// ============================================================================

export const FIXTURE_OBSERVATION_1: Observation = {
  id: FIXTURE_IDS.observation1,
  evidenceId: FIXTURE_IDS.evidence1,
  sourceId: FIXTURE_IDS.source1,
  type: 'FINANCIAL',
  content: 'Entity A transferred $50,000 to Entity B on 2024-12-01',
  entityIds: [FIXTURE_IDS.entity1, FIXTURE_IDS.entity2],
  candidateMentions: ['Entity A', 'Entity B', '$50,000', '2024-12-01'],
  strength: 0.85,
  provenance: {
    sourceId: FIXTURE_IDS.source1,
    extractor: 'financial-extractor-v2',
    extractionMethod: 'regex-pattern-match',
  },
  observedAt: { value: '2024-12-01T00:00:00Z', precision: 'day' },
  createdAt: { value: '2025-01-15T10:01:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T10:01:00Z', precision: 'exact' },
};

export const FIXTURE_OBSERVATION_2: Observation = {
  id: FIXTURE_IDS.observation2,
  evidenceId: FIXTURE_IDS.evidence2,
  sourceId: FIXTURE_IDS.source2,
  type: 'COMMUNICATION',
  content: 'Email from alice@corp.com to bob@corp.com dated 2024-11-28',
  entityIds: [FIXTURE_IDS.entity1],
  candidateMentions: ['alice@corp.com', 'bob@corp.com', '2024-11-28'],
  candidateEntityHypothesisIds: [FIXTURE_IDS.entityHypothesis1],
  strength: 0.72,
  provenance: {
    sourceId: FIXTURE_IDS.source2,
    extractor: 'email-parser-v1',
    extractionMethod: 'header-analysis',
  },
  observedAt: { value: '2024-11-28T00:00:00Z', precision: 'day' },
  createdAt: { value: '2025-01-16T14:01:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-16T14:01:00Z', precision: 'exact' },
};

export const FIXTURE_OBSERVATION_3: Observation = {
  id: FIXTURE_IDS.observation3,
  evidenceId: FIXTURE_IDS.evidence3,
  sourceId: FIXTURE_IDS.source1,
  type: 'TEMPORAL',
  content: 'Entity B was at location X on 2024-12-01 between 14:00-16:00',
  entityIds: [FIXTURE_IDS.entity2],
  candidateMentions: ['Entity B', 'location X', '2024-12-01'],
  strength: 0.90,
  provenance: {
    sourceId: FIXTURE_IDS.source1,
    extractor: 'location-extractor-v1',
    extractionMethod: 'gps-data-analysis',
  },
  observedAt: { value: '2024-12-01T14:00:00Z', precision: 'hour' },
  createdAt: { value: '2025-01-15T10:02:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T10:02:00Z', precision: 'exact' },
};
