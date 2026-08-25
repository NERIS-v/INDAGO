import { z } from 'zod';
import {
  InvestigationIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
} from '../common/ids.js';
import { EvidencePostureSchema, EvidenceStrengthSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';

// ============================================================================
// Evidence Search
//
// Search and retrieval of evidence packages.
// ============================================================================

export const EvidenceSearchFilterSchema = z.object({
  investigationId: InvestigationIdSchema.optional(),
  entityIds: z.array(EntityIdSchema).optional()
    .describe('Filter by entities referenced'),
  evidenceTypes: z.array(z.string()).optional()
    .describe('Filter by evidence type'),
  posture: z.array(EvidencePostureSchema).optional()
    .describe('Filter by evidence posture tier'),
  minStrength: EvidenceStrengthSchema.optional()
    .describe('Minimum evidence strength'),
  dateRange: z.object({
    from: z.string().describe('ISO 8601'),
    to: z.string().describe('ISO 8601'),
  }).optional(),
  query: z.string().max(1000).optional()
    .describe('Free-text search query'),
}).strict();
export type EvidenceSearchFilter = z.infer<typeof EvidenceSearchFilterSchema>;

export const EvidenceSearchResultSchema = z.object({
  evidenceId: EvidenceIdSchema,
  score: z.number().min(0).max(1)
    .describe('Relevance score'),
  type: z.string(),
  posture: EvidencePostureSchema,
  strength: EvidenceStrengthSchema,
  title: z.string(),
  entityCount: z.number().int(),
  observationCount: z.number().int(),
  snippet: z.string().optional()
    .describe('Relevant text snippet'),
}).strict();
export type EvidenceSearchResult = z.infer<typeof EvidenceSearchResultSchema>;

export const EvidenceSearchResponseSchema = z.object({
  results: z.array(EvidenceSearchResultSchema),
  totalCount: z.number().int(),
  filter: EvidenceSearchFilterSchema,
  computedAt: ObservedTimeSchema,
}).strict();
export type EvidenceSearchResponse = z.infer<typeof EvidenceSearchResponseSchema>;
