import { z } from 'zod';
import {
  InvestigationIdSchema,
  EntityIdSchema,
  HypothesisIdSchema,
  LeadIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Intelligence Results
//
// Aggregated intelligence results from all analysis modules.
// ============================================================================

export const IntelligenceResultTypeSchema = z.enum([
  'ENTITY_RESOLUTION',
  'RELATION_RESOLUTION',
  'EVIDENCE_SEARCH',
  'CROSS_CASE',
  'GRAPH_HOLES',
  'GAP_CLASSIFICATION',
  'EVIDENCE_RANKING',
  'COUNTER_EVIDENCE',
  'ROBUSTNESS',
  'ROUTE_STAGE',
]);
export type IntelligenceResultType = z.infer<typeof IntelligenceResultTypeSchema>;

export const IntelligenceResultSchema = z.object({
  investigationId: InvestigationIdSchema,
  type: IntelligenceResultTypeSchema,
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in this result'),
  summary: z.string()
    .describe('Human-readable summary'),
  keyFindings: z.array(z.string())
    .describe('Top findings from this analysis'),
  relatedEntityIds: z.array(EntityIdSchema).optional(),
  relatedHypothesisIds: z.array(HypothesisIdSchema).optional(),
  relatedLeadIds: z.array(LeadIdSchema).optional(),
  computedAt: ObservedTimeSchema,
  computationTimeMs: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
}).strict();
export type IntelligenceResult = z.infer<typeof IntelligenceResultSchema>;

export const IntelligenceSummarySchema = z.object({
  investigationId: InvestigationIdSchema,
  results: z.array(IntelligenceResultSchema),
  overallConfidence: AnalyticalConfidenceSchema,
  activeEntities: z.number().int().nonnegative(),
  activeHypotheses: z.number().int().nonnegative(),
  activeLeads: z.number().int().nonnegative(),
  identifiedGaps: z.number().int().nonnegative(),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type IntelligenceSummary = z.infer<typeof IntelligenceSummarySchema>;
