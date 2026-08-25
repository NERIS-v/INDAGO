import { z } from 'zod';
import {
  InvestigativeGapIdSchema,
  InvestigationIdSchema,
  HypothesisIdSchema,
  EntityIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema, ExpectedInformationGainSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Gap Classification
//
// Classifies and prioritizes investigative gaps by type and impact.
// ============================================================================

export const GapClassificationRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  gapIds: z.array(InvestigativeGapIdSchema).optional()
    .describe('Specific gaps to classify. If empty, classify all gaps.'),
}).strict();
export type GapClassificationRequest = z.infer<typeof GapClassificationRequestSchema>;

export const GapClassificationResultSchema = z.object({
  gapId: InvestigativeGapIdSchema,
  type: z.string()
    .describe('Classified gap type'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  impact: AnalyticalConfidenceSchema
    .describe('How much this gap affects investigation confidence'),
  expectedInformationValue: ExpectedInformationGainSchema
    .describe('Expected reduction in uncertainty if addressed'),
  relatedEntityIds: z.array(EntityIdSchema),
  relatedHypothesisIds: z.array(HypothesisIdSchema),
  suggestedActions: z.array(z.string())
    .describe('Suggested actions to address this gap'),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type GapClassificationResult = z.infer<typeof GapClassificationResultSchema>;
