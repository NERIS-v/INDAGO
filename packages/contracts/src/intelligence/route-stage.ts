import { z } from 'zod';
import {
  InvestigationIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
  LeadIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema, ExpectedInformationGainSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Route Stage
//
// Determines the best investigative route/stage to pursue next.
// ============================================================================

export const RouteStageTypeSchema = z.enum([
  'EVIDENCE_COLLECTION',
  'ENTITY_RESOLUTION',
  'RELATION_ANALYSIS',
  'GAP_FILLING',
  'HYPOTHESIS_TESTING',
  'CROSS_CASE_LINKING',
  'REVIEW',
]);
export type RouteStageType = z.infer<typeof RouteStageTypeSchema>;

export const RouteStageRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  currentStage: RouteStageTypeSchema.optional()
    .describe('Current stage, if any'),
  maxCandidates: z.number().int().min(1).max(20).default(5),
}).strict();
export type RouteStageRequest = z.infer<typeof RouteStageRequestSchema>;

export const RouteStageCandidateSchema = z.object({
  stage: RouteStageTypeSchema,
  score: ExpectedInformationGainSchema
    .describe('Expected information gain from pursuing this stage'),
  rationale: z.string()
    .describe('Why this stage is recommended'),
  relatedEntityIds: z.array(EntityIdSchema).optional(),
  relatedLeadIds: z.array(LeadIdSchema).optional(),
  relatedObservationIds: z.array(ObservationIdSchema).optional(),
  estimatedEffort: z.enum(['LOW', 'MEDIUM', 'HIGH'])
    .describe('Estimated effort to complete this stage'),
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in this recommendation'),
}).strict();
export type RouteStageCandidate = z.infer<typeof RouteStageCandidateSchema>;

export const RouteStageResponseSchema = z.object({
  investigationId: InvestigationIdSchema,
  candidates: z.array(RouteStageCandidateSchema).min(1),
  recommended: z.number().int().nonnegative()
    .describe('Index of the recommended candidate'),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type RouteStageResponse = z.infer<typeof RouteStageResponseSchema>;
