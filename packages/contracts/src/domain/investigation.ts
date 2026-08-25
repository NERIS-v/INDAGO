import { z } from 'zod';
import {
  InvestigationIdSchema,
  CaseIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  HypothesisIdSchema,
  LeadIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, TemporalIntervalSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';

// ============================================================================
// Investigation
//
// A top-level investigative scope within an INDAGO case.
// Each investigation has an owner, status lifecycle, and working hypotheses.
// ============================================================================

export const InvestigationStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'CLOSED',
  'ARCHIVED',
]);
export type InvestigationStatus = z.infer<typeof InvestigationStatusSchema>;

export const InvestigationSchema = z.object({
  id: InvestigationIdSchema,
  caseId: CaseIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(10000),
  status: InvestigationStatusSchema,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  owner: z.string().min(1),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  closedAt: ObservedTimeSchema.optional(),
  entityIds: z.array(EntityIdSchema).describe('Entities involved in this investigation'),
  evidenceIds: z.array(EvidenceIdSchema).describe('Evidence accumulated'),
  hypothesisIds: z.array(HypothesisIdSchema).describe('Working hypotheses'),
  leadIds: z.array(LeadIdSchema).describe('Active leads'),
  confidence: AnalyticalConfidenceSchema.optional()
    .describe('Overall confidence in the investigation model'),
  metadata: MetadataSchema.optional(),
  temporalScope: TemporalIntervalSchema.optional()
    .describe('Time range this investigation covers'),
}).strict();
export type Investigation = z.infer<typeof InvestigationSchema>;

export const InvestigationSummarySchema = z.object({
  id: InvestigationIdSchema,
  title: z.string(),
  status: InvestigationStatusSchema,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  entityCount: z.number().int(),
  evidenceCount: z.number().int(),
  hypothesisCount: z.number().int(),
  leadCount: z.number().int(),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
}).strict();
export type InvestigationSummary = z.infer<typeof InvestigationSummarySchema>;
