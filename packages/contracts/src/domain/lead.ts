import { z } from 'zod';
import {
  LeadIdSchema,
  InvestigationIdSchema,
  CaseIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
  EvidenceIdSchema,
  InvestigativeGapIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema, EvidencePostureSchema } from '../common/confidence.js';
import { ProvenanceChainSchema } from '../common/provenance.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Lead
//
// An investigative lead — a line of inquiry derived from analysis.
// Leads emerge from hypotheses, observations, and gap analysis.
// ============================================================================

export const LeadStatusSchema = z.enum([
  'NEW',
  'UNDER_REVIEW',
  'ACTIVE',
  'PROMOTED',
  'REJECTED',
  'STALE',
]);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const LeadPrioritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);
export type LeadPriority = z.infer<typeof LeadPrioritySchema>;

export const LeadSchema = z.object({
  id: LeadIdSchema,
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  status: LeadStatusSchema,
  priority: LeadPrioritySchema,
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence that this lead is worth pursuing'),
  posture: EvidencePostureSchema
    .describe('Evidence posture tier of the best supporting evidence'),
  relatedEntityIds: z.array(EntityIdSchema)
    .describe('Entities this lead is about'),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations giving rise to this lead'),
  relatedEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages related to this lead'),
  gapIds: z.array(InvestigativeGapIdSchema).optional()
    .describe('Investigative gaps this lead may address'),
  assignedTo: z.string().optional()
    .describe('Person assigned to pursue this lead'),
  provenance: ProvenanceChainSchema,
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  closedAt: ObservedTimeSchema.optional(),
  metadata: MetadataSchema.optional(),
}).strict();
export type Lead = z.infer<typeof LeadSchema>;
