import { z } from 'zod';
import {
  ReviewTaskIdSchema,
  InvestigationIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  HypothesisIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Review Task
//
// A human review task for evidence, hypotheses, or entity resolution.
// ============================================================================

export const ReviewTaskTypeSchema = z.enum([
  'EVIDENCE_REVIEW',
  'HYPOTHESIS_REVIEW',
  'ENTITY_RESOLUTION_REVIEW',
  'RELATION_REVIEW',
  'LEAD_REVIEW',
  'GAP_REVIEW',
  'QUALITY_ASSURANCE',
]);
export type ReviewTaskType = z.infer<typeof ReviewTaskTypeSchema>;

export const ReviewTaskStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'ESCALATED',
  'CANCELLED',
]);
export type ReviewTaskStatus = z.infer<typeof ReviewTaskStatusSchema>;

export const ReviewTaskSchema = z.object({
  id: ReviewTaskIdSchema,
  investigationId: InvestigationIdSchema,
  type: ReviewTaskTypeSchema,
  status: ReviewTaskStatusSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  assignedTo: z.string().optional()
    .describe('Person assigned to this review'),
  relatedEntityIds: z.array(EntityIdSchema).optional(),
  relatedEvidenceIds: z.array(EvidenceIdSchema).optional(),
  relatedHypothesisIds: z.array(HypothesisIdSchema).optional(),
  reviewComments: z.array(z.object({
    author: z.string(),
    content: z.string().min(1).max(10000),
    timestamp: ObservedTimeSchema,
    decision: z.enum([
      'APPROVED',
      'REJECTED',
      'NEEDS更多信息',
      'ESCALATED',
    ]).optional(),
  })).optional()
    .describe('Review comments and decisions'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  completedAt: ObservedTimeSchema.optional(),
  metadata: MetadataSchema.optional(),
}).strict();
export type ReviewTask = z.infer<typeof ReviewTaskSchema>;
