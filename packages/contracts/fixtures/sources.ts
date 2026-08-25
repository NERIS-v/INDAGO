import { randomUUID } from 'node:crypto';
import type { Source } from '../src/domain/source.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Source Fixtures
// ============================================================================

export const FIXTURE_SOURCE_1: Source = {
  id: FIXTURE_IDS.source1,
  caseId: FIXTURE_IDS.case1,
  name: 'Financial Records Database',
  type: 'DATABASE_SYNC',
  status: 'ACTIVE',
  systemOrigin: 'internal-finance-db',
  evidenceIds: [FIXTURE_IDS.evidence1],
  ingestionStartedAt: { value: '2025-01-15T10:00:00Z', precision: 'exact' },
  ingestionCompletedAt: { value: '2025-01-15T10:05:00Z', precision: 'exact' },
  recordCount: 1500,
  description: 'Internal financial transaction records',
  createdAt: { value: '2025-01-15T10:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T10:05:00Z', precision: 'exact' },
};

export const FIXTURE_SOURCE_2: Source = {
  id: FIXTURE_IDS.source2,
  caseId: FIXTURE_IDS.case1,
  name: 'Email Archive',
  type: 'FILE_UPLOAD',
  status: 'INGESTING',
  systemOrigin: 'email-export',
  evidenceIds: [FIXTURE_IDS.evidence2],
  ingestionStartedAt: { value: '2025-01-16T14:00:00Z', precision: 'exact' },
  recordCount: 3200,
  description: 'Exported email archive from corporate email system',
  createdAt: { value: '2025-01-16T14:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-16T14:00:00Z', precision: 'exact' },
};
