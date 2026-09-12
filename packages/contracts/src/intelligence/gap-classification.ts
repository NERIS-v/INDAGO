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
import { GapPrioritySchema } from '../domain/investigative-gap.js';

// ============================================================================
// Gap Classification
//
// Classifies and prioritizes investigative gaps by type and impact.
// ============================================================================

/**
 * Phase 5 semantic gap-classification categories.
 *
 * These are EXPLANATION / HYPOTHESIS-ORIENTED categories and intentionally do
 * NOT overload the domain `GapType` (domain/investigative-gap.ts). The domain
 * GapType describes the broad reason something is missing; Phase 5 classifies
 * the KIND of investigative effort implied.
 *
 * IMPORTANT: `CONCEALMENT_CONSISTENT` must NEVER become an assertion of
 * concealment. It is a hypothesis-oriented semantic — "the available pattern
 * is consistent with concealment as ONE possible explanation" — and carries
 * no legal or factual meaning on its own.
 */
export const GapClassificationTypeSchema = z.enum([
  'MISSING_INVESTIGATION',
  'MISSING_DATA',
  'MISSING_COMPARISON',
  'INFRASTRUCTURE_GAP',
  'CONCEALMENT_CONSISTENT',
]).describe(
  'Phase 5 semantic classification category. CONCEALMENT_CONSISTENT is an ' +
  'explanation/hypothesis-oriented semantic, NOT an assertion of concealment.',
);
export type GapClassificationType = z.infer<typeof GapClassificationTypeSchema>;

export const GapClassificationRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  gapIds: z.array(InvestigativeGapIdSchema).optional()
    .describe('Specific gaps to classify. If empty, classify all gaps.'),
}).strict();
export type GapClassificationRequest = z.infer<typeof GapClassificationRequestSchema>;

export const GapClassificationResultSchema = z.object({
  gapId: InvestigativeGapIdSchema,
  type: GapClassificationTypeSchema
    .describe('Phase 5 semantic classification category (NOT domain GapType).'),
  priority: GapPrioritySchema,
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
