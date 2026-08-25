import { z } from 'zod';
import {
  EntityIdSchema,
  InvestigationIdSchema,
  ObservationIdSchema,
} from '../common/ids.js';
import { RelationSupportSchema, EvidenceStrengthSchema } from '../common/confidence.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Relation Resolution
//
// Resolves and validates relationships between entities.
// ============================================================================

export const RelationResolutionRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  sourceEntityId: EntityIdSchema,
  targetEntityId: EntityIdSchema,
  relationType: RelationTypeSchema.optional()
    .describe('If specified, only resolve this relation type'),
}).strict();
export type RelationResolutionRequest = z.infer<typeof RelationResolutionRequestSchema>;

export const RelationResolutionResultSchema = z.object({
  sourceEntityId: EntityIdSchema,
  targetEntityId: EntityIdSchema,
  relationType: RelationTypeSchema,
  support: RelationSupportSchema
    .describe('Support for this relationship'),
  evidenceCount: z.number().int().nonnegative(),
  evidenceStrength: EvidenceStrengthSchema
    .describe('Average strength of supporting evidence'),
  supportingObservations: z.array(ObservationIdSchema),
  contradictingObservations: z.array(ObservationIdSchema),
  temporalCoverage: z.number().min(0).max(1).optional()
    .describe('Proportion of relevant time range covered'),
  sourceCoverage: z.number().min(0).max(1).optional()
    .describe('Proportion of relevant sources represented'),
  computedAt: ObservedTimeSchema,
  computationTimeMs: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
}).strict();
export type RelationResolutionResult = z.infer<typeof RelationResolutionResultSchema>;
