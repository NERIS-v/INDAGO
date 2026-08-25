import { z } from 'zod';
import {
  InvestigationIdSchema,
  HypothesisIdSchema,
  ObservationIdSchema,
} from '../common/ids.js';
import { RobustnessScoreSchema, AnalyticalConfidenceSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Robustness
//
// Measures how robust conclusions are under perturbation.
// RobustnessScore is perturbation stability count, NOT truth probability.
// ============================================================================

export const RobustnessRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  hypothesisId: HypothesisIdSchema
    .describe('Hypothesis to test for robustness'),
  perturbationCount: z.number().int().min(1).max(1000).default(100)
    .describe('Number of perturbation iterations'),
  perturbationRate: z.number().min(0).max(1).default(0.1)
    .describe('Fraction of observations to perturb per iteration'),
}).strict();
export type RobustnessRequest = z.infer<typeof RobustnessRequestSchema>;

export const RobustnessResultSchema = z.object({
  hypothesisId: HypothesisIdSchema,
  robustnessScore: RobustnessScoreSchema
    .describe('Perturbation stability count. NOT truth probability.'),
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in the robustness measurement'),
  perturbationCount: z.number().int().nonnegative(),
  stableIterations: z.number().int().nonnegative()
    .describe('Iterations where hypothesis remained supported'),
  unstableIterations: z.number().int().nonnegative()
    .describe('Iterations where hypothesis was weakened or contradicted'),
  sensitiveObservations: z.array(ObservationIdSchema)
    .describe('Observations whose perturbation most affected the hypothesis'),
  stableObservations: z.array(ObservationIdSchema)
    .describe('Observations that consistently supported the hypothesis'),
  computedAt: ObservedTimeSchema,
  computationTimeMs: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
}).strict();
export type RobustnessResult = z.infer<typeof RobustnessResultSchema>;
