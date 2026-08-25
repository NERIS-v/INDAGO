import { z } from 'zod';
import {
  CaseIdSchema,
  EntityIdSchema,
  InvestigationIdSchema,
} from '../common/ids.js';
import { ResolutionScoreSchema, AnalyticalConfidenceSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Cross-Case Intelligence
//
// Matches and links entities/patterns across separate cases.
// ============================================================================

export const CrossCaseMatchSchema = z.object({
  sourceCaseId: CaseIdSchema,
  targetCaseId: CaseIdSchema,
  sourceEntityId: EntityIdSchema,
  targetEntityId: EntityIdSchema,
  matchScore: ResolutionScoreSchema
    .describe('Strength of the cross-case identity match'),
  sharedEvidenceTypes: z.array(z.string())
    .describe('Types of evidence that overlap'),
  sharedEntityCount: z.number().int().nonnegative()
    .describe('Number of shared entities between cases'),
  investigationIds: z.array(InvestigationIdSchema)
    .describe('Investigations involved'),
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in this cross-case link'),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type CrossCaseMatch = z.infer<typeof CrossCaseMatchSchema>;

export const CrossCaseLinkRequestSchema = z.object({
  sourceCaseId: CaseIdSchema,
  targetCaseId: CaseIdSchema,
  minMatchScore: ResolutionScoreSchema.optional()
    .describe('Minimum match score threshold'),
  maxResults: z.number().int().min(1).max(100).default(20),
}).strict();
export type CrossCaseLinkRequest = z.infer<typeof CrossCaseLinkRequestSchema>;
