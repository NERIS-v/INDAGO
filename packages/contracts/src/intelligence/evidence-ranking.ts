import { z } from 'zod';
import {
  EvidenceIdSchema,
  InvestigationIdSchema,
  HypothesisIdSchema,
  EntityIdSchema,
} from '../common/ids.js';
import { EvidenceStrengthSchema, EvidencePostureSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Evidence Ranking
//
// Ranks evidence packages by relevance, strength, and investigative value.
// ============================================================================

export const EvidenceRankingRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  hypothesisId: HypothesisIdSchema.optional()
    .describe('Rank evidence for a specific hypothesis'),
  entityIds: z.array(EntityIdSchema).optional()
    .describe('Rank evidence related to specific entities'),
  maxResults: z.number().int().min(1).max(100).default(20),
}).strict();
export type EvidenceRankingRequest = z.infer<typeof EvidenceRankingRequestSchema>;

export const EvidenceRankingResultSchema = z.object({
  evidenceId: EvidenceIdSchema,
  rank: z.number().int().positive(),
  score: z.number().min(0).max(1)
    .describe('Combined ranking score'),
  strength: EvidenceStrengthSchema,
  posture: EvidencePostureSchema,
  relevanceToHypothesis: z.number().min(0).max(1).optional()
    .describe('Relevance to the target hypothesis'),
  relevanceToEntities: z.number().min(0).max(1).optional()
    .describe('Relevance to the target entities'),
  sourceDiversity: z.number().min(0).max(1)
    .describe('Diversity of source types'),
  observationCount: z.number().int().nonnegative(),
  title: z.string(),
  type: z.string(),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type EvidenceRankingResult = z.infer<typeof EvidenceRankingResultSchema>;
