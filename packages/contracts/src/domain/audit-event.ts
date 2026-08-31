import { z } from 'zod';
import {
  AuditEventIdSchema,
  InvestigationIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  EntityComparisonIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Audit Event
//
// An immutable audit log entry for tracking actions and decisions.
// ============================================================================

export const AuditActionSchema = z.enum([
  'ENTITY_CREATED',
  'ENTITY_UPDATED',
  'ENTITY_MERGED',
  'ENTITY_SPLIT',
  'ENTITY_HYPOTHESIS_CREATED',
  'ENTITY_HYPOTHESIS_RESOLVED',
  'ENTITY_HYPOTHESIS_CONTRADICTED',
  'RELATION_CREATED',
  'RELATION_UPDATED',
  'RELATION_CONTRADICTED',
  'EVIDENCE_INGESTED',
  'EVIDENCE_REVIEWED',
  'EVIDENCE_REJECTED',
  'HYPOTHESIS_CREATED',
  'HYPOTHESIS_PROMOTED',
  'HYPOTHESIS_ABANDONED',
  'LEAD_CREATED',
  'LEAD_PROMOTED',
  'LEAD_REJECTED',
  'GAP_IDENTIFIED',
  'GAP_ADDRESSED',
  'REVIEW_COMPLETED',
  'INVESTIGATION_OPENED',
  'INVESTIGATION_CLOSED',
  'COMPARISON_CREATED',
  'COMPARISON_COMPLETED',
  'EVIDENCE_UPLOADED',
  'EVIDENCE_QUEUED',
  'INGESTION_JOB_QUEUED',
  'INGESTION_JOB_FAILED',
  'NORMALIZATION_STORED',
  'NORMALIZATION_COMPLETED',
  'NORMALIZATION_FAILED',
  'OBSERVATION_EXTRACTED',
  'ENTITY_MENTION_EXTRACTED',
  'SYSTEM_ACTION',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEventSchema = z.object({
  id: AuditEventIdSchema,
  investigationId: InvestigationIdSchema,
  action: AuditActionSchema,
  actor: z.string().min(1)
    .describe('Who or what performed this action'),
  timestamp: ObservedTimeSchema,
  targetType: z.enum([
    'ENTITY',
    'EVIDENCE',
    'OBSERVATION',
    'HYPOTHESIS',
    'RELATION',
    'LEAD',
    'GAP',
    'REVIEW_TASK',
    'INVESTIGATION',
    'COMPARISON',
    'SYSTEM',
  ]),
  targetId: z.string().min(1)
    .describe('ID of the affected object'),
  description: z.string().min(1).max(5000),
  previousState: z.record(z.string(), z.unknown()).optional()
    .describe('State before this action'),
  newState: z.record(z.string(), z.unknown()).optional()
    .describe('State after this action'),
  relatedEntityIds: z.array(EntityIdSchema).optional(),
  relatedEvidenceIds: z.array(EvidenceIdSchema).optional(),
  comparisonId: EntityComparisonIdSchema.optional()
    .describe('Comparison ID if this audit event relates to an entity comparison'),
  metadata: MetadataSchema.optional(),
}).strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;
