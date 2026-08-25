import { z } from 'zod';
import {
  EntityIdSchema,
  EntityHypothesisIdSchema,
  InvestigationIdSchema,
  ObservationIdSchema,
  EntityComparisonIdSchema,
} from '../common/ids.js';
import { ResolutionScoreSchema } from '../common/confidence.js';
import { EntityComparisonStatusSchema, EntityResolutionStatusSchema } from '../common/comparison-status.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Entity Resolution
//
// Entity resolution matches and merges entities across sources.
// ============================================================================

export const EntityResolutionRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  entityHypothesisIds: z.array(EntityHypothesisIdSchema).min(2)
    .describe('Entity hypotheses to compare'),
  strictMode: z.boolean().default(false)
    .describe('If true, only resolve when confidence is high'),
}).strict();
export type EntityResolutionRequest = z.infer<typeof EntityResolutionRequestSchema>;

export const EntityResolutionCandidateSchema = z.object({
  entityId: EntityIdSchema,
  score: ResolutionScoreSchema,
  supportingObservations: z.array(ObservationIdSchema),
  contradictingObservations: z.array(ObservationIdSchema),
  sourceCount: z.number().int().nonnegative(),
}).strict();
export type EntityResolutionCandidate = z.infer<typeof EntityResolutionCandidateSchema>;

export const EntityResolutionResultSchema = z.object({
  entityHypothesisId: EntityHypothesisIdSchema,
  candidates: z.array(EntityResolutionCandidateSchema).min(1),
  comparisonId: EntityComparisonIdSchema,
  topCandidateScore: ResolutionScoreSchema,
  status: EntityResolutionStatusSchema,
  comparisonStatus: EntityComparisonStatusSchema,
  computedAt: ObservedTimeSchema,
  computationTimeMs: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
}).strict();
export type EntityResolutionResult = z.infer<typeof EntityResolutionResultSchema>;
